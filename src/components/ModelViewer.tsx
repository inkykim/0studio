import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Box, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

interface SceneStats {
  vertices: number;
  faces: number;
  objects: number;
}

function Cube() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial
        color="#ffffff"
        metalness={0.1}
        roughness={0.8}
      />
    </mesh>
  );
}

function GridFloor() {
  return (
    <gridHelper
      args={[20, 20, "#333333", "#222222"]}
      position={[0, -2, 0]}
    />
  );
}

function SceneStatsCalculator({ onStatsUpdate }: { onStatsUpdate: (stats: SceneStats) => void }) {
  const { scene } = useThree();

  useEffect(() => {
    const calculateStats = () => {
      let vertices = 0;
      let faces = 0;
      let objects = 0;

      scene.traverse((child) => {
        // Exclude grid helpers and only count mesh objects
        if (child instanceof THREE.Mesh && child.geometry && !(child instanceof THREE.GridHelper)) {
          objects++;
          
          const geometry = child.geometry;
          
          // Count vertices
          if (geometry.attributes.position) {
            vertices += geometry.attributes.position.count;
          }
          
          // Count faces
          if (geometry.index) {
            faces += geometry.index.count / 3;
          } else if (geometry.attributes.position) {
            faces += geometry.attributes.position.count / 3;
          }
        }
      });

      onStatsUpdate({ vertices, faces, objects });
    };

    calculateStats();
    
    // Update stats periodically (optional, since the scene is relatively static)
    const interval = setInterval(calculateStats, 1000);
    
    return () => clearInterval(interval);
  }, [scene, onStatsUpdate]);

  return null;
}

export const ModelViewer = () => {
  const [stats, setStats] = useState<SceneStats>({ vertices: 0, faces: 0, objects: 0 });

  const handleStatsUpdate = (newStats: SceneStats) => {
    setStats(newStats);
  };

  return (
    <div className="h-full flex flex-col panel-glass relative">
      {/* Canvas */}
      <div className="flex-1 relative">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={["#000000"]} />
          
          <ambientLight intensity={0.3} />
          <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
          <directionalLight position={[-5, -5, -5]} intensity={0.3} color="#ffffff" />

          <Cube />
          <GridFloor />
          
          <SceneStatsCalculator onStatsUpdate={handleStatsUpdate} />

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={3}
            maxDistance={15}
            target={[0, 0, 0]}
            makeDefault
          />
        </Canvas>

        {/* Viewport info overlay */}
        <div className="absolute bottom-4 left-4 text-code text-xs text-muted-foreground space-y-1">
          <div>Vertices: {stats.vertices.toLocaleString()}</div>
          <div>Faces: {stats.faces.toLocaleString()}</div>
          <div>Objects: {stats.objects}</div>
        </div>

        {/* Controls hint */}
        <div className="absolute bottom-4 right-4 text-code text-xs text-muted-foreground">
          <span className="opacity-60">Drag to rotate / Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
};
