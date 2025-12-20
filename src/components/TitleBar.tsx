import { Circle } from "lucide-react";

export const TitleBar = () => {
  return (
    <div className="h-11 bg-panel-header border-b border-panel-border flex items-center px-4 select-none" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>

      {/* window control buttons */}
      <div className="flex items-center gap-2 mr-6" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button className="w-3 h-3 rounded-full bg-foreground hover:opacity-70 transition-all" />
        <button className="w-3 h-3 rounded-full border border-foreground hover:bg-foreground/20 transition-all" />
        <button className="w-3 h-3 rounded-full border border-foreground hover:bg-foreground/20 transition-all" />
      </div>

      {/* title */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm font-medium text-muted-foreground">0studio</span>
        <span className="text-xs text-muted-foreground/60 ml-2">demo.3dm</span>
      </div>

      {/* spacer for symmetry */}
      <div className="w-16" />
    </div>
  );
};
