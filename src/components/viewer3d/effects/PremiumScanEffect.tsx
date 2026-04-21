import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../../config/daemon';
import { createXrayMaterial, type XrayMaterialOptions } from '../../../utils/viewer3d/materials';

// TODO(ts): createXrayMaterial's XrayMaterialOptions exposes a narrower shape
// than what callers pass (rimPower, edgeIntensity, subsurfaceColor,
// subsurfaceIntensity). Extend locally to preserve runtime behavior.
interface LooseXrayMaterialOptions extends XrayMaterialOptions {
  rimPower?: number;
  edgeIntensity?: number;
  subsurfaceColor?: number;
  subsurfaceIntensity?: number;
}

// TODO(ts): xrayShader only declares 4 uniforms but this effect reads/writes
// edgeIntensity / subsurfaceColor / subsurfaceIntensity too.
interface PremiumXrayUniforms {
  baseColor: { value: THREE.Color };
  rimColor: { value: THREE.Color };
  opacity: { value: number };
  rimIntensity: { value: number };
  edgeIntensity: { value: number };
  subsurfaceColor: { value: THREE.Color };
  subsurfaceIntensity: { value: number };
  [uniform: string]: THREE.IUniform;
}

type PremiumXrayShaderMaterial = THREE.ShaderMaterial & { uniforms: PremiumXrayUniforms };

interface PremiumScanUserData {
  isShellPiece?: boolean;
  isOutline?: boolean;
  isErrorMesh?: boolean;
  isAntenna?: boolean;
  materialName?: string;
  originalColor?: number;
  scanMaterial?: THREE.ShaderMaterial;
  scanned?: boolean;
  [key: string]: unknown;
}

type PremiumScanMesh = THREE.Mesh & { userData: PremiumScanUserData };

interface PremiumMeshScanData {
  mesh: PremiumScanMesh;
  index: number;
  isAntenna: boolean;
  isBigLens: boolean;
  isShellPiece: boolean;
  targetXrayColor: number;
  finalOpacity: number;
  startDelay: number;
  normalizedY: number;
  state: 'waiting' | 'scanning' | 'transitioning' | 'complete';
  scanStartTime: number;
}

interface PremiumScanState {
  meshes: PremiumMeshScanData[];
  startTime: number;
  duration: number;
  scannedCount: number;
  notifiedMeshes: Set<PremiumScanMesh>;
  totalMeshes: number;
  sweepPosition: number;
}

export interface PremiumScanEffectProps {
  meshes?: PremiumScanMesh[];
  scanColor?: string;
  enabled?: boolean;
  onComplete?: (() => void) | null;
  onScanMesh?: ((mesh: PremiumScanMesh, index: number, total: number) => void) | null;
}

