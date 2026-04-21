import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../../config/daemon';
import { createXrayMaterial, type XrayMaterialOptions } from '../../../utils/viewer3d/materials';
import {
  mapMeshToScanPart,
  SCAN_PARTS,
  type ScanMesh as ScanPartMeshLike,
} from '../../../utils/scanParts';

interface ScanUserData {
  isShellPiece?: boolean;
  isOutline?: boolean;
  isErrorMesh?: boolean;
  isAntenna?: boolean;
  materialName?: string;
  originalColor?: number;
  scanMaterial?: THREE.ShaderMaterial;
  originalMaterial?: THREE.Material | THREE.Material[];
  finalMaterial?: THREE.ShaderMaterial;
  scanned?: boolean;
  [key: string]: unknown;
}

type ScanMesh = THREE.Mesh & { userData: ScanUserData };

// TODO(ts): xrayShader only declares baseColor/rimColor/opacity/rimIntensity,
// but this effect mutates uniforms directly. Locally extend the shape.
interface XrayShaderMaterial extends THREE.ShaderMaterial {
  uniforms: {
    baseColor: { value: THREE.Color };
    rimColor: { value: THREE.Color };
    opacity: { value: number };
    rimIntensity: { value: number };
  };
}

interface MeshScanData {
  mesh: ScanMesh;
  index: number;
  isAntenna: boolean;
  isBigLens: boolean;
  isShellPiece: boolean;
  targetXrayColor: number;
  finalOpacity: number;
  startDelay: number;
  highlightDuration: number;
  state: 'waiting' | 'scanning' | 'transitioning' | 'complete';
  scanStartTime: number;
}

interface ScanState {
  meshes: MeshScanData[];
  startTime: number;
  duration: number;
  scannedCount: number;
  notifiedMeshes: Set<ScanMesh>;
  totalMeshes: number;
}

export interface ScanEffectProps {
  meshes?: ScanMesh[];
  scanColor?: string;
  enabled?: boolean;
  onComplete?: (() => void) | null;
  onScanMesh?: ((mesh: ScanMesh, index: number, total: number) => void) | null;
}

