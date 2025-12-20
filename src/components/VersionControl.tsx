import { GitBranch, FileText, Plus, Minus, RefreshCw, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVersionControl, FileChange } from "@/contexts/VersionControlContext";
import { useModel } from "@/contexts/ModelContext";

const StatusIcon = ({ status }: { status: FileChange["status"] }) => {
  switch (status) {
    case "added":
      return <Plus className="w-3.5 h-3.5 text-foreground" />;
    case "modified":
      return <RefreshCw className="w-3.5 h-3.5 text-foreground" />;
    case "deleted":
      return <Minus className="w-3.5 h-3.5 text-foreground" />;
  }
};

export const VersionControl = () => {
  const { stagedChanges, unstagedChanges, commits, currentCommitId, restoreCommit } = useVersionControl();
  const { restoreScene } = useModel();

  const handleRestoreCommit = (commitId: string) => {
    const sceneState = restoreCommit(commitId);
    if (sceneState) {
      restoreScene(sceneState);
    }
  };

  return (
    <div className="h-full flex flex-col panel-glass">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Source Control</span>
        </div>
        <div className="flex items-center gap-1 text-code text-muted-foreground">
          <span>main</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Unstaged Changes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Changes ({unstagedChanges.length})
            </h3>
            <div className="space-y-1">
              {unstagedChanges.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No changes</p>
              ) : (
                unstagedChanges.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group"
                  >
                    <StatusIcon status={file.status} />
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-code text-sm flex-1 truncate">{file.name}</span>
                    <span className="text-code text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.path}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Staged Changes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Staged Changes ({stagedChanges.length})
            </h3>
            <div className="space-y-1">
              {stagedChanges.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No staged changes</p>
              ) : (
                stagedChanges.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group"
                  >
                    <StatusIcon status={file.status} />
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-code text-sm flex-1 truncate">{file.name}</span>
                    <span className="text-code text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.path}
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
              {commits.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No commits yet</p>
              ) : (
                commits.map((commit, idx) => {
                  const isCurrentCommit = commit.id === currentCommitId;
                  return (
                    <div 
                      key={commit.id} 
                      className={`flex gap-3 group cursor-pointer rounded-md transition-colors ${
                        isCurrentCommit ? 'bg-primary/10' : 'hover:bg-secondary/50'
                      }`}
                      onClick={() => handleRestoreCommit(commit.id)}
                      title={isCurrentCommit ? 'Current state' : 'Click to restore this commit'}
                    >
                      {/* Timeline */}
                      <div className="flex flex-col items-center">
                        <div className={`commit-dot mt-1.5 ${isCurrentCommit ? 'bg-primary' : ''}`} />
                        {idx < commits.length - 1 && <div className="commit-line my-1" style={{ minHeight: "32px" }} />}
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
                            {commit.hash}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {commit.author} • {commit.time}
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
