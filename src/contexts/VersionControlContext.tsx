import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { LoadedModel } from "./ModelContext";
import { exportModelToBuffer } from "@/lib/rhino3dm-service";
import { getFileBuffer } from "@/lib/commit-storage";
import { toast } from "sonner";

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
  isProcessingAICommit: boolean;
  
  // Branching
  branches: Branch[];
  activeBranchId: string | null;
  pulledCommitId: string | null; // The commit that was last pulled/downloaded (for highlighting)
  
  // Actions
  setCurrentModel: (path: string) => void;
  commitModelChanges: (message: string, currentModelData?: LoadedModel, customBranchName?: string) => Promise<void>;
  commitWithAI: (message: string) => Promise<{ success: boolean; error?: string }>;
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
  
  // Gallery mode
  isGalleryMode: boolean;
  selectedCommitIds: Set<string>;
  toggleGalleryMode: () => void;
  toggleCommitSelection: (commitId: string) => void;
  clearSelectedCommits: () => void;
  
  // Model restoration callback - will be set by ModelContext
  onModelRestore?: (modelData: LoadedModel) => void;
  setModelRestoreCallback: (callback: (modelData: LoadedModel) => void) => void;
  
  // AI commit callbacks - will be set by a component that can execute commands
  onAICommit?: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>;
  setAICommitCallback: (callback: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) => void;
}

const VersionControlContext = createContext<VersionControlContextType | undefined>(undefined);

interface VersionControlProviderProps {
  children: ReactNode;
}

