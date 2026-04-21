import * as THREE from 'three';

/**
 * Utilities for creating and managing robot materials. Focused on X-ray
 * rendering for the 3D viewer.
 */

/**
 * Simple and efficient X-ray shader using Fresnel rim lighting. Based on
 * proven techniques: rim lighting for edges, transparency for X-ray effect.
 */
export const xrayShader = {
  uniforms: {
    baseColor: { value: new THREE.Color(0x5a6570) },
    rimColor: { value: new THREE.Color(0x8a9aac) },
    opacity: { value: 0.3 },
    rimIntensity: { value: 0.6 },
  },

  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    uniform vec3 baseColor;
    uniform vec3 rimColor;
    uniform float opacity;
    uniform float rimIntensity;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      
      float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
      fresnel = pow(fresnel, 2.0);
      
      vec3 finalColor = mix(baseColor, rimColor, fresnel * rimIntensity);
      
      gl_FragColor = vec4(finalColor, opacity);
    }
  `,
};

export interface XrayMaterialOptions {
  opacity?: number;
  rimColor?: number;
  rimIntensity?: number;
  /** When `true`, uses green color tones for scan effect. */
  scanMode?: boolean;
}

/**
 * Creates a simple X-ray material.
 *
 * @param baseColorHex - Base color in hex (default: gray-blue)
 */
export function createXrayMaterial(
  baseColorHex: number = 0x5a6570,
  options: XrayMaterialOptions = {}
): THREE.ShaderMaterial {
  const isScanMode = options.scanMode === true;

  const baseColor = isScanMode ? 0x2d5a3d : baseColorHex;
  const rimColor = isScanMode ? 0x4ade80 : options.rimColor || 0x8a9aac;

  const uniforms = {
    baseColor: { value: new THREE.Color(baseColor) },
    rimColor: { value: new THREE.Color(rimColor) },
    opacity: { value: options.opacity ?? 0.3 },
    rimIntensity: { value: options.rimIntensity ?? 0.6 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: xrayShader.vertexShader,
    fragmentShader: xrayShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    opacity: options.opacity ?? 0.3,
  });

  return material;
}
