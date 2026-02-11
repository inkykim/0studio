import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, ChevronRight } from "lucide-react";
import { useModel } from "@/contexts/ModelContext";
import { useRecentProjects } from "@/contexts/RecentProjectsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDesktopAPI } from "@/lib/desktop-api";

function shortenPath(path: string): string {
  const usersMatch = path.match(/^(\/Users\/[^/]+)(\/.*)?$/);
  if (usersMatch) {
    return "~" + (usersMatch[2] || "");
  }
  const winMatch = path.match(/^([A-Z]:\\Users\\[^\\]+)(\\.*)?$/i);
  if (winMatch) {
    return "~" + (winMatch[2]?.replace(/\\/g, "/") || "");
  }
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (parts.length > 2) {
    return "…/" + parts.slice(-2).join("/");
  }
  return path;
}

export function ProjectsPanel() {
  const { user } = useAuth();
  const { recentProjects } = useRecentProjects();
  const { triggerFileDialog } = useModel();
  const desktopAPI = useDesktopAPI();
  const isDesktop = desktopAPI.isDesktop;
  const signedIn = !!user;

  const handleOpenRecent = async (path: string) => {
    if (isDesktop) {
      await desktopAPI.openProjectByPath(path);
    }
  };

  return (
    <div className="h-full flex flex-col panel-glass">
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Projects</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <Button
            onClick={triggerFileDialog}
            variant="secondary"
            className="w-full justify-start gap-3 h-11 px-4"
          >
            <FolderOpen className="w-4 h-4 text-primary" />
            <span className="font-medium">Open project</span>
            <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
          </Button>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Recent projects
              </h3>
              {recentProjects.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {recentProjects.length}
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              {!signedIn ? (
                <p className="text-sm text-muted-foreground/70 py-3 px-1">
                  Sign in to see your recent projects.
                </p>
              ) : recentProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground/70 py-3 px-1">
                  No recent projects. Open a .3dm file to get started.
                </p>
              ) : (
                recentProjects.map((project) => (
                  <button
                    key={project.path}
                    onClick={() => handleOpenRecent(project.path)}
                    disabled={!isDesktop}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <span className="font-medium truncate flex-1 min-w-0 text-sm">
                      {project.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                      {shortenPath(project.path)}
                    </span>
                    {isDesktop && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
