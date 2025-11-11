import * as THREE from 'three';

/**
 * Utilitaires pour la création et la gestion des matériaux du robot
 */

/**
 * Crée un gradient map pour le cell shading avec un meilleur contraste
 * @param {number} bands - Nombre de bandes de couleur (2-10)
 * @returns {THREE.DataTexture}
 */
export function createCellShadingGradient(bands = 3) {
  const colors = new Uint8Array(bands * 3);
  
  // ✅ Gradient EXTRÊME pour cell shading très visible
  // Utiliser des valeurs fixes pour maximiser le contraste
  if (bands === 3) {
    // 3 bands : Ombre / Mi-ton / Lumière
    colors[0] = 40;   colors[1] = 40;   colors[2] = 40;   // Ombre profonde
    colors[3] = 140;  colors[4] = 140;  colors[5] = 140;  // Mi-ton
    colors[6] = 255;  colors[7] = 255;  colors[8] = 255;  // Lumière pleine
  } else if (bands === 4) {
    // 4 bands pour plus de nuance
    colors[0] = 30;   colors[1] = 30;   colors[2] = 30;   // Ombre très sombre
    colors[3] = 100;  colors[4] = 100;  colors[5] = 100;  // Ombre moyenne
    colors[6] = 180;  colors[7] = 180;  colors[8] = 180;  // Lumière moyenne
    colors[9] = 255;  colors[10] = 255; colors[11] = 255; // Lumière pleine
  } else {
    // Pour les autres nombres de bands, gradient progressif avec plus de contraste
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      // Courbe exponentielle pour plus de contraste
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
  
  console.log('🎨 Gradient map created:', {
    bands,
    values: Array.from(colors).slice(0, bands * 3),
  });
  
  return gradientTexture;
}

/**
 * Shader custom pour cell shading AAA avec rim lighting et highlights spéculaires
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
    bands: { value: 12 },
    ambientIntensity: { value: 0.4 },
    contrastBoost: { value: 0.85 },
    smoothness: { value: 0.4 },
    internalLinesEnabled: { value: 1.0 },
    internalLinesIntensity: { value: 0.3 },
  },
  
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    
    void main() {
      // Normale en world space
      vNormal = normalize(normalMatrix * normal);
      
      // Position de la caméra
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      
      // Position world
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
    uniform float internalLinesEnabled;
    uniform float internalLinesIntensity;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    
    // Fonction de quantification smooth avec anti-aliasing
    float quantizeSmooth(float value, float steps, float smoothFactor) {
      float quantized = floor(value * steps) / steps;
      float nextBand = floor(value * steps + 1.0) / steps;
      float t = fract(value * steps);
      
      // Smoothstep pour des transitions douces entre les bandes
      t = smoothstep(1.0 - smoothFactor, 1.0, t);
      
      return mix(quantized, nextBand, t);
    }
    
    // ✅ Détection d'arêtes internes basée sur la géométrie (Guilty Gear style)
    // Utilise le produit scalaire view-normal pour détecter les changements d'angle
    float detectInternalEdges(vec3 normal, vec3 viewDir, vec3 worldPos) {
      // Edge detection basé sur le Fresnel et la position world
      float fresnel = abs(dot(viewDir, normal));
      
      // Détection des plis/arêtes : zones où la normale est perpendiculaire à la vue
      float edgeFromFresnel = 1.0 - smoothstep(0.2, 0.4, fresnel);
      
      // Variation subtile basée sur la position pour créer des lignes de forme
      float posVariation = fract(worldPos.y * 10.0 + worldPos.x * 10.0 + worldPos.z * 10.0);
      float geometricPattern = smoothstep(0.92, 0.95, posVariation) * 0.5;
      
      return max(edgeFromFresnel * 0.3, geometricPattern);
    }
    
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      vec3 light = normalize(lightDirection);
      vec3 light2 = normalize(lightDirection2);
      
      // ===== 1. DIFFUSE CELL SHADING (Multi-light avec smooth) =====
      // Lumière principale
      float NdotL = max(dot(normal, light), 0.0);
      // Lumière secondaire (fill light)
      float NdotL2 = max(dot(normal, light2), 0.0) * 0.35;
      // Combiner les deux lumières
      float combinedLight = NdotL + NdotL2;
      
      // Quantification smooth en bandes
      float diffuse = quantizeSmooth(combinedLight, bands, smoothness);
      
      // Boost du contraste (optionnel, désactivé par défaut)
      if (contrastBoost != 1.0) {
        diffuse = pow(diffuse, 1.0 / contrastBoost);
      }
      
      // Mapper les bandes sur les couleurs avec transitions douces
      vec3 shadedColor;
      if (diffuse < 0.33) {
        // Zone d'ombre
        shadedColor = mix(shadowColor, midtoneColor, diffuse / 0.33) * baseColor;
      } else if (diffuse < 0.66) {
        // Mi-ton vers couleur de base
        shadedColor = mix(midtoneColor * baseColor, baseColor, (diffuse - 0.33) / 0.33);
      } else {
        // Couleur de base vers highlight (subtil)
        shadedColor = mix(baseColor, baseColor * mix(vec3(1.0), highlightColor, 0.15), (diffuse - 0.66) / 0.34);
      }
      
      // ===== 2. RIM LIGHTING (Fresnel subtil) =====
      float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
      fresnel = pow(fresnel, rimPower);
      
      // Rim light avec transition douce
      float rimSmooth = smoothstep(0.5, 0.8, fresnel);
      vec3 rimLight = rimColor * rimSmooth * rimIntensity;
      
      // ===== 3. SPECULAR HIGHLIGHT (Subtil) =====
      vec3 halfVector = normalize(light + viewDir);
      float NdotH = max(dot(normal, halfVector), 0.0);
      float spec = pow(NdotH, specularPower);
      
      // Specular doux avec smoothstep
      float specSmooth = smoothstep(0.7, 0.9, spec);
      vec3 specular = highlightColor * specSmooth * specularIntensity;
      
      // ===== 4. AMBIENT =====
      // AO subtil basé sur la normale Y
      float ao = smoothstep(-0.5, 0.5, normal.y) * 0.3 + 0.7;
      vec3 ambient = baseColor * ambientIntensity * ao;
      
      // ===== COMBINAISON FINALE =====
      vec3 finalColor = shadedColor + ambient + rimLight + specular;
      
      // ===== 5. LIGNES INTERNES (Edge Detection) =====
      if (internalLinesEnabled > 0.5) {
        float edgeFactor = detectInternalEdges(normal, viewDir, vWorldPosition);
        // Assombrir là où il y a une arête
        finalColor = mix(finalColor, finalColor * (1.0 - internalLinesIntensity), edgeFactor);
      }
      
      // Réduction de la saturation pour éviter le "cramé"
      float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
      finalColor = mix(vec3(luminance), finalColor, 1.05);
      
      // Clamp pour éviter l'overexposure (le tone mapping est géré par le renderer)
      finalColor = clamp(finalColor, 0.0, 1.0);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

/**
 * Crée un matériau cell shading AAA avec shader custom
 * @param {number} baseColorHex - Couleur de base en hexa
 * @param {object} options - Options du shader
 * @returns {THREE.ShaderMaterial}
 */
export function createCellShadingMaterial(baseColorHex = 0xFF9500, options = {}) {
  // ✅ Créer manuellement les uniforms pour éviter les problèmes de clonage
  const uniforms = {
    baseColor: { value: new THREE.Color(baseColorHex) },
    lightDirection: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
    lightDirection2: { value: new THREE.Vector3(-0.3, 0.5, 0.3).normalize() },
    shadowColor: { value: new THREE.Color(0x404040) },
    midtoneColor: { value: new THREE.Color(0x909090) },
    highlightColor: { value: new THREE.Color(0xffffff) },
    rimColor: { value: new THREE.Color(0xffcc88) },
    rimPower: { value: 3.5 },
    rimIntensity: { value: options.rimIntensity ?? 0.35 },
    specularPower: { value: 56.0 },
    specularIntensity: { value: options.specularIntensity ?? 0.25 },
    bands: { value: options.bands ?? 12 },
    ambientIntensity: { value: options.ambientIntensity ?? 0.4 },
    contrastBoost: { value: options.contrastBoost ?? 0.85 },
    smoothness: { value: options.smoothness ?? 0.4 },
    internalLinesEnabled: { value: options.internalLinesEnabled ? 1.0 : 0.0 },
    internalLinesIntensity: { value: options.internalLinesIntensity ?? 0.3 },
  };
  
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: cellShadingShader.vertexShader,
    fragmentShader: cellShadingShader.fragmentShader,
    lights: false, // On gère nous-mêmes l'éclairage dans le shader
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
  });
  
  console.log('✨ Cell shading AAA+ material created:', {
    baseColor: `#${baseColorHex.toString(16).padStart(6, '0')}`,
    bands: material.uniforms.bands.value,
    quality: 'Ultra',
  });
  
  return material;
}

