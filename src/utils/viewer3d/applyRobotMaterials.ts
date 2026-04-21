/**
 * Apply materials to robot model.
 *
 * Shared utility for `URDFRobot` and `URDFRobotSharedBuffer`. Handles
 * wireframe, x-ray, and normal material modes.
 */

import * as THREE from 'three';
import { createXrayMaterial } from './materials';

export interface ApplyRobotMaterialsOptions {
  transparent?: boolean;
  wireframe?: boolean;
  xrayOpacity?: number;
  darkMode?: boolean;
}

interface RobotMeshUserData {
  isErrorMesh?: boolean;
  isAntenna?: boolean;
  isBigLens?: boolean;
  materialName?: string;
  stlFileName?: string;
  originalColor?: number;
  [key: string]: unknown;
}

type RobotMesh = THREE.Mesh & { userData: RobotMeshUserData };

interface RobotModelLike {
  traverse: (callback: (child: THREE.Object3D) => void) => void;
}

/** Apply materials to a robot model based on current visual settings. */
export function applyRobotMaterials(
  robotModel: RobotModelLike,
  { transparent, wireframe, xrayOpacity = 0.5, darkMode = false }: ApplyRobotMaterialsOptions
): void {
  robotModel.traverse((child: THREE.Object3D) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as RobotMesh;
    if (mesh.userData.isErrorMesh) return;

    const originalColor = mesh.userData.originalColor ?? 0xff9500;
    const materialName = (
      mesh.userData.materialName ||
      (mesh.material as (THREE.Material & { name?: string }) | undefined)?.name ||
      ''
    ).toLowerCase();
    const stlFileName = (mesh.userData.stlFileName ?? '').toLowerCase();

    const isBigLens =
      Boolean(mesh.userData.isBigLens) ||
      materialName.includes('big_lens') ||
      materialName.includes('small_lens') ||
      materialName.includes('lens_d40') ||
      materialName.includes('lens_d30');
    const isAntenna =
      Boolean(mesh.userData.isAntenna) ||
      materialName.includes('antenna') ||
      stlFileName.includes('antenna');
    const isArducam = materialName.includes('arducam') || stlFileName.includes('arducam');

    if (wireframe) {
      mesh.material = new THREE.MeshBasicMaterial({
        color: originalColor,
        wireframe: true,
        transparent: false,
      });
      (mesh.material as THREE.Material).needsUpdate = true;
    } else if (transparent) {
      let xrayColor: number;
      let rimColor: number | undefined;
      if (darkMode) {
        if (isAntenna) {
          xrayColor = 0x8aacd0;
          rimColor = 0xaac8e8;
        } else if (isBigLens) {
          xrayColor = 0x9bb8b8;
          rimColor = 0xb8d8d8;
        } else {
          xrayColor = 0x8a9aaa;
          rimColor = 0xaac0d0;
        }
      } else {
        xrayColor = 0x5a6570;
        if (isAntenna) xrayColor = 0x5a6b7c;
        else if (isBigLens) xrayColor = 0x6b7b7a;
        rimColor = undefined;
      }

      mesh.material = createXrayMaterial(xrayColor, {
        opacity: darkMode ? Math.min(xrayOpacity * 1.5, 0.15) : xrayOpacity,
        rimColor,
        rimIntensity: darkMode ? 0.8 : 0.6,
      });
    } else {
      if (mesh.geometry.attributes.normal) {
        mesh.geometry.deleteAttribute('normal');
      }
      mesh.geometry.computeVertexNormals();

      if (isBigLens) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.75,
          flatShading: true,
        });
      } else if (isAntenna) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: darkMode ? 0x999999 : 0x000000,
          flatShading: true,
          roughness: 0.3,
          metalness: 0.2,
        });
        (mesh.material as THREE.Material).needsUpdate = true;
      } else if (isArducam) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x4d4d4d,
          flatShading: true,
          roughness: 0.7,
          metalness: 0.0,
        });
        (mesh.material as THREE.Material).needsUpdate = true;
      } else {
        mesh.material = new THREE.MeshStandardMaterial({
          color: originalColor,
          flatShading: true,
          roughness: 0.7,
          metalness: 0.0,
        });
      }
    }
  });
}

export default applyRobotMaterials;