export default function PremiumScanEffect({
  meshes = [],
  scanColor = '#00ff88',
  enabled = true,
  onComplete = null,
  onScanMesh = null,
}: PremiumScanEffectProps): React.ReactElement | null {
  const isScanningRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const onScanMeshRef = useRef(onScanMesh);
  const onCompleteRef = useRef(onComplete);
  const scanStateRef = useRef<PremiumScanState>({
    meshes: [],
    startTime: 0,
    duration: 0,
    scannedCount: 0,
    notifiedMeshes: new Set(),
    totalMeshes: 0,
    sweepPosition: 0,
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

    const sortedMeshes = [...scannableMeshes].sort((a, b) => {
      const posA = new THREE.Vector3();
      const posB = new THREE.Vector3();
      a.getWorldPosition(posA);
      b.getWorldPosition(posB);
      return posA.y - posB.y;
    });

    const meshData: PremiumMeshScanData[] = sortedMeshes.map((mesh, index) => {
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

      const baseOpacity = (mesh.material as THREE.Material).opacity || 0.5;
      const finalOpacity = isShellPiece ? baseOpacity * 0.3 : baseOpacity;

      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const minY =
        sortedMeshes.length > 0 ? sortedMeshes[0].getWorldPosition(new THREE.Vector3()).y : 0;
      const maxY =
        sortedMeshes.length > 1
          ? sortedMeshes[sortedMeshes.length - 1].getWorldPosition(new THREE.Vector3()).y
          : minY + 0.5;
      const normalizedY = maxY > minY ? (worldPos.y - minY) / (maxY - minY) : 0;

      const startDelay =
        sortedMeshes.length > 1
          ? ((duration * 1000 * index) / (sortedMeshes.length - 1)) * 0.05
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
        normalizedY,
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
      sweepPosition: 0,
    };

    const animate = (): void => {
      const currentTime = Date.now();
      const elapsed = currentTime - scanStateRef.current.startTime;
      const totalDuration = scanStateRef.current.duration;

      scanStateRef.current.sweepPosition = Math.min(elapsed / totalDuration, 1.0);

      const highlightDuration = 233;
      const fadeOutDuration = 133;
      const totalMeshDuration = highlightDuration + fadeOutDuration;

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
          normalizedY,
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

        const progress = Math.min(meshElapsed / totalMeshDuration, 1.0);

        if (progress <= 0) {
          return;
        }

        const sweepDistance = Math.abs(normalizedY - scanStateRef.current.sweepPosition);
        const waveIntensity = Math.max(0, 1 - sweepDistance * 3);

        if (progress < 0.5) {
          meshData.state = 'scanning';
          activeMeshes++;

          const currentMatForRead = mesh.material as Partial<PremiumXrayShaderMaterial> & {
            opacity?: number;
          };
          const currentOpacity = currentMatForRead?.opacity || finalOpacity;
          const currentRimIntensity = currentMatForRead?.uniforms?.rimIntensity?.value || 0.25;

          if (!mesh.userData.scanMaterial) {
            const scanOpts: LooseXrayMaterialOptions = {
              rimColor: targetXrayColor,
              rimPower: 1.0,
              rimIntensity: currentRimIntensity,
              opacity: currentOpacity,
              edgeIntensity: 0.2,
              subsurfaceColor: targetXrayColor,
              subsurfaceIntensity: 0.15,
            };
            mesh.userData.scanMaterial = createXrayMaterial(targetXrayColor, scanOpts);
          }

          if (progress > 0.02 && mesh.material !== mesh.userData.scanMaterial) {
            mesh.material = mesh.userData.scanMaterial;
          }

          const mat = mesh.material as PremiumXrayShaderMaterial;
          if (mat.uniforms) {
            const scanProgress = progress / 0.5;

            const time = scanProgress * Math.PI * 4;
            const pulse1 = Math.sin(time) * 0.5 + 0.5;
            const pulse2 = Math.sin(time * 1.7) * 0.5 + 0.5;
            const pulse3 = Math.cos(time * 0.8) * 0.5 + 0.5;
            const combinedPulse = pulse1 * 0.5 + pulse2 * 0.3 + pulse3 * 0.2;

            const waveBoost = waveIntensity * 0.4;

            const scanColorVec = new THREE.Color(scanColor);
            const brightScanHex = scanColorVec.clone().multiplyScalar(1.3);
            const darkScanHex = scanColorVec.clone().multiplyScalar(0.5);
            const currentColor = new THREE.Color(targetXrayColor);

            const lerpedBaseColor = currentColor.clone().lerp(darkScanHex, scanProgress);
            mat.uniforms.baseColor.value.copy(lerpedBaseColor);

            const currentRimColor = new THREE.Color(targetXrayColor);
            const lerpedRimColor = currentRimColor.clone().lerp(brightScanHex, scanProgress);
            mat.uniforms.rimColor.value.copy(lerpedRimColor);

            const targetRimIntensity = 1.0 + combinedPulse * 0.4 + waveBoost;
            mat.uniforms.rimIntensity.value = THREE.MathUtils.lerp(
              currentRimIntensity,
              targetRimIntensity,
              scanProgress
            );

            const targetOpacity = 0.9 + combinedPulse * 0.08 + waveBoost * 0.1;
            mat.uniforms.opacity.value = THREE.MathUtils.lerp(
              currentOpacity,
              targetOpacity,
              scanProgress
            );

            const targetEdgeIntensity = 0.6 + combinedPulse * 0.2 + waveBoost * 0.15;
            mat.uniforms.edgeIntensity.value = THREE.MathUtils.lerp(
              0.2,
              targetEdgeIntensity,
              scanProgress
            );

            const targetSubsurfaceIntensity = 0.45 + combinedPulse * 0.15 + waveBoost * 0.1;
            const lerpedSubsurfaceColor = currentColor.clone().lerp(scanColorVec, scanProgress);
            mat.uniforms.subsurfaceColor.value.copy(lerpedSubsurfaceColor);
            mat.uniforms.subsurfaceIntensity.value = THREE.MathUtils.lerp(
              0.15,
              targetSubsurfaceIntensity,
              scanProgress
            );

            mat.needsUpdate = true;
          }
        } else if (progress < 1.0) {
          meshData.state = 'transitioning';
          activeMeshes++;

          const transitionProgress = (progress - 0.5) / 0.5;
          const easeOut = 1 - Math.pow(1 - transitionProgress, 2.2);

          const mat = mesh.material as PremiumXrayShaderMaterial;
          if (mat.uniforms) {
            const brightScanColor = new THREE.Color(scanColor).multiplyScalar(0.9);
            const xrayColorVec = new THREE.Color(targetXrayColor);
            const lerpedColor = brightScanColor.clone().lerp(xrayColorVec, easeOut);
            mat.uniforms.baseColor.value.copy(lerpedColor);

            const rimColor = isAntenna
              ? 0x8a9aac
              : isBigLens
                ? 0x7a8a8a
                : isShellPiece
                  ? 0x7a8590
                  : 0x6a7580;

            const scanRimColor = new THREE.Color(scanColor).multiplyScalar(1.2);
            const xrayRimColor = new THREE.Color(rimColor);
            const lerpedRimColor = scanRimColor.clone().lerp(xrayRimColor, easeOut);
            mat.uniforms.rimColor.value.copy(lerpedRimColor);

            mat.uniforms.opacity.value = THREE.MathUtils.lerp(0.98, finalOpacity, easeOut);

            mat.uniforms.rimIntensity.value = THREE.MathUtils.lerp(1.1, 0.25, easeOut);

            mat.uniforms.edgeIntensity.value = THREE.MathUtils.lerp(0.7, 0.2, easeOut);

            const scanSubsurfaceColor = new THREE.Color(scanColor).multiplyScalar(0.8);
            const xraySubsurfaceColor = new THREE.Color(
              isAntenna ? 0x4a5a6c : isBigLens ? 0x5a6a6a : 0x4a5560
            );
            const lerpedSubsurfaceColor = scanSubsurfaceColor
              .clone()
              .lerp(xraySubsurfaceColor, easeOut);
            mat.uniforms.subsurfaceColor.value.copy(lerpedSubsurfaceColor);
            mat.uniforms.subsurfaceIntensity.value = THREE.MathUtils.lerp(0.5, 0.15, easeOut);

            mat.needsUpdate = true;
          }

          if (transitionProgress >= 0.88) {
            const rimColor = isAntenna
              ? 0x8a9aac
              : isBigLens
                ? 0x7a8a8a
                : isShellPiece
                  ? 0x7a8590
                  : 0x6a7580;

            const finalOpts: LooseXrayMaterialOptions = {
              rimColor: rimColor,
              rimPower: 2.0,
              rimIntensity: 0.25,
              opacity: finalOpacity,
              edgeIntensity: 0.2,
              subsurfaceColor: isAntenna ? 0x4a5a6c : isBigLens ? 0x5a6a6a : 0x4a5560,
              subsurfaceIntensity: 0.15,
            };
            const finalMaterial = createXrayMaterial(targetXrayColor, finalOpts);
            mesh.material = finalMaterial;
            mesh.userData.scanned = true;
            meshData.state = 'complete';
            scanStateRef.current.scannedCount++;
          }
        } else if (meshData.state !== 'complete') {
          const rimColor = isAntenna
            ? 0x8a9aac
            : isBigLens
              ? 0x7a8a8a
              : isShellPiece
                ? 0x7a8590
                : 0x6a7580;

          const finalOpts: LooseXrayMaterialOptions = {
            rimColor: rimColor,
            rimPower: 2.0,
            rimIntensity: 0.25,
            opacity: finalOpacity,
            edgeIntensity: 0.2,
            subsurfaceColor: isAntenna ? 0x4a5a6c : isBigLens ? 0x5a6a6a : 0x4a5560,
            subsurfaceIntensity: 0.15,
          };
          const finalMaterial = createXrayMaterial(targetXrayColor, finalOpts);
          mesh.material = finalMaterial;
          mesh.userData.scanned = true;
          meshData.state = 'complete';
          scanStateRef.current.scannedCount++;
        }
      });

      if (scanStateRef.current.scannedCount >= scanStateRef.current.totalMeshes) {
        scanStateRef.current.meshes.forEach(meshData => {
          const { mesh, targetXrayColor, finalOpacity, isAntenna, isBigLens, isShellPiece } =
            meshData;
          if (!mesh.material || mesh.userData.isErrorMesh) return;

          if (meshData.state !== 'complete' || mesh.userData.scanMaterial) {
            const rimColor = isAntenna
              ? 0x8a9aac
              : isBigLens
                ? 0x7a8a8a
                : isShellPiece
                  ? 0x7a8590
                  : 0x6a7580;

            const finalOpts: LooseXrayMaterialOptions = {
              rimColor: rimColor,
              rimPower: 2.0,
              rimIntensity: 0.25,
              opacity: finalOpacity,
              edgeIntensity: 0.2,
              subsurfaceColor: isAntenna ? 0x4a5a6c : isBigLens ? 0x5a6a6a : 0x4a5560,
              subsurfaceIntensity: 0.15,
            };
            const finalMaterial = createXrayMaterial(targetXrayColor, finalOpts);
            mesh.material = finalMaterial;
            mesh.userData.scanned = true;
            meshData.state = 'complete';
          }
        });

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

      if (activeMeshes > 0 || hasWaitingMeshes) {
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
    };
  }, [enabled, meshes.length, scanColor]);

  return null;
}
