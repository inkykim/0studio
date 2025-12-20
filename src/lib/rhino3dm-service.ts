import * as THREE from "three";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";

// Singleton loader instance
let loaderInstance: Rhino3dmLoader | null = null;

/**
 * Get or create the Rhino3dm loader with proper library path
 */
function getLoader(): Rhino3dmLoader {
  if (!loaderInstance) {
    loaderInstance = new Rhino3dmLoader();
    // Use CDN for rhino3dm library - this loads both the JS and WASM
    loaderInstance.setLibraryPath("https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/");
  }
  return loaderInstance;
}

/**
 * Load a .3dm file and convert it to Three.js objects
 */
export async function load3dmFile(
  file: File
): Promise<{ objects: THREE.Object3D[]; metadata: Rhino3dmMetadata }> {
  console.log(`Starting to load 3DM file: ${file.name}`);
  
  const loader = getLoader();
  const buffer = await file.arrayBuffer();
  
  console.log(`File loaded: ${buffer.byteLength} bytes`);

  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      (object) => {
        console.log("Successfully parsed 3DM file");
        console.log(`Root object type: ${object.type}`);
        console.log(`Children count: ${object.children.length}`);
        
        // Log warnings if any
        if (object.userData.warnings && object.userData.warnings.length > 0) {
          console.warn("Warnings during parsing:", object.userData.warnings);
        }

        // Log detailed object info
        let meshCount = 0;
        let lineCount = 0;
        let pointsCount = 0;
        
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++;
            console.log(`Found Mesh: ${child.name || 'unnamed'}`);
            
            // Log geometry info
            if (child.geometry) {
              const pos = child.geometry.attributes.position;
              console.log(`  - Vertices: ${pos ? pos.count : 0}`);
            }
            
            // Ensure materials are properly set up
            if (child.material) {
              const mat = child.material as THREE.Material;
              if (mat instanceof THREE.MeshStandardMaterial || 
                  mat instanceof THREE.MeshPhysicalMaterial) {
                mat.side = THREE.DoubleSide;
                // Ensure the material color isn't black
                if (mat.color.r < 0.1 && mat.color.g < 0.1 && mat.color.b < 0.1) {
                  mat.color.setHex(0xcccccc);
                }
                mat.needsUpdate = true;
              }
            }
          } else if (child instanceof THREE.Line) {
            lineCount++;
            console.log(`Found Line: ${child.name || 'unnamed'}`);
          } else if (child instanceof THREE.Points) {
            pointsCount++;
            console.log(`Found Points: ${child.name || 'unnamed'}`);
          }
        });

        console.log(`\n=== SUMMARY ===`);
        console.log(`Meshes: ${meshCount}`);
        console.log(`Lines: ${lineCount}`);
        console.log(`Points: ${pointsCount}`);
        console.log(`===============\n`);

        // Return the entire parsed object - it's already a proper Three.js group
        // This preserves all transforms and hierarchy
        const objects: THREE.Object3D[] = [object];
        
        const metadata: Rhino3dmMetadata = {
          objectCount: meshCount + lineCount + pointsCount,
          fileName: file.name,
          fileSize: file.size,
        };

        resolve({ objects, metadata });
      },
      (error) => {
        console.error("Failed to parse 3DM file:", error);
        reject(error);
      }
    );
  });
}

/**
 * Export Three.js scene to a .3dm file
 * Note: This still needs rhino3dm for creating 3dm files
 */
export async function exportTo3dm(
  scene: THREE.Object3D,
  filename: string = "export.3dm"
): Promise<void> {
  // For export, we need to use rhino3dm directly
  // Dynamic import to avoid the ws issue during initial load
  const rhino3dmModule = await import("rhino3dm");
  const factory = rhino3dmModule.default || rhino3dmModule;
  
  let rhino: any;
  if (typeof factory === "function") {
    rhino = await factory();
  } else {
    rhino = factory;
  }

  const doc = new rhino.File3dm();

  // Traverse the scene and convert meshes
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const rhinoMesh = threeMeshToRhinoMesh(rhino, child);
      if (rhinoMesh) {
        const attributes = new rhino.ObjectAttributes();
        attributes.name = child.name || "Mesh";

        // Set color from material
        if (child.material instanceof THREE.MeshStandardMaterial) {
          const color = child.material.color;
          attributes.objectColor = {
            r: Math.round(color.r * 255),
            g: Math.round(color.g * 255),
            b: Math.round(color.b * 255),
            a: 255,
          };
          attributes.colorSource = rhino.ObjectColorSource.ColorFromObject;
        }

        doc.objects().add(rhinoMesh, attributes);
        rhinoMesh.delete();
      }
    }
  });

  // Convert to byte array and trigger download
  const buffer = doc.toByteArray();

  // Create a proper ArrayBuffer copy for Blob
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);

  const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".3dm") ? filename : `${filename}.3dm`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
  doc.delete();
}

/**
 * Convert a Three.js mesh to a Rhino mesh
 */
function threeMeshToRhinoMesh(rhino: any, threeMesh: THREE.Mesh): any | null {
  try {
    const geometry = threeMesh.geometry;

    if (!geometry.attributes.position) {
      return null;
    }

    const rhinoMesh = new rhino.Mesh();
    const positions = geometry.attributes.position;

    // Apply world matrix to get correct positions
    const worldMatrix = threeMesh.matrixWorld;
    const tempVector = new THREE.Vector3();

    // Add vertices
    for (let i = 0; i < positions.count; i++) {
      tempVector.fromBufferAttribute(positions, i);
      tempVector.applyMatrix4(worldMatrix);
      rhinoMesh.vertices().add(tempVector.x, tempVector.y, tempVector.z);
    }

    // Add faces using addTriFace (correct API for rhino3dm v8+)
    if (geometry.index) {
      const indices = geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        rhinoMesh
          .faces()
          .addTriFace(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < positions.count; i += 3) {
        rhinoMesh.faces().addTriFace(i, i + 1, i + 2);
      }
    }

    // Compute normals
    rhinoMesh.normals().computeNormals();
    rhinoMesh.compact();

    return rhinoMesh;
  } catch (error) {
    console.error("Error converting Three.js mesh to Rhino:", error);
    return null;
  }
}

/**
 * Metadata returned when loading a 3DM file
 */
export interface Rhino3dmMetadata {
  objectCount: number;
  fileName: string;
  fileSize: number;
}

/**
 * Dispose of the loader and free resources
 */
export function disposeLoader(): void {
  if (loaderInstance) {
    loaderInstance.dispose();
    loaderInstance = null;
  }
}
