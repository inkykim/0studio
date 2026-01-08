import { Archive, Clock, RotateCcw, Save, FolderOpen, X, Sparkles, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useCallback } from "react";
import { useModel } from "@/contexts/ModelContext";
import { useVersionControl } from "@/contexts/VersionControlContext";
import { interpretCommitMessage, isGeminiConfigured } from "@/lib/gemini-service";
import { parseGeminiResponse, executeCommands, SceneCommand } from "@/lib/scene-commands";

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
  const { 
    currentFile, 
    fileName, 
    clearModel, 
    triggerFileDialog, 
    loadedModel,
    addPrimitive,
    removeObject,
    transformObject,
    setObjectColor,
    clearGeneratedObjects,
    generatedObjects,
  } = useModel();
  const { 
    currentModel, 
    modelName, 
    commits, 
    currentCommitId, 
    hasUnsavedChanges,
    isProcessingAICommit,
    setCurrentModel,
    commitModelChanges,
    commitWithAI,
    restoreToCommit,
    markUnsavedChanges,
    clearCurrentModel,
    setAICommitCallback,
  } = useVersionControl();
  
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [useAICommit, setUseAICommit] = useState(true); // Default to AI mode when no 3dm changes
  const [aiError, setAiError] = useState<string | null>(null);

  // When a model file is loaded, update the version control
  useEffect(() => {
    if (currentFile && currentFile !== currentModel) {
      setCurrentModel(currentFile);
    }
  }, [currentFile, currentModel, setCurrentModel]);

  // Set up the AI commit callback
  const handleAICommit = useCallback(async (message: string): Promise<{ success: boolean; modelData?: typeof loadedModel; error?: string }> => {
    // Interpret the commit message using LLM
    const result = await interpretCommitMessage(message, {
      generatedObjects: generatedObjects.map(obj => ({
        id: obj.id,
        type: obj.type,
        name: obj.name,
      })),
    });

    if (!result.success || result.commands.length === 0) {
      return { 
        success: false, 
        error: result.error || "Could not interpret commit message as modeling instructions" 
      };
    }

    // Execute the commands
    const getLastObjectId = () => {
      return generatedObjects.length > 0 ? generatedObjects[generatedObjects.length - 1].id : null;
    };

    const executionResult = executeCommands(result.commands, {
      addPrimitive,
      removeObject,
      transformObject,
      setObjectColor,
      clearGeneratedObjects,
      getLastObjectId,
    });

    if (!executionResult.success) {
      return {
        success: false,
        error: `Some commands failed: ${executionResult.errors.join(", ")}`,
      };
    }

    // Return success with the current model data
    // Note: The model data will be captured after commands execute
    return {
      success: true,
      modelData: loadedModel || undefined,
    };
  }, [generatedObjects, addPrimitive, removeObject, transformObject, setObjectColor, clearGeneratedObjects, loadedModel]);

  // Register the AI commit callback
  useEffect(() => {
    setAICommitCallback(handleAICommit);
  }, [handleAICommit, setAICommitCallback]);

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
    if (!commitMessage.trim() || isCommitting) return;
    
    setIsCommitting(true);
    setAiError(null);
    
    try {
      // If we have unsaved 3dm changes, use traditional commit
      if (hasUnsavedChanges && loadedModel) {
        await commitModelChanges(commitMessage.trim(), loadedModel);
        setCommitMessage("");
      } 
      // Otherwise, if AI mode is enabled, use AI to interpret the message
      else if (useAICommit && isGeminiConfigured()) {
        const result = await commitWithAI(commitMessage.trim());
        if (result.success) {
          setCommitMessage("");
        } else {
          setAiError(result.error || "Failed to process AI commit");
        }
      }
    } catch (error) {
      console.error("Failed to commit:", error);
      setAiError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsCommitting(false);
    }
  };

  // Check if we can make an AI commit (when there are no 3dm changes)
  const canMakeAICommit = !hasUnsavedChanges && useAICommit && isGeminiConfigured() && currentFile;

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

          {/* AI Commit Mode - when no external 3dm changes */}
          {!hasUnsavedChanges && currentFile && (
            <section>
              <div className="space-y-4">
                {/* AI Mode Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <Label htmlFor="ai-mode" className="text-sm font-medium cursor-pointer">
                      AI Modeling Mode
                    </Label>
                  </div>
                  <Switch
                    id="ai-mode"
                    checked={useAICommit}
                    onCheckedChange={setUseAICommit}
                    disabled={!isGeminiConfigured()}
                  />
                </div>

                {useAICommit && isGeminiConfigured() ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Describe changes in natural language — the AI will modify the 3D model accordingly.
                    </p>
                    <Input
                      placeholder="e.g., Add a red sphere next to the box..."
                      value={commitMessage}
                      onChange={(e) => {
                        setCommitMessage(e.target.value);
                        setAiError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && commitMessage.trim() && !isCommitting && !isProcessingAICommit) {
                          handleCommit();
                        }
                      }}
                      className="bg-background/50"
                    />
                    {aiError && (
                      <p className="text-xs text-destructive">{aiError}</p>
                    )}
                    <Button 
                      onClick={handleCommit} 
                      disabled={!commitMessage.trim() || isCommitting || isProcessingAICommit}
                      className="w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
                    >
                      {isCommitting || isProcessingAICommit ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing with AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Apply Changes with AI
                        </>
                      )}
                    </Button>
                  </div>
                ) : !isGeminiConfigured() ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-muted-foreground">
                      Configure VITE_GEMINI_API_KEY to enable AI modeling
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No unsaved changes
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enable AI Mode above to create changes with natural language
                    </p>
                  </div>
                )}

                <div className="border-t border-border/50 pt-3">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => markUnsavedChanges()} 
                    className="w-full text-xs text-muted-foreground"
                  >
                    Or simulate external file changes
                  </Button>
                </div>
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