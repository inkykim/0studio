import { GitBranch, GitCommit, FileText, Plus, Minus, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Commit {
  id: string;
  message: string;
  author: string;
  time: string;
  hash: string;
}

interface FileChange {
  name: string;
  status: "added" | "modified" | "deleted";
  path: string;
}

const commits: Commit[] = [
  { id: "1", message: "Update shader materials", author: "you", time: "2m ago", hash: "a3f2b1c" },
  { id: "2", message: "Add environment mapping", author: "you", time: "1h ago", hash: "d4e5f6g" },
  { id: "3", message: "Refactor mesh geometry", author: "you", time: "3h ago", hash: "h7i8j9k" },
  { id: "4", message: "Initial model import", author: "you", time: "1d ago", hash: "l0m1n2o" },
  { id: "5", message: "Setup project structure", author: "you", time: "2d ago", hash: "p3q4r5s" },
];

const stagedChanges: FileChange[] = [
  { name: "material.glsl", status: "modified", path: "shaders/" },
  { name: "config.json", status: "modified", path: "src/" },
];

const unstagedChanges: FileChange[] = [
  { name: "model.obj", status: "added", path: "assets/" },
  { name: "texture.png", status: "added", path: "assets/" },
  { name: "old-shader.glsl", status: "deleted", path: "shaders/" },
];

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
          {/* Staged Changes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Staged Changes ({stagedChanges.length})
            </h3>
            <div className="space-y-1">
              {stagedChanges.map((file, idx) => (
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
              ))}
            </div>
          </section>

          {/* Unstaged Changes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Changes ({unstagedChanges.length})
            </h3>
            <div className="space-y-1">
              {unstagedChanges.map((file, idx) => (
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
              ))}
            </div>
          </section>

          {/* Commit History */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Commit History
            </h3>
            <div className="relative">
              {commits.map((commit, idx) => (
                <div key={commit.id} className="flex gap-3 group">
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div className="commit-dot mt-1.5" />
                    {idx < commits.length - 1 && <div className="commit-line my-1" style={{ minHeight: "32px" }} />}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-4 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate">{commit.message}</p>
                      <span className="text-code text-xs text-muted-foreground shrink-0">
                        {commit.hash}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {commit.author} • {commit.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};
