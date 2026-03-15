import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { LoadedModel } from "./ModelContext";
import { exportModelToBuffer } from "@/lib/rhino3dm-service";
import { getFileBuffer } from "@/lib/commit-storage";
import { toast } from "sonner";
import { usePresence } from '@/contexts/PresenceContext';
import { features } from '@/lib/features';

interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Store the actual model data (for display/restore in UI)
  fileBuffer?: ArrayBuffer; // Store the exact .3dm file buffer (for exact file restoration)
  starred?: boolean; // Whether this commit is starred/favorited
  parentCommitId?: string | null; // Parent commit ID for branching (null for root)
  branchId: string; // Branch this commit belongs to
}

interface Branch {
  id: string;
  name: string;
  headCommitId: string; // Latest commit on this branch
  color: string; // Color for visualization
  parentBranchId?: string; // Parent branch (for branch-off-branch scenarios)
  originCommitId?: string; // Commit this branch was created from
  isMain: boolean; // Whether this is the main/master branch
}

interface VersionControlContextType {
  // Model tracking
  currentModel: string | null;
  modelName: string | null;
  commits: ModelCommit[];
  currentCommitId: string | null;
  hasUnsavedChanges: boolean;
  
  // Branching
  branches: Branch[];
  activeBranchId: string | null;
  pulledCommitId: string | null; // The commit that was last pulled/downloaded (for highlighting)
  
  // Actions
  setCurrentModel: (path: string) => Promise<void>;
  commitModelChanges: (message: string, currentModelData?: LoadedModel, customBranchName?: string) => Promise<void>;
  createInitialCommit: (modelData: LoadedModel, fileBuffer?: ArrayBuffer, filePath?: string) => void | Promise<void>;
  restoreToCommit: (commitId: string) => Promise<boolean>;
  pullFromCommit: (commitId: string) => Promise<boolean>; // Pull commit to local file (updates file on disk)
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  clearCurrentModel: () => Promise<void>;
  toggleStarCommit: (commitId: string) => void; // Toggle star status of a commit
  getStarredCommits: () => ModelCommit[]; // Get all starred commits
  
  // Branching actions
  switchBranch: (branchId: string) => void;
  keepBranch: (branchId: string) => void; // Mark a branch as the main/kept branch
  getBranchCommits: (branchId: string) => ModelCommit[];
  getCommitVersionLabel: (commit: ModelCommit) => string; // Get version label like v3a, v3b
  
  // Internal — exposed for CloudSyncContext
  previouslyWorkingBranchId: string | null;
  cloudSyncedCommitIdsRef: React.MutableRefObject<Set<string>>;
  setCloudSyncedCommitIdsExternal: (ids: Set<string>) => void;
  setCommits: React.Dispatch<React.SetStateAction<ModelCommit[]>>;
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
  initialCloudSyncedCommitIds: string[] | null;

  // Model restoration callback - will be set by ModelContext
  onModelRestore?: (modelData: LoadedModel) => void;
  setModelRestoreCallback: (callback: (modelData: LoadedModel) => void) => void;
}

const VersionControlContext = createContext<VersionControlContextType | undefined>(undefined);

interface VersionControlProviderProps {
  children: ReactNode;
}

// Branch colors for visualization
const CURRENT_WORKING_BRANCH_COLOR = '#22c55e'; // green
const PREVIOUSLY_WORKING_BRANCH_COLOR = '#ef4444'; // red
const DEFAULT_BRANCH_COLOR = '#737373'; // gray for other branches

