import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import {
  FileBox,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModel, SceneStats, GeneratedObject, LoadedModel } from "@/contexts/ModelContext";
import { useVersionControl } from "@/contexts/VersionControlContext";
import { TooltipProvider } from "@/components/ui/tooltip";

function DefaultCube() {
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#888888" metalness={0.3} roughness={0.7} />
    </mesh>
  );
}

/**
 * Calculates the camera distance needed to fit a bounding box in the viewport
 * Uses the bounding sphere approach for reliable fitting from any angle
 */
function calculateCameraDistance(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  padding: number = 1.2
): number {
  if (box.isEmpty()) return 10;
  
  // Calculate the bounding sphere that contains the box
  // The radius is the maximum distance from center to any corner
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = size.length() * 0.5; // Distance from center to corner (half the diagonal)
  
  if (radius === 0) return 10;
  
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect;
  const tanHalfFov = Math.tan(fov / 2);
  
  // For a perspective camera, the visible sphere radius at distance d is:
  // We need to fit the sphere in both vertical and horizontal directions
  // Vertical: 2 * d * tan(fov/2) >= 2 * radius  =>  d >= radius / tan(fov/2)
  // Horizontal: 2 * d * tan(fov/2) * aspect >= 2 * radius  =>  d >= radius / (tan(fov/2) * aspect)
  
  const distanceY = radius / tanHalfFov;
  const distanceX = radius / (tanHalfFov * aspect);
  
  // Use the larger distance to ensure the sphere fits in both dimensions
  const distance = Math.max(distanceX, distanceY);
  
  // Apply padding and ensure minimum distance
  return Math.max(0.1, distance * padding);
}

/**
 * Positions the camera to view the model centered and fit to screen
 * Uses a consistent isometric-like angle for all models
 */
