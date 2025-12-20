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

export interface GeneratedObject {
  id: string;
  object: THREE.Object3D;
  type: string;
  name: string;
}

interface ModelContextType {
  // State
  loadedModel: LoadedModel | null;
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;
  stats: SceneStats;
  generatedObjects: GeneratedObject[];
  
  // Actions
  importFile: (file: File) => Promise<void>;
  exportScene: (filename?: string) => Promise<void>;
  clearModel: () => void;
  triggerFileDialog: () => void;
  clearError: () => void;
  
  // Scene manipulation
  addPrimitive: (type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane', params?: {
    size?: number;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    color?: string;
    position?: [number, number, number];
    name?: string;
  }) => string;
  removeObject: (id: string) => boolean;
  transformObject: (id: string, transform: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: number | [number, number, number];
  }) => boolean;
  setObjectColor: (id: string, color: string) => boolean;
  clearGeneratedObjects: () => void;
  
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
  const [generatedObjects, setGeneratedObjects] = useState<GeneratedObject[]>([]);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setSceneRef = useCallback((scene: THREE.Scene | null) => {
    sceneRef.current = scene;
  }, []);

  const addPrimitive = useCallback((
    type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane',
    params?: {
      size?: number;
      width?: number;
      height?: number;
      depth?: number;
      radius?: number;
      color?: string;
      position?: [number, number, number];
      name?: string;
    }
  ): string => {
    const id = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const size = params?.size ?? 1;
    const color = params?.color ?? '#888888';
    const position = params?.position ?? [0, 0, 0];
    const name = params?.name ?? `${type}_${id.slice(-4)}`;
    
    let geometry: THREE.BufferGeometry;
    
    switch (type) {
      case 'box':
        geometry = new THREE.BoxGeometry(
          params?.width ?? size,
          params?.height ?? size,
          params?.depth ?? size
        );
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(params?.radius ?? size / 2, 32, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(
          params?.radius ?? size / 2,
          params?.radius ?? size / 2,
          params?.height ?? size,
          32
        );
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(
          params?.radius ?? size / 2,
          params?.height ?? size,
          32
        );
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(
          params?.radius ?? size / 2,
          (params?.radius ?? size / 2) * 0.3,
          16,
          48
        );
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(
          params?.width ?? size,
          params?.height ?? size
        );
        break;
      default:
        geometry = new THREE.BoxGeometry(size, size, size);
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.3,
      roughness: 0.7,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.name = name;
    mesh.userData = { objectType: 'Generated', generatedId: id };
    
    const newObject: GeneratedObject = {
      id,
      object: mesh,
      type,
      name,
    };
    
    setGeneratedObjects(prev => [...prev, newObject]);
    
    return id;
  }, []);

  const removeObject = useCallback((id: string): boolean => {
    const obj = generatedObjects.find(o => o.id === id);
    if (!obj) return false;
    
    if (obj.object instanceof THREE.Mesh) {
      obj.object.geometry.dispose();
      const material = obj.object.material;
      if (Array.isArray(material)) {
        material.forEach(m => m.dispose());
      } else {
        material.dispose();
      }
    }
    
    setGeneratedObjects(prev => prev.filter(o => o.id !== id));
    return true;
  }, [generatedObjects]);

  const transformObject = useCallback((
    id: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: number | [number, number, number];
    }
  ): boolean => {
    const obj = generatedObjects.find(o => o.id === id);
    if (!obj) return false;
    
    if (transform.position) {
      obj.object.position.set(...transform.position);
    }
    if (transform.rotation) {
      obj.object.rotation.set(
        THREE.MathUtils.degToRad(transform.rotation[0]),
        THREE.MathUtils.degToRad(transform.rotation[1]),
        THREE.MathUtils.degToRad(transform.rotation[2])
      );
    }
    if (transform.scale !== undefined) {
      if (typeof transform.scale === 'number') {
        obj.object.scale.setScalar(transform.scale);
      } else {
        obj.object.scale.set(...transform.scale);
      }
    }
    
    // Force re-render by updating state
    setGeneratedObjects(prev => [...prev]);
    return true;
  }, [generatedObjects]);

  const setObjectColor = useCallback((id: string, color: string): boolean => {
    const obj = generatedObjects.find(o => o.id === id);
    if (!obj || !(obj.object instanceof THREE.Mesh)) return false;
    
    const material = obj.object.material as THREE.MeshStandardMaterial;
    material.color.set(color);
    material.needsUpdate = true;
    
    return true;
  }, [generatedObjects]);

  const clearGeneratedObjects = useCallback(() => {
    generatedObjects.forEach(obj => {
      if (obj.object instanceof THREE.Mesh) {
        obj.object.geometry.dispose();
        const material = obj.object.material;
        if (Array.isArray(material)) {
          material.forEach(m => m.dispose());
        } else {
          material.dispose();
        }
      }
    });
    setGeneratedObjects([]);
  }, [generatedObjects]);

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
        generatedObjects,
        importFile,
        exportScene,
        clearModel,
        triggerFileDialog,
        clearError,
        addPrimitive,
        removeObject,
        transformObject,
        setObjectColor,
        clearGeneratedObjects,
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


