import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createXrayMaterial, type XrayMaterialOptions } from '../../../utils/viewer3d/materials';

// TODO(ts): createXrayMaterial's XrayMaterialOptions interface only exposes a
// subset of the options callers actually pass (rimPower, edgeIntensity,
// subsurfaceColor, subsurfaceIntensity, depthWrite, transparent). Extending
// locally preserves runtime behavior without modifying materials.ts.
interface LooseXrayMaterialOptions extends XrayMaterialOptions {
  rimPower?: number;
  edgeIntensity?: number;
  subsurfaceColor?: number;
  subsurfaceIntensity?: number;
  depthWrite?: boolean;
  transparent?: boolean;
}

// TODO(ts): the xrayShader only declares a subset of uniforms but callers
// access additional uniforms at runtime. Locally widen the type to preserve
// 1:1 behavior.
interface ErrorMeshUserData {
  isErrorMesh?: boolean;
  [key: string]: unknown;
}

type ErrorMesh = THREE.Mesh & { userData: ErrorMeshUserData };

type MaterialWithGradient = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  gradientMap?: THREE.Texture | null;
  uniforms?: {
    baseColor?: { value: THREE.Color };
    rimColor?: { value: THREE.Color };
    opacity?: { value: number };
    rimIntensity?: { value: number };
  };
};

interface OriginalState {
  material: THREE.Material | THREE.Material[];
  color: number | null;
  emissive: number | null;
  emissiveIntensity: number | undefined;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  side: THREE.Side;
  gradientMap: THREE.Texture | null | undefined;
  renderOrder: number;
}

export interface ErrorHighlightProps {
  errorMesh?: ErrorMesh | null;
  errorMeshes?: ErrorMesh[] | null;
  allMeshes?: ErrorMesh[];
  errorColor?: string;
  enabled?: boolean;
}

