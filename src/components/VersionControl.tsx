import { Archive, Clock, RotateCcw, Save, FolderOpen, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useModel } from "@/contexts/ModelContext";
import { useVersionControl } from "@/contexts/VersionControlContext";

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

export const VersionControl = () => {
  const { currentFile, fileName, clearModel, triggerFileDialog } = useModel();
  const { 
    currentModel, 
    modelName, 
    commits, 
    currentCommitId, 
    hasUnsavedChanges, 
    setCurrentModel,
    commitModelChanges,
    restoreToCommit,
    markUnsavedChanges,
    clearCurrentModel
  } = useVersionControl();
  
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);

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

  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting || !hasUnsavedChanges) return;
    
    setIsCommitting(true);
    try {
      await commitModelChanges(commitMessage.trim());
      setCommitMessage("");
    } catch (error) {
      console.error("Failed to commit model:", error);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCloseModel = () => {
    clearModel();
    clearCurrentModel();
  };

  const handleOpenNewModel = () => {
    triggerFileDialog();
  };

  // If no model is open, show open model UI
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

          {/* Current Status */}
          {!hasUnsavedChanges && (
            <section>
              <div className="text-center py-6">
                <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No unsaved changes
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Make changes to your model file to create a new version
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => markUnsavedChanges()} 
                  className="mt-3"
                >
                  Simulate Changes
                </Button>
              </div>
            </section>
          )}

          {/* Version History */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Version History ({commits.length})
            </h3>
            <div className="relative">
              {commits.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">No versions saved yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save your first version to start tracking changes</p>
                </div>
              ) : (
                commits.map((commit, idx) => {
                  const isCurrentCommit = commit.id === currentCommitId;
                  return (
                    <div 
                      key={commit.id} 
                      className={`flex gap-3 group cursor-pointer rounded-md p-2 transition-colors ${
                        isCurrentCommit ? 'bg-primary/10' : 'hover:bg-secondary/50'
                      }`}
                      onClick={() => !isCurrentCommit && handleRestoreCommit(commit.id)}
                      title={isCurrentCommit ? 'Current version' : 'Click to restore to this version'}
                    >
                      {/* Timeline */}
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${
                          isCurrentCommit ? 'bg-primary' : 'bg-muted-foreground/40'
                        }`} />
                        {idx < commits.length - 1 && (
                          <div className="w-px bg-border my-1" style={{ minHeight: "32px" }} />
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{commit.message}</p>
                            {isCurrentCommit && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                current
                              </Badge>
                            )}
                          </div>
                          <span className="text-code text-xs text-muted-foreground shrink-0">
                            v{commits.length - idx}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatTimeAgo(commit.timestamp)}
                        </p>
                      </div>
                      
                      {/* Restore indicator on hover */}
                      {!isCurrentCommit && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                          <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};