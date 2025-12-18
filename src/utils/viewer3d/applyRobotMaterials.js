/**
 * 🎨 Apply materials to robot model
 * 
 * Shared utility for URDFRobot and URDFRobotSharedBuffer.
 * Handles wireframe, x-ray, and normal material modes.
 */

import * as THREE from 'three';
import { createXrayMaterial } from './materials';

/**
 * Apply materials to a robot model based on current visual settings
 * 
 * @param {Object} robotModel - The URDF robot model
 * @param {Object} options - Material options
 * @param {boolean} options.transparent - X-ray mode
 * @param {boolean} options.wireframe - Wireframe mode
 * @param {number} options.xrayOpacity - Opacity for x-ray mode
 * @param {boolean} options.darkMode - Dark mode enabled
 */
export function applyRobotMaterials(robotModel, { transparent, wireframe, xrayOpacity = 0.5, darkMode = false }) {
  robotModel.traverse((child) => {
    if (!child.isMesh || child.userData.isErrorMesh) return;
    
    const originalColor = child.userData?.originalColor || 0xFF9500;
    const materialName = (child.userData?.materialName || child.material?.name || '').toLowerCase();
    const stlFileName = (child.userData?.stlFileName || '').toLowerCase();
    
    // Detect special parts
    const isBigLens = child.userData?.isBigLens || 
                     materialName.includes('big_lens') ||
                     materialName.includes('small_lens') ||
                     materialName.includes('lens_d40') ||
                     materialName.includes('lens_d30');
    const isAntenna = child.userData?.isAntenna || 
                     materialName.includes('antenna') ||
                     stlFileName.includes('antenna');
    const isArducam = materialName.includes('arducam') || stlFileName.includes('arducam');
    
    if (wireframe) {
      // Wireframe mode
      child.material = new THREE.MeshBasicMaterial({
        color: originalColor,
        wireframe: true,
        transparent: false,
      });
      child.material.needsUpdate = true;
    } else if (transparent) {
      // X-ray mode
      let xrayColor, rimColor;
      if (darkMode) {
        if (isAntenna) {
          xrayColor = 0x8AACD0;
          rimColor = 0xAAC8E8;
        } else if (isBigLens) {
          xrayColor = 0x9BB8B8;
          rimColor = 0xB8D8D8;
        } else {
          xrayColor = 0x8A9AAA;
          rimColor = 0xAAC0D0;
        }
      } else {
        xrayColor = 0x5A6570;
        if (isAntenna) xrayColor = 0x5A6B7C;
        else if (isBigLens) xrayColor = 0x6B7B7A;
        rimColor = undefined;
      }
      
      child.material = createXrayMaterial(xrayColor, { 
        opacity: darkMode ? Math.min(xrayOpacity * 1.5, 0.15) : xrayOpacity,
        rimColor: rimColor,
        rimIntensity: darkMode ? 0.8 : 0.6,
      });
    } else {
      // Normal mode with flat shading
      if (child.geometry.attributes.normal) {
        child.geometry.deleteAttribute('normal');
      }
      child.geometry.computeVertexNormals();
      
      if (isBigLens) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.75,
          flatShading: true,
        });
      } else if (isAntenna) {
        child.material = new THREE.MeshStandardMaterial({
          color: darkMode ? 0x999999 : 0x000000,
          flatShading: true,
          roughness: 0.3,
          metalness: 0.2,
        });
        child.material.needsUpdate = true;
      } else if (isArducam) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0x4D4D4D,
          flatShading: true,
          roughness: 0.7,
          metalness: 0.0,
        });
        child.material.needsUpdate = true;
      } else {
        child.material = new THREE.MeshStandardMaterial({
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

