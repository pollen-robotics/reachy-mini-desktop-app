import * as THREE from 'three';

/**
 * Utilities for creating and managing robot materials
 */

/**
 * Creates a gradient map for cell shading with better contrast
 * @param {number} bands - Number of color bands (2-10)
 * @returns {THREE.DataTexture}
 */
export function createCellShadingGradient(bands = 3) {
  const colors = new Uint8Array(bands * 3);
  
  // ✅ EXTREME gradient for highly visible cell shading
  // Use fixed values to maximize contrast
  if (bands === 3) {
    // 3 bands: Shadow / Mid-tone / Light
    colors[0] = 40;   colors[1] = 40;   colors[2] = 40;   // Deep shadow
    colors[3] = 140;  colors[4] = 140;  colors[5] = 140;  // Mid-tone
    colors[6] = 255;  colors[7] = 255;  colors[8] = 255;  // Full light
  } else if (bands === 4) {
    // 4 bands for more nuance
    colors[0] = 30;   colors[1] = 30;   colors[2] = 30;   // Very dark shadow
    colors[3] = 100;  colors[4] = 100;  colors[5] = 100;  // Medium shadow
    colors[6] = 180;  colors[7] = 180;  colors[8] = 180;  // Medium light
    colors[9] = 255;  colors[10] = 255; colors[11] = 255; // Full light
  } else {
    // For other numbers of bands, progressive gradient with more contrast
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      // Exponential curve for more contrast
      const brightness = Math.pow(t, 0.7) * 255;
      
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;
    }
  }
  
  const gradientTexture = new THREE.DataTexture(colors, bands, 1, THREE.RGBFormat);
  gradientTexture.minFilter = THREE.NearestFilter;
  gradientTexture.magFilter = THREE.NearestFilter;
  gradientTexture.needsUpdate = true;
  
  return gradientTexture;
}

/**
 * Custom shader for AAA cell shading with rim lighting and specular highlights
 */
