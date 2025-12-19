import * as THREE from "three";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Singleton for the rhino3dm module
let rhinoModule: any = null;
let rhinoInitPromise: Promise<any> | null = null;

/**
 * Initialize the rhino3dm WebAssembly module
 */
export async function initRhino3dm(): Promise<any> {
  if (rhinoModule) return rhinoModule;

  if (rhinoInitPromise) return rhinoInitPromise;

  rhinoInitPromise = (async () => {
    // Dynamic import of rhino3dm - handle both ESM and CJS exports
    const rhino3dmModule = await import("rhino3dm");
    
    // rhino3dm exports a factory function that returns a promise
    // Handle both default export and named export patterns
    const factory = rhino3dmModule.default || rhino3dmModule;
    
    if (typeof factory === "function") {
      rhinoModule = await factory();
    } else if (typeof factory === "object" && factory !== null) {
      // Already initialized module
      rhinoModule = factory;
    } else {
      throw new Error("Failed to load rhino3dm module");
    }
    
    return rhinoModule;
  })();

  return rhinoInitPromise;
}

/**
 * Load a .3dm file and convert it to Three.js objects
 */
export async function load3dmFile(
  file: File
): Promise<{ objects: THREE.Object3D[]; metadata: Rhino3dmMetadata }> {
  console.log(`Starting to load 3DM file: ${file.name}`);
  const rhino = await initRhino3dm();
  console.log("Rhino3dm module initialized");

  const buffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);
  console.log(`File loaded: ${uint8Array.length} bytes`);

  // Create a File3dm from the buffer
  const doc = rhino.File3dm.fromByteArray(uint8Array);

  if (!doc) {
    throw new Error("Failed to parse 3DM file");
  }

  console.log("File3dm document created successfully");

  const objects: THREE.Object3D[] = [];
  const objectCount = doc.objects().count;

  console.log(`Loading 3DM file with ${objectCount} objects`);

  for (let i = 0; i < objectCount; i++) {
    const rhinoObject = doc.objects().get(i);
    
    if (!rhinoObject) {
      console.warn(`Object ${i}: Failed to get object`);
      continue;
    }

    const geometry = rhinoObject.geometry();
    const attributes = rhinoObject.attributes();

    if (!geometry) {
      console.warn(`Object ${i}: No geometry`);
      continue;
    }

    // Handle different geometry types
    const objectType = geometry.objectType;
    console.log(`Object ${i}: type ${objectType}, name: ${attributes?.name || 'unnamed'}`);

    // Mesh (32 is ObjectType.Mesh in rhino3dm)
    if (objectType === 32) {
      console.log(`Processing Mesh ${i}`);
      const rhinoMesh = geometry;
      const threeMesh = rhinoMeshToThreeMesh(rhinoMesh, attributes, rhino);
      if (threeMesh) {
        threeMesh.name = attributes.name || `Mesh_${i}`;
        objects.push(threeMesh);
        console.log(`✓ Added mesh: ${threeMesh.name}`);
      } else {
        console.warn(`✗ Failed to convert mesh ${i}`);
      }
    }
    // Brep (16 is ObjectType.Brep)
    else if (objectType === 16) {
      console.log(`Processing Brep ${i}`);
      // BReps need to be meshed first
      const brep = geometry;
      try {
        // Create a default mesh for the brep
        const meshes = rhino.Mesh.createFromBrep(brep, rhino.MeshingParameters.default);
        console.log(`Brep ${i} meshed into ${meshes?.length || 0} meshes`);
        
        if (meshes && meshes.length > 0) {
          for (let j = 0; j < meshes.length; j++) {
            const mesh = meshes[j];
            const threeMesh = rhinoMeshToThreeMesh(mesh, attributes, rhino);
            if (threeMesh) {
              threeMesh.name = attributes.name || `Brep_${i}_${j}`;
              objects.push(threeMesh);
              console.log(`✓ Added brep mesh: ${threeMesh.name}`);
            } else {
              console.warn(`✗ Failed to convert brep mesh ${i}_${j}`);
            }
          }
        } else {
          console.warn(`Brep ${i} produced no meshes`);
        }
      } catch (e) {
        console.warn(`Failed to mesh Brep ${i}:`, e);
      }
    }
    // Extrusion (1073741824 is ObjectType.Extrusion)
    else if (objectType === 1073741824) {
      console.log(`Processing Extrusion ${i}`);
      const extrusion = geometry;
      try {
        const mesh = extrusion.getMesh(rhino.MeshType.Default);
        if (mesh) {
          const threeMesh = rhinoMeshToThreeMesh(mesh, attributes, rhino);
          if (threeMesh) {
            threeMesh.name = attributes.name || `Extrusion_${i}`;
            objects.push(threeMesh);
            console.log(`✓ Added extrusion: ${threeMesh.name}`);
          } else {
            console.warn(`✗ Failed to convert extrusion ${i}`);
          }
        } else {
          console.warn(`Extrusion ${i} produced no mesh`);
        }
      } catch (e) {
        console.warn(`Failed to mesh Extrusion ${i}:`, e);
      }
    }
    // Point (1 is ObjectType.Point)
    else if (objectType === 1) {
      console.log(`Processing Point ${i}`);
      const point = geometry;
      const pointGeom = new THREE.SphereGeometry(0.05);
      const pointMat = new THREE.MeshStandardMaterial({
        color: attributesToColor(attributes),
      });
      const pointMesh = new THREE.Mesh(pointGeom, pointMat);
      if (point.location) {
        pointMesh.position.set(
          point.location[0],
          point.location[1],
          point.location[2]
        );
      }
      pointMesh.name = attributes.name || `Point_${i}`;
      objects.push(pointMesh);
      console.log(`✓ Added point: ${pointMesh.name}`);
    }
    // Curve (4 is ObjectType.Curve)
    else if (objectType === 4) {
      console.log(`Processing Curve ${i}`);
      const curve = geometry;
      const lineMaterial = new THREE.LineBasicMaterial({
        color: attributesToColor(attributes),
      });

      // Sample the curve
      const points: THREE.Vector3[] = [];
      const domain = curve.domain;
      const segments = 50;

      for (let t = 0; t <= segments; t++) {
        const param = domain[0] + (t / segments) * (domain[1] - domain[0]);
        const pt = curve.pointAt(param);
        if (pt) {
          points.push(new THREE.Vector3(pt[0], pt[1], pt[2]));
        }
      }

      if (points.length > 1) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeom, lineMaterial);
        line.name = attributes.name || `Curve_${i}`;
        objects.push(line);
        console.log(`✓ Added curve: ${line.name} with ${points.length} points`);
      } else {
        console.warn(`Curve ${i} produced insufficient points`);
      }
    } else {
      console.warn(`Unsupported object type: ${objectType}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total objects in file: ${objectCount}`);
  console.log(`Total objects converted: ${objects.length}`);
  console.log(`===============\n`);

  if (objects.length === 0) {
    console.error("No objects were successfully converted to Three.js!");
  }

  const metadata: Rhino3dmMetadata = {
    objectCount: objects.length,
    fileName: file.name,
    fileSize: file.size,
  };

  doc.delete();

  return { objects, metadata };
}