export const VersionControlProvider: React.FC<VersionControlProviderProps> = ({ children }) => {
  const [currentModel, setCurrentModelState] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [commits, setCommits] = useState<ModelCommit[]>([]);
  const [currentCommitId, setCurrentCommitId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [onModelRestore, setOnModelRestore] = useState<((modelData: LoadedModel) => void) | undefined>(undefined);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [treeLoadPromise, setTreeLoadPromise] = useState<Promise<void> | null>(null);
  
  // Branching state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [pulledCommitId, setPulledCommitId] = useState<string | null>(null);
  const [previouslyWorkingBranchId, setPreviouslyWorkingBranchId] = useState<string | null>(null);

  // Cloud sync: ref kept here for saveTreeFile; state owned by CloudSyncContext
  const cloudSyncedCommitIdsRef = useRef<Set<string>>(new Set());
  const [cloudSyncedCommitIdsState, setCloudSyncedCommitIdsState] = useState<Set<string>>(new Set());
  const setCloudSyncedCommitIdsExternal = useCallback((ids: Set<string>) => {
    setCloudSyncedCommitIdsState(ids);
  }, []);
  // Initial cloud synced IDs loaded from tree.json, for CloudSyncContext to pick up
  const [initialCloudSyncedCommitIds, setInitialCloudSyncedCommitIds] = useState<string[] | null>(null);

  const { updatePresenceCommit } = usePresence();

  const setModelRestoreCallback = useCallback((callback: (modelData: LoadedModel) => void) => {
    setOnModelRestore(() => callback);
  }, []);

  // Helper function to get storage key for a file path
  const getStorageKey = useCallback((filePath: string): string => {
    // Create a stable key based on file path
    // Use a hash or normalized path to handle different path formats
    return `vc_commits_${filePath}`;
  }, []);

  // Helper function to save commits to localStorage
  const saveCommitsToStorage = useCallback((filePath: string, commitsToSave: ModelCommit[], branchesToSave?: Branch[]) => {
    try {
      const storageKey = getStorageKey(filePath);
      
      // Convert commits to a serializable format
      // Note: fileBuffer is too large for localStorage, we'll store it separately in IndexedDB
      // For now, we'll store commits without fileBuffer and rely on reading from disk when needed
      const serializableCommits = commitsToSave.map(commit => ({
        id: commit.id,
        message: commit.message,
        timestamp: commit.timestamp,
        starred: commit.starred,
        parentCommitId: commit.parentCommitId,
        branchId: commit.branchId,
        // Don't store modelData or fileBuffer in localStorage (too large)
        // We'll store fileBuffer in IndexedDB separately if needed
        hasFileBuffer: !!commit.fileBuffer,
        hasModelData: !!commit.modelData,
      }));

      localStorage.setItem(storageKey, JSON.stringify(serializableCommits));
      
      // Save branches separately
      if (branchesToSave) {
        const branchStorageKey = `vc_branches_${filePath}`;
        localStorage.setItem(branchStorageKey, JSON.stringify(branchesToSave));
      }
      
    } catch {
      // Silent catch
    }
  }, [getStorageKey]);

  // Helper function to load commits from localStorage
  const loadCommitsFromStorage = useCallback(async (filePath: string): Promise<{ commits: ModelCommit[], branches: Branch[] }> => {
    try {
      const storageKey = getStorageKey(filePath);
      const stored = localStorage.getItem(storageKey);
      
      // Load branches
      const branchStorageKey = `vc_branches_${filePath}`;
      const storedBranches = localStorage.getItem(branchStorageKey);
      let loadedBranches: Branch[] = [];
      if (storedBranches) {
        loadedBranches = JSON.parse(storedBranches);
      }
      
      if (stored) {
        const serializableCommits = JSON.parse(stored);
        // Convert back to ModelCommit format and load fileBuffers from IndexedDB
        const commits: ModelCommit[] = await Promise.all(
          serializableCommits.map(async (c: any): Promise<ModelCommit> => {
            const commit: ModelCommit = {
              id: c.id,
              message: c.message,
              timestamp: c.timestamp,
              starred: c.starred,
              parentCommitId: c.parentCommitId,
              branchId: c.branchId || 'main', // Default to main for backwards compatibility
            };
            
            // Try to load fileBuffer from IndexedDB if it was stored
            if (c.hasFileBuffer) {
              const buffer = await getFileBuffer(c.id, filePath);
              if (buffer) {
                commit.fileBuffer = buffer;
              }
            }
            
            return commit;
          })
        );
        
        return { commits, branches: loadedBranches };
      }
    } catch {
      // Silent catch
    }
    return { commits: [], branches: [] };
  }, [getStorageKey]);

  // Helper function to save tree.json file
  const saveTreeFile = useCallback(async (filePath: string) => {
    if (!desktopAPI.isDesktop || !filePath) {
      return; // Silently return if not desktop or no file path
    }

    try {
      const treeData = {
        version: '1.0',
        activeBranchId: activeBranchId,
        currentCommitId: currentCommitId,
        previouslyWorkingBranchId: previouslyWorkingBranchId,
        cloudSyncedCommitIds: Array.from(cloudSyncedCommitIdsRef.current),
        branches: branches.map(b => ({
          id: b.id,
          name: b.name,
          headCommitId: b.headCommitId,
          color: b.color,
          isMain: b.isMain,
          parentBranchId: b.parentBranchId,
          originCommitId: b.originCommitId,
        })),
        commits: commits.map(c => ({
          id: c.id,
          message: c.message,
          timestamp: c.timestamp,
          parentCommitId: c.parentCommitId,
          branchId: c.branchId,
          starred: c.starred || false,
        })),
      };

      await desktopAPI.saveTreeFile(filePath, treeData);
    } catch {
      // Silent catch (non-critical)
    }
  }, [branches, commits, activeBranchId, currentCommitId, previouslyWorkingBranchId]);

  // Helper function to load tree.json file
  const loadTreeFile = useCallback(async (filePath: string): Promise<{ branches: Branch[], commits: ModelCommit[], activeBranchId: string | null, currentCommitId: string | null, previouslyWorkingBranchId: string | null, cloudSyncedCommitIds: string[] } | null> => {
    if (!desktopAPI.isDesktop || !filePath) return null;

    try {
      const treeData = await desktopAPI.loadTreeFile(filePath);
      if (!treeData) return null;

      // Validate commit files exist
      const commitIds = treeData.commits.map((c: any) => c.id);
      const missingCommitIds = await desktopAPI.validateCommitFiles(filePath, commitIds);
      
      if (missingCommitIds.length > 0) {
        // Filter out commits with missing files
        treeData.commits = treeData.commits.filter((c: any) => !missingCommitIds.includes(c.id));
      }

      // Convert tree data to Branch and ModelCommit arrays
      const loadedBranches: Branch[] = treeData.branches.map((b: any) => ({
        id: b.id,
        name: b.name,
        headCommitId: b.headCommitId,
        color: b.color,
        isMain: b.isMain,
        parentBranchId: b.parentBranchId,
        originCommitId: b.originCommitId,
      }));

      const loadedCommits: ModelCommit[] = treeData.commits.map((c: any) => ({
        id: c.id,
        message: c.message,
        timestamp: c.timestamp,
        parentCommitId: c.parentCommitId,
        branchId: c.branchId,
        starred: c.starred || false,
        // Note: modelData and fileBuffer are not stored in tree.json
        // They will be loaded from files when needed
      }));

      const loadedPreviouslyWorkingBranchId = (treeData as any).previouslyWorkingBranchId || null;
      const loadedCloudSyncedIds: string[] = (treeData as any).cloudSyncedCommitIds || [];
      
      return {
        branches: loadedBranches,
        commits: loadedCommits,
        activeBranchId: treeData.activeBranchId,
        currentCommitId: treeData.currentCommitId,
        previouslyWorkingBranchId: loadedPreviouslyWorkingBranchId,
        cloudSyncedCommitIds: loadedCloudSyncedIds,
      };
    } catch {
      return null;
    }
  }, []);

  const setCurrentModel = useCallback((path: string): Promise<void> => {
    setCurrentModelState(path);
    
    // Extract filename from path
    const fileName = path.split('/').pop() || path;
    setModelName(fileName);
    
    // Clear unsaved changes only when switching to a different model
    setHasUnsavedChanges(false);
    setPulledCommitId(null);

    // Load from tree.json first (primary source in 0studio_{filename}/), then fall back to localStorage
    setIsLoadingTree(true);
    
    // Create a promise that loads branches/commits from 0studio_{filename}/tree.json
    const loadPromise = (async () => {
      const treeData = await loadTreeFile(path);
      
      if (treeData && treeData.commits.length > 0) {
        if (treeData.previouslyWorkingBranchId) {
          setPreviouslyWorkingBranchId(treeData.previouslyWorkingBranchId);
        }

        // Signal cloud synced commit IDs to CloudSyncContext
        if (treeData.cloudSyncedCommitIds && treeData.cloudSyncedCommitIds.length > 0) {
          cloudSyncedCommitIdsRef.current = new Set(treeData.cloudSyncedCommitIds);
          setInitialCloudSyncedCommitIds(treeData.cloudSyncedCommitIds);
        }

        setBranches(treeData.branches);
        setCommits(treeData.commits);
        setActiveBranchId(treeData.activeBranchId);
        setCurrentCommitId(treeData.currentCommitId);
        if (features.team) updatePresenceCommit(treeData.currentCommitId);
        setIsLoadingTree(false);

        return;
      }
      
      // Fall back to localStorage (for backwards compatibility)
      const { commits: persistedCommits, branches: persistedBranches } = await loadCommitsFromStorage(path);
      
      // Load branches
      if (persistedBranches.length > 0) {
        // Initialize branch colors: main/active branch is green, others are gray
        const mainBranch = persistedBranches.find(b => b.isMain);
        const activeBranchIdFromStorage = mainBranch?.id || persistedBranches[0]?.id || null;
        const branchesWithColors = persistedBranches.map(b => ({
          ...b,
          color: b.id === activeBranchIdFromStorage ? CURRENT_WORKING_BRANCH_COLOR : (b.color || DEFAULT_BRANCH_COLOR),
        }));
        setBranches(branchesWithColors);
        setActiveBranchId(activeBranchIdFromStorage);
      }
      
      if (persistedCommits.length > 0) {
        setCommits(persistedCommits);
        // Set current commit to the latest one
        const latestCommit = persistedCommits[0];
        if (latestCommit) {
          setCurrentCommitId(latestCommit.id);
          if (features.team) updatePresenceCommit(latestCommit.id);
        }
      }
      
      setIsLoadingTree(false);
    })();
    
    setTreeLoadPromise(loadPromise);
    return loadPromise;
  }, [loadCommitsFromStorage, loadTreeFile]);

  const createInitialCommit = useCallback(async (modelData: LoadedModel, fileBuffer?: ArrayBuffer, filePath?: string) => {
    // Only create initial commit if no commits exist
    const targetPath = filePath || currentModel;
    
    if (!targetPath) {
      return;
    }

    // Wait for tree loading to complete before creating initial commit
    // This prevents race conditions where we create a duplicate initial commit
    if (treeLoadPromise) {
      try {
        await treeLoadPromise;
      } catch {
        // Silent catch
      }
    }

    // Use a Promise to get the current commits count from within the setState callback
    // This ensures we check the actual current state, not a stale closure value
    const currentCommitsCount = await new Promise<number>(resolve => {
      setCommits(prevCommits => {
        resolve(prevCommits.length);
        return prevCommits;
      });
    });

    // If we have commits from tree.json, don't create a new initial commit
    if (currentCommitsCount > 0) {
      // Update the modelData for the current commit (so we have it for display)
      setCommits(prevCommits => {
        if (prevCommits.length > 0) {
          return prevCommits.map((c, idx) => {
            // Update the first commit (current head) with the modelData if it doesn't have one
            if (idx === 0 && !c.modelData) {
              return { ...c, modelData, fileBuffer };
            }
            return c;
          });
        }
        return prevCommits;
      });
      return;
    }

    // Create main branch if it doesn't exist
    const mainBranchId = 'main';
    setBranches(prevBranches => {
      if (prevBranches.length === 0) {
        const mainBranch: Branch = {
          id: mainBranchId,
          name: 'main',
          headCommitId: '', // Will be updated after commit
          color: CURRENT_WORKING_BRANCH_COLOR, // Current working branch is green
          isMain: true,
        };
        return [mainBranch];
      }
      return prevBranches;
    });
    const branchIdToSet = activeBranchId || mainBranchId;
    if (branchIdToSet) {
      setBranches(prevBranches => prevBranches.map(b => 
        b.id === branchIdToSet ? { ...b, color: CURRENT_WORKING_BRANCH_COLOR } : b
      ));
    }
    setActiveBranchId(branchIdToSet);

    // Generate a unique commit ID with timestamp and random component
    const commitId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const initialCommit: ModelCommit = {
      id: commitId,
      message: "Initial model import",
      timestamp: Date.now(),
      modelData: modelData,
      fileBuffer: fileBuffer, // Store file buffer if provided
      parentCommitId: null, // Root commit has no parent
      branchId: mainBranchId,
    };
    
    setCurrentCommitId(initialCommit.id);
    if (features.team) updatePresenceCommit(initialCommit.id);

    const updatedCommits = [initialCommit];
    setCommits(updatedCommits);
    
    // Create the updated branch with the new headCommitId
    const mainBranch: Branch = {
      id: mainBranchId,
      name: 'main',
      headCommitId: commitId,
      color: CURRENT_WORKING_BRANCH_COLOR, // Current working branch is green
      isMain: true,
    };
    const updatedBranches = [mainBranch];
    setBranches(updatedBranches);
    
    // Save to localStorage as backup
    saveCommitsToStorage(targetPath, updatedCommits, updatedBranches);
    
    // Save file to 0studio folder (file system storage)
    if (fileBuffer && desktopAPI.isDesktop) {
      try {
        await desktopAPI.saveCommitFile(targetPath, initialCommit.id, fileBuffer);
      } catch {
        // Silent catch
      }
    }
    
    // Explicitly save tree.json after initial commit (don't rely on useEffect which may be skipped during loading)
    if (desktopAPI.isDesktop) {
      try {
        const treeData = {
          version: '1.0',
          activeBranchId: mainBranchId,
          currentCommitId: commitId,
          previouslyWorkingBranchId: previouslyWorkingBranchId, // Save previously working branch
          branches: updatedBranches.map(b => ({
            id: b.id,
            name: b.name,
            headCommitId: b.headCommitId,
            color: b.color,
            isMain: b.isMain,
            parentBranchId: b.parentBranchId,
            originCommitId: b.originCommitId,
          })),
          commits: updatedCommits.map(c => ({
            id: c.id,
            message: c.message,
            timestamp: c.timestamp,
            parentCommitId: c.parentCommitId,
            branchId: c.branchId,
            starred: c.starred || false,
          })),
        };
        await desktopAPI.saveTreeFile(targetPath, treeData);
      } catch {
        // Silent catch
      }
    }
  }, [currentModel, saveCommitsToStorage, treeLoadPromise]);

  // Auto-save tree.json whenever branches, commits, activeBranchId, or currentCommitId change
  // Skip saving during initial load (when commits/branches are being loaded)
  useEffect(() => {
    if (currentModel && (branches.length > 0 || commits.length > 0) && !isLoadingTree) {
      // Use a ref to track if we're currently clearing to avoid race conditions
      saveTreeFile(currentModel).catch(() => {});
    }
  }, [branches, commits, activeBranchId, currentCommitId, previouslyWorkingBranchId, currentModel, saveTreeFile, isLoadingTree]);


  // File change detection - mark unsaved changes when file changes on disk
  useEffect(() => {
    if (!desktopAPI.isDesktop || !currentModel) return;

    const handleFileChange = (event: any) => {
      if (event.eventType === 'change' && event.filePath && event.filePath === currentModel) {
        setHasUnsavedChanges(true);
      }
    };

    // Set up file change listener
    const unsubFileChanged = desktopAPI.onFileChanged(handleFileChange);

    // Cleanup
    return () => {
      unsubFileChanged?.();
    };
  }, [currentModel]); // Re-setup when current model changes

  const commitModelChanges = useCallback(async (message: string, currentModelData?: LoadedModel, customBranchName?: string): Promise<void> => {
    if (!currentModel) {
      throw new Error("No model is currently open");
    }

    try {
      let fileBuffer: ArrayBuffer | undefined;

      // Always read the exact file buffer from disk (if desktop) for exact file storage
      if (desktopAPI.isDesktop) {
        const buffer = await desktopAPI.readFileBuffer(currentModel);
        if (buffer) {
          fileBuffer = buffer;
        }
      }

      // Determine if we need to create a new branch
      // If currentCommitId is not the head of the active branch, we're branching
      let targetBranchId = activeBranchId || 'main';
      let parentCommitId = currentCommitId;
      let newBranch: Branch | null = null;
      
      // Check if we're at the head of the current branch
      const activeBranch = branches.find(b => b.id === activeBranchId);
      const isAtBranchHead = activeBranch && activeBranch.headCommitId === currentCommitId;
      
      // If we pulled to an old commit and are now committing, create a new branch
      if (pulledCommitId && pulledCommitId !== activeBranch?.headCommitId) {
        // We're creating a branch from an old commit
        // Find how many branches already exist from this parent
        const existingBranchesFromParent = branches.filter(b => b.originCommitId === pulledCommitId);
        const branchLetter = String.fromCharCode(97 + existingBranchesFromParent.length); // a, b, c, etc.
        
        // Generate new branch ID and name
        const newBranchId = `branch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const branchName = customBranchName || `v${getCommitNumber(pulledCommitId)}${branchLetter}`;
        
        newBranch = {
          id: newBranchId,
          name: branchName,
          headCommitId: '', // Will be updated after commit
          color: CURRENT_WORKING_BRANCH_COLOR, // New branch becomes current working (green)
          parentBranchId: activeBranchId || undefined,
          originCommitId: pulledCommitId,
          isMain: false,
        };
        
        targetBranchId = newBranchId;
        parentCommitId = pulledCommitId;
        
      }

      // Generate a unique commit ID with timestamp and random component to avoid collisions
      const commitId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newCommit: ModelCommit = {
        id: commitId,
        message,
        timestamp: Date.now(),
        modelData: currentModelData, // Store for UI display and in-memory restore
        fileBuffer: fileBuffer, // Store exact .3dm file buffer for exact file restoration
        parentCommitId: parentCommitId,
        branchId: targetBranchId,
      };

      // Update branches
      let updatedBranches = [...branches];
      if (newBranch) {
        newBranch.headCommitId = commitId;
        updatedBranches.push(newBranch);
      } else {
        // Update head of current branch
        updatedBranches = updatedBranches.map(b => 
          b.id === targetBranchId ? { ...b, headCommitId: commitId } : b
        );
      }
      
      // Update branch colors before setting active branch
      const previousActiveId = activeBranchId;
      if (previousActiveId && previousActiveId !== targetBranchId) {
        setPreviouslyWorkingBranchId(previousActiveId);
        updatedBranches = updatedBranches.map(b => {
          if (b.id === previousActiveId) {
            return { ...b, color: PREVIOUSLY_WORKING_BRANCH_COLOR };
          } else if (b.id === targetBranchId) {
            return { ...b, color: CURRENT_WORKING_BRANCH_COLOR };
          }
          return b;
        });
      } else if (targetBranchId) {
        updatedBranches = updatedBranches.map(b => 
          b.id === targetBranchId ? { ...b, color: CURRENT_WORKING_BRANCH_COLOR } : b
        );
      }
      
      setBranches(updatedBranches);
      setActiveBranchId(targetBranchId);

      setCommits(prev => {
        const updated = [newCommit, ...prev];
        // Save to localStorage with branches
        if (currentModel) {
          saveCommitsToStorage(currentModel, updated, updatedBranches);
        }
        return updated;
      });
      
      // Save file to 0studio folder (file system storage)
      if (fileBuffer && currentModel && desktopAPI.isDesktop) {
        try {
          await desktopAPI.saveCommitFile(currentModel, newCommit.id, fileBuffer);
        } catch (error) {
          toast.error("Failed to save commit file.");
          throw error;
        }
      }
      
      setCurrentCommitId(newCommit.id);
      if (features.team) updatePresenceCommit(newCommit.id);
      setHasUnsavedChanges(false);
      setPulledCommitId(null); // Clear pulled commit after successful commit

      toast.success(newBranch ? `New branch "${newBranch.name}" created` : "Commit saved successfully");
    } catch (error) {
      throw error;
    }
  }, [currentModel, currentCommitId, activeBranchId, branches, pulledCommitId, saveCommitsToStorage]);
  
  // Helper to get commit number in the timeline
  const getCommitNumber = useCallback((commitId: string | null): number => {
    if (!commitId) return 0;
    const commit = commits.find(c => c.id === commitId);
    if (!commit) return 0;
    
    // Count commits in the same branch up to this commit
    const branchCommits = commits
      .filter(c => c.branchId === commit.branchId)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    return branchCommits.findIndex(c => c.id === commitId) + 1;
  }, [commits]);

  const restoreToCommit = useCallback(async (commitId: string): Promise<boolean> => {
    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        return false;
      }

      // Priority 1: Load from 0studio folder (file system storage) - PRIMARY METHOD
      let fileBuffer: ArrayBuffer | undefined;
      if (desktopAPI.isDesktop && currentModel) {
        const storedFile = await desktopAPI.readCommitFile(currentModel, commitId);
        if (storedFile) {
          fileBuffer = storedFile;
        }
      }

      // Priority 2: Fall back to in-memory file buffer
      if (!fileBuffer && commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
      }

      // Priority 3: Fall back to IndexedDB
      if (!fileBuffer && currentModel) {
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
        }
      }

      // Priority 4: Fall back to exporting modelData (less ideal)
      let modelData: LoadedModel | undefined = commit.modelData;
      if (!fileBuffer && modelData) {
        try {
          const { exportModelToBuffer } = await import('@/lib/rhino3dm-service');
          fileBuffer = await exportModelToBuffer(modelData);
        } catch {
          // Silent catch
        }
      }

      // Load the model from file buffer if available
      if (fileBuffer) {
        const file = new File([fileBuffer], modelName || 'model.3dm', { type: 'application/octet-stream' });
        const { load3dmFile } = await import('@/lib/rhino3dm-service');
        const loaded = await load3dmFile(file);
        modelData = loaded;
      }

      if (!modelData) {
        return false;
      }

      // Restore the model by calling the callback provided by ModelContext
      if (onModelRestore) {
        onModelRestore(modelData);
      } else {
        return false;
      }

      setCurrentCommitId(commitId);
      if (features.team) updatePresenceCommit(commitId);
      setHasUnsavedChanges(false);

      return true;
    } catch {
      return false;
    }
  }, [commits, onModelRestore, currentModel, modelName]);

  const pullFromCommit = useCallback(async (commitId: string): Promise<boolean> => {
    if (!currentModel || !desktopAPI.isDesktop) {
      toast.error("Pull only works in desktop mode with an open file");
      return false;
    }

    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        toast.error("Commit not found");
        return false;
      }

      let fileBuffer: ArrayBuffer | undefined;

      // Priority 1: Read from 0studio folder (file system storage) - PRIMARY METHOD
      if (desktopAPI.isDesktop) {
        const storedFile = await desktopAPI.readCommitFile(currentModel, commitId);
        if (storedFile) {
          fileBuffer = storedFile;
        }
      }

      // Priority 2: Fall back to in-memory file buffer (for backwards compatibility)
      if (!fileBuffer && commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
      }

      // Priority 3: Fall back to IndexedDB (for backwards compatibility)
      if (!fileBuffer) {
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
        }
      }
      
      // Priority 4: Fall back to exporting modelData (less ideal, loses polysurface data)
      if (!fileBuffer && commit.modelData) {
        try {
          fileBuffer = await exportModelToBuffer(commit.modelData);
          toast.warning("Note: Using converted model data - may differ from original file");
        } catch {
          toast.error("Failed to convert model data to file");
          return false;
        }
      }

      // If we still don't have a file buffer, we can't proceed
      if (!fileBuffer) {
        toast.error("No file data available for this commit. The commit may have been created before file buffer storage was implemented.");
        return false;
      }

      // Write the exact file buffer to disk
      await desktopAPI.writeFileBuffer(currentModel, fileBuffer);

      // Touch the file to ensure Rhino detects the change
      // Read and immediately write to update file metadata
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyBuffer = await desktopAPI.readFileBuffer(currentModel);
      if (verifyBuffer && verifyBuffer.byteLength === fileBuffer.byteLength) {
        // File was written correctly, touch it again to trigger Rhino reload
        await desktopAPI.writeFileBuffer(currentModel, fileBuffer);
      }

      // Wait for file system to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Reload the model in the UI
      const file = new File([fileBuffer], modelName || 'model.3dm', { type: 'application/octet-stream' });
      const { load3dmFile } = await import('@/lib/rhino3dm-service');
      const loaded = await load3dmFile(file);
      
      if (onModelRestore) {
        onModelRestore(loaded);
      }

      setCurrentCommitId(commitId);
      if (features.team) updatePresenceCommit(commitId);
      setPulledCommitId(commitId); // Track which commit was pulled for highlighting
      setHasUnsavedChanges(false);
      
      // Switch to the branch of this commit and update colors
      const previousActiveId = activeBranchId;
      const newBranchId = commit.branchId;
      if (previousActiveId && previousActiveId !== newBranchId) {
        setPreviouslyWorkingBranchId(previousActiveId);
        setBranches(prevBranches => prevBranches.map(b => {
          if (b.id === previousActiveId) {
            return { ...b, color: PREVIOUSLY_WORKING_BRANCH_COLOR };
          } else if (b.id === newBranchId) {
            return { ...b, color: CURRENT_WORKING_BRANCH_COLOR };
          }
          return b;
        }));
      } else if (newBranchId) {
        setBranches(prevBranches => prevBranches.map(b => 
          b.id === newBranchId ? { ...b, color: CURRENT_WORKING_BRANCH_COLOR } : b
        ));
      }
      setActiveBranchId(newBranchId);
      
      toast.success("File updated to exact commit version - Rhino should auto-reload");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pull from commit");
      return false;
    }
  }, [commits, currentModel, modelName, onModelRestore]);

  const markUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const clearUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(false);
  }, []);

  const clearCurrentModel = useCallback(async () => {
    // Save tree.json one final time before clearing (if we have data to save)
    const modelToSave = currentModel;
    if (modelToSave && (branches.length > 0 || commits.length > 0)) {
      try {
        await saveTreeFile(modelToSave);
      } catch {
        // Silent catch
      }
    }
    
    setCurrentModelState(null);
    setModelName(null);
    setCommits([]);
    setCurrentCommitId(null);
    if (features.team) updatePresenceCommit(null);
    setHasUnsavedChanges(false);
    // Reset branching state
    setBranches([]);
    setActiveBranchId(null);
    setPulledCommitId(null);
    // Reset tree loading state
    setTreeLoadPromise(null);
    setIsLoadingTree(false);
    // Reset cloud sync ref (CloudSyncContext will reset its own state via currentModel effect)
    cloudSyncedCommitIdsRef.current = new Set();
    setInitialCloudSyncedCommitIds(null);
  }, [currentModel, branches, commits, saveTreeFile]);

  // Handle project-closed event from Electron
  useEffect(() => {
    if (!desktopAPI.isDesktop) return;

    const handleProjectClosed = async () => {
      await clearCurrentModel();
    };

    // Set up project closed listener
    const unsubProjectClosed = desktopAPI.onProjectClosed(handleProjectClosed);

    // Cleanup
    return () => {
      unsubProjectClosed?.();
    };
  }, [clearCurrentModel]);


  // Toggle star status of a commit
  const toggleStarCommit = useCallback((commitId: string) => {
    setCommits(prevCommits => {
      const updated = prevCommits.map(commit => 
        commit.id === commitId 
          ? { ...commit, starred: !commit.starred }
          : commit
      );
      
      // Persist starred status to localStorage (per file)
      if (currentModel) {
        const storageKey = `starred_commits_${currentModel}`;
        const starredIds = updated.filter(c => c.starred).map(c => c.id);
        localStorage.setItem(storageKey, JSON.stringify(starredIds));
      }
      
      // Save updated commits to localStorage
      if (currentModel) {
        saveCommitsToStorage(currentModel, updated);
      }
      
      return updated;
    });
  }, [currentModel, saveCommitsToStorage]);

  // Get all starred commits
  const getStarredCommits = useCallback((): ModelCommit[] => {
    return commits.filter(commit => commit.starred);
  }, [commits]);

  // Branching functions
  const switchBranch = useCallback((branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    if (!branch) {
      return;
    }

    const previousActiveId = activeBranchId;
    if (previousActiveId && previousActiveId !== branchId) {
      setPreviouslyWorkingBranchId(previousActiveId);
      setBranches(prevBranches => prevBranches.map(b => {
        if (b.id === previousActiveId) {
          return { ...b, color: PREVIOUSLY_WORKING_BRANCH_COLOR };
        } else if (b.id === branchId) {
          return { ...b, color: CURRENT_WORKING_BRANCH_COLOR };
        }
        return b;
      }));
    } else if (branchId) {
      setBranches(prevBranches => prevBranches.map(b => 
        b.id === branchId ? { ...b, color: CURRENT_WORKING_BRANCH_COLOR } : b
      ));
    }
    
    setActiveBranchId(branchId);
    setCurrentCommitId(branch.headCommitId);
    if (features.team) updatePresenceCommit(branch.headCommitId);
    setPulledCommitId(null);
  }, [branches, activeBranchId]);

  const keepBranch = useCallback((branchId: string) => {
    if (!currentModel) return;
    
    const branchToKeep = branches.find(b => b.id === branchId);
    if (!branchToKeep) {
      return;
    }
    
    // Mark this branch as main and demote others, update colors
    const previousActiveId = activeBranchId;
    const updatedBranches = branches.map(b => {
      const isMain = b.id === branchId;
      let color = b.color;
      
      if (b.id === branchId) {
        // Current working branch is green
        color = CURRENT_WORKING_BRANCH_COLOR;
      } else if (b.id === previousActiveId && previousActiveId !== branchId) {
        // Previously working branch is red
        color = PREVIOUSLY_WORKING_BRANCH_COLOR;
        setPreviouslyWorkingBranchId(previousActiveId);
      }
      
      return {
        ...b,
        isMain,
        color,
      };
    });
    
    setBranches(updatedBranches);
    setActiveBranchId(branchId);
    
    // Save to storage
    saveCommitsToStorage(currentModel, commits, updatedBranches);
    
    toast.success(`Branch "${branchToKeep.name}" is now the main branch`);
  }, [branches, commits, currentModel, saveCommitsToStorage]);

  const getBranchCommits = useCallback((branchId: string): ModelCommit[] => {
    return commits.filter(c => c.branchId === branchId).sort((a, b) => b.timestamp - a.timestamp);
  }, [commits]);

  const getCommitVersionLabel = useCallback((commit: ModelCommit): string => {
    // Find the branch for this commit
    const branch = branches.find(b => b.id === commit.branchId);
    
    // Get all commits on main branch sorted by timestamp
    const mainBranch = branches.find(b => b.isMain);
    const mainCommits = commits
      .filter(c => c.branchId === mainBranch?.id)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (branch?.isMain) {
      // Main branch: just use version number v1, v2, v3...
      const idx = mainCommits.findIndex(c => c.id === commit.id);
      return `v${idx + 1}`;
    }
    
    // For non-main branches, find the origin point
    if (branch?.originCommitId) {
      const originCommit = commits.find(c => c.id === branch.originCommitId);
      if (originCommit) {
        // Find the version number of the origin commit
        const originBranch = branches.find(b => b.id === originCommit.branchId);
        const originBranchCommits = commits
          .filter(c => c.branchId === originBranch?.id)
          .sort((a, b) => a.timestamp - b.timestamp);
        const originIdx = originBranchCommits.findIndex(c => c.id === originCommit.id);
        const baseVersion = originIdx + 1;
        
        // Get all sibling branches from the same origin
        const siblingBranches = branches
          .filter(b => b.originCommitId === branch.originCommitId && !b.isMain)
          .sort((a, b) => {
            // Sort by creation time (first commit timestamp)
            const aFirstCommit = commits.filter(c => c.branchId === a.id).sort((x, y) => x.timestamp - y.timestamp)[0];
            const bFirstCommit = commits.filter(c => c.branchId === b.id).sort((x, y) => x.timestamp - y.timestamp)[0];
            return (aFirstCommit?.timestamp || 0) - (bFirstCommit?.timestamp || 0);
          });
        
        const branchIndex = siblingBranches.findIndex(b => b.id === branch.id);
        const branchLetter = String.fromCharCode(97 + branchIndex); // a, b, c...
        
        // Get commit index within this branch
        const branchCommits = commits
          .filter(c => c.branchId === commit.branchId)
          .sort((a, b) => a.timestamp - b.timestamp);
        const commitIdx = branchCommits.findIndex(c => c.id === commit.id);
        
        if (commitIdx === 0) {
          return `v${baseVersion + 1}${branchLetter}`;
        }
        return `v${baseVersion + 1 + commitIdx}${branchLetter}`;
      }
    }
    
    // Fallback
    const branchCommits = commits
      .filter(c => c.branchId === commit.branchId)
      .sort((a, b) => a.timestamp - b.timestamp);
    const idx = branchCommits.findIndex(c => c.id === commit.id);
    return `v${idx + 1}`;
  }, [branches, commits]);

  // Load starred commits from localStorage when project/model changes
  useEffect(() => {
    if (!currentModel) return;
    
    const storageKey = `starred_commits_${currentModel}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const starredIds = new Set(JSON.parse(stored));
        setCommits(prevCommits => {
          const updated = prevCommits.map(commit => ({
            ...commit,
            starred: starredIds.has(commit.id)
          }));
          // Save updated commits to localStorage
          if (currentModel) {
            saveCommitsToStorage(currentModel, updated);
          }
          return updated;
        });
      } catch {
        // Silent catch
      }
    }
  }, [currentModel, saveCommitsToStorage]);

  const value: VersionControlContextType = {
    currentModel,
    modelName,
    commits,
    currentCommitId,
    hasUnsavedChanges,
    // Branching
    branches,
    activeBranchId,
    pulledCommitId,
    // Actions
    setCurrentModel,
    commitModelChanges,
    createInitialCommit,
    restoreToCommit,
    pullFromCommit,
    markUnsavedChanges,
    clearUnsavedChanges,
    clearCurrentModel,
    toggleStarCommit,
    getStarredCommits,
    // Branching actions
    switchBranch,
    keepBranch,
    getBranchCommits,
    getCommitVersionLabel,
    // Internal — exposed for CloudSyncContext
    previouslyWorkingBranchId,
    cloudSyncedCommitIdsRef,
    setCloudSyncedCommitIdsExternal,
    setCommits,
    setBranches,
    initialCloudSyncedCommitIds,
    // Callbacks
    onModelRestore,
    setModelRestoreCallback,
  };

  return (
    <VersionControlContext.Provider value={value}>
      {children}
    </VersionControlContext.Provider>
  );
};

export const useVersionControl = (): VersionControlContextType => {
  const context = useContext(VersionControlContext);
  if (!context) {
    throw new Error("useVersionControl must be used within a VersionControlProvider");
  }
  return context;
};

export type { ModelCommit, Branch };