function fitCameraToModel(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  controls?: { target: THREE.Vector3; update: () => void } | null
): void {
  if (box.isEmpty()) {
    camera.position.set(5, 5, 8);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
    return;
  }
  
  // Calculate optimal distance to fit the bounding box
  const distance = calculateCameraDistance(box, camera, 1.2);
  
  // Use a consistent camera angle: 45° elevation, 45° azimuth
  // This creates an isometric-like view that's consistent across all models
  const elevation = Math.PI / 4; // 45 degrees
  const azimuth = Math.PI / 4;   // 45 degrees
  
  // Calculate position on a sphere around the origin
  const x = distance * Math.cos(elevation) * Math.cos(azimuth);
  const y = distance * Math.sin(elevation);
  const z = distance * Math.cos(elevation) * Math.sin(azimuth);
  
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  
  // Update controls to look at center
  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function LoadedObjects({ objects, onScaleChange }: { objects: THREE.Object3D[]; onScaleChange?: (scale: number) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, controls } = useThree();
  
  // Cast controls to access OrbitControls methods (drei's OrbitControls sets this)
  const orbitControls = controls as unknown as { target: THREE.Vector3; update: () => void } | null;

  useLayoutEffect(() => {
    console.log(`LoadedObjects effect triggered with ${objects.length} objects`);
    
    if (groupRef.current && objects.length > 0) {
      // Clear existing children
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }

      console.log("Adding objects to scene...");
      
      // Add new objects
      objects.forEach((obj, index) => {
        const clonedObj = obj.clone();
        
        // Make sure materials are visible
        clonedObj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.material) {
              const mat = child.material as THREE.MeshStandardMaterial;
              // Ensure material is not pure black
              if (mat.color) {
                const c = mat.color;
                if (c.r < 0.1 && c.g < 0.1 && c.b < 0.1) {
                  mat.color.setHex(0xaaaaaa);
                  console.log(`Fixed black material on ${child.name}`);
                }
              }
              mat.needsUpdate = true;
            }
          }
        });
        
        groupRef.current!.add(clonedObj);
        console.log(`Added object ${index}: ${obj.name || 'unnamed'}, type: ${obj.type}`);
      });

      console.log(`Total objects in group: ${groupRef.current.children.length}`);

      // Reset position and scale first
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.scale.set(1, 1, 1);
      groupRef.current.rotation.set(0, 0, 0);

      // Force update the matrix before calculating bounding box
      groupRef.current.updateMatrixWorld(true);

      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(groupRef.current);
      
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        console.log(`File: ${objects[0]?.userData?.fileName || 'Unknown'}`);
        console.log(`Bounding box - min: (${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)})`);
        console.log(`Bounding box - max: (${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})`);
        console.log(`Bounding box - center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
        console.log(`Bounding box - size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
        
        // Move group so its center is at origin - ensure we're using the correct center
        console.log(`Moving group by: (${(-center.x).toFixed(2)}, ${(-center.y).toFixed(2)}, ${(-center.z).toFixed(2)})`);
        groupRef.current.position.set(-center.x, -center.y, -center.z);
        
        // Force another matrix update after positioning
        groupRef.current.updateMatrixWorld(true);
        
        // Scale model down slightly to make it more proportional to grid
        const scaleFactor = 0.85; // Scale down by 15%
        groupRef.current.scale.setScalar(scaleFactor);
        
        // Verify the centering worked by recalculating the bounding box
        groupRef.current.updateMatrixWorld(true);
        const centeredBox = new THREE.Box3().setFromObject(groupRef.current);
        const verifyCenter = centeredBox.getCenter(new THREE.Vector3());
        console.log(`After centering - new center: (${verifyCenter.x.toFixed(2)}, ${verifyCenter.y.toFixed(2)}, ${verifyCenter.z.toFixed(2)})`);

        // Calculate model scale for grid adjustment
        // Use the size before scaling to determine appropriate grid scale
        const modelSize = size; // Use original size before scaling
        const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
        // Calculate scale factor: if model is 10 units, scale should be 10
        // This will make grid cells scale proportionally
        const calculatedScale = maxDim > 0 ? maxDim : 1;
        
        // Notify parent of scale change for grid adjustment
        if (onScaleChange) {
          onScaleChange(calculatedScale);
        }

        // Ensure camera aspect is up to date
        camera.updateProjectionMatrix();
        
        // Position camera to fit the model in view
        fitCameraToModel(camera as THREE.PerspectiveCamera, centeredBox, orbitControls);
        
        console.log(`Camera positioned at: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
      } else {
        console.warn("Bounding box is empty!");
      }
      
      console.log("Objects successfully added and centered");
    } else {
      console.log("No objects to display or group ref not ready");
    }
  }, [objects, camera, controls]);

  return <group ref={groupRef} />;
}

function GeneratedObjects({ objects }: { objects: GeneratedObject[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, controls } = useThree();
  
  // Cast controls to access OrbitControls methods
  const orbitControls = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
  
  useLayoutEffect(() => {
    if (!groupRef.current) return;
    
    console.log(`GeneratedObjects effect triggered with ${objects.length} objects`);
    
    // Clear existing children
    while (groupRef.current.children.length > 0) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    
    // Add all generated objects
    objects.forEach((genObj, index) => {
      groupRef.current!.add(genObj.object);
      console.log(`Added generated object ${index}: ${genObj.object.name || 'unnamed'}`);
    });
    
    if (objects.length > 0) {
      // Reset position and scale first
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.scale.set(1, 1, 1);
      groupRef.current.rotation.set(0, 0, 0);

      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(groupRef.current);
      
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        console.log(`Generated objects - center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
        console.log(`Generated objects - size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
        
        // Move group so its center is at origin
        groupRef.current.position.set(-center.x, -center.y, -center.z);
        
        // Force matrix update after positioning
        groupRef.current.updateMatrixWorld(true);

        // Recalculate bounding box after centering for accurate camera positioning
        const centeredBox = new THREE.Box3().setFromObject(groupRef.current);
        
        // Ensure camera aspect is up to date
        camera.updateProjectionMatrix();
        
        // Position camera to fit the model in view (no scaling - let camera handle fit)
        fitCameraToModel(camera as THREE.PerspectiveCamera, centeredBox, orbitControls);
        
        console.log(`Camera positioned for generated objects at: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
      }
    }
    
    return () => {
      // Remove objects from group on cleanup (but don't dispose - context handles that)
      if (groupRef.current) {
        while (groupRef.current.children.length > 0) {
          groupRef.current.remove(groupRef.current.children[0]);
        }
      }
    };
  }, [objects, camera, controls]);
  
  return <group ref={groupRef} />;
}

