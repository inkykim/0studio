import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from "react";
import * as THREE from "three";
import {
  load3dmFile,
  exportTo3dm,
  Rhino3dmMetadata,
} from "@/lib/rhino3dm-service";
import { desktopAPI } from "@/lib/desktop-api";
import { useVersionControl } from "./VersionControlContext";

// Serializable representation of a 3D object for storage
export interface SerializedObject {
  id: string;
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
  name: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  params?: {
    size?: number;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
  };
}

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
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
  name: string;
  color?: string;
  params?: {
    size?: number;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
  };
}

interface ModelContextType {
  // State
  loadedModel: LoadedModel | null;
  currentFile: string | null;
  fileName: string | null;
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;
  stats: SceneStats;
  generatedObjects: GeneratedObject[];
  lastFileChangeTime: string | null;
  
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
  
  // Serialization for version control
  serializeScene: () => SerializedObject[];
  restoreScene: (objects: SerializedObject[]) => void;
  
  // Internal refs for components
  setStats: (stats: SceneStats) => void;
  setSceneRef: (scene: THREE.Scene | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const ModelContext = createContext<ModelContextType | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [loadedModel, setLoadedModel] = useState<LoadedModel | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFileChangeTime, setLastFileChangeTime] = useState<string | null>(null);
  const [stats, setStats] = useState<SceneStats>({
    curves: 0,
    surfaces: 0,
    polysurfaces: 0,
  });
  const [generatedObjects, setGeneratedObjects] = useState<GeneratedObject[]>([]);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get version control functions
  // Note: VersionControlProvider must wrap ModelProvider for this to work
  const { markUnsavedChanges, setModelRestoreCallback, createInitialCommit } = useVersionControl();

  // Set up model restore callback for version control
  useEffect(() => {
    const handleModelRestore = (modelData: LoadedModel) => {
      console.log('Restoring model from version control:', modelData);
      setLoadedModel(modelData);
      // Stats will be recalculated by SceneStatsCalculator in ModelViewer
    };

    setModelRestoreCallback(handleModelRestore);
  }, [setModelRestoreCallback]);

  // Handle project opened via Electron's native file dialog
  useEffect(() => {
    if (!desktopAPI.isDesktop) return;

    const handleProjectOpened = async (project: { filePath: string; fileName: string }) => {
      console.log('Project opened via native dialog:', project);
      
      setIsLoading(true);
      setError(null);

      try {
        // Read the file using the actual file path from Electron
        const arrayBuffer = await desktopAPI.readFileBuffer(project.filePath);
        if (!arrayBuffer) {
          throw new Error('Failed to read file buffer');
        }

        // Create a File object for the rhino3dm loader
        const file = new File([arrayBuffer], project.fileName, { type: 'application/octet-stream' });
        
        // Load the 3dm file
        const result = await load3dmFile(file);
        setLoadedModel(result);

        // Use the actual file path from Electron (not hardcoded!)
        const filePath = project.filePath;
        setCurrentFile(filePath);
        setFileName(project.fileName);

        console.log('Set current file for watching:', filePath);

        // Create initial commit for version control with exact file buffer
        await createInitialCommit(result, arrayBuffer, filePath);
        console.log('Created initial commit for model opened via native dialog');

      } catch (err) {
        console.error('Failed to load 3DM file:', err);
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setIsLoading(false);
      }
    };

    desktopAPI.onProjectOpened(handleProjectOpened);

    // Cleanup
    return () => {
      desktopAPI.removeAllListeners('project-opened');
    };
  }, [createInitialCommit]);

  // File change detection and handling
  useEffect(() => {
    if (!desktopAPI.isDesktop) return;

    const handleFileChange = (event: any) => {
      console.log('3DM file changed on disk:', event);
      
      if (event.eventType === 'change' && event.filePath && event.filePath === currentFile) {
        // File was modified - reload the model automatically
        const changeTime = new Date().toLocaleTimeString();
        setLastFileChangeTime(changeTime);
        console.log(`Model file changed at ${changeTime}`);
        
        reloadModelFromDisk();
      }
    };

    // Set up file change listener
    desktopAPI.onFileChanged(handleFileChange);

    // Cleanup
    return () => {
      desktopAPI.removeAllListeners('file-changed');
    };
  }, [currentFile]); // Re-setup when current file changes

  const reloadModelFromDisk = useCallback(async () => {
    if (!currentFile) return;

    console.log('Reloading model from disk:', currentFile);
    setIsLoading(true);
    setError(null);

    try {
      if (desktopAPI.isDesktop) {
        // In Electron, read the file using IPC
        const arrayBuffer = await desktopAPI.readFileBuffer(currentFile);
        if (!arrayBuffer) {
          console.warn('Failed to read file buffer');
          return;
        }
        
        const fileName = currentFile.split('/').pop() || 'model.3dm';
        const file = new File([arrayBuffer], fileName, { type: 'application/octet-stream' });
        
        // Load the updated model
        const result = await load3dmFile(file);
        setLoadedModel(result);
        // Stats will be recalculated by SceneStatsCalculator in ModelViewer
        
        console.log('Model successfully reloaded from disk with updated geometry');
      } else {
        // In browser mode, we can't reload from disk
        console.log('Model file was updated externally (browser mode - cannot reload)');
      }
      
      // Mark as having unsaved changes
      if (markUnsavedChanges) {
        markUnsavedChanges();
      }
      
    } catch (err) {
      console.error("Failed to reload model from disk:", err);
      setError(err instanceof Error ? err.message : "Failed to reload model");
    } finally {
      setIsLoading(false);
    }
  }, [currentFile, markUnsavedChanges]);

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
      color,
      params: {
        size: params?.size,
        width: params?.width,
        height: params?.height,
        depth: params?.depth,
        radius: params?.radius,
      },
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
      