// Branch colors for visualization
const BRANCH_COLORS = [
  '#ef4444', // red (main)
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

export const VersionControlProvider: React.FC<VersionControlProviderProps> = ({ children }) => {
  const [currentModel, setCurrentModelState] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [commits, setCommits] = useState<ModelCommit[]>([]);
  const [currentCommitId, setCurrentCommitId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isProcessingAICommit, setIsProcessingAICommit] = useState(false);
  const [onModelRestore, setOnModelRestore] = useState<((modelData: LoadedModel) => void) | undefined>(undefined);
  const [onAICommit, setOnAICommit] = useState<((message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) | undefined>(undefined);
  const [isGalleryMode, setIsGalleryMode] = useState(false);
  const [selectedCommitIds, setSelectedCommitIds] = useState<Set<string>>(new Set());
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [treeLoadPromise, setTreeLoadPromise] = useState<Promise<void> | null>(null);
  
  // Branching state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [pulledCommitId, setPulledCommitId] = useState<string | null>(null);

  const setModelRestoreCallback = useCallback((callback: (modelData: LoadedModel) => void) => {
    setOnModelRestore(() => callback);
  }, []);

  const setAICommitCallback = useCallback((callback: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) => {
    setOnAICommit(() => callback);
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
      
      console.log(`Saved ${commitsToSave.length} commits to localStorage for: ${filePath}`);
    } catch (error) {
      console.error('Failed to save commits to localStorage:', error);
      // If quota exceeded, try to clean up old entries
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, consider using IndexedDB for larger files');
      }
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
        
        console.log(`Loaded ${commits.length} commits and ${loadedBranches.length} branches from localStorage for: ${filePath}`);
        return { commits, branches: loadedBranches };
      }
    } catch (error) {
      console.error('Failed to load commits from localStorage:', error);
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
      console.log(`Saved tree.json for: ${filePath}`);
    } catch (error) {
      // Don't throw - just log, as this is a non-critical operation
      // Errors can happen during cleanup or if file system is unavailable
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('ENOENT') && !errorMessage.includes('not found')) {
        console.warn('Failed to save tree.json (non-critical):', errorMessage);
      }
    }
  }, [branches, commits, activeBranchId, currentCommitId]);

  // Helper function to load tree.json file
  const loadTreeFile = useCallback(async (filePath: string): Promise<{ branches: Branch[], commits: ModelCommit[], activeBranchId: string | null, currentCommitId: string | null } | null> => {
    if (!desktopAPI.isDesktop || !filePath) return null;

    try {
      const treeData = await desktopAPI.loadTreeFile(filePath);
      if (!treeData) return null;

      console.log(`Loaded tree.json for: ${filePath}`);

      // Validate commit files exist
      const commitIds = treeData.commits.map((c: any) => c.id);
      const missingCommitIds = await desktopAPI.validateCommitFiles(filePath, commitIds);
      
      if (missingCommitIds.length > 0) {
        console.warn(`⚠️ Warning: ${missingCommitIds.length} commit file(s) missing:`, missingCommitIds);
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

      return {
        branches: loadedBranches,
        commits: loadedCommits,
        activeBranchId: treeData.activeBranchId,
        currentCommitId: treeData.currentCommitId,
      };
    } catch (error) {
      console.error('Failed to load tree.json:', error);
      return null;
    }
  }, []);

  const setCurrentModel = useCallback((path: string) => {
    setCurrentModelState(path);
    
    // Extract filename from path
    const fileName = path.split('/').pop() || path;
    setModelName(fileName);
    
    // Clear unsaved changes only when switching to a different model
    console.log('Model switched, clearing unsaved changes for new model:', path);
    setHasUnsavedChanges(false);
    setPulledCommitId(null);

    // Load from tree.json first (primary source), then fall back to localStorage
    setIsLoadingTree(true);
    
    // Create a promise that we can await in createInitialCommit
    const loadPromise = (async () => {
      const treeData = await loadTreeFile(path);
      
      if (treeData && treeData.commits.length > 0) {
        // Loaded from tree.json
        console.log(`Loaded ${treeData.commits.length} commits and ${treeData.branches.length} branches from tree.json`);
        setBranches(treeData.branches);
        setCommits(treeData.commits);
        setActiveBranchId(treeData.activeBranchId);
        setCurrentCommitId(treeData.currentCommitId);
        setIsLoadingTree(false);
        return; // Successfully loaded from tree.json
      }
      
      // Fall back to localStorage (for backwards compatibility)
      const { commits: persistedCommits, branches: persistedBranches } = await loadCommitsFromStorage(path);
      
      // Load branches
      if (persistedBranches.length > 0) {
        setBranches(persistedBranches);
        // Set active branch to main or first branch
        const mainBranch = persistedBranches.find(b => b.isMain);
        setActiveBranchId(mainBranch?.id || persistedBranches[0]?.id || null);
      }
      
      if (persistedCommits.length > 0) {
        console.log(`Found ${persistedCommits.length} persisted commits for file from localStorage`);
        setCommits(persistedCommits);
        // Set current commit to the latest one
        const latestCommit = persistedCommits[0];
        if (latestCommit) {
          setCurrentCommitId(latestCommit.id);
        }
      }
      
      setIsLoadingTree(false);
    })();
    
    setTreeLoadPromise(loadPromise);
  }, [loadCommitsFromStorage, loadTreeFile]);

  const createInitialCommit = useCallback(async (modelData: LoadedModel, fileBuffer?: ArrayBuffer, filePath?: string) => {
    // Only create initial commit if no commits exist
    const targetPath = filePath || currentModel;
    
    if (!targetPath) {
      console.warn('createInitialCommit called without filePath and currentModel is not set');
      return;
    }

    // Wait for tree loading to complete before creating initial commit
    // This prevents race conditions where we create a duplicate initial commit
    if (treeLoadPromise) {
      console.log('Waiting for tree.json to finish loading before creating initial commit...');
      try {
        await treeLoadPromise;
        console.log('Tree loading complete, checking if initial commit is needed...');
      } catch (error) {
        console.warn('Tree loading failed, will proceed with initial commit creation:', error);
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
      console.log(`Skipping initial commit creation - ${currentCommitsCount} commits already exist from tree.json`);
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
          color: BRANCH_COLORS[0],
          isMain: true,
        };
        return [mainBranch];
      }
      return prevBranches;
    });
    setActiveBranchId(prev => prev || mainBranchId);

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
    console.log("Created initial commit:", initialCommit.id, fileBuffer ? `with ${fileBuffer.byteLength} byte file buffer` : 'without file buffer');
    
    const updatedCommits = [initialCommit];
    setCommits(updatedCommits);
    
    // Create the updated branch with the new headCommitId
    const mainBranch: Branch = {
      id: mainBranchId,
      name: 'main',
      headCommitId: commitId,
      color: BRANCH_COLORS[0],
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
        console.log(`Successfully saved initial commit file: commit-${initialCommit.id}.3dm`);
      } catch (err) {
        console.error('Failed to save commit file to 0studio folder:', err);
      }
    }
    
    // Explicitly save tree.json after initial commit (don't rely on useEffect which may be skipped during loading)
    if (desktopAPI.isDesktop) {
      try {
        const treeData = {
          version: '1.0',
          activeBranchId: mainBranchId,
          currentCommitId: commitId,
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
        console.log(`Successfully saved tree.json for initial commit`);
      } catch (err) {
        console.error('Failed to save tree.json for initial commit:', err);
      }
    }
  }, [currentModel, saveCommitsToStorage, treeLoadPromise]);

  // Auto-save tree.json whenever branches, commits, activeBranchId, or currentCommitId change
  // Skip saving during initial load (when commits/branches are being loaded)
  useEffect(() => {
    if (currentModel && (branches.length > 0 || commits.length > 0) && !isLoadingTree) {
      // Use a ref to track if we're currently clearing to avoid race conditions
      saveTreeFile(currentModel).catch(error => {
        // Only log if it's not a "file doesn't exist" type error (which can happen during cleanup)
        if (error && !error.message?.includes('ENOENT') && !error.message?.includes('not found')) {
          console.warn('Failed to auto-save tree.json (non-critical):', error);
        }
      });
    }
  }, [branches, commits, activeBranchId, currentCommitId, currentModel, saveTreeFile, isLoadingTree]);

  // Debug: Track hasUnsavedChanges state changes
  useEffect(() => {
    console.log('hasUnsavedChanges state changed to:', hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  // File change detection - mark unsaved changes when file changes on disk
  useEffect(() => {
    if (!desktopAPI.isDesktop || !currentModel) return;

    const handleFileChange = (event: any) => {
      console.log('File changed detected in version control:', event);
      
      if (event.eventType === 'change' && event.filePath && event.filePath === currentModel) {
        console.log('Model file changed on disk - marking as having unsaved changes');
        console.log('Before setting hasUnsavedChanges:', hasUnsavedChanges);
        setHasUnsavedChanges(true);
        console.log('hasUnsavedChanges should now be true');
      }
    };

    // Set up file change listener
    desktopAPI.onFileChanged(handleFileChange);

    // Cleanup
    return () => {
      desktopAPI.removeAllListeners('file-changed');
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
          console.log('Read exact file buffer from disk for commit:', buffer.byteLength, 'bytes');
        } else {
          console.warn('Failed to read file buffer from disk, commit will not have exact file');
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
          color: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
          parentBranchId: activeBranchId || undefined,
          originCommitId: pulledCommitId,
          isMain: false,
        };
        
        targetBranchId = newBranchId;
        parentCommitId = pulledCommitId;
        
        console.log(`Creating new branch "${branchName}" from commit ${pulledCommitId}`);
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
          console.log("Saved commit file to 0studio folder:", newCommit.id);
        } catch (error) {
          console.error("Failed to save commit file to 0studio folder:", error);
          toast.error("Failed to save commit file. Please check console for details.");
          throw error;
        }
      }
      
      setCurrentCommitId(newCommit.id);
      setHasUnsavedChanges(false);
      setPulledCommitId(null); // Clear pulled commit after successful commit

      console.log("Model commit created with file buffer:", newCommit.id, fileBuffer ? `${fileBuffer.byteLength} bytes` : 'no buffer');
      toast.success(newBranch ? `New branch "${newBranch.name}" created` : "Commit saved successfully");
    } catch (error) {
      console.error("Failed to commit model changes:", error);
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

  // Commit using AI to interpret the message and modify the model
  const commitWithAI = useCallback(async (message: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentModel) {
      return { success: false, error: "No model is currently open" };
    }

    if (!onAICommit) {
      return { success: false, error: "AI commit handler not set up" };
    }

    setIsProcessingAICommit(true);

    try {
      // Call the AI commit handler which will interpret the message and execute commands
      const result = await onAICommit(message);

      if (!result.success) {
        setIsProcessingAICommit(false);
        return { success: false, error: result.error };
      }

      // Use commitModelChanges to handle both local and cloud commits
      await commitModelChanges(`🤖 ${message}`, result.modelData);
      setIsProcessingAICommit(false);

      console.log("AI-driven commit created");
      return { success: true };
    } catch (error) {
      console.error("Failed to create AI commit:", error);
      setIsProcessingAICommit(false);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }, [currentModel, onAICommit, commitModelChanges]);

  const restoreToCommit = useCallback(async (commitId: string): Promise<boolean> => {
    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        console.error("Commit not found:", commitId);
        return false;
      }

      // Priority 1: Load from 0studio folder (file system storage) - PRIMARY METHOD
      let fileBuffer: ArrayBuffer | undefined;
      if (desktopAPI.isDesktop && currentModel) {
        const storedFile = await desktopAPI.readCommitFile(currentModel, commitId);
        if (storedFile) {
          fileBuffer = storedFile;
          console.log('Using file buffer from 0studio folder for restore:', fileBuffer.byteLength, 'bytes');
        }
      }

      // Priority 2: Fall back to in-memory file buffer
      if (!fileBuffer && commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
        console.log('Using in-memory file buffer from commit for restore:', fileBuffer.byteLength, 'bytes');
      }

      // Priority 3: Fall back to IndexedDB
      if (!fileBuffer && currentModel) {
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
          console.log('Using file buffer from IndexedDB for restore:', fileBuffer.byteLength, 'bytes');
        }
      }

      // Priority 4: Fall back to exporting modelData (less ideal)
      let modelData: LoadedModel | undefined = commit.modelData;
      if (!fileBuffer && modelData) {
        try {
          const { exportModelToBuffer } = await import('@/lib/rhino3dm-service');
          fileBuffer = await exportModelToBuffer(modelData);
          console.warn('Warning: Using exported model data for restore (may not be exact file)');
        } catch (exportError) {
          console.error('Failed to export model data to buffer:', exportError);
        }
      }

      // Load the model from file buffer if available
      if (fileBuffer) {
        const file = new File([fileBuffer], modelName || 'model.3dm', { type: 'application/octet-stream' });
        const { load3dmFile } = await import('@/lib/rhino3dm-service');
        const loaded = await load3dmFile(file);
        modelData = loaded;
        console.log('Loaded model from commit file for restore');
      }

      if (!modelData) {
        console.error("No model data found for commit:", commitId);
        return false;
      }

      // Restore the model by calling the callback provided by ModelContext
      if (onModelRestore) {
        onModelRestore(modelData);
        console.log("Model restored to commit:", commit);
      } else {
        console.error("Model restore callback not set");
        return false;
      }

      setCurrentCommitId(commitId);
      setHasUnsavedChanges(false);

      return true;
    } catch (error) {
      console.error("Failed to restore to commit:", error);
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
        console.error("Commit not found:", commitId);
        toast.error("Commit not found");
        return false;
      }

      let fileBuffer: ArrayBuffer | undefined;

      // Priority 1: Read from 0studio folder (file system storage) - PRIMARY METHOD
      if (desktopAPI.isDesktop) {
        const storedFile = await desktopAPI.readCommitFile(currentModel, commitId);
        if (storedFile) {
          fileBuffer = storedFile;
          console.log('Using file buffer from 0studio folder:', fileBuffer.byteLength, 'bytes');
        }
      }

      // Priority 2: Fall back to in-memory file buffer (for backwards compatibility)
      if (!fileBuffer && commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
        console.log('Using in-memory file buffer from commit:', fileBuffer.byteLength, 'bytes');
      }

      // Priority 3: Fall back to IndexedDB (for backwards compatibility)
      if (!fileBuffer) {
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
          console.log('Using file buffer from IndexedDB:', fileBuffer.byteLength, 'bytes');
        }
      }
      
      // Priority 4: Fall back to exporting modelData (less ideal, loses polysurface data)
      if (!fileBuffer && commit.modelData) {
        try {
          fileBuffer = await exportModelToBuffer(commit.modelData);
          console.warn('Warning: Using exported model data (may not be exact file):', fileBuffer.byteLength, 'bytes');
          toast.warning("Note: Using converted model data - may differ from original file");
        } catch (exportError) {
          console.error('Failed to export model data to buffer:', exportError);
          toast.error("Failed to convert model data to file");
          return false;
        }
      }
      
      // If we still don't have a file buffer, we can't proceed
      if (!fileBuffer) {
        console.error('No file data available for commit:', commitId, {
          hasFileBuffer: !!commit.fileBuffer,
          hasModelData: !!commit.modelData,
        });
        toast.error("No file data available for this commit. The commit may have been created before file buffer storage was implemented.");
        return false;
      }

      // Write the exact file buffer to disk
      await desktopAPI.writeFileBuffer(currentModel, fileBuffer);
      console.log('Exact file written to disk:', currentModel, fileBuffer.byteLength, 'bytes');

      // Touch the file to ensure Rhino detects the change
      // Read and immediately write to update file metadata
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyBuffer = await desktopAPI.readFileBuffer(currentModel);
      if (verifyBuffer && verifyBuffer.byteLength === fileBuffer.byteLength) {
        // File was written correctly, touch it again to trigger Rhino reload
        await desktopAPI.writeFileBuffer(currentModel, fileBuffer);
        console.log('File touched again to trigger Rhino reload');
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
      setPulledCommitId(commitId); // Track which commit was pulled for highlighting
      setHasUnsavedChanges(false);
      
      // Switch to the branch of this commit
      setActiveBranchId(commit.branchId);
      
      toast.success("File updated to exact commit version - Rhino should auto-reload");
      return true;
    } catch (error) {
      console.error("Failed to pull from commit:", error);
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
        console.log('Saved tree.json before clearing model');
      } catch (error) {
        // Don't throw - just log, as we're closing anyway
        console.warn('Failed to save tree.json before clearing (non-critical):', error);
      }
    }
    
    setCurrentModelState(null);
    setModelName(null);
    setCommits([]);
    setCurrentCommitId(null);
    setHasUnsavedChanges(false);
    // Reset gallery mode when closing project
    setIsGalleryMode(false);
    setSelectedCommitIds(new Set());
    // Reset branching state
    setBranches([]);
    setActiveBranchId(null);
    setPulledCommitId(null);
    // Reset tree loading state
    setTreeLoadPromise(null);
    setIsLoadingTree(false);
  }, [currentModel, branches, commits, saveTreeFile]);

  // Handle project-closed event from Electron
  useEffect(() => {
    if (!desktopAPI.isDesktop) return;

    const handleProjectClosed = async () => {
      console.log('Project closed event received, clearing model and resetting gallery mode');
      await clearCurrentModel();
    };

    // Set up project closed listener
    desktopAPI.onProjectClosed(handleProjectClosed);

    // Cleanup
    return () => {
      desktopAPI.removeAllListeners('project-closed');
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

  // Gallery mode functions
  const toggleGalleryMode = useCallback(() => {
    setIsGalleryMode(prev => {
      const newValue = !prev;
      if (!newValue) {
        // Clear selections when exiting gallery mode
        setSelectedCommitIds(new Set());
      }
      return newValue;
    });
  }, []);

  const toggleCommitSelection = useCallback((commitId: string) => {
    setSelectedCommitIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commitId)) {
        // Allow deselecting even if at max
        newSet.delete(commitId);
      } else {
        // Only allow adding if under the limit of 4
        if (newSet.size < 4) {
          newSet.add(commitId);
        }
      }
      return newSet;
    });
  }, []);

  const clearSelectedCommits = useCallback(() => {
    setSelectedCommitIds(new Set());
  }, []);

  // Branching functions
  const switchBranch = useCallback((branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    if (!branch) {
      console.error('Branch not found:', branchId);
      return;
    }
    
    setActiveBranchId(branchId);
    setCurrentCommitId(branch.headCommitId);
    setPulledCommitId(null);
    
    console.log(`Switched to branch: ${branch.name}`);
  }, [branches]);

  const keepBranch = useCallback((branchId: string) => {
    if (!currentModel) return;
    
    const branchToKeep = branches.find(b => b.id === branchId);
    if (!branchToKeep) {
      console.error('Branch not found:', branchId);
      return;
    }
    
    // Mark this branch as main and demote others
    const updatedBranches = branches.map(b => ({
      ...b,
      isMain: b.id === branchId,
    }));
    
    setBranches(updatedBranches);
    setActiveBranchId(branchId);
    
    // Save to storage
    saveCommitsToStorage(currentModel, commits, updatedBranches);
    
    toast.success(`Branch "${branchToKeep.name}" is now the main branch`);
    console.log(`Kept branch: ${branchToKeep.name}`);
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
      } catch (error) {
        console.error('Failed to load starred commits:', error);
      }
    }
  }, [currentModel, saveCommitsToStorage]);

  const value: VersionControlContextType = {
    currentModel,
    modelName,
    commits,
    currentCommitId,
    hasUnsavedChanges,
    isProcessingAICommit,
    // Branching
    branches,
    activeBranchId,
    pulledCommitId,
    // Actions
    setCurrentModel,
    commitModelChanges,
    commitWithAI,
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
    // Gallery mode
    isGalleryMode,
    selectedCommitIds,
    toggleGalleryMode,
    toggleCommitSelection,
    clearSelectedCommits,
    // Callbacks
    onModelRestore,
    setModelRestoreCallback,
    onAICommit,
    setAICommitCallback,
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