function GridFloor({ modelScale = 1 }: { modelScale?: number }) {
  // Calculate grid scale based on model scale
  // If model is large, scale grid up proportionally to match
  // Default grid cell size is 1, section size is 10
  const baseCellSize = 1;
  const baseSectionSize = 10;
  
  // Scale grid proportionally to model size
  // Use a power function to get reasonable grid sizes
  // For very large models, we want larger grid cells
  const scaleFactor = Math.pow(modelScale, 0.5); // Square root for smoother scaling
  const cellSize = baseCellSize * scaleFactor;
  const sectionSize = baseSectionSize * scaleFactor;
  
  // Round to nice numbers for grid (powers of 10, or 1, 2, 5, etc.)
  const roundToNiceNumber = (value: number): number => {
    if (value <= 0) return 0.1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let nice: number;
    if (normalized <= 1) nice = 1;
    else if (normalized <= 2) nice = 2;
    else if (normalized <= 5) nice = 5;
    else nice = 10;
    return nice * magnitude;
  };
  
  const finalCellSize = roundToNiceNumber(Math.max(0.1, Math.min(100, cellSize)));
  const finalSectionSize = roundToNiceNumber(Math.max(1, Math.min(1000, sectionSize)));
  
  return (
    <Grid
      args={[200, 200]}
      cellSize={finalCellSize}
      cellThickness={0.6}
      cellColor="#555555"
      sectionSize={finalSectionSize}
      sectionThickness={0.8}
      sectionColor="#555555"
      fadeDistance={200}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid={true}
      position={[0, -0.01, 0]}
    />
  );
}

function SceneStatsCalculator({
  onStatsUpdate,
  modelObjects,
  generatedObjects,
}: {
  onStatsUpdate: (stats: SceneStats) => void;
  modelObjects: THREE.Object3D[] | null;
  generatedObjects: GeneratedObject[];
}) {
  useEffect(() => {
    const calculateStats = () => {
      let curves = 0;
      let surfaces = 0;
      let polysurfaces = 0;

      // Count objects from the loaded model
      if (modelObjects && modelObjects.length > 0) {
        const objectDetails: string[] = [];
        
        modelObjects.forEach((obj) => {
          obj.traverse((child) => {
            // Get the original Rhino object type from userData
            const objectType = child.userData?.objectType as string | undefined;
            
            if (objectType) {
              switch (objectType) {
                case 'Curve':
                  curves++;
                  objectDetails.push(`Curve: ${child.name || 'unnamed'}`);
                  break;
                case 'Mesh':
                  // A single mesh is a surface
                  surfaces++;
                  objectDetails.push(`Surface (Mesh): ${child.name || 'unnamed'}`);
                  break;
                case 'Brep':
                  // Breps are polysurfaces (boundary representations)
                  polysurfaces++;
                  objectDetails.push(`Polysurface (Brep): ${child.name || 'unnamed'}`);
                  break;
                case 'Extrusion':
                  // Extrusions are also polysurfaces
                  polysurfaces++;
                  objectDetails.push(`Polysurface (Extrusion): ${child.name || 'unnamed'}`);
                  break;
                case 'SubD':
                  // SubD surfaces count as surfaces
                  surfaces++;
                  objectDetails.push(`Surface (SubD): ${child.name || 'unnamed'}`);
                  break;
                default:
                  // Log unknown types for debugging
                  if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
                    console.log(`Unknown objectType: ${objectType}`);
                  }
              }
            }
          });
        });
        
        // Log once when model changes
        if (objectDetails.length > 0) {
          console.log("Model breakdown:", objectDetails);
        }
      }

      // Count generated objects as polysurfaces (AI-generated primitives are solid shapes)
      if (generatedObjects.length > 0) {
        polysurfaces += generatedObjects.length;
      }

      onStatsUpdate({ curves, surfaces, polysurfaces });
    };

    calculateStats();
    
    // Recalculate when model or generated objects change
  }, [modelObjects, generatedObjects, onStatsUpdate]);

  return null;
}