export const cellShadingShader = {
  uniforms: {
    baseColor: { value: new THREE.Color(0xFF9500) },
    lightDirection: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
    lightDirection2: { value: new THREE.Vector3(-0.3, 0.5, 0.3).normalize() },
    shadowColor: { value: new THREE.Color(0x404040) },
    midtoneColor: { value: new THREE.Color(0x909090) },
    highlightColor: { value: new THREE.Color(0xffffff) },
    rimColor: { value: new THREE.Color(0xffcc88) },
    rimPower: { value: 3.5 },
    rimIntensity: { value: 0.35 },
    specularPower: { value: 56.0 },
    specularIntensity: { value: 0.25 },
    bands: { value: 100 },
    ambientIntensity: { value: 0.4 },
    contrastBoost: { value: 0.85 },
    smoothness: { value: 0.4 },
    opacity: { value: 1.0 },
  },
  
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    
    void main() {
      // Normal in world space
      vNormal = normalize(normalMatrix * normal);
      
      // Camera position
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      
      // World position
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  
  fragmentShader: `
    uniform vec3 baseColor;
    uniform vec3 lightDirection;
    uniform vec3 lightDirection2;
    uniform vec3 shadowColor;
    uniform vec3 midtoneColor;
    uniform vec3 highlightColor;
    uniform vec3 rimColor;
    uniform float rimPower;
    uniform float rimIntensity;
    uniform float specularPower;
    uniform float specularIntensity;
    uniform float bands;
    uniform float ambientIntensity;
    uniform float contrastBoost;
    uniform float smoothness;
    uniform float opacity;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    
    // Smooth quantization function with anti-aliasing
    float quantizeSmooth(float value, float steps, float smoothFactor) {
      float quantized = floor(value * steps) / steps;
      float nextBand = floor(value * steps + 1.0) / steps;
      float t = fract(value * steps);
      
      // Smoothstep for smooth transitions between bands
      t = smoothstep(1.0 - smoothFactor, 1.0, t);
      
      return mix(quantized, nextBand, t);
    }
    
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      vec3 light = normalize(lightDirection);
      vec3 light2 = normalize(lightDirection2);
      
      // ===== 1. DIFFUSE CELL SHADING (Multi-light with smooth) =====
      // Main light
      float NdotL = max(dot(normal, light), 0.0);
      // Secondary light (fill light)
      float NdotL2 = max(dot(normal, light2), 0.0) * 0.35;
      // Combine both lights
      float combinedLight = NdotL + NdotL2;
      
      // Smooth quantization into bands
      float diffuse = quantizeSmooth(combinedLight, bands, smoothness);
      
      // Contrast boost (optional, disabled by default)
      if (contrastBoost != 1.0) {
        diffuse = pow(diffuse, 1.0 / contrastBoost);
      }
      
      // Map bands to colors with smooth transitions
      vec3 shadedColor;
      if (diffuse < 0.33) {
        // Shadow zone
        shadedColor = mix(shadowColor, midtoneColor, diffuse / 0.33) * baseColor;
      } else if (diffuse < 0.66) {
        // Mid-tone to base color
        shadedColor = mix(midtoneColor * baseColor, baseColor, (diffuse - 0.33) / 0.33);
      } else {
        // Base color to highlight (elegant and subtle)
        shadedColor = mix(baseColor, baseColor * mix(vec3(1.0), highlightColor, 0.2), (diffuse - 0.66) / 0.34);
      }
      
      // ===== 2. RIM LIGHTING (Elegant Fresnel) =====
      float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
      fresnel = pow(fresnel, rimPower);
      
      // Rim light with smooth and elegant transition
      float rimSmooth = smoothstep(0.4, 0.75, fresnel);
      vec3 rimLight = rimColor * rimSmooth * rimIntensity;
      
      // ===== 3. SPECULAR HIGHLIGHT (Elegant) =====
      vec3 halfVector = normalize(light + viewDir);
      float NdotH = max(dot(normal, halfVector), 0.0);
      float spec = pow(NdotH, specularPower);
      
      // Soft specular with smoothstep for elegant rendering
      float specSmooth = smoothstep(0.65, 0.85, spec);
      vec3 specular = highlightColor * specSmooth * specularIntensity;
      
      // ===== 4. AMBIENT =====
      // Elegant AO based on Y normal for more depth
      float ao = smoothstep(-0.4, 0.6, normal.y) * 0.25 + 0.75;
      vec3 ambient = baseColor * ambientIntensity * ao;
      
      // ===== FINAL COMBINATION =====
      vec3 finalColor = shadedColor + ambient + rimLight + specular;
      
      // Subtle saturation adjustment for elegant rendering
      float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
      finalColor = mix(vec3(luminance), finalColor, 1.0);
      
      // Clamp to avoid overexposure (tone mapping is handled by the renderer)
      finalColor = clamp(finalColor, 0.0, 1.0);
      
      // ✅ Use uniform opacity for transparency
      gl_FragColor = vec4(finalColor, opacity);
    }
  `
};

/**
 * Creates an AAA cell shading material with custom shader
 * @param {number} baseColorHex - Base color in hex
 * @param {object} options - Shader options
 * @returns {THREE.ShaderMaterial}
 */
export function createCellShadingMaterial(baseColorHex = 0xFF9500, options = {}) {
  // ✅ Manually create uniforms to avoid cloning issues
  const uniforms = {
    baseColor: { value: new THREE.Color(baseColorHex) },
    lightDirection: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
    lightDirection2: { value: new THREE.Vector3(-0.3, 0.5, 0.3).normalize() },
    shadowColor: { value: new THREE.Color(0x404040) },
    midtoneColor: { value: new THREE.Color(0x909090) },
    highlightColor: { value: new THREE.Color(0xffffff) },
    rimColor: { value: new THREE.Color(0xffcc88) },
    rimPower: { value: 3.5 }, // Optimized for elegant rim light
    rimIntensity: { value: options.rimIntensity ?? 0.4 }, // Slightly increased for more punch
    specularPower: { value: 56.0 }, // Optimized for subtle but visible highlights
    specularIntensity: { value: options.specularIntensity ?? 0.3 }, // Slightly increased
    bands: { value: options.bands ?? 100 }, // Optimal resolution for quality/performance
    ambientIntensity: { value: options.ambientIntensity ?? 0.45 }, // Slightly increased for more brightness
    contrastBoost: { value: options.contrastBoost ?? 0.9 }, // Optimized for elegant contrast
    smoothness: { value: options.smoothness ?? 0.45 }, // Slightly increased for smoother transitions
    opacity: { value: options.opacity ?? 1.0 },
  };
  
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: cellShadingShader.vertexShader,
    fragmentShader: cellShadingShader.fragmentShader,
    lights: false, // We manage lighting ourselves in the shader
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    transparent: options.opacity !== undefined && options.opacity < 1.0, // Enable transparent if opacity < 1.0
    opacity: options.opacity ?? 1.0, // Set material opacity
    // ✅ Smooth shading is controlled by geometry normals (computeVertexNormals)
    // No flatShading property on ShaderMaterial
  });
  
  return material;
}

