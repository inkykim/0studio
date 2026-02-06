import { useState, useEffect, useMemo } from "react";
import { useModel } from "@/contexts/ModelContext";
import { useVersionControl, ModelCommit, Branch } from "@/contexts/VersionControlContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Archive, Save, Star, Download, Search, FolderOpen, X, Grid3x3, GitBranch, Network } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { GraphView } from "./GraphView";

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
};

// Simplified list view for commits (no branching tree visualization)
interface SimpleListProps {
  commits: ModelCommit[];
  branches: Branch[];
  currentCommitId: string | null;
  pulledCommitId: string | null;
  onRestoreCommit: (commitId: string) => void;
  onPullCommit: (commitId: string, e: React.MouseEvent) => void;
  onToggleStar: (commitId: string) => void;
  getVersionLabel: (commit: ModelCommit) => string;
  isGalleryMode: boolean;
  selectedCommitIds: Set<string>;
  onToggleSelection: (commitId: string) => void;
}

const SimpleList = ({
  commits,
  branches,
  currentCommitId,
  pulledCommitId,
  onRestoreCommit,
  onPullCommit,
  onToggleStar,
  getVersionLabel,
  isGalleryMode,
  selectedCommitIds,
  onToggleSelection,
}: SimpleListProps) => {
  // Sort commits by timestamp (newest first)
  const sortedCommits = useMemo(() => {
    return [...commits].sort((a, b) => b.timestamp - a.timestamp);
  }, [commits]);

  if (sortedCommits.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No versions saved yet</p>
        <p className="text-xs text-muted-foreground mt-1">Save your first version to start tracking changes</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sortedCommits.map((commit) => {
        const branch = branches.find((b) => b.id === commit.branchId);
        const isCurrentCommit = commit.id === currentCommitId;
        const isPulledCommit = commit.id === pulledCommitId;
        const versionLabel = getVersionLabel(commit);

        return (
          <div
            key={commit.id}
            className={`flex gap-3 group cursor-pointer rounded-md p-2 transition-colors ${
              isPulledCommit
                ? "bg-secondary/30 ring-2 ring-border"
                : isCurrentCommit
                ? "bg-primary/10"
                : "hover:bg-secondary/50"
            }`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(".star-button")) return;
              if ((e.target as HTMLElement).closest(".pull-button")) return;
              if (!isCurrentCommit) onRestoreCommit(commit.id);
            }}
            title={
              isPulledCommit
                ? "Active working version (pulled)"
                : isCurrentCommit
                ? "Current version"
                : "Click to restore to this version"
            }
          >
            {/* Checkbox for gallery mode */}
            {isGalleryMode && (
              <div className="flex items-center">
                <Checkbox
                  checked={selectedCommitIds.has(commit.id)}
                  onCheckedChange={() => onToggleSelection(commit.id)}
                  disabled={
                    !selectedCommitIds.has(commit.id) &&
                    selectedCommitIds.size >= 4
                  }
                  title={
                    !selectedCommitIds.has(commit.id) &&
                    selectedCommitIds.size >= 4
                      ? "Maximum of 4 models can be selected for gallery view"
                      : selectedCommitIds.has(commit.id)
                      ? "Click to deselect"
                      : "Click to select for gallery view"
                  }
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    className="star-button p-0.5 hover:bg-secondary rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(commit.id);
                    }}
                    title={
                      commit.starred ? "Unstar this commit" : "Star this commit"
                    }
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        commit.starred
                          ? "fill-foreground text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      } transition-colors`}
                    />
                  </button>
                  <p className="text-sm font-medium truncate">{commit.message}</p>
                  {isPulledCommit && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 bg-secondary/30 text-foreground border-border"
                    >
                      working
                    </Badge>
                  )}
                  {isCurrentCommit && !isPulledCommit && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      current
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-code text-xs text-muted-foreground shrink-0">
                    {versionLabel}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTimeAgo(commit.timestamp)}
              </p>
            </div>

            {/* Action buttons on hover */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <button
                className="pull-button p-1 hover:bg-secondary rounded transition-colors"
                onClick={(e) => onPullCommit(commit.id, e)}
                title="Pull this version to local file (updates file on disk)"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

type ViewMode = "list" | "graph";

export const VersionControl = () => {
  const { 
    currentFile, 
    fileName, 
    clearModel, 
    triggerFileDialog, 
    loadedModel,
  } = useModel();
  const { 
    currentModel, 
    modelName, 
    commits, 
    currentCommitId, 
    hasUnsavedChanges,
    branches,
    activeBranchId,
    pulledCommitId,
    setCurrentModel,
    commitModelChanges,
    restoreToCommit,
    pullFromCommit,
    markUnsavedChanges,
    clearCurrentModel,
    toggleStarCommit,
    getCommitVersionLabel,
    isGalleryMode,
    selectedCommitIds,
    toggleGalleryMode,
    toggleCommitSelection,
    clearSelectedCommits,
  } = useVersionControl();
  
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Get the current branch
  const currentBranch = useMemo(() => {
    return branches.find((b) => b.id === activeBranchId);
  }, [branches, activeBranchId]);

  // When a model file is loaded, update the version control
  useEffect(() => {
    if (currentFile && currentFile !== currentModel) {
      setCurrentModel(currentFile);
    }
  }, [currentFile, currentModel, setCurrentModel]);

  const handleRestoreCommit = async (commitId: string) => {
    try {
      const success = await restoreToCommit(commitId);
      if (success) {
        console.log(`Model restored to commit: ${commitId}`);
      }
    } catch (error) {
      console.error("Failed to restore commit:", error);
    }
  };

  const handlePullCommit = async (commitId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const success = await pullFromCommit(commitId);
      if (success) {
        console.log(`File pulled to commit: ${commitId}`);
      }
    } catch (error) {
      console.error("Failed to pull commit:", error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting) return;
    
    if (!hasUnsavedChanges || !loadedModel) {
      return;
    }
    
    setIsCommitting(true);
    
    try {
      await commitModelChanges(commitMessage.trim(), loadedModel);
      setCommitMessage("");
    } catch (error) {
      console.error("Failed to commit:", error);
      toast.error("Failed to save version");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleOpenNewModel = () => {
    triggerFileDialog();
  };

  const handleCloseModel = () => {
    clearModel();
    clearCurrentModel().catch(err => {
      console.warn('Error clearing model:', err);
    });
  };

  // Filter commits based on search and starred filter
  const filteredCommits = useMemo(() => {
    let filtered = commits;
    
    if (showStarredOnly) {
      filtered = filtered.filter(commit => commit.starred);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(commit =>
        commit.message.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [commits, showStarredOnly, searchQuery]);

  if (!currentFile) {
    return (
      <div className="h-full flex flex-col panel-glass">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Version Control</span>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Archive className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No model open</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col panel-glass">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Version Control</span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleOpenNewModel}
            className="h-6 px-2"
            title="Open new model"
          >
            <FolderOpen className="w-3 h-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCloseModel}
            className="h-6 px-2"
            title="Close model"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Commit Input */}
          {hasUnsavedChanges && (
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Save New Version
              </h3>
              <div className="space-y-2">
                <Input
                  placeholder="Describe these changes..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && commitMessage.trim()) {
                      handleCommit();
                    }
                  }}
                />
                {pulledCommitId && (
                  <p className="text-xs text-muted-foreground">
                    Creating new branch from {getCommitVersionLabel(commits.find(c => c.id === pulledCommitId)!)}
                  </p>
                )}
                <Button 
                  onClick={handleCommit} 
                  disabled={!commitMessage.trim() || isCommitting}
                  className="w-full gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isCommitting ? "Saving Version..." : pulledCommitId ? "Create Branch & Save" : "Save Version"}
                </Button>
              </div>
            </section>
          )}

          {/* Current Branch Indicator */}
          {currentBranch && (
            <section className="mb-2">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary/30 rounded-md">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">On branch</span>
                <span className="text-xs font-medium">{currentBranch.name}</span>
                {currentBranch.isMain && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    main
                  </Badge>
                )}
              </div>
            </section>
          )}

          {/* Version History */}
          <section className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Version History ({commits.length})
              </h3>
              <div className="flex items-center gap-1">
                {commits.length > 0 && (
                  <>
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-secondary/50 rounded-md p-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewMode("list")}
                        className={`h-5 px-2 text-xs rounded-sm ${
                          viewMode === "list"
                            ? "bg-background shadow-sm"
                            : "hover:bg-transparent"
                        }`}
                        title="List view"
                      >
                        <Archive className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewMode("graph")}
                        className={`h-5 px-2 text-xs rounded-sm ${
                          viewMode === "graph"
                            ? "bg-background shadow-sm"
                            : "hover:bg-transparent"
                        }`}
                        title="Graph view"
                      >
                        <Network className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleGalleryMode}
                      className={`h-6 px-2 text-xs ${isGalleryMode ? 'bg-primary/10' : ''}`}
                      title={isGalleryMode ? 'Exit gallery mode' : 'Enter gallery mode to compare versions'}
                    >
                      <Grid3x3 className={`w-3 h-3 mr-1 ${isGalleryMode ? 'text-primary' : ''}`} />
                      Gallery
                    </Button>
                    {viewMode === "list" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowStarredOnly(!showStarredOnly)}
                        className="h-6 px-2 text-xs"
                      >
                        <Star className={`w-3 h-3 mr-1 ${showStarredOnly ? 'fill-foreground text-foreground' : 'text-muted-foreground'}`} />
                        {showStarredOnly ? 'Show All' : 'Starred'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {/* Search Input - only in list view */}
            {commits.length > 0 && viewMode === "list" && (
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by commit message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}
            
            {/* View Content */}
            {viewMode === "graph" ? (
              <GraphView
                commits={commits}
                branches={branches}
                currentCommitId={currentCommitId}
                pulledCommitId={pulledCommitId}
                onSelectCommit={handleRestoreCommit}
                getVersionLabel={getCommitVersionLabel}
              />
            ) : filteredCommits.length === 0 && commits.length > 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">
                  {showStarredOnly && searchQuery
                    ? 'No starred commits match your search'
                    : showStarredOnly
                    ? 'No starred commits yet'
                    : 'No commits match your search'}
                </p>
              </div>
            ) : (
              <SimpleList
                commits={filteredCommits}
                branches={branches}
                currentCommitId={currentCommitId}
                pulledCommitId={pulledCommitId}
                onRestoreCommit={handleRestoreCommit}
                onPullCommit={handlePullCommit}
                onToggleStar={toggleStarCommit}
                getVersionLabel={getCommitVersionLabel}
                isGalleryMode={isGalleryMode}
                selectedCommitIds={selectedCommitIds}
                onToggleSelection={toggleCommitSelection}
              />
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};