export default function ErrorHighlight({
  errorMesh = null,
  errorMeshes = null,
  allMeshes = [],
  errorColor = '#ff0000',
  enabled = true,
}: ErrorHighlightProps): React.ReactElement | null {
  const animationFrameRefs = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const errorMeshesList = errorMeshes || (errorMesh ? [errorMesh] : []);

    if (!enabled) {
      return;
    }

    if (errorMeshesList.length === 0) {
      return;
    }

    if (allMeshes.length === 0) {
      return;
    }

    const errorMeshUuids = new Set(errorMeshesList.map(m => m.uuid));
    const matchingErrorMeshes = allMeshes.filter(mesh => errorMeshUuids.has(mesh.uuid));
    if (matchingErrorMeshes.length === 0 && errorMeshesList.length > 0) {
      console.warn(
        '⚠️ No matching meshes found by UUID! Error meshes:',
        errorMeshesList.map(m => ({ name: m.name, uuid: m.uuid }))
      );
      console.warn(
        '⚠️ First few allMeshes UUIDs:',
        allMeshes.slice(0, 5).map(m => ({ name: m.name, uuid: m.uuid }))
      );
    }

    const originalStates = new Map<ErrorMesh, OriginalState>();

    const finalErrorMeshes = matchingErrorMeshes.length > 0 ? matchingErrorMeshes : errorMeshesList;
    const finalErrorMeshUuids = new Set(finalErrorMeshes.map(m => m.uuid));
    const finalErrorMeshRefs = new Set(finalErrorMeshes);
    let highlightedCount = 0;

    allMeshes.forEach(mesh => {
      if (!mesh.material) {
        console.warn('⚠️ Mesh without material:', mesh.name);
        return;
      }

      const material = mesh.material as MaterialWithGradient;
      const hasEmissive = material.emissive !== undefined;

      originalStates.set(mesh, {
        material: mesh.material,
        color: material.color ? material.color.getHex() : null,
        emissive: hasEmissive && material.emissive ? material.emissive.getHex() : null,
        emissiveIntensity: material.emissiveIntensity,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        side: material.side,
        gradientMap: material.gradientMap,
        renderOrder: mesh.renderOrder,
      });

      const isErrorMesh =
        finalErrorMeshRefs.has(mesh) ||
        finalErrorMeshes.includes(mesh) ||
        finalErrorMeshUuids.has(mesh.uuid);

      if (isErrorMesh) {
        highlightedCount++;
        mesh.userData.isErrorMesh = true;

        mesh.renderOrder = 1000;

        const brightRed = new THREE.Color('#ff3333');
        const errorColorHex = brightRed.getHex();
        const darkRedHex = brightRed.multiplyScalar(0.8).getHex();

        const xrayOptions: LooseXrayMaterialOptions = {
          rimColor: errorColorHex,
          rimPower: 2.5,
          rimIntensity: 1.5,
          opacity: 1.0,
          edgeIntensity: 0.8,
          subsurfaceColor: darkRedHex,
          subsurfaceIntensity: 0.5,
          depthWrite: true,
          transparent: false,
        };
        const errorMaterial = createXrayMaterial(darkRedHex, xrayOptions);

        errorMaterial.depthTest = true;

        mesh.material = errorMaterial;
        mesh.material.needsUpdate = true;

        mesh.updateMatrix();
        mesh.updateMatrixWorld(true);

        requestAnimationFrame(() => {
          const startTime = Date.now();
          const meshUuid = mesh.uuid;

          const animate = (): void => {
            const currentMaterial = mesh.material as MaterialWithGradient | undefined;
            if (!currentMaterial || !currentMaterial.uniforms || !mesh.userData.isErrorMesh) {
              console.warn('⚠️ Animation stopped for mesh:', mesh.name, {
                hasMaterial: !!mesh.material,
                hasUniforms: !!currentMaterial?.uniforms,
                isErrorMesh: mesh.userData.isErrorMesh,
              });
              if (animationFrameRefs.current.has(meshUuid)) {
                const id = animationFrameRefs.current.get(meshUuid);
                if (id !== undefined) cancelAnimationFrame(id);
                animationFrameRefs.current.delete(meshUuid);
              }
              return;
            }

            if (
              currentMaterial.uniforms.baseColor &&
              currentMaterial.uniforms.baseColor.value.getHex() !== darkRedHex
            ) {
              currentMaterial.uniforms.baseColor.value.setHex(darkRedHex);
            }
            if (
              currentMaterial.uniforms.rimColor &&
              currentMaterial.uniforms.rimColor.value.getHex() !== errorColorHex
            ) {
              currentMaterial.uniforms.rimColor.value.setHex(errorColorHex);
            }

            const elapsed = Date.now() - startTime;
            const pulse = Math.sin(elapsed / 500) * 0.3 + 0.7;

            if (currentMaterial.uniforms.rimIntensity) {
              currentMaterial.uniforms.rimIntensity.value = 1.0 + pulse * 0.3;
            }
            if (currentMaterial.uniforms.opacity) {
              currentMaterial.uniforms.opacity.value = 0.95 + pulse * 0.05;
            }
            currentMaterial.needsUpdate = true;

            const frameId = requestAnimationFrame(animate);
            animationFrameRefs.current.set(meshUuid, frameId);
          };

          const frameId = requestAnimationFrame(animate);
          animationFrameRefs.current.set(meshUuid, frameId);
        });
      } else {
        material.transparent = true;
        material.opacity = 0.05;
        material.depthWrite = false;
        material.side = THREE.DoubleSide;
        if (hasEmissive && material.emissive) {
          material.emissive.set(0x000000);
          material.emissiveIntensity = 0;
        }
      }

      material.needsUpdate = true;
    });

    return () => {
      animationFrameRefs.current.forEach(frameId => {
        cancelAnimationFrame(frameId);
      });
      animationFrameRefs.current.clear();

      allMeshes.forEach(mesh => {
        if (mesh.userData.isErrorMesh) {
          mesh.userData.isErrorMesh = false;
        }

        const state = originalStates.get(mesh);
        if (state && mesh.material) {
          if (state.material && state.material !== mesh.material) {
            mesh.material = state.material;
          } else {
            const material = mesh.material as MaterialWithGradient;
            if (state.color !== null && material.color) {
              material.color.setHex(state.color);
            }
            if (state.emissive !== null && material.emissive) {
              material.emissive.setHex(state.emissive);
              material.emissiveIntensity = state.emissiveIntensity;
            }
            material.transparent = state.transparent;
            material.opacity = state.opacity;
            material.depthWrite = state.depthWrite;
            material.side = state.side;
            material.gradientMap = state.gradientMap ?? null;
          }
          if (state.renderOrder !== undefined) {
            mesh.renderOrder = state.renderOrder;
          }
          (mesh.material as THREE.Material).needsUpdate = true;
        }
      });
    };
  }, [enabled, errorMesh, errorMeshes, allMeshes, errorColor]);

  return null;
}