/**
 * Updates cell shading shader parameters
 * @param {THREE.ShaderMaterial} material - Material to update
 * @param {object} params - Parameters to modify
 */
export function updateCellShadingMaterial(material, params = {}) {
  if (!material.uniforms) return;
  
  // ✅ Update all parameters even if they are undefined (use current values)
  // This allows forcing update even if some values don't change
  let updated = false;
  
  if (params.bands !== undefined) {
    material.uniforms.bands.value = params.bands;
    updated = true;
  }
  if (params.rimIntensity !== undefined) {
    material.uniforms.rimIntensity.value = params.rimIntensity;
    updated = true;
  }
  if (params.specularIntensity !== undefined) {
    material.uniforms.specularIntensity.value = params.specularIntensity;
    updated = true;
  }
  if (params.ambientIntensity !== undefined) {
    material.uniforms.ambientIntensity.value = params.ambientIntensity;
    updated = true;
  }
  if (params.rimPower !== undefined) {
    material.uniforms.rimPower.value = params.rimPower;
    updated = true;
  }
  if (params.specularPower !== undefined) {
    material.uniforms.specularPower.value = params.specularPower;
    updated = true;
  }
  if (params.contrastBoost !== undefined) {
    material.uniforms.contrastBoost.value = params.contrastBoost;
    updated = true;
  }
  if (params.smoothness !== undefined) {
    material.uniforms.smoothness.value = params.smoothness;
    updated = true;
  }
  if (params.opacity !== undefined) {
    material.uniforms.opacity.value = params.opacity;
    // ✅ Also update material.opacity and material.transparent
    material.opacity = params.opacity;
    material.transparent = params.opacity < 1.0;
    updated = true;
  }
  
  // ✅ Always mark as needing update to force re-render
  if (updated) {
    material.needsUpdate = true;
  }
}

/**
 * Simple and efficient X-ray shader using Fresnel rim lighting
 * Based on proven techniques: rim lighting for edges, transparency for X-ray effect
 */
export const xrayShader = {
  uniforms: {
    baseColor: { value: new THREE.Color(0x5A6570) },
    rimColor: { value: new THREE.Color(0x8A9AAC) },
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
      
      // Fresnel effect: edges are brighter (rim lighting)
      float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
      fresnel = pow(fresnel, 2.0);
      
      // Mix base color with rim color based on fresnel
      vec3 finalColor = mix(baseColor, rimColor, fresnel * rimIntensity);
      
      gl_FragColor = vec4(finalColor, opacity);
    }
  `
};

/**
 * Creates a simple X-ray material
 * @param {number} baseColorHex - Base color in hex (default: gray-blue)
 * @param {object} options - Options: { opacity, rimColor, rimIntensity, scanMode }
 * @param {boolean} options.scanMode - If true, uses green color for scan effect
 * @returns {THREE.ShaderMaterial}
 */
export function createXrayMaterial(baseColorHex = 0x5A6570, options = {}) {
  const isScanMode = options.scanMode === true;
  
  // Scan mode: green colors
  const baseColor = isScanMode ? 0x2D5A3D : baseColorHex;
  const rimColor = isScanMode ? 0x4ADE80 : (options.rimColor || 0x8A9AAC);
  
  const uniforms = {
    baseColor: { value: new THREE.Color(baseColor) },
    rimColor: { value: new THREE.Color(rimColor) },
    opacity: { value: options.opacity ?? 0.3 },
    rimIntensity: { value: options.rimIntensity ?? 0.6 },
  };
  
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
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


