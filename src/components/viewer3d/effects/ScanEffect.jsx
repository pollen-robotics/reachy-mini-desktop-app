import { useEffect } from 'react';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../../config/daemon';

/**
 * Effet de scan progressif des meshes du robot
 * Change le shading de chaque mesh un par un avec timing déterministe
 */
export default function ScanEffect({ 
  meshes = [], // Liste des meshes à scanner
  scanColor = '#00ffff', // Couleur pendant le scan
  enabled = true,
  onComplete = null,
  onScanMesh = null, // Callback appelé pour chaque mesh scanné (mesh, index, total)
}) {
  useEffect(() => {
    if (!enabled || meshes.length === 0) return;

    // ⚡ Durée du scan lue depuis la config centrale
    const duration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

    console.log(`🔍 Starting progressive scan of ${meshes.length} meshes (duration: ${duration}s)`);
    
    // Sauvegarder l'état X-ray de chaque mesh
    const originalStates = new Map();
    meshes.forEach((mesh) => {
      if (mesh.material) {
        originalStates.set(mesh, {
          transparent: mesh.material.transparent,
          opacity: mesh.material.opacity,
          depthWrite: mesh.material.depthWrite,
          side: mesh.material.side,
          color: mesh.material.color ? mesh.material.color.clone() : null,
        });
        mesh.userData.scanned = false;
      }
    });

    // ✅ Filtrer les coques ET les outline meshes
    const scannableMeshes = meshes.filter(mesh => !mesh.userData.isShellPiece && !mesh.userData.isOutline);
    
    const shellCount = meshes.length - scannableMeshes.length;
    console.log(`🔍 Scanning ${scannableMeshes.length}/${meshes.length} meshes (${shellCount} shell pieces excluded)`);
    
    const sortedMeshes = [...scannableMeshes].sort((a, b) => {
      // Calculer la position Y globale de chaque mesh
      const posA = new THREE.Vector3();
      const posB = new THREE.Vector3();
      a.getWorldPosition(posA);
      b.getWorldPosition(posB);
      
      // Trier de bas en haut
      return posA.y - posB.y;
    });
    
    // ⚡ Calculer le délai pour que le DERNIER mesh démarre exactement à la fin de duration
    // On divise par (n-1) pour que index_max × delay = duration
    const delayBetweenMeshes = scannableMeshes.length > 1
      ? (duration * 1000) / (scannableMeshes.length - 1) 
      : 0;
    let scannedCount = 0;
    const timeouts = [];

    // Scanner chaque mesh un par un (de bas en haut)
    sortedMeshes.forEach((mesh, index) => {
      // ⚡ Délai fixe et déterministe (pas de random)
      const delay = delayBetweenMeshes * index;
      
      const scanTimeout = setTimeout(() => {
        if (!mesh.material) return;
        
        // ✅ Notifier qu'on commence à scanner ce mesh
        if (onScanMesh) {
          onScanMesh(mesh, index + 1, scannableMeshes.length);
        }
        
        // FLASH avec couleur : passer temporairement en opaque avec la couleur du scan
        const originalState = originalStates.get(mesh);
        
        // ✅ Compatible avec MeshBasicMaterial (X-ray)
        if (mesh.material.color) {
          mesh.material.color.set(scanColor);
        }
        
        // Si le matériau supporte emissive (MeshBasicMaterial peut avoir emissive)
        if (mesh.material.emissive !== undefined) {
          mesh.material.emissive = new THREE.Color(scanColor);
          if (mesh.material.emissiveIntensity !== undefined) {
            mesh.material.emissiveIntensity = 1.5;
          }
        }
        
        mesh.material.transparent = false;
        mesh.material.opacity = 1.0;
        mesh.material.depthWrite = true;
        mesh.material.side = THREE.FrontSide;
        mesh.material.needsUpdate = true;
        
        // Après 250ms, retour en X-ray
        const returnToXrayTimeout = setTimeout(() => {
          // Restaurer l'état X-ray
          if (originalState.color && mesh.material.color) {
            mesh.material.color.copy(originalState.color);
          }
          
          // Retirer l'émissive si présent
          if (mesh.material.emissive !== undefined) {
            mesh.material.emissive.set(0x000000);
            if (mesh.material.emissiveIntensity !== undefined) {
              mesh.material.emissiveIntensity = 0;
            }
          }
          
          mesh.material.transparent = originalState.transparent;
          mesh.material.opacity = originalState.opacity;
          mesh.material.depthWrite = originalState.depthWrite;
          mesh.material.side = originalState.side;
          mesh.material.needsUpdate = true;
          
          mesh.userData.scanned = true;
          
          // Vérifier si tous les meshes scannables sont scannés
          scannedCount++;
          if (scannedCount === scannableMeshes.length && onComplete) {
            onComplete(); // ⚡ Appel immédiat quand scan visuellement terminé
          }
        }, 250);
        
        timeouts.push(returnToXrayTimeout);
      }, delay); // ⚡ Délai fixe
      
      timeouts.push(scanTimeout);
    });

    // Cleanup au démontage
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout) || clearInterval(timeout));
    };
  }, [enabled, meshes, scanColor, onComplete, onScanMesh]);

  return null; // Pas de rendu visuel, juste la logique
}

