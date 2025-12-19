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
    // Dynamic import of rhino3dm
    const rhino3dm = await import("rhino3dm");
    rhinoModule = await rhino3dm.default();
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
  const rhino = await initRhino3dm();

  const buffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Create a File3dm from the buffer
  const doc = rhino.File3dm.fromByteArray(uint8Array);

  if (!doc) {
    throw new Error("Failed to parse 3DM file");
  }

  const objects: THREE.Object3D[] = [];
  const objectCount = doc.objects().count;

  for (let i = 0; i < objectCount; i++) {
    const rhinoObject = doc.objects().get(i);
    const geometry = rhinoObject.geometry();
    const attributes = rhinoObject.attributes();

    // Handle different geometry types
    const objectType = geometry.objectType;

    // Mesh (32 is ObjectType.Mesh in rhino3dm)
    if (objectType === 32) {
      const rhinoMesh = geometry;
      const threeMesh = rhinoMeshToThreeMesh(rhinoMesh, attributes);
      if (threeMesh) {
        threeMesh.name = attributes.name || `Object_${i}`;
        objects.push(threeMesh);
      }
    }
    // Brep (16 is ObjectType.Brep)
    else if (objectType === 16) {
      // BReps need to be meshed first
      const brep = geometry;
      if (brep.faces && typeof brep.faces === "function") {
        const meshes = rhino.MeshObjects.fromBrep(brep, {});
        for (const mesh of meshes) {
          const threeMesh = rhinoMeshToThreeMesh(mesh, attributes);
          if (threeMesh) {
            threeMesh.name = attributes.name || `Brep_${i}`;
            objects.push(threeMesh);
          }
        }
      }
    }
    // Extrusion (1073741824 is ObjectType.Extrusion)
    else if (objectType === 1073741824) {
      const extrusion = geometry;
      if (extrusion.toMesh) {
        const mesh = extrusion.toMesh(true);
        if (mesh) {
          const threeMesh = rhinoMeshToThreeMesh(mesh, attributes);
          if (threeMesh) {
            threeMesh.name = attributes.name || `Extrusion_${i}`;
            objects.push(threeMesh);
          }
        }
      }
    }
    // Point (1 is ObjectType.Point)
    else if (objectType === 1) {
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
    }
    // Curve (4 is ObjectType.Curve)
    else if (objectType === 4) {
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
      }
    }
  }

  const metadata: Rhino3dmMetadata = {
    objectCount,
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
  attributes: any
): THREE.Mesh | null {
  try {
    const vertices = rhinoMesh.vertices();
    const faces = rhinoMesh.faces();

    if (vertices.count === 0 || faces.count === 0) {
      return null;
    }

    const positions: number[] = [];
    const indices: number[] = [];

    // Extract vertices
    for (let i = 0; i < vertices.count; i++) {
      const v = vertices.get(i);
      positions.push(v.x, v.y, v.z);
    }

    // Extract faces
    for (let i = 0; i < faces.count; i++) {
      const face = faces.get(i);
      // Rhino uses quads (a, b, c, d) where d === c means triangle
      indices.push(face.a, face.b, face.c);
      if (face.d !== face.c) {
        // It's a quad, add second triangle
        indices.push(face.a, face.c, face.d);
      }
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

    return new THREE.Mesh(geometry, material);
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

  // Add a note about the export
  doc.strings().setModelNotes("Exported from 0studio", false);

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
  const options = new rhino.File3dmWriteOptions();
  const buffer = doc.toByteArray(options);

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

    // Add faces
    if (geometry.index) {
      const indices = geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        rhinoMesh
          .faces()
          .addFace(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < positions.count; i += 3) {
        rhinoMesh.faces().addFace(i, i + 1, i + 2);
      }
    }

    // Compute normals
    rhinoMesh.compute();

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