/**
 * Met à jour les paramètres du shader cell shading
 * @param {THREE.ShaderMaterial} material - Le matériau à mettre à jour
 * @param {object} params - Paramètres à modifier
 */
export function updateCellShadingMaterial(material, params = {}) {
  if (!material.uniforms) return;
  
  if (params.bands !== undefined) material.uniforms.bands.value = params.bands;
  if (params.rimIntensity !== undefined) material.uniforms.rimIntensity.value = params.rimIntensity;
  if (params.specularIntensity !== undefined) material.uniforms.specularIntensity.value = params.specularIntensity;
  if (params.ambientIntensity !== undefined) material.uniforms.ambientIntensity.value = params.ambientIntensity;
  if (params.rimPower !== undefined) material.uniforms.rimPower.value = params.rimPower;
  if (params.specularPower !== undefined) material.uniforms.specularPower.value = params.specularPower;
  if (params.contrastBoost !== undefined) material.uniforms.contrastBoost.value = params.contrastBoost;
  if (params.smoothness !== undefined) material.uniforms.smoothness.value = params.smoothness;
  if (params.internalLinesEnabled !== undefined) material.uniforms.internalLinesEnabled.value = params.internalLinesEnabled ? 1.0 : 0.0;
  if (params.internalLinesIntensity !== undefined) material.uniforms.internalLinesIntensity.value = params.internalLinesIntensity;
  
  material.needsUpdate = true;
}


