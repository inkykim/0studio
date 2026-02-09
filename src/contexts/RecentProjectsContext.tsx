import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

const STORAGE_KEY = "0studio_recent_projects";
const MAX_RECENT = 10;

export interface RecentProject {
  name: string;
  path: string;
  openedAt: number;
}

interface RecentProjectsContextType {
  recentProjects: RecentProject[];
  addRecentProject: (path: string, name?: string) => void;
  removeRecentProject: (path: string) => void;
  clearRecentProjects: () => void;
}

const RecentProjectsContext = createContext<RecentProjectsContextType | null>(null);

function loadFromStorage(): RecentProject[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as RecentProject[];
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn("Failed to load recent projects:", e);
  }
  return [];
}

function saveToStorage(projects: RecentProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn("Failed to save recent projects:", e);
  }
}

export function RecentProjectsProvider({ children }: { children: ReactNode }) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(recentProjects);
  }, [recentProjects]);

  const addRecentProject = useCallback((path: string, name?: string) => {
    const projectName = name || path.split(/[/\\]/).pop() || path;
    const openedAt = Date.now();

    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.path !== path);
      const updated = [
        { name: projectName, path, openedAt },
        ...filtered,
      ].slice(0, MAX_RECENT);
      return updated;
    });
  }, []);

  const removeRecentProject = useCallback((path: string) => {
    setRecentProjects((prev) => prev.filter((p) => p.path !== path));
  }, []);

  const clearRecentProjects = useCallback(() => {
    setRecentProjects([]);
  }, []);

  return (
    <RecentProjectsContext.Provider
      value={{
        recentProjects,
        addRecentProject,
        removeRecentProject,
        clearRecentProjects,
      }}
    >
      {children}
    </RecentProjectsContext.Provider>
  );
}

export function useRecentProjects() {
  const context = useContext(RecentProjectsContext);
  if (!context) {
    throw new Error("useRecentProjects must be used within RecentProjectsProvider");
  }
  return context;
}
