import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import * as THREE from "three";
import {
  load3dmFile,
  exportTo3dm,
  Rhino3dmMetadata,
} from "@/lib/rhino3dm-service";

export interface SceneStats {
  curves: number;
  surfaces: number;
  polysurfaces: number;
}

export interface LoadedModel {
  objects: THREE.Object3D[];
  metadata: Rhino3dmMetadata;
}

interface ModelContextType {
  // State
  loadedModel: LoadedModel | null;
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;
  stats: SceneStats;
  
  // Actions
  importFile: (file: File) => Promise<void>;
  exportScene: (filename?: string) => Promise<void>;
  clearModel: () => void;
  triggerFileDialog: () => void;
  clearError: () => void;
  
  // Internal refs for components
  setStats: (stats: SceneStats) => void;
  setSceneRef: (scene: THREE.Scene | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const ModelContext = createContext<ModelContextType | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [loadedModel, setLoadedModel] = useState<LoadedModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SceneStats>({
    curves: 0,
    surfaces: 0,
    polysurfaces: 0,
  });
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setSceneRef = useCallback((scene: THREE.Scene | null) => {
    sceneRef.current = scene;
  }, []);

  const importFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".3dm")) {
      setError("Please select a valid .3dm file");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await load3dmFile(file);
      setLoadedModel(result);
    } catch (err) {
      console.error("Failed to load 3DM file:", err);
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exportScene = useCallback(async (filename?: string) => {
    if (!sceneRef.current) {
      setError("No scene available to export");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const exportFilename = filename || 
        loadedModel?.metadata.fileName.replace(".3dm", "_export.3dm") || 
        "scene_export.3dm";
      await exportTo3dm(sceneRef.current, exportFilename);
    } catch (err) {
      console.error("Failed to export:", err);
      setError(err instanceof Error ? err.message : "Failed to export file");
    } finally {
      setIsExporting(false);
    }
  }, [loadedModel]);

  const clearModel = useCallback(() => {
    setLoadedModel(null);
    setError(null);
  }, []);

  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <ModelContext.Provider
      value={{
        loadedModel,
        isLoading,
        isExporting,
        error,
        stats,
        importFile,
        exportScene,
        clearModel,
        triggerFileDialog,
        clearError,
        setStats,
        setSceneRef,
        fileInputRef,
      }}
    >
      {children}
    </ModelContext.Provider>
  );
}

export function useModel() {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error("useModel must be used within a ModelProvider");
  }
  return context;
}


