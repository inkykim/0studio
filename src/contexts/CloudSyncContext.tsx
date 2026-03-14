import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { toast } from "sonner";
import { cloudSyncService, type RemoteTreeData, type SyncStatus, findProjectIdByLocalPath, setCloudProjectPath } from "@/lib/cloud-sync-service";
import { projectAPI, type CloudProject } from "@/lib/project-api";
import { supabase } from "@/lib/supabase";
import { useVersionControl, type ModelCommit, type Branch } from "@/contexts/VersionControlContext";
import { usePresence } from '@/contexts/PresenceContext';

interface CloudSyncContextType {
  cloudProject: CloudProject | null;
  cloudSyncedCommitIds: Set<string>;
  cloudSyncStatus: SyncStatus | null;
  isCloudSyncing: boolean;
  pushToCloud: () => Promise<void>;
  pullFromCloud: () => Promise<void>;
  refreshCloudStatus: () => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncContextType | undefined>(undefined);

interface CloudSyncProviderProps {
  children: ReactNode;
}

export const CloudSyncProvider: React.FC<CloudSyncProviderProps> = ({ children }) => {
  const {
    currentModel,
    commits,
    branches,
    activeBranchId,
    currentCommitId,
    previouslyWorkingBranchId,
    setCommits,
    setBranches,
    cloudSyncedCommitIdsRef,
    setCloudSyncedCommitIdsExternal,
  } = useVersionControl();

  const { joinProject, leaveProject } = usePresence();

  // Cloud sync state
  const [cloudProject, setCloudProject] = useState<CloudProject | null>(null);
  const [cloudSyncedCommitIds, setCloudSyncedCommitIds] = useState<Set<string>>(new Set());
  const [cloudSyncStatus, setCloudSyncStatus] = useState<SyncStatus | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Keep the ref in VersionControlContext in sync so saveTreeFile can use it
  useEffect(() => {
    cloudSyncedCommitIdsRef.current = cloudSyncedCommitIds;
    setCloudSyncedCommitIdsExternal(cloudSyncedCommitIds);
  }, [cloudSyncedCommitIds, cloudSyncedCommitIdsRef, setCloudSyncedCommitIdsExternal]);

  // Auto-detect cloud project when model changes
  useEffect(() => {
    if (!currentModel) {
      setCloudProject(null);
      setCloudSyncStatus(null);
      setCloudSyncedCommitIds(new Set());
      return;
    }
  }, [currentModel]);

  // Detect cloud project in background when model is loaded
  // This replaces the inline async IIFE that was in setCurrentModel
  useEffect(() => {
    if (!currentModel) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        // Check localStorage mapping first
        if (userId) {
          const mappedProjectId = findProjectIdByLocalPath(userId, currentModel);
          if (mappedProjectId) {
            const allProjects = await projectAPI.getUserProjects();
            const proj = allProjects.find(p => p.id === mappedProjectId);
            if (proj && !cancelled) {
              setCloudProject(proj);
              return;
            }
          }
        }

        // Fall back to file path match (owner's original path)
        const proj = await projectAPI.getProjectByFilePath(currentModel);
        if (proj && !cancelled) {
          setCloudProject(proj);
          // Also save mapping for future lookups
          if (userId) setCloudProjectPath(userId, proj.id, currentModel);
        }
      } catch {
        // Not cloud-enabled, that's fine
      }
    })();

