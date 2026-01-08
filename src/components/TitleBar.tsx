import { Circle } from "lucide-react";
import { useModel } from "@/contexts/ModelContext";
import { UserMenu } from "@/components/Auth";

export const TitleBar = () => {
  const { currentFile, fileName } = useModel();

  return (
    <div className="h-11 bg-panel-header border-b border-panel-border flex items-center px-4 select-none" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>

      {/* Left spacer for native traffic lights */}
      <div className="w-20" />

      {/* title and project info */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm font-medium text-muted-foreground">0studio</span>
        {currentFile && fileName ? (
          <>
            <span className="text-xs text-muted-foreground/60 ml-2">—</span>
            <span className="text-sm text-foreground ml-2">{fileName}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/60 ml-2">No model open</span>
        )}
      </div>

      {/* Right side - User menu */}
      <div className="w-20 flex items-center justify-end" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <UserMenu />
      </div>
    </div>
  );
};
