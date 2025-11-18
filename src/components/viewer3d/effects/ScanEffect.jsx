import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../../config/daemon';
import { createXrayMaterial } from '../utils/materials';

/**
 * Optimized progressive scan effect for robot meshes
 * Uses a single requestAnimationFrame loop instead of one per mesh
 * Significantly reduces CPU/GPU load for large mesh counts (150+)
 */
export default function ScanEffect({ 
  meshes = [], // List of meshes to scan
  scanColor = '#22c55e', // Color during scan (success green)
  enabled = true,
  onComplete = null,
  onScanMesh = null, // Callback called for each scanned mesh (mesh, index, total)
}) {
  const isScanningRef = useRef(false);
  const animationFrameRef = useRef(null);
  const onScanMeshRef = useRef(onScanMesh);
  const onCompleteRef = useRef(onComplete);
  const scanStateRef = useRef({
    meshes: [],
    startTime: 0,
    duration: 0,
    scannedCount: 0,
    notifiedMeshes: new Set(),
  });

  // Update refs when callbacks change
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

    // ✅ Avoid multiple simultaneous scans
    if (isScanningRef.current) {
      console.log('⚠️ Scan already in progress, skipping...');
      return;
    }

    isScanningRef.current = true;

    // ⚡ Scan duration read from central config
    const duration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

    console.log(`🔍 Starting optimized scan: ${meshes.length} meshes`);

    // ✅ Filter shells AND outline meshes
    const scannableMeshes = meshes.filter(mesh => 
      mesh.material && 
      !mesh.userData.isShellPiece && 
      !mesh.userData.isOutline &&
      !mesh.userData.isErrorMesh
    );
    
    // Sort meshes from bottom to top
    const sortedMeshes = [...scannableMeshes].sort((a, b) => {
      const posA = new THREE.Vector3();
      const posB = new THREE.Vector3();
      a.getWorldPosition(posA);
      b.getWorldPosition(posB);
      return posA.y - posB.y;
    });
    
    // Pre-compute mesh data (material types, colors, etc.)
    const meshData = sortedMeshes.map((mesh, index) => {
        const isAntenna = mesh.userData?.isAntenna || false;
        const isShellPiece = mesh.userData?.isShellPiece || false;
      const materialName = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase();
      const isBigLens = materialName.includes('big_lens') || 
                       materialName.includes('small_lens') ||
                       materialName.includes('lens_d40') ||
                       materialName.includes('lens_d30');
        
      // Calculate target X-ray color
        let targetXrayColor;
        if (isAntenna) {
        targetXrayColor = 0x5A6B7C;
        } else if (isBigLens) {
        targetXrayColor = 0x6B7B7A;
        } else if (isShellPiece) {
        targetXrayColor = 0x5A6570;
        } else {
          const originalColor = mesh.userData?.originalColor || 0xFF9500;
          const r = (originalColor >> 16) & 0xFF;
          const g = (originalColor >> 8) & 0xFF;
          const b = originalColor & 0xFF;
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
          
          if (luminance > 200) targetXrayColor = 0x6B757D;
          else if (luminance > 150) targetXrayColor = 0x5A6570;
          else if (luminance > 100) targetXrayColor = 0x4A5560;
          else if (luminance > 50) targetXrayColor = 0x3A4550;
          else targetXrayColor = 0x2A3540;
        }
        
      const baseOpacity = mesh.material.opacity || 0.5;
        const finalOpacity = isShellPiece ? baseOpacity * 0.3 : baseOpacity;
        
      // Calculate start time for this mesh (progressive from bottom to top)
      const startDelay = sortedMeshes.length > 1 
        ? (duration * 1000 * index) / (sortedMeshes.length - 1)
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
        state: 'waiting', // 'waiting' | 'scanning' | 'transitioning' | 'complete'
        scanStartTime: 0,
      };
    });

    const totalMeshes = sortedMeshes.length;

    // Initialize scan state
    scanStateRef.current = {
      meshes: meshData,
      startTime: Date.now(),
      duration: duration * 1000,
      scannedCount: 0,
      notifiedMeshes: new Set(),
      totalMeshes,
    };
        
    // ✅ SINGLE requestAnimationFrame loop for all meshes
        const animate = () => {
      const currentTime = Date.now();
      const highlightDuration = 500; // 500ms per mesh highlight

      let activeMeshes = 0;

      scanStateRef.current.meshes.forEach((meshData) => {
        const { mesh, index, targetXrayColor, finalOpacity, isAntenna, isBigLens, isShellPiece } = meshData;
        
        if (!mesh.material || mesh.userData.isErrorMesh) return;

        const meshElapsed = currentTime - scanStateRef.current.startTime - meshData.startDelay;

        // Mesh hasn't started yet
        if (meshElapsed < 0) {
            return;
          }
          
        // Notify start of scan for this mesh
        if (!scanStateRef.current.notifiedMeshes.has(mesh)) {
          scanStateRef.current.notifiedMeshes.add(mesh);
          if (onScanMeshRef.current) {
            onScanMeshRef.current(mesh, index + 1, scanStateRef.current.totalMeshes);
          }
        }

        const progress = Math.min(meshElapsed / highlightDuration, 1.0);
          
        // Phase 1: Intense scan (0-40%)
          if (progress < 0.4) {
          meshData.state = 'scanning';
          activeMeshes++;
            
            if (!mesh.userData.scanMaterial) {
              const scanColorHex = new THREE.Color(scanColor).getHex();
              const darkGreenHex = new THREE.Color(scanColor).multiplyScalar(0.7).getHex();
              mesh.userData.scanMaterial = createXrayMaterial(darkGreenHex, {
              rimColor: scanColorHex,
              rimPower: 1.5,
              rimIntensity: 0.6,
              opacity: 0.8,
              edgeIntensity: 0.4,
                subsurfaceColor: darkGreenHex,
                subsurfaceIntensity: 0.25,
              });
            }
          
            mesh.material = mesh.userData.scanMaterial;
            
            if (mesh.material.uniforms) {
            const scanProgress = progress / 0.4;
            const pulse = Math.sin(scanProgress * Math.PI * 2);
            mesh.material.uniforms.rimIntensity.value = 0.6 + (pulse * 0.2);
            mesh.material.uniforms.opacity.value = 0.75 + (pulse * 0.1);
            mesh.material.needsUpdate = true;
          }
        }
        // Phase 2: Transition to X-ray (40-100%)
        else if (progress < 1.0) {
          meshData.state = 'transitioning';
          activeMeshes++;

          const transitionProgress = (progress - 0.4) / 0.6;
          const easeOut = 1 - Math.pow(1 - transitionProgress, 3);

          if (mesh.material.uniforms) {
            const darkGreenColor = new THREE.Color(scanColor).multiplyScalar(0.7);
            const xrayColorVec = new THREE.Color(targetXrayColor);
            const lerpedColor = darkGreenColor.clone().lerp(xrayColorVec, easeOut);
            mesh.material.uniforms.baseColor.value.copy(lerpedColor);

            const rimColor = isAntenna ? 0x8A9AAC :
                           isBigLens ? 0x7A8A8A :
                           isShellPiece ? 0x7A8590 :
                           0x6A7580;
            const scanRimColor = new THREE.Color(scanColor);
            const xrayRimColor = new THREE.Color(rimColor);
            const lerpedRimColor = scanRimColor.clone().lerp(xrayRimColor, easeOut);
            mesh.material.uniforms.rimColor.value.copy(lerpedRimColor);

            mesh.material.uniforms.opacity.value = THREE.MathUtils.lerp(1.0, finalOpacity, easeOut);
            mesh.material.uniforms.rimIntensity.value = THREE.MathUtils.lerp(0.8, 0.25, easeOut);
            mesh.material.uniforms.edgeIntensity.value = THREE.MathUtils.lerp(0.5, 0.2, easeOut);

            const scanSubsurfaceColor = new THREE.Color(scanColor).multiplyScalar(0.6);
            const xraySubsurfaceColor = new THREE.Color(
              isAntenna ? 0x4A5A6C :
              isBigLens ? 0x5A6A6A :
              0x4A5560
            );
            const lerpedSubsurfaceColor = scanSubsurfaceColor.clone().lerp(xraySubsurfaceColor, easeOut);
            mesh.material.uniforms.subsurfaceColor.value.copy(lerpedSubsurfaceColor);
            mesh.material.uniforms.subsurfaceIntensity.value = THREE.MathUtils.lerp(0.3, 0.15, easeOut);
            mesh.material.needsUpdate = true;
          }
            
          // Apply final material near end
          if (transitionProgress >= 0.95) {
            const rimColor = isAntenna ? 0x8A9AAC :
                           isBigLens ? 0x7A8A8A :
                           isShellPiece ? 0x7A8590 :
                           0x6A7580;
            
            const finalMaterial = createXrayMaterial(targetXrayColor, {
              rimColor: rimColor,
              rimPower: 2.0,
              rimIntensity: 0.25,
              opacity: finalOpacity,
              edgeIntensity: 0.2,
              subsurfaceColor: isAntenna ? 0x4A5A6C :
                               isBigLens ? 0x5A6A6A :
                               0x4A5560,
              subsurfaceIntensity: 0.15,
            });
            mesh.material = finalMaterial;
            mesh.userData.scanned = true;
            meshData.state = 'complete';
            scanStateRef.current.scannedCount++;
          }
        }
        // Complete
        else if (meshData.state !== 'complete') {
            const rimColor = isAntenna ? 0x8A9AAC :
                           isBigLens ? 0x7A8A8A :
                           isShellPiece ? 0x7A8590 :
                           0x6A7580;
            
            const finalMaterial = createXrayMaterial(targetXrayColor, {
              rimColor: rimColor,
              rimPower: 2.0,
              rimIntensity: 0.25,
              opacity: finalOpacity,
              edgeIntensity: 0.2,
              subsurfaceColor: isAntenna ? 0x4A5A6C :
                               isBigLens ? 0x5A6A6A :
                               0x4A5560,
              subsurfaceIntensity: 0.15,
            });
            mesh.material = finalMaterial;
            mesh.userData.scanned = true;
          meshData.state = 'complete';
          scanStateRef.current.scannedCount++;
        }
      });
            
      // Check if all meshes are complete
      if (scanStateRef.current.scannedCount >= scanStateRef.current.totalMeshes) {
              console.log('✅ Scan complete');
        isScanningRef.current = false;
              if (onCompleteRef.current) {
                onCompleteRef.current();
              }
        return; // Stop animation loop
      }

      // Continue animation if there are active meshes or meshes waiting to start
      const hasWaitingMeshes = scanStateRef.current.meshes.some(md => 
        (currentTime - scanStateRef.current.startTime - md.startDelay) < scanStateRef.current.duration
      );

      if (activeMeshes > 0 || hasWaitingMeshes) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isScanningRef.current = false;
      }
    };

    // Start single animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      isScanningRef.current = false;
    };
  }, [enabled, meshes.length, scanColor]);

  return null; // No visual rendering, just logic
}

