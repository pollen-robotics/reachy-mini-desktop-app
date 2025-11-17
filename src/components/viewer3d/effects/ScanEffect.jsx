import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../../config/daemon';
import { createXrayMaterial, updateXrayMaterial } from '../utils/materials';

/**
 * AAA progressive scan effect for robot meshes
 * Uses improved X-ray techniques with rim lighting, bloom and smooth transitions
 */
export default function ScanEffect({ 
  meshes = [], // List of meshes to scan
  scanColor = '#22c55e', // Color during scan (success green)
  enabled = true,
  onComplete = null,
  onScanMesh = null, // Callback called for each scanned mesh (mesh, index, total)
}) {
  const isScanningRef = useRef(false);
  const timeoutsRef = useRef([]);
  const onScanMeshRef = useRef(onScanMesh);
  const onCompleteRef = useRef(onComplete);

  // Update refs when callbacks change
  useEffect(() => {
    onScanMeshRef.current = onScanMesh;
    onCompleteRef.current = onComplete;
  }, [onScanMesh, onComplete]);

  useEffect(() => {
    if (!enabled || meshes.length === 0) {
      isScanningRef.current = false;
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

    // Reduced logging - only log summary
    console.log(`🔍 Starting scan: ${meshes.length} meshes`);
    
    // ✅ Save complete X-ray state of each mesh (including shader materials)
    const originalStates = new Map();
    meshes.forEach((mesh) => {
      if (mesh.material) {
        // Save complete material for restoration
        originalStates.set(mesh, {
          material: mesh.material.clone ? mesh.material.clone() : mesh.material,
          transparent: mesh.material.transparent,
          opacity: mesh.material.opacity,
          depthWrite: mesh.material.depthWrite,
          side: mesh.material.side,
          color: mesh.material.color ? mesh.material.color.clone() : null,
          emissive: mesh.material.emissive ? mesh.material.emissive.clone() : null,
          // Save uniforms if it's a shader material
          uniforms: mesh.material.uniforms ? JSON.parse(JSON.stringify(mesh.material.uniforms)) : null,
        });
        mesh.userData.scanned = false;
      }
    });

    // ✅ Filter shells AND outline meshes
    const scannableMeshes = meshes.filter(mesh => !mesh.userData.isShellPiece && !mesh.userData.isOutline);
    
    const sortedMeshes = [...scannableMeshes].sort((a, b) => {
      // Calculate global Y position of each mesh
      const posA = new THREE.Vector3();
      const posB = new THREE.Vector3();
      a.getWorldPosition(posA);
      b.getWorldPosition(posB);
      
      // Sort from bottom to top
      return posA.y - posB.y;
    });
    
    // ⚡ Calculate delay so LAST mesh starts exactly at end of duration
    // We divide by (n-1) so that index_max × delay = duration
    const delayBetweenMeshes = scannableMeshes.length > 1
      ? (duration * 1000) / (scannableMeshes.length - 1) 
      : 0;
    let scannedCount = 0;
    
    // ✅ Clean up previous timeouts
    timeoutsRef.current.forEach(timeout => {
      if (typeof timeout === 'function') {
        timeout();
      } else {
        clearTimeout(timeout);
      }
    });
    timeoutsRef.current = [];

    // Scan each mesh one by one (from bottom to top)
    sortedMeshes.forEach((mesh, index) => {
      // ⚡ Fixed and deterministic delay (no random)
      const delay = delayBetweenMeshes * index;
      
      const scanTimeout = setTimeout(() => {
        if (!mesh.material) return;
        
        // ✅ Notify that we're starting to scan this mesh
        if (onScanMeshRef.current) {
          onScanMeshRef.current(mesh, index + 1, scannableMeshes.length);
        }
        
        const originalState = originalStates.get(mesh);
        
        // ✅ Determine material type to use correct X-ray colors
        const isAntenna = mesh.userData?.isAntenna || false;
        const isShellPiece = mesh.userData?.isShellPiece || false;
        const isBigLens = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('big_lens') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('small_lens') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('lens_d40') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('lens_d30');
        
        // ✅ Final X-ray color based on material type (same logic as getXrayMaterial)
        let targetXrayColor;
        if (isAntenna) {
          targetXrayColor = 0x5A6B7C; // Medium-blue gray
        } else if (isBigLens) {
          targetXrayColor = 0x6B7B7A; // Light-green gray
        } else if (isShellPiece) {
          targetXrayColor = 0x5A6570; // Medium gray
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
        
        // ✅ Final opacity with increased transparency for 3D printed parts
        const baseOpacity = originalState.opacity || 0.5;
        const finalOpacity = isShellPiece ? baseOpacity * 0.3 : baseOpacity;
        
        // ✨ AAA ANIMATION with rim lighting and bloom
        const highlightDuration = 500; // Total highlight duration in ms (slightly increased)
        const startTime = Date.now();
        
        // Animation frame for smooth AAA effect
        const animate = () => {
          if (!mesh.material) return;
          
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / highlightDuration, 1.0);
          
          // ✨ Phase 1: Intense scan (0-40% of time)
          if (progress < 0.4) {
            const scanProgress = progress / 0.4;
            const pulse = Math.sin(scanProgress * Math.PI * 2); // Fast pulse
            
            // Create/apply scan material with intense rim lighting (one per mesh)
            // ✅ Use darker green to avoid white flash
            if (!mesh.userData.scanMaterial) {
              const scanColorHex = new THREE.Color(scanColor).getHex();
              // Darker success green for scan phase
              const darkGreenHex = new THREE.Color(scanColor).multiplyScalar(0.7).getHex();
              mesh.userData.scanMaterial = createXrayMaterial(darkGreenHex, {
                rimColor: scanColorHex, // Rim with original success green
                rimPower: 1.5, // More pronounced rim during scan
                rimIntensity: 0.6, // Less intense rim to avoid flash
                opacity: 0.8, // Reduced opacity for smoother transition
                edgeIntensity: 0.4, // Visible edges but less aggressive
                subsurfaceColor: darkGreenHex,
                subsurfaceIntensity: 0.25,
              });
            }
            mesh.material = mesh.userData.scanMaterial;
            
            // Rim lighting intensity pulse (more subtle)
            if (mesh.material.uniforms) {
              mesh.material.uniforms.rimIntensity.value = 0.6 + (pulse * 0.2); // 0.6 -> 0.8 -> 0.6
              mesh.material.uniforms.opacity.value = 0.75 + (pulse * 0.1); // Slight opacity variation
            }
            
            mesh.material.needsUpdate = true;
          }
          // ✨ Phase 2: Smooth transition to X-ray (40-100% of time)
          else {
            const transitionProgress = (progress - 0.4) / 0.6;
            const easeOut = 1 - Math.pow(1 - transitionProgress, 3); // Cubic easing
            
            // Create final X-ray material
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
            
            // Interpolation between dark green scan and X-ray (green -> gray transition)
            if (mesh.material.uniforms) {
              // ✅ Interpolate from dark green (not white) to X-ray color
              const darkGreenColor = new THREE.Color(scanColor).multiplyScalar(0.7); // Dark green
              const xrayColorVec = new THREE.Color(targetXrayColor);
              const lerpedColor = darkGreenColor.clone().lerp(xrayColorVec, easeOut);
              mesh.material.uniforms.baseColor.value.copy(lerpedColor);
              
              // Interpolate rim color
              const scanRimColor = new THREE.Color(scanColor);
              const xrayRimColor = new THREE.Color(rimColor);
              const lerpedRimColor = scanRimColor.clone().lerp(xrayRimColor, easeOut);
              mesh.material.uniforms.rimColor.value.copy(lerpedRimColor);
              
              // Interpolate opacity
              mesh.material.uniforms.opacity.value = THREE.MathUtils.lerp(1.0, finalOpacity, easeOut);
              
              // Interpolate rim intensity
              mesh.material.uniforms.rimIntensity.value = THREE.MathUtils.lerp(0.8, 0.25, easeOut);
              mesh.material.uniforms.edgeIntensity.value = THREE.MathUtils.lerp(0.5, 0.2, easeOut);
              
              // Interpolate subsurface color
              const scanSubsurfaceColor = new THREE.Color(scanColor).multiplyScalar(0.6);
              const xraySubsurfaceColor = new THREE.Color(
                isAntenna ? 0x4A5A6C :
                isBigLens ? 0x5A6A6A :
                0x4A5560
              );
              const lerpedSubsurfaceColor = scanSubsurfaceColor.clone().lerp(xraySubsurfaceColor, easeOut);
              mesh.material.uniforms.subsurfaceColor.value.copy(lerpedSubsurfaceColor);
              mesh.material.uniforms.subsurfaceIntensity.value = THREE.MathUtils.lerp(0.3, 0.15, easeOut);
          }
          
          mesh.material.needsUpdate = true;
            
            // At end of transition, replace with final X-ray material
            if (transitionProgress >= 0.95) {
              mesh.material = finalMaterial;
            }
          }
          
          // Continue animation or finish
          if (progress < 1.0) {
            const frameId = requestAnimationFrame(animate);
            timeoutsRef.current.push(() => cancelAnimationFrame(frameId));
          } else {
            // ✅ Animation finished - ensure final X-ray material is applied
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
            mesh.material.needsUpdate = true;
            mesh.userData.scanned = true;
            
            // Check if all scannable meshes are scanned
            scannedCount++;
            if (scannedCount === scannableMeshes.length) {
              // Reduced logging
              console.log('✅ Scan complete');
              isScanningRef.current = false; // ✅ Reset flag
              
              if (onCompleteRef.current) {
                onCompleteRef.current();
              }
            }
          }
        };
        
        // Start animation
        animate();
      }, delay); // ⚡ Fixed delay
      
      timeoutsRef.current.push(scanTimeout);
    });

    // Cleanup on unmount
    return () => {
      // Cancel all timeouts and animations in progress
      timeoutsRef.current.forEach(timeout => {
        if (typeof timeout === 'function') {
          timeout(); // Cancel requestAnimationFrame animations
        } else {
          clearTimeout(timeout);
          clearInterval(timeout);
            }
      });
      timeoutsRef.current = [];
      isScanningRef.current = false;
      
      // Note: We don't restore materials as they should remain in X-ray mode after scan
      // Final X-ray materials are already applied at end of each animation
    };
  }, [enabled, meshes.length, scanColor]); // ✅ Use meshes.length instead of meshes to avoid relaunches

  return null; // No visual rendering, just logic
}