      // Get the file buffer for exact file storage in commits
      const fileBuffer = await file.arrayBuffer();
      
      // In browser mode, we only have the file name (no full path due to security)
      // For Electron, the native dialog path is preferred (handled via project-opened event)
      // This function is primarily for browser mode or drag-drop
      const filePath = file.name;
      
      setCurrentFile(filePath);
      setFileName(file.name);
      
      // Note: File watching requires a real file path, which is only available
      // when opening via Electron's native dialog. Browser mode doesn't support watching.
      if (desktopAPI.isDesktop) {
        console.log('File imported via browser input - file watching requires native dialog for full path');
      }

      // Create initial commit for version control with exact file buffer
      await createInitialCommit(result, fileBuffer, filePath);
      console.log('Created initial commit for imported model with file buffer:', fileBuffer.byteLength, 'bytes');
      
    } catch (err) {
      console.error("Failed to load 3DM file:", err);
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setIsLoading(false);
    }
  }, [createInitialCommit]);

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

  const clearModel = useCallback(async () => {
    // Stop file watching if in Electron
    if (desktopAPI.isDesktop) {
      try {
        await desktopAPI.stopFileWatching();
        console.log('Stopped watching file');
      } catch (err) {
        console.warn('Failed to stop file watching:', err);
      }
    }
    
    setLoadedModel(null);
    setCurrentFile(null);
    setFileName(null);
    setError(null);
  }, []);

  const triggerFileDialog = useCallback(async () => {
    if (desktopAPI.isDesktop) {
      // In Electron, use the native file dialog which provides the full path
      // The file will be loaded via the 'project-opened' event listener
      await desktopAPI.openProjectDialog();
    } else {
      // In browser mode, use the HTML file input
      fileInputRef.current?.click();
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Serialize current scene state for version control
  const serializeScene = useCallback((): SerializedObject[] => {
    return generatedObjects.map(obj => {
      const mesh = obj.object as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      
      return {
        id: obj.id,
        type: obj.type,
        name: obj.name,
        color: obj.color || `#${material.color.getHexString()}`,
        position: [mesh.position.x, mesh.position.y, mesh.position.z] as [number, number, number],
        rotation: [
          THREE.MathUtils.radToDeg(mesh.rotation.x),
          THREE.MathUtils.radToDeg(mesh.rotation.y),
          THREE.MathUtils.radToDeg(mesh.rotation.z),
        ] as [number, number, number],
        scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z] as [number, number, number],
        params: obj.params,
      };
    });
  }, [generatedObjects]);

  // Restore scene from serialized state
  const restoreScene = useCallback((objects: SerializedObject[]) => {
    // Clear existing objects
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
    
    // Recreate objects from serialized data
    const newObjects: GeneratedObject[] = objects.map(serialized => {
      const size = serialized.params?.size ?? 1;
      let geometry: THREE.BufferGeometry;
      
      switch (serialized.type) {
        case 'box':
          geometry = new THREE.BoxGeometry(
            serialized.params?.width ?? size,
            serialized.params?.height ?? size,
            serialized.params?.depth ?? size
          );
          break;
        case 'sphere':
          geometry = new THREE.SphereGeometry(serialized.params?.radius ?? size / 2, 32, 32);
          break;
        case 'cylinder':
          geometry = new THREE.CylinderGeometry(
            serialized.params?.radius ?? size / 2,
            serialized.params?.radius ?? size / 2,
            serialized.params?.height ?? size,
            32
          );
          break;
        case 'cone':
          geometry = new THREE.ConeGeometry(
            serialized.params?.radius ?? size / 2,
            serialized.params?.height ?? size,
            32
          );
          break;
        case 'torus':
          geometry = new THREE.TorusGeometry(
            serialized.params?.radius ?? size / 2,
            (serialized.params?.radius ?? size / 2) * 0.3,
            16,
            48
          );
          break;
        case 'plane':
          geometry = new THREE.PlaneGeometry(
            serialized.params?.width ?? size,
            serialized.params?.height ?? size
          );
          break;
        default:
          geometry = new THREE.BoxGeometry(size, size, size);
      }
      
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(serialized.color),
        metalness: 0.3,
        roughness: 0.7,
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...serialized.position);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(serialized.rotation[0]),
        THREE.MathUtils.degToRad(serialized.rotation[1]),
        THREE.MathUtils.degToRad(serialized.rotation[2])
      );
      mesh.scale.set(...serialized.scale);
      mesh.name = serialized.name;
      mesh.userData = { objectType: 'Generated', generatedId: serialized.id };
      
      return {
        id: serialized.id,
        object: mesh,
        type: serialized.type,
        name: serialized.name,
        color: serialized.color,
        params: serialized.params,
      };
    });
    
    setGeneratedObjects(newObjects);
  }, [generatedObjects]);

  return (
    <ModelContext.Provider
      value={{
        loadedModel,
        currentFile,
        fileName,
        isLoading,
        isExporting,
        error,
        stats,
        generatedObjects,
        lastFileChangeTime,
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
        serializeScene,
        restoreScene,
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