/**
 * Convert a Rhino mesh to a Three.js mesh
 */
function rhinoMeshToThreeMesh(
  rhinoMesh: any,
  attributes: any,
  rhino: any
): THREE.Mesh | null {
  try {
    const vertices = rhinoMesh.vertices();
    const faces = rhinoMesh.faces();

    if (!vertices || !faces) {
      console.warn("Mesh has no vertices or faces accessor");
      return null;
    }

    const vertexCount = vertices.count;
    const faceCount = faces.count;

    console.log(`Converting mesh with ${vertexCount} vertices and ${faceCount} faces`);

    if (vertexCount === 0 || faceCount === 0) {
      console.warn("Mesh has 0 vertices or 0 faces");
      return null;
    }

    const positions: number[] = [];
    const indices: number[] = [];

    // Extract vertices
    for (let i = 0; i < vertexCount; i++) {
      const v = vertices.get(i);
      if (v) {
        positions.push(v.x, v.y, v.z);
      }
    }

    console.log(`Extracted ${positions.length / 3} vertex positions`);

    // Extract faces
    for (let i = 0; i < faceCount; i++) {
      const face = faces.get(i);
      if (face) {
        // Rhino uses quads (a, b, c, d) where d === c means triangle
        indices.push(face.a, face.b, face.c);
        if (face.d !== face.c) {
          // It's a quad, add second triangle
          indices.push(face.a, face.c, face.d);
        }
      }
    }

    console.log(`Extracted ${indices.length / 3} triangles`);

    if (positions.length === 0 || indices.length === 0) {
      console.warn("No positions or indices extracted from mesh");
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: attributesToColor(attributes),
      metalness: 0.1,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    console.log(`Successfully created Three.js mesh`);
    
    return mesh;
  } catch (error) {
    console.error("Error converting Rhino mesh:", error);
    return null;
  }
}

/**
 * Convert Rhino object attributes to a Three.js color
 */
function attributesToColor(attributes: any): THREE.Color {
  if (attributes.objectColor) {
    const c = attributes.objectColor;
    return new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  }
  return new THREE.Color(0xcccccc);
}

/**
 * Export Three.js scene to a .3dm file
 */
export async function exportTo3dm(
  scene: THREE.Object3D,
  filename: string = "export.3dm"
): Promise<void> {
  const rhino = await initRhino3dm();

  const doc = new rhino.File3dm();

  // Note: model notes API varies by version, skip for compatibility

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
