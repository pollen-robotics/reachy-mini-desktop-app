import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

/**
 * Disposes GPU resources (geometries, materials, renderer, WebGL context)
 * when the parent `<Canvas>` unmounts. Must be rendered inside the Canvas.
 */
export default function WebGLCleanup(): null {
  const { gl, scene } = useThree();

  useEffect(() => {
    return () => {
      scene?.traverse(object => {
        const withResources = object as DisposableObject;
        if (withResources.geometry) {
          withResources.geometry.dispose();
        }
        if (withResources.material) {
          if (Array.isArray(withResources.material)) {
            withResources.material.forEach(material => material.dispose());
          } else {
            withResources.material.dispose();
          }
        }
      });

      gl?.dispose();

      const loseContext = gl?.getContext()?.getExtension('WEBGL_lose_context') as {
        loseContext: () => void;
      } | null;
      if (loseContext) {
        loseContext.loseContext();
      }
    };
  }, [gl, scene]);

  return null;
}