// Camera rotation component for idle animation
function CameraRotation() {
  const { camera } = useThree();
  
  useFrame((state, delta) => {
    // Get current camera position
    const radius = Math.sqrt(camera.position.x * camera.position.x + camera.position.z * camera.position.z);
    const currentAngle = Math.atan2(camera.position.z, camera.position.x);
    
    // Rotate around Y axis
    const newAngle = currentAngle + delta * 0.00; // 0.05 rad/sec rotation speed
    
    // Update camera position maintaining the same distance and Y position
    camera.position.x = radius * Math.cos(newAngle);
    camera.position.z = radius * Math.sin(newAngle);
    
    // Keep camera looking at center
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// Scene content component that provides export functionality
function SceneContent({
  onSceneReady,
  modelData,
}: {
  onSceneReady: (scene: THREE.Scene) => void;
  modelData?: LoadedModel | null;
}) {
  const { scene } = useThree();
  const { loadedModel: contextModel, generatedObjects, setStats } = useModel();
  const [modelScale, setModelScale] = useState(1);
  
  // Use provided modelData if in gallery mode, otherwise use context model
  const displayModel = modelData !== undefined ? modelData : contextModel;

  useEffect(() => {
    onSceneReady(scene);
  }, [scene, onSceneReady]);

  // Reset scale when model is cleared
  useEffect(() => {
    if (!displayModel) {
      setModelScale(1);
    }
  }, [displayModel]);

  const handleScaleChange = useCallback((scale: number) => {
    setModelScale(scale);
  }, []);

  return (
    <>
      {displayModel && <LoadedObjects objects={displayModel.objects} onScaleChange={handleScaleChange} />}
      {/* Only show generated objects in main view, not in gallery */}
      {modelData === undefined && generatedObjects.length > 0 && <GeneratedObjects objects={generatedObjects} />}
      <GridFloor modelScale={modelScale} />
      <SceneStatsCalculator 
        onStatsUpdate={setStats} 
        modelObjects={displayModel?.objects || null}
        generatedObjects={modelData === undefined ? generatedObjects : []}
      />
    </>
  );
}

export const ModelViewer = () => {
  const {
    loadedModel,
    error,
    stats,
    clearError,
    setSceneRef,
    importFile,
    isLoading,
    fileInputRef,
    triggerFileDialog,
  } = useModel();
  
  const { isGalleryMode, selectedCommitIds, commits } = useVersionControl();

  const [isDragOver, setIsDragOver] = useState(false);
  
  // Get selected commits for gallery mode
  const selectedCommits = useMemo(() => {
    if (!isGalleryMode || selectedCommitIds.size === 0) return [];
    return commits.filter(commit => selectedCommitIds.has(commit.id));
  }, [isGalleryMode, selectedCommitIds, commits]);

  // Safety check for stats - provide default values if undefined
  const safeStats = stats || { curves: 0, surfaces: 0, polysurfaces: 0 };

  const handleSceneReady = useCallback((scene: THREE.Scene) => {
    setSceneRef(scene);
  }, [setSceneRef]);

  // Handle file input change
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        importFile(file);
        // Clear the input to allow re-importing the same file
        event.target.value = "";
      }
    },
    [importFile]
  );

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.relatedTarget === null || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      
      const files = Array.from(e.dataTransfer.files);
      const file = files.find(f => f.name.toLowerCase().endsWith('.3dm'));
      
      if (file) {
        importFile(file);
      }
    },
    [importFile]
  );





  return (
    <TooltipProvider>
      <div 
        className="h-full flex flex-col panel-glass relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".3dm"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-primary/20 border-2 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <FileBox className="w-12 h-12 text-primary mx-auto mb-2" />
              <p className="text-lg font-medium text-primary">Drop .3dm file here</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loadedModel && !isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="text-center p-8">
              <FileBox className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">Import 3D Model</h3>
              <p className="text-muted-foreground mb-6">
                Drag & drop a .3dm file here or click to browse
              </p>
              <Button onClick={triggerFileDialog} className="gap-2">
                <FileBox className="w-4 h-4" />
                Choose File
              </Button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading model...</p>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute top-14 left-3 right-3 z-10 flex items-center gap-2 px-3 py-2 bg-destructive/20 border border-destructive/50 rounded-md">
            <span className="text-xs text-destructive">{error}</span>
            <button
              onClick={clearError}
              className="ml-auto text-destructive hover:text-destructive/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Canvas - Gallery mode or single view */}
        {isGalleryMode && selectedCommits.length > 0 ? (
          <div className="flex-1 relative grid gap-2 p-2" style={{
            gridTemplateColumns: `repeat(${Math.min(selectedCommits.length, 4)}, 1fr)`,
            gridTemplateRows: selectedCommits.length > 4 ? 'repeat(2, 1fr)' : '1fr',
          }}>
            {selectedCommits.map((commit) => (
              <div key={commit.id} className="relative border border-border rounded-md overflow-hidden bg-background">
                <div className="absolute top-2 left-2 z-10 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                  {commit.message}
                </div>
                <Canvas
                  camera={{ position: [5, 5, 8], fov: 50 }}
                  dpr={[1, 2]}
                  gl={{ antialias: true, alpha: true }}
                >
                  <color attach="background" args={["#0a0a0a"]} />
                  <ambientLight intensity={0.8} />
                  <directionalLight
                    position={[10, 10, 10]}
                    intensity={1.5}
                    color="#ffffff"
                    castShadow
                  />
                  <directionalLight
                    position={[-10, -5, -10]}
                    intensity={0.8}
                    color="#ffffff"
                  />
                  <directionalLight
                    position={[0, -10, 0]}
                    intensity={0.5}
                    color="#ffffff"
                  />
                  <hemisphereLight
                    args={["#ffffff", "#444444", 0.6]}
                  />
                  <SceneContent onSceneReady={() => {}} modelData={commit.modelData || null} />
                  <OrbitControls
                    enablePan={true}
                    enableZoom={true}
                    enableRotate={true}
                    enableDamping={true}
                    dampingFactor={0.05}
                    minDistance={0.5}
                    maxDistance={200}
                    makeDefault
                  />
                </Canvas>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 relative">
            <Canvas
              camera={{ position: [5, 5, 8], fov: 50 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <color attach="background" args={["#0a0a0a"]} />

              {/* Much brighter lighting */}
              <ambientLight intensity={0.8} />
              <directionalLight
                position={[10, 10, 10]}
                intensity={1.5}
                color="#ffffff"
                castShadow
              />
              <directionalLight
                position={[-10, -5, -10]}
                intensity={0.8}
                color="#ffffff"
              />
              <directionalLight
                position={[0, -10, 0]}
                intensity={0.5}
                color="#ffffff"
              />
              <hemisphereLight
                args={["#ffffff", "#444444", 0.6]}
              />

              <SceneContent onSceneReady={handleSceneReady} />
              <CameraRotation />

              <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                enableDamping={true}
                dampingFactor={0.05}
                minDistance={0.5}
                maxDistance={200}
                makeDefault
              />
            </Canvas>

            {/* Viewport info overlay */}
            <div className="absolute bottom-4 left-4 z-20 text-code text-xs text-muted-foreground space-y-1">
              <div>Curves: {safeStats.curves}</div>
              <div>Surfaces: {safeStats.surfaces}</div>
              <div>Polysurfaces: {safeStats.polysurfaces}</div>
            </div>

            {/* Controls hint */}
            <div className="absolute bottom-4 right-4 z-20 text-code text-xs text-muted-foreground">
              <span className="opacity-60">
                Drag to rotate / Scroll to zoom
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
