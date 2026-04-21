import * as THREE from 'three';

interface URDFLinkedObject extends THREE.Object3D {
  links?: Record<string, THREE.Object3D>;
}

function collectMeshesFromObject(obj: THREE.Object3D, meshes: THREE.Mesh[] = []): THREE.Mesh[] {
  const maybeMesh = obj as THREE.Mesh & {
    isMesh?: boolean;
    userData: { isOutline?: boolean; [key: string]: unknown };
  };
  if (maybeMesh.isMesh && !maybeMesh.userData.isOutline) {
    meshes.push(maybeMesh);
  }
  if (obj.children) {
    obj.children.forEach(child => {
      collectMeshesFromObject(child, meshes);
    });
  }
  return meshes;
}

function isUnderCameraLink(mesh: THREE.Object3D, maxDepth = 10): boolean {
  let current: THREE.Object3D | null = mesh;
  let depth = 0;
  while (current && current.parent && depth < maxDepth) {
    const parentName = (current.parent.name || '').toLowerCase();
    const currentName = (current.name || '').toLowerCase();
    if (parentName.includes('camera') || currentName.includes('camera')) {
      return true;
    }
    current = current.parent;
    depth++;
  }
  return false;
}

/**
 * Given an error mesh that was clicked/reported, returns the full set of
 * related meshes that should be highlighted. Camera-related meshes are
 * grouped together so the whole camera assembly lights up instead of a
 * single sub-part.
 */
export function findErrorMeshes(
  errorMesh: THREE.Mesh | null,
  robotRef: URDFLinkedObject | null,
  allOutlineMeshes: THREE.Mesh[]
): THREE.Mesh[] | null {
  if (!errorMesh) return null;
  if (!robotRef || allOutlineMeshes.length === 0) {
    return [errorMesh];
  }

  const cameraLink = robotRef.links?.['camera'] ?? null;

  if (cameraLink) {
    const cameraMeshes = collectMeshesFromObject(cameraLink, []);
    if (cameraMeshes.includes(errorMesh)) {
      return cameraMeshes.length > 0 ? cameraMeshes : [errorMesh];
    }
  }

  if (isUnderCameraLink(errorMesh)) {
    if (cameraLink) {
      const cameraMeshes = collectMeshesFromObject(cameraLink, []);
      return cameraMeshes.length > 0 ? cameraMeshes : [errorMesh];
    }
    const cameraMeshes = allOutlineMeshes.filter(mesh => isUnderCameraLink(mesh));
    return cameraMeshes.length > 0 ? cameraMeshes : [errorMesh];
  }

  return [errorMesh];
}
