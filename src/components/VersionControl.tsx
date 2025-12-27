import { GitBranch, FileText, Plus, Minus, RefreshCw, RotateCcw, FolderOpen, GitCommit, Upload, Download, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useVersionControl, FileChange } from "@/contexts/VersionControlContext";
import { useModel } from "@/contexts/ModelContext";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const StatusIcon = ({ status }: { status: FileChange["status"] }) => {
  switch (status) {
    case "added":
      return <Plus className="w-3.5 h-3.5 text-green-600" />;
    case "modified":
      return <RefreshCw className="w-3.5 h-3.5 text-blue-600" />;
    case "deleted":
      return <Minus className="w-3.5 h-3.5 text-red-600" />;
    case "staged":
      return <GitCommit className="w-3.5 h-3.5 text-yellow-600" />;
    case "untracked":
      return <Plus className="w-3.5 h-3.5 text-gray-600" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

export const VersionControl = () => {
  const { 
    currentProject, 
    projectName, 
    isGitRepo,
    gitStatus,
    gitCommits,
    currentBranch,
    stagedChanges, 
    unstagedChanges, 
    commits, 
    currentCommitId, 
    openProject,
    initRepository,
    commitChanges,
    pushChanges,
    pullChanges,
    checkoutCommit,
    restoreCommit,
    hasUnstagedChanges,
    hasStagedChanges
  } = useVersionControl();
  
  const { restoreScene } = useModel();
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);

  const handleRestoreCommit = (commitId: string) => {
    const sceneState = restoreCommit(commitId);
    if (sceneState) {
      restoreScene(sceneState);
    }
  };

  const handleGitCheckout = async (commitHash: string) => {
    try {
      await checkoutCommit(commitHash);
    } catch (error) {
      console.error("Failed to checkout commit:", error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting) return;
    
    setIsCommitting(true);
    try {
      await commitChanges(commitMessage.trim());
      setCommitMessage("");
    } catch (error) {
      console.error("Failed to commit:", error);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    try {
      await pushChanges();
    } catch (error) {
      console.error("Failed to push:", error);
    }
  };

  const handlePull = async () => {
    try {
      await pullChanges();
    } catch (error) {
      console.error("Failed to pull:", error);
    }
  };

  // If no project is open, show open project UI
  if (!currentProject) {
    return (
      <div className="h-full flex flex-col panel-glass">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Source Control</span>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Project Open</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Open a .3dm file to start version control for your 3D model.
          </p>
          <Button onClick={openProject} className="gap-2">
            <FolderOpen className="w-4 h-4" />
            Open .3dm Project
          </Button>
        </div>
      </div>
    );
  }

  // If project is open but no git repo, show initialization UI
  if (!isGitRepo) {
    return (
      <div className="h-full flex flex-col panel-glass">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Source Control</span>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Settings className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Initialize Repository</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Initialize a Git repository to start tracking versions of <strong>{projectName}</strong>.
          </p>
          <Button onClick={initRepository} className="gap-2">
            <GitBranch className="w-4 h-4" />
            Initialize Git Repository
          </Button>
        </div>
      </div>
    );
  }

  const displayCommits = gitCommits.length > 0 ? gitCommits : commits;
  const displayUnstaged = gitStatus?.files.filter(f => !f.staged) || unstagedChanges;
  const displayStaged = gitStatus?.files.filter(f => f.staged) || stagedChanges;

  return (
    <div className="h-full flex flex-col panel-glass">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Source Control</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-code text-muted-foreground">
            <span>{currentBranch}</span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handlePull} className="h-6 px-2">
              <Download className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handlePush} className="h-6 px-2">
              <Upload className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Commit Input */}
          {(displayUnstaged.length > 0 || displayStaged.length > 0) && (
            <section>
              <div className="space-y-2">
                <Input
                  placeholder="Commit message..."
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
                  <GitCommit className="w-4 h-4" />
                  {isCommitting ? "Committing..." : "Commit Changes"}
                </Button>
              </div>
            </section>
          )}

          {/* Unstaged Changes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Changes ({displayUnstaged.length})
            </h3>
            <div className="space-y-1">
              {displayUnstaged.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No changes</p>
              ) : (
                displayUnstaged.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group"
                  >
                    <StatusIcon status={file.status} />
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-code text-sm flex-1 truncate">{file.name || file.path}</span>
                    <span className="text-code text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Staged Changes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Staged Changes ({displayStaged.length})
            </h3>
            <div className="space-y-1">
              {displayStaged.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No staged changes</p>
              ) : (
                displayStaged.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group"
                  >
                    <StatusIcon status={file.status} />
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-code text-sm flex-1 truncate">{file.name || file.path}</span>
                    <span className="text-code text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      staged
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Commit History */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Commit History
            </h3>
            <div className="relative">
              {displayCommits.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No commits yet</p>
              ) : (
                displayCommits.map((commit, idx) => {
                  const commitId = commit.hash || commit.id;
                  const isCurrentCommit = commitId === currentCommitId || idx === 0;
                  return (
                    <div 
                      key={commitId} 
                      className={`flex gap-3 group cursor-pointer rounded-md transition-colors ${
                        isCurrentCommit ? 'bg-primary/10' : 'hover:bg-secondary/50'
                      }`}
                      onClick={() => gitCommits.length > 0 ? handleGitCheckout(commitId) : handleRestoreCommit(commitId)}
                      title={isCurrentCommit ? 'Current state' : 'Click to restore this commit'}
                    >
                      {/* Timeline */}
                      <div className="flex flex-col items-center">
                        <div className={`commit-dot mt-1.5 ${isCurrentCommit ? 'bg-primary' : ''}`} />
                        {idx < displayCommits.length - 1 && <div className="commit-line my-1" style={{ minHeight: "32px" }} />}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 pb-4 min-w-0 pr-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{commit.message}</p>
                            {isCurrentCommit && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                                current
                              </span>
                            )}
                          </div>
                          <span className="text-code text-xs text-muted-foreground shrink-0">
                            {(commit.hash || commit.id).substring(0, 7)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {commit.author} • {commit.time || commit.date}
                        </p>
                      </div>
                      
                      {/* Restore indicator on hover */}
                      {!isCurrentCommit && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center pr-2">
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