    return () => { cancelled = true; };
  }, [currentModel]);

  // Restore cloud synced commit IDs from tree data when model loads
  // This is triggered by VersionControlContext setting initialCloudSyncedCommitIds
  const { initialCloudSyncedCommitIds } = useVersionControl();
  useEffect(() => {
    if (initialCloudSyncedCommitIds && initialCloudSyncedCommitIds.length > 0) {
      const syncedSet = new Set(initialCloudSyncedCommitIds);
      setCloudSyncedCommitIds(syncedSet);
    }
  }, [initialCloudSyncedCommitIds]);

  // Join/leave presence channel when cloudProject changes
  useEffect(() => {
    if (cloudProject?.id) {
      joinProject(cloudProject.id);
    } else {
      leaveProject();
    }
    return () => leaveProject();
  }, [cloudProject?.id, joinProject, leaveProject]);

  const refreshCloudStatus = useCallback(async () => {
    if (!cloudProject) return;

    try {
      const remoteTree = await cloudSyncService.pullTreeJson(cloudProject.id);
      const remoteCommitIds = remoteTree?.commits?.map(c => c.id) || [];
      const localCommitIds = commits.map(c => c.id);
      const status = cloudSyncService.computeSyncStatus(
        localCommitIds,
        Array.from(cloudSyncedCommitIdsRef.current),
        remoteCommitIds
      );
      setCloudSyncStatus(status);
    } catch {
      // Silent catch
    }
  }, [cloudProject, commits, cloudSyncedCommitIdsRef]);

  const pushToCloud = useCallback(async () => {
    if (!cloudProject || !currentModel) {
      toast.error('Project is not cloud-enabled. Enable collaboration in Settings first.');
      return;
    }

    setIsCloudSyncing(true);
    try {
      const unsyncedCommitIds = commits
        .map(c => c.id)
        .filter(id => !cloudSyncedCommitIdsRef.current.has(id));

      if (unsyncedCommitIds.length === 0) {
        toast.info('All commits are already synced');
        setIsCloudSyncing(false);
        return;
      }

      toast.info(`Pushing ${unsyncedCommitIds.length} commit(s) to cloud...`);

      // Upload each unsynced commit file
      for (const commitId of unsyncedCommitIds) {
        let fileBuffer: ArrayBuffer | null = null;

        // Try reading from local 0studio folder first
        if (desktopAPI.isDesktop) {
          fileBuffer = await desktopAPI.readCommitFile(currentModel, commitId);
        }

        // Fall back to in-memory buffer
        if (!fileBuffer) {
          const commit = commits.find(c => c.id === commitId);
          if (commit?.fileBuffer) {
            fileBuffer = commit.fileBuffer;
          }
        }

        if (!fileBuffer) {
          continue;
        }

        await cloudSyncService.pushCommitFile(cloudProject.id, commitId, fileBuffer);
      }

      // Update synced IDs
      const newSynced = new Set(cloudSyncedCommitIdsRef.current);
      unsyncedCommitIds.forEach(id => newSynced.add(id));
      setCloudSyncedCommitIds(newSynced);

      // Push updated tree.json with cloud-synced IDs
      const treeData: RemoteTreeData = {
        version: '1.0',
        activeBranchId,
        currentCommitId,
        previouslyWorkingBranchId,
        cloudSyncedCommitIds: Array.from(newSynced),
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

      await cloudSyncService.pushTreeJson(cloudProject.id, treeData);

      // Refresh status
      await refreshCloudStatus();

      toast.success(`Pushed ${unsyncedCommitIds.length} commit(s) to cloud`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to push to cloud');
    } finally {
      setIsCloudSyncing(false);
    }
  }, [cloudProject, currentModel, commits, branches, activeBranchId, currentCommitId, previouslyWorkingBranchId, refreshCloudStatus, cloudSyncedCommitIdsRef]);

  const pullFromCloud = useCallback(async () => {
    if (!cloudProject || !currentModel) {
      toast.error('Project is not cloud-enabled. Enable collaboration in Settings first.');
      return;
    }

    setIsCloudSyncing(true);
    try {
      const remoteTree = await cloudSyncService.pullTreeJson(cloudProject.id);
      if (!remoteTree) {
        toast.info('No cloud data found for this project');
        setIsCloudSyncing(false);
        return;
      }

      const localCommitIds = new Set(commits.map(c => c.id));
      const remoteOnlyCommitIds = remoteTree.commits
        .map(c => c.id)
        .filter(id => !localCommitIds.has(id));

      if (remoteOnlyCommitIds.length === 0) {
        toast.info('Already up to date');
        setIsCloudSyncing(false);
        return;
      }

      toast.info(`Pulling ${remoteOnlyCommitIds.length} commit(s) from cloud...`);

      // Download each remote-only commit file
      for (const commitId of remoteOnlyCommitIds) {
        try {
          const fileBuffer = await cloudSyncService.pullCommitFile(cloudProject.id, commitId);

          // Save to local 0studio folder
          if (desktopAPI.isDesktop) {
            await desktopAPI.saveCommitFile(currentModel, commitId, fileBuffer);
          }

        } catch {
          // Silent catch
        }
      }

      // Merge remote commits and branches into local state
      const mergedCommitMap = new Map<string, ModelCommit>();
      for (const c of commits) {
        mergedCommitMap.set(c.id, c);
      }
      for (const rc of remoteTree.commits) {
        if (!mergedCommitMap.has(rc.id)) {
          mergedCommitMap.set(rc.id, {
            id: rc.id,
            message: rc.message,
            timestamp: rc.timestamp,
            parentCommitId: rc.parentCommitId,
            branchId: rc.branchId,
            starred: rc.starred,
          });
        }
      }

      const mergedBranchMap = new Map<string, Branch>();
      for (const b of branches) {
        mergedBranchMap.set(b.id, b);
      }
      for (const rb of remoteTree.branches) {
        if (!mergedBranchMap.has(rb.id)) {
          mergedBranchMap.set(rb.id, {
            id: rb.id,
            name: rb.name,
            headCommitId: rb.headCommitId,
            color: rb.color,
            isMain: rb.isMain,
            parentBranchId: rb.parentBranchId,
            originCommitId: rb.originCommitId,
          });
        } else {
          // Update head if remote is newer
          const local = mergedBranchMap.get(rb.id)!;
          const localHead = mergedCommitMap.get(local.headCommitId);
          const remoteHead = mergedCommitMap.get(rb.headCommitId);
          if (remoteHead && localHead && remoteHead.timestamp > localHead.timestamp) {
            mergedBranchMap.set(rb.id, { ...local, headCommitId: rb.headCommitId });
          }
        }
      }

      const mergedCommits = Array.from(mergedCommitMap.values()).sort((a, b) => b.timestamp - a.timestamp);
      const mergedBranches = Array.from(mergedBranchMap.values());

      // Update synced IDs (all remote commits are now locally available)
      const newSynced = new Set(cloudSyncedCommitIdsRef.current);
      remoteTree.commits.forEach(c => newSynced.add(c.id));
      setCloudSyncedCommitIds(newSynced);

      setCommits(mergedCommits);
      setBranches(mergedBranches);

      // Refresh sync status
      const allIds = mergedCommits.map(c => c.id);
      const remoteIds = remoteTree.commits.map(c => c.id);
      const status = cloudSyncService.computeSyncStatus(allIds, Array.from(newSynced), remoteIds);
      setCloudSyncStatus(status);

      toast.success(`Pulled ${remoteOnlyCommitIds.length} commit(s) from cloud`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pull from cloud');
    } finally {
      setIsCloudSyncing(false);
    }
  }, [cloudProject, currentModel, commits, branches, setCommits, setBranches, cloudSyncedCommitIdsRef]);

  const value: CloudSyncContextType = {
    cloudProject,
    cloudSyncedCommitIds,
    cloudSyncStatus,
    isCloudSyncing,
    pushToCloud,
    pullFromCloud,
    refreshCloudStatus,
  };

  return (
    <CloudSyncContext.Provider value={value}>
      {children}
    </CloudSyncContext.Provider>
  );
};

export const useCloudSync = (): CloudSyncContextType => {
  const context = useContext(CloudSyncContext);
  if (!context) {
    throw new Error("useCloudSync must be used within a CloudSyncProvider");
  }
  return context;
};
