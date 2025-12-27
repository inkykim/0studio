import { Circle } from "lucide-react";
import { useVersionControl } from "@/contexts/VersionControlContext";

export const TitleBar = () => {
  const { currentProject, projectName, isGitRepo, openProject } = useVersionControl();

  return (
    <div className="h-11 bg-panel-header border-b border-panel-border flex items-center px-4 select-none" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>

      {/* Left spacer for native traffic lights */}
      <div className="w-20" />

      {/* title and project info */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm font-medium text-muted-foreground">0studio</span>
        {currentProject && projectName ? (
          <>
            <span className="text-xs text-muted-foreground/60 ml-2">—</span>
            <span className="text-sm text-foreground ml-2">{projectName}</span>
            {isGitRepo && (
              <Circle className="w-2 h-2 fill-green-500 text-green-500 ml-2" />
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground/60 ml-2">No project open</span>
        )}
      </div>

      {/* Right spacer for symmetry */}
      <div className="w-20" />
    </div>
  );
};
