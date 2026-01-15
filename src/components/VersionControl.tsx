import { useState, useEffect } from "react";
import { useModel } from "@/contexts/ModelContext";
import { useVersionControl } from "@/contexts/VersionControlContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Archive, Save, Star, Download, RotateCcw, Search, FolderOpen, X, Grid3x3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

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
    setCurrentModel,
    commitModelChanges,
    restoreToCommit,
    pullFromCommit,
    markUnsavedChanges,
    clearCurrentModel,
    toggleStarCommit,
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
    e.stopPropagation(); // Prevent triggering the restore action
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
      return; // Can only commit when there are unsaved changes
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
    clearCurrentModel();
  };

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
          <Archive className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Model Open</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Open a .3dm file to start tracking versions of your 3D model.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the Model Viewer tab to import a .3dm file
          </p>
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
                <Button 
                  onClick={handleCommit} 
                  disabled={!commitMessage.trim() || isCommitting}
                  className="w-full gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isCommitting ? "Saving Version..." : "Save Version"}
                </Button>
              </div>
            </section>
          )}


          {/* Version History */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Version History ({commits.length})
              </h3>
              <div className="flex items-center gap-1">
                {commits.length > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleGalleryMode}
                      className={`h-6 px-2 text-xs ${isGalleryMode ? 'bg-primary/10' : ''}`}
                      title={isGalleryMode ? 'Exit gallery mode' : 'Enter gallery mode to compare versions'}
                    >
                      <Grid3x3 className={`w-3 h-3 mr-1 ${isGalleryMode ? 'text-primary' : ''}`} />
                      {isGalleryMode ? 'Gallery' : 'Gallery'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowStarredOnly(!showStarredOnly)}
                      className="h-6 px-2 text-xs"
                    >
                      <Star className={`w-3 h-3 mr-1 ${showStarredOnly ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      {showStarredOnly ? 'Show All' : 'Starred'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {/* Search Input */}
            {commits.length > 0 && (
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
            
            <div className="relative">
              {commits.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">No versions saved yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save your first version to start tracking changes</p>
                </div>
              ) : (() => {
                // Filter commits based on search and starred filter
                let filteredCommits = commits;
                
                if (showStarredOnly) {
                  filteredCommits = filteredCommits.filter(commit => commit.starred);
                }
                
                if (searchQuery.trim()) {
                  const query = searchQuery.toLowerCase();
                  filteredCommits = filteredCommits.filter(commit =>
                    commit.message.toLowerCase().includes(query)
                  );
                }
                
                if (filteredCommits.length === 0) {
                  return (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground">
                        {showStarredOnly && searchQuery
                          ? 'No starred commits match your search'
                          : showStarredOnly
                          ? 'No starred commits yet'
                          : 'No commits match your search'}
                      </p>
                    </div>
                  );
                }
                
                return filteredCommits.map((commit, idx) => {
                  // Find original index for timeline continuity
                  const originalIdx = commits.findIndex(c => c.id === commit.id);
                  const isCurrentCommit = commit.id === currentCommitId;
                  return (
                    <div 
                      key={commit.id} 
                      className={`flex gap-3 group cursor-pointer rounded-md p-2 transition-colors ${
                        isCurrentCommit ? 'bg-primary/10' : 'hover:bg-secondary/50'
                      }`}
                      onClick={(e) => {
                        // Don't restore if clicking on star button or pull button
                        if ((e.target as HTMLElement).closest('.star-button')) return;
                        if ((e.target as HTMLElement).closest('.pull-button')) return;
                        if (!isCurrentCommit) handleRestoreCommit(commit.id);
                      }}
                      title={isCurrentCommit ? 'Current version' : 'Click to restore to this version'}
                    >
                      {/* Timeline / Checkbox */}
                      <div className="flex flex-col items-center">
                        {isGalleryMode ? (
                          <>
                            <Checkbox
                              checked={selectedCommitIds.has(commit.id)}
                              onCheckedChange={() => toggleCommitSelection(commit.id)}
                              className="mt-1.5"
                            />
                            {idx < filteredCommits.length - 1 && (
                              <div className="w-px bg-border my-1" style={{ minHeight: "32px" }} />
                            )}
                          </>
                        ) : (
                          <>
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${
                              isCurrentCommit ? 'bg-primary' : commit.starred ? 'bg-yellow-400' : 'bg-muted-foreground/40'
                            }`} />
                            {idx < filteredCommits.length - 1 && (
                              <div className="w-px bg-border my-1" style={{ minHeight: "32px" }} />
                            )}
                          </>
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <button
                              className="star-button p-0.5 hover:bg-secondary rounded transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStarCommit(commit.id);
                              }}
                              title={commit.starred ? 'Unstar this commit' : 'Star this commit'}
                            >
                              <Star 
                                className={`w-3.5 h-3.5 ${
                                  commit.starred 
                                    ? 'fill-yellow-400 text-yellow-400' 
                                    : 'text-muted-foreground hover:text-yellow-400'
                                } transition-colors`} 
                              />
                            </button>
                            <p className="text-sm font-medium truncate">{commit.message}</p>
                            {isCurrentCommit && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                current
                              </Badge>
                            )}
                          </div>
                          <span className="text-code text-xs text-muted-foreground shrink-0">
                            v{commits.length - originalIdx}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatTimeAgo(commit.timestamp)}
                        </p>
                      </div>
                      
                      {/* Action buttons on hover */}
                      {!isCurrentCommit && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            className="pull-button p-1 hover:bg-secondary rounded transition-colors"
                            onClick={(e) => handlePullCommit(commit.id, e)}
                            title="Pull this version to local file (updates file on disk)"
                          >
                            <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                          </button>
                          <div className="flex items-center">
                            <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};
