import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../../config/daemon';
import { createXrayMaterial } from '../../../utils/viewer3d/materials';
import { mapMeshToScanPart, SCAN_PARTS } from '../../../utils/scanParts';

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
      return;
    }

    isScanningRef.current = true;

    // ⚡ Scan duration read from central config
    const duration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

    // ✅ Filter shells AND outline meshes
    const scannableMeshes = meshes.filter(mesh => 
      mesh.material && 
      !mesh.userData.isShellPiece && 
      !mesh.userData.isOutline &&
      !mesh.userData.isErrorMesh
    );
    
    // ✅ Cache mesh positions to avoid recalculating during sort
    const meshPositions = new Map();
    const getMeshY = (mesh) => {
      if (!meshPositions.has(mesh)) {
        const pos = new THREE.Vector3();
        mesh.getWorldPosition(pos);
        meshPositions.set(mesh, pos.y);
      }
      return meshPositions.get(mesh);
    };
    
    // Group meshes by family using mapMeshToScanPart
    const familyGroups = new Map();
    const ungroupedMeshes = [];
    const meshPartCache = new WeakMap(); // Cache to avoid recalculating
    
    scannableMeshes.forEach(mesh => {
      // ✅ Cache mesh-to-part mapping
      let partInfo = meshPartCache.get(mesh);
      if (!partInfo) {
        partInfo = mapMeshToScanPart(mesh);
        if (partInfo) {
          meshPartCache.set(mesh, partInfo);
        }
      }
      
      if (partInfo && partInfo.family) {
        if (!familyGroups.has(partInfo.family)) {
          familyGroups.set(partInfo.family, []);
        }
        familyGroups.get(partInfo.family).push(mesh);
      } else {
        ungroupedMeshes.push(mesh);
      }
    });
    
    // Sort families according to SCAN_PARTS order
    const familyOrder = SCAN_PARTS.map(f => f.family);
    const sortedFamilies = Array.from(familyGroups.entries()).sort((a, b) => {
      const indexA = familyOrder.indexOf(a[0]);
      const indexB = familyOrder.indexOf(b[0]);
      // If family not in order list, put it at the end
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    // Sort meshes within each family by Y position (bottom to top)
    // Then flatten all families into a single array
    const sortedMeshes = [];
    sortedFamilies.forEach(([family, familyMeshes]) => {
      const sortedFamilyMeshes = [...familyMeshes].sort((a, b) => {
        // ✅ Use cached positions
        return getMeshY(a) - getMeshY(b);
      });
      sortedMeshes.push(...sortedFamilyMeshes);
    });
    
    // Add ungrouped meshes at the end
    if (ungroupedMeshes.length > 0) {
      const sortedUngrouped = [...ungroupedMeshes].sort((a, b) => {
        // ✅ Use cached positions
        return getMeshY(a) - getMeshY(b);
      });
      sortedMeshes.push(...sortedUngrouped);
    }
    
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
        
      // ✅ Use X-ray opacity from Scene config (0.2 light, 0.1 dark) instead of material opacity
      // Note: This will be adjusted by Scene.jsx based on darkMode, but we use a default here
      // The actual opacity is controlled by Scene.jsx xraySettings
      const xrayOpacity = 0.2; // Base opacity (Scene.jsx adjusts based on darkMode)
      const finalOpacity = isShellPiece ? xrayOpacity * 0.3 : xrayOpacity;
        
      // Calculate start time for this mesh
      // Fixed duration per mesh (slower), distributed across total scan duration
      const highlightDuration = 350; // Fixed 350ms per mesh (slower than before)
      const totalScanTime = duration * 1000; // Total scan duration in ms
      
      // Distribute meshes across total scan time
      // Ensure the last mesh starts early enough to finish before scan ends
      // Last mesh should start at: totalScanTime - highlightDuration
      const startDelay = sortedMeshes.length > 1 
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
        highlightDuration, // Store per-mesh duration
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

      let activeMeshes = 0;

      scanStateRef.current.meshes.forEach((meshData) => {
        const { mesh, index, targetXrayColor, finalOpacity, isAntenna, isBigLens, isShellPiece, highlightDuration } = meshData;
        
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
          
        // Phase 1: Intense scan (0-50%) - Extended for better visibility
          if (progress < 0.5) {
          meshData.state = 'scanning';
          activeMeshes++;
            
            // ✅ Create scan material once (green mode)
            if (!mesh.userData.scanMaterial) {
              mesh.userData.scanMaterial = createXrayMaterial(0x2D5A3D, {
                scanMode: true,
                opacity: 0.4,
                rimIntensity: 0.7,
              });
              if (!mesh.userData.originalMaterial) {
                mesh.userData.originalMaterial = mesh.material;
              }
            }
          
            if (mesh.material !== mesh.userData.scanMaterial) {
            mesh.material = mesh.userData.scanMaterial;
            }
            
            // ✅ Simple pulse effect during scan
            if (mesh.material.uniforms) {
            const scanProgress = progress / 0.5;
              const pulse = Math.sin(scanProgress * Math.PI * 2) * 0.08; // Subtle pulse
              mesh.material.uniforms.opacity.value = 0.4 + pulse;
              mesh.material.opacity = mesh.material.uniforms.opacity.value;
          }
        }
        // Phase 2: Transition to X-ray (50-100%)
        else if (progress < 1.0) {
          meshData.state = 'transitioning';
          activeMeshes++;

          const transitionProgress = (progress - 0.5) / 0.5;
          // Smoother easing curve for more elegant transition
          const easeOut = 1 - Math.pow(1 - transitionProgress, 2.5);

          // ✅ Transition from green scan to normal X-ray
          if (!mesh.userData.scanMaterial) {
            mesh.userData.scanMaterial = createXrayMaterial(0x2D5A3D, {
              scanMode: true,
              opacity: 0.6,
              rimIntensity: 0.7,
            });
          }
          
          if (mesh.material !== mesh.userData.scanMaterial) {
            mesh.material = mesh.userData.scanMaterial;
          }

          if (mesh.material.uniforms) {
            // ✅ Simple transition: lerp from green to X-ray color
            const scanBaseColor = new THREE.Color(0x2D5A3D);
            const xrayBaseColor = new THREE.Color(targetXrayColor);
            const lerpedColor = scanBaseColor.clone().lerp(xrayBaseColor, easeOut);
            mesh.material.uniforms.baseColor.value.copy(lerpedColor);

            const scanRimColor = new THREE.Color(0x4ADE80);
            const xrayRimColor = new THREE.Color(isAntenna ? 0x8A9AAC : isBigLens ? 0x7A8A8A : isShellPiece ? 0x7A8590 : 0x6A7580);
            const lerpedRim = scanRimColor.clone().lerp(xrayRimColor, easeOut);
            mesh.material.uniforms.rimColor.value.copy(lerpedRim);

            const newOpacity = THREE.MathUtils.lerp(0.3, finalOpacity, easeOut);
            mesh.material.uniforms.opacity.value = newOpacity;
            mesh.material.opacity = newOpacity;
            mesh.material.uniforms.rimIntensity.value = THREE.MathUtils.lerp(0.7, 0.6, easeOut);
          }
            
          // ✅ Create final X-ray material when transition completes
          if (transitionProgress >= 0.95 && !mesh.userData.finalMaterial) {
            const rimColor = isAntenna ? 0x8A9AAC :
                           isBigLens ? 0x7A8A8A :
                           isShellPiece ? 0x7A8590 :
                           0x6A7580;
            
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
        }
        // Complete - create final X-ray material
        else if (meshData.state !== 'complete') {
          if (!mesh.userData.finalMaterial) {
            const rimColor = isAntenna ? 0x8A9AAC :
                           isBigLens ? 0x7A8A8A :
                           isShellPiece ? 0x7A8590 :
                           0x6A7580;
            
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
            
      // Check if all meshes are complete AND enough time has passed for the last mesh to finish
      const allMeshesComplete = scanStateRef.current.scannedCount >= scanStateRef.current.totalMeshes;
      
      // Find the last mesh's end time (startDelay + highlightDuration)
      const lastMesh = scanStateRef.current.meshes[scanStateRef.current.meshes.length - 1];
      const lastMeshEndTime = scanStateRef.current.startTime + lastMesh.startDelay + lastMesh.highlightDuration;
      const allMeshesFinished = currentTime >= lastMeshEndTime;
      
      if (allMeshesComplete && allMeshesFinished) {
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

      if (activeMeshes > 0 || hasWaitingMeshes || !allMeshesFinished) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isScanningRef.current = false;
      }
    };

    // Start single animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    // ✅ Cleanup on unmount or when disabled
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      isScanningRef.current = false;
      
      // ✅ Cleanup: dispose scan materials to prevent memory leaks
      // Note: We don't dispose finalMaterial as it's used after scan completes
      // Only dispose scanMaterial if scan was interrupted
      if (scanStateRef.current.meshes) {
        scanStateRef.current.meshes.forEach((meshData) => {
          const mesh = meshData.mesh;
          if (mesh && mesh.userData.scanMaterial && mesh.material === mesh.userData.scanMaterial) {
            // Only dispose if still using scan material (scan was interrupted)
            if (mesh.userData.originalMaterial) {
              mesh.material = mesh.userData.originalMaterial;
            }
            // Don't dispose scanMaterial here - it might be reused
            // The finalMaterial will be kept for the X-ray view
          }
        });
      }
    };
  }, [enabled, meshes.length, scanColor]);

  return null; // No visual rendering, just logic
}

