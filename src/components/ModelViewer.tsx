import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import React, { useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import {
  FileBox,
  X,
} from "lucide-react";
import { useModel, SceneStats, GeneratedObject } from "@/contexts/ModelContext";
import { TooltipProvider } from "@/components/ui/tooltip";

function DefaultCube() {
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#888888" metalness={0.3} roughness={0.7} />
    </mesh>
  );
}

function LoadedObjects({ objects }: { objects: THREE.Object3D[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, controls } = useThree();
  
  // Cast controls to access OrbitControls methods (drei's OrbitControls sets this)
  const orbitControls = controls as unknown as { target: THREE.Vector3; update: () => void } | null;

  useEffect(() => {
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
        
        // Verify the centering worked by recalculating the bounding box
        const verifyBox = new THREE.Box3().setFromObject(groupRef.current);
        const verifyCenter = verifyBox.getCenter(new THREE.Vector3());
        console.log(`After centering - new center: (${verifyCenter.x.toFixed(2)}, ${verifyCenter.y.toFixed(2)}, ${verifyCenter.z.toFixed(2)})`);

        // Calculate optimal scale to fit in view (target size of 3 units)
        const maxDim = Math.max(size.x, size.y, size.z);
        console.log(`Max dimension: ${maxDim.toFixed(2)}`);
        
        if (maxDim > 0) {
          const targetSize = 3;
          const scale = targetSize / maxDim;
          groupRef.current.scale.setScalar(scale);
          console.log(`Scaled by factor: ${scale.toFixed(6)}`);
          console.log(`Final size: ${(maxDim * scale).toFixed(2)} units`);
        }

        // Update controls to look at center
        if (orbitControls) {
          orbitControls.target.set(0, 0, 0);
          orbitControls.update();
        }

        // Position camera to view the object
        const distance = Math.max(8, maxDim * 1.5);
        camera.position.set(distance * 0.6, distance * 0.6, distance * 0.8);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        
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
  
  useEffect(() => {
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

        // Calculate optimal scale to fit in view (target size of 3 units)
        const maxDim = Math.max(size.x, size.y, size.z);
        
        if (maxDim > 0 && maxDim > 5) { // Only scale down if it's too big
          const targetSize = 3;
          const scale = targetSize / maxDim;
          groupRef.current.scale.setScalar(scale);
          console.log(`Scaled generated objects by factor: ${scale.toFixed(6)}`);
        }

        // Update controls to look at center
        if (orbitControls) {
          orbitControls.target.set(0, 0, 0);
          orbitControls.update();
        }

        // Position camera to view the object
        const distance = Math.max(8, maxDim * 1.5);
        camera.position.set(distance * 0.6, distance * 0.6, distance * 0.8);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        
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

function GridFloor() {
  return (
    <Grid
      args={[100, 100]}
      cellSize={1}
      cellThickness={0.6}
      cellColor="#555555"
      sectionSize={10}
      sectionThickness={0.8}
      sectionColor="#555555"
      fadeDistance={80}
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
}: {
  onSceneReady: (scene: THREE.Scene) => void;
}) {
  const { scene } = useThree();
  const { loadedModel, generatedObjects, setStats } = useModel();

  useEffect(() => {
    onSceneReady(scene);
  }, [scene, onSceneReady]);

  const hasContent = loadedModel || generatedObjects.length > 0;

  return (
    <>
      {loadedModel && <LoadedObjects objects={loadedModel.objects} />}
      {generatedObjects.length > 0 && <GeneratedObjects objects={generatedObjects} />}
      <GridFloor />
      <SceneStatsCalculator 
        onStatsUpdate={setStats} 
        modelObjects={loadedModel?.objects || null}
        generatedObjects={generatedObjects}
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
  } = useModel();

  const [isDragOver, setIsDragOver] = useState(false);

  const handleSceneReady = useCallback((scene: THREE.Scene) => {
    setSceneRef(scene);
  }, [setSceneRef]);





  return (
    <TooltipProvider>
      <div className="h-full flex flex-col panel-glass relative">

        {/* Loaded file info */}
        {loadedModel && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 bg-secondary/80 backdrop-blur-sm rounded-md">
            <FileBox className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              {loadedModel.metadata.fileName}
            </span>
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

        {/* Canvas */}
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
            <div>Curves: {stats.curves}</div>
            <div>Surfaces: {stats.surfaces}</div>
            <div>Polysurfaces: {stats.polysurfaces}</div>
          </div>

          {/* Controls hint */}
          <div className="absolute bottom-4 right-4 z-20 text-code text-xs text-muted-foreground">
            <span className="opacity-60">
              Drag to rotate / Scroll to zoom
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
