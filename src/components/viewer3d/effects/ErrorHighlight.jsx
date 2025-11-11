import { useEffect } from 'react';
import * as THREE from 'three';

/**
 * Effet de mise en évidence d'un mesh en erreur
 * Change la couleur du mesh en rouge avec une animation pulsante
 */
export default function ErrorHighlight({ 
  errorMesh = null,
  allMeshes = [],
  errorColor = '#ff0000',
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled || !errorMesh || allMeshes.length === 0) return;

    console.log('🔴 Highlighting error mesh and dimming all others');

    // Sauvegarder les états originaux de TOUS les meshes
    const originalStates = new Map();

    allMeshes.forEach((mesh) => {
      if (mesh.material) {
        // Vérifier si le matériau a les propriétés nécessaires
        const hasEmissive = mesh.material.emissive !== undefined;
        
        originalStates.set(mesh, {
          color: mesh.material.color ? mesh.material.color.getHex() : null,
          emissive: hasEmissive ? mesh.material.emissive.getHex() : null,
          emissiveIntensity: mesh.material.emissiveIntensity,
          transparent: mesh.material.transparent,
          opacity: mesh.material.opacity,
          depthWrite: mesh.material.depthWrite,
          side: mesh.material.side,
          gradientMap: mesh.material.gradientMap,
        });

        if (mesh === errorMesh) {
          // ✅ MESH EN ERREUR : Rouge vif opaque
          mesh.userData.isErrorMesh = true;
          if (mesh.material.color) {
            mesh.material.color.set(errorColor);
          }
          if (hasEmissive) {
            mesh.material.emissive.set(errorColor);
            mesh.material.emissiveIntensity = 3.5;
          }
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          mesh.material.depthWrite = true;
          mesh.material.side = THREE.FrontSide;
          mesh.material.gradientMap = null;
        } else {
          // ⚪ AUTRES MESHES : Très transparents (presque invisibles)
          mesh.material.transparent = true;
          mesh.material.opacity = 0.05;
          mesh.material.depthWrite = false;
          mesh.material.side = THREE.DoubleSide;
          if (hasEmissive) {
            mesh.material.emissive.set(0x000000);
            mesh.material.emissiveIntensity = 0;
          }
        }
        
        mesh.material.needsUpdate = true;
      }
    });

    console.log('🔴 Error mesh highlighted, all others dimmed to 5% opacity');

    // Cleanup : restaurer les états originaux de TOUS les meshes
    return () => {
      allMeshes.forEach((mesh) => {
        const state = originalStates.get(mesh);
        if (state && mesh.material) {
          if (state.color !== null && mesh.material.color) {
            mesh.material.color.setHex(state.color);
          }
          if (state.emissive !== null && mesh.material.emissive) {
            mesh.material.emissive.setHex(state.emissive);
            mesh.material.emissiveIntensity = state.emissiveIntensity;
          }
          mesh.material.transparent = state.transparent;
          mesh.material.opacity = state.opacity;
          mesh.material.depthWrite = state.depthWrite;
          mesh.material.side = state.side;
          mesh.material.gradientMap = state.gradientMap;
          mesh.material.needsUpdate = true;
          
          // Retirer le flag d'erreur
          if (mesh.userData.isErrorMesh) {
            delete mesh.userData.isErrorMesh;
          }
        }
      });
      console.log('🔄 All meshes restored to original state');
    };
  }, [enabled, errorMesh, allMeshes, errorColor]);

  return null; // Pas de rendu visuel, juste la logique
}