export default function ScanEffect({
  meshes = [],
  scanColor = '#22c55e',
  enabled = true,
  onComplete = null,
  onScanMesh = null,
}: ScanEffectProps): React.ReactElement | null {
  const isScanningRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const onScanMeshRef = useRef(onScanMesh);
  const onCompleteRef = useRef(onComplete);
  const scanStateRef = useRef<ScanState>({
    meshes: [],
    startTime: 0,
    duration: 0,
    scannedCount: 0,
    notifiedMeshes: new Set(),
    totalMeshes: 0,
  });

  useEffect(() => {
    onScanMeshRef.current = onScanMesh;
    onCompleteRef.current = onComplete;
  }, [onScanMesh, onComplete]);

  useEffect(() => {
    if (!enabled || meshes.length === 0) {
      isScanningRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    if (isScanningRef.current) {
      return;
    }

    isScanningRef.current = true;

    const duration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

    const scannableMeshes = meshes.filter(
      mesh =>
        mesh.material &&
        !mesh.userData.isShellPiece &&
        !mesh.userData.isOutline &&
        !mesh.userData.isErrorMesh
    );

    const meshPositions = new Map<ScanMesh, number>();
    const getMeshY = (mesh: ScanMesh): number => {
      if (!meshPositions.has(mesh)) {
        const pos = new THREE.Vector3();
        mesh.getWorldPosition(pos);
        meshPositions.set(mesh, pos.y);
      }
      return meshPositions.get(mesh) as number;
    };

    const familyGroups = new Map<string, ScanMesh[]>();
    const ungroupedMeshes: ScanMesh[] = [];
    const meshPartCache = new WeakMap<ScanMesh, ReturnType<typeof mapMeshToScanPart>>();

    scannableMeshes.forEach(mesh => {
      let partInfo = meshPartCache.get(mesh);
      if (!partInfo) {
        partInfo = mapMeshToScanPart(mesh as unknown as ScanPartMeshLike);
        if (partInfo) {
          meshPartCache.set(mesh, partInfo);
        }
      }

      if (partInfo && partInfo.family) {
        if (!familyGroups.has(partInfo.family)) {
          familyGroups.set(partInfo.family, []);
        }
        familyGroups.get(partInfo.family)!.push(mesh);
      } else {
        ungroupedMeshes.push(mesh);
      }
    });

    const familyOrder = SCAN_PARTS.map(f => f.family);
    const sortedFamilies = Array.from(familyGroups.entries()).sort((a, b) => {
      const indexA = familyOrder.indexOf(a[0]);
      const indexB = familyOrder.indexOf(b[0]);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    const sortedMeshes: ScanMesh[] = [];
    sortedFamilies.forEach(([, familyMeshes]) => {
      const sortedFamilyMeshes = [...familyMeshes].sort((a, b) => {
        return getMeshY(a) - getMeshY(b);
      });
      sortedMeshes.push(...sortedFamilyMeshes);
    });

    if (ungroupedMeshes.length > 0) {
      const sortedUngrouped = [...ungroupedMeshes].sort((a, b) => {
        return getMeshY(a) - getMeshY(b);
      });
      sortedMeshes.push(...sortedUngrouped);
    }

    const meshData: MeshScanData[] = sortedMeshes.map((mesh, index) => {
      const isAntenna = Boolean(mesh.userData?.isAntenna);
      const isShellPiece = Boolean(mesh.userData?.isShellPiece);
      const matName = (mesh.userData?.materialName ||
        (mesh.material as THREE.Material & { name?: string })?.name ||
        '') as string;
      const materialName = matName.toLowerCase();
      const isBigLens =
        materialName.includes('big_lens') ||
        materialName.includes('small_lens') ||
        materialName.includes('lens_d40') ||
        materialName.includes('lens_d30');

      let targetXrayColor: number;
      if (isAntenna) {
        targetXrayColor = 0x5a6b7c;
      } else if (isBigLens) {
        targetXrayColor = 0x6b7b7a;
      } else if (isShellPiece) {
        targetXrayColor = 0x5a6570;
      } else {
        const originalColor = mesh.userData?.originalColor || 0xff9500;
        const r = (originalColor >> 16) & 0xff;
        const g = (originalColor >> 8) & 0xff;
        const b = originalColor & 0xff;
        const luminance = r * 0.299 + g * 0.587 + b * 0.114;

        if (luminance > 200) targetXrayColor = 0x6b757d;
        else if (luminance > 150) targetXrayColor = 0x5a6570;
        else if (luminance > 100) targetXrayColor = 0x4a5560;
        else if (luminance > 50) targetXrayColor = 0x3a4550;
        else targetXrayColor = 0x2a3540;
      }

      const xrayOpacity = 0.2;
      const finalOpacity = isShellPiece ? xrayOpacity * 0.3 : xrayOpacity;

      const highlightDuration = 350;
      const totalScanTime = duration * 1000;

      const startDelay =
        sortedMeshes.length > 1
          ? ((totalScanTime - highlightDuration) * index) / (sortedMeshes.length - 1)
          : 0;

      return {
        mesh,
        index,
        isAntenna,
        isBigLens,
        isShellPiece,
        targetXrayColor,
        finalOpacity,
        startDelay,
        highlightDuration,
        state: 'waiting',
        scanStartTime: 0,
      };
    });

    const totalMeshes = sortedMeshes.length;

    scanStateRef.current = {
      meshes: meshData,
      startTime: Date.now(),
      duration: duration * 1000,
      scannedCount: 0,
      notifiedMeshes: new Set(),
      totalMeshes,
    };

    const animate = (): void => {
      const currentTime = Date.now();

      let activeMeshes = 0;

      scanStateRef.current.meshes.forEach(meshData => {
        const {
          mesh,
          index,
          targetXrayColor,
          finalOpacity,
          isAntenna,
          isBigLens,
          isShellPiece,
          highlightDuration,
        } = meshData;

        if (!mesh.material || mesh.userData.isErrorMesh) return;

        const meshElapsed = currentTime - scanStateRef.current.startTime - meshData.startDelay;

        if (meshElapsed < 0) {
          return;
        }

        if (!scanStateRef.current.notifiedMeshes.has(mesh)) {
          scanStateRef.current.notifiedMeshes.add(mesh);
          if (onScanMeshRef.current) {
            onScanMeshRef.current(mesh, index + 1, scanStateRef.current.totalMeshes);
          }
        }

        const progress = Math.min(meshElapsed / highlightDuration, 1.0);

        if (progress < 0.5) {
          meshData.state = 'scanning';
          activeMeshes++;

          if (!mesh.userData.scanMaterial) {
            const scanOptions: XrayMaterialOptions = {
              scanMode: true,
              opacity: 0.4,
              rimIntensity: 0.7,
            };
            mesh.userData.scanMaterial = createXrayMaterial(0x2d5a3d, scanOptions);
            if (!mesh.userData.originalMaterial) {
              mesh.userData.originalMaterial = mesh.material;
            }
          }

          if (mesh.material !== mesh.userData.scanMaterial) {
            mesh.material = mesh.userData.scanMaterial;
          }

          const mat = mesh.material as XrayShaderMaterial;
          if (mat.uniforms) {
            const scanProgress = progress / 0.5;
            const pulse = Math.sin(scanProgress * Math.PI * 2) * 0.08;
            mat.uniforms.opacity.value = 0.4 + pulse;
            mat.opacity = mat.uniforms.opacity.value;
          }
        } else if (progress < 1.0) {
          meshData.state = 'transitioning';
          activeMeshes++;

          const transitionProgress = (progress - 0.5) / 0.5;
          const easeOut = 1 - Math.pow(1 - transitionProgress, 2.5);

          if (!mesh.userData.scanMaterial) {
            const scanOptions: XrayMaterialOptions = {
              scanMode: true,
              opacity: 0.6,
              rimIntensity: 0.7,
            };
            mesh.userData.scanMaterial = createXrayMaterial(0x2d5a3d, scanOptions);
          }

          if (mesh.material !== mesh.userData.scanMaterial) {
            mesh.material = mesh.userData.scanMaterial;
          }

          const mat = mesh.material as XrayShaderMaterial;
          if (mat.uniforms) {
            const scanBaseColor = new THREE.Color(0x2d5a3d);
            const xrayBaseColor = new THREE.Color(targetXrayColor);
            const lerpedColor = scanBaseColor.clone().lerp(xrayBaseColor, easeOut);
            mat.uniforms.baseColor.value.copy(lerpedColor);

            const scanRimColor = new THREE.Color(0x4ade80);
            const xrayRimColor = new THREE.Color(
              isAntenna ? 0x8a9aac : isBigLens ? 0x7a8a8a : isShellPiece ? 0x7a8590 : 0x6a7580
            );
            const lerpedRim = scanRimColor.clone().lerp(xrayRimColor, easeOut);
            mat.uniforms.rimColor.value.copy(lerpedRim);

            const newOpacity = THREE.MathUtils.lerp(0.3, finalOpacity, easeOut);
            mat.uniforms.opacity.value = newOpacity;
            mat.opacity = newOpacity;
            mat.uniforms.rimIntensity.value = THREE.MathUtils.lerp(0.7, 0.6, easeOut);
          }

          if (transitionProgress >= 0.95 && !mesh.userData.finalMaterial) {
            const rimColor = isAntenna
              ? 0x8a9aac
              : isBigLens
                ? 0x7a8a8a
                : isShellPiece
                  ? 0x7a8590
                  : 0x6a7580;

            mesh.userData.finalMaterial = createXrayMaterial(targetXrayColor, {
              rimColor: rimColor,
              opacity: finalOpacity,
              rimIntensity: 0.6,
            });
            mesh.material = mesh.userData.finalMaterial;
            mesh.userData.scanned = true;
            meshData.state = 'complete';
            scanStateRef.current.scannedCount++;
          }
        } else if (meshData.state !== 'complete') {
          if (!mesh.userData.finalMaterial) {
            const rimColor = isAntenna
              ? 0x8a9aac
              : isBigLens
                ? 0x7a8a8a
                : isShellPiece
                  ? 0x7a8590
                  : 0x6a7580;

            mesh.userData.finalMaterial = createXrayMaterial(targetXrayColor, {
              rimColor: rimColor,
              opacity: finalOpacity,
              rimIntensity: 0.6,
            });
          }
          mesh.material = mesh.userData.finalMaterial;
          mesh.userData.scanned = true;
          meshData.state = 'complete';
          scanStateRef.current.scannedCount++;
        }
      });

      const allMeshesComplete =
        scanStateRef.current.scannedCount >= scanStateRef.current.totalMeshes;

      const lastMesh = scanStateRef.current.meshes[scanStateRef.current.meshes.length - 1];
      const lastMeshEndTime =
        scanStateRef.current.startTime + lastMesh.startDelay + lastMesh.highlightDuration;
      const allMeshesFinished = currentTime >= lastMeshEndTime;

      if (allMeshesComplete && allMeshesFinished) {
        isScanningRef.current = false;
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
        return;
      }

      const hasWaitingMeshes = scanStateRef.current.meshes.some(
        md =>
          currentTime - scanStateRef.current.startTime - md.startDelay <
          scanStateRef.current.duration
      );

      if (activeMeshes > 0 || hasWaitingMeshes || !allMeshesFinished) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isScanningRef.current = false;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      isScanningRef.current = false;

      if (scanStateRef.current.meshes) {
        scanStateRef.current.meshes.forEach(meshData => {
          const mesh = meshData.mesh;
          if (mesh && mesh.userData.scanMaterial && mesh.material === mesh.userData.scanMaterial) {
            if (mesh.userData.originalMaterial) {
              mesh.material = mesh.userData.originalMaterial;
            }
          }
        });
      }
    };
  }, [enabled, meshes.length, scanColor]);

  return null;
}
