import { useControls } from 'leva';

/**
 * Centralized configuration of Leva controls for 3D scene
 * All groups are expanded by default and hidden if showLevaControls=false
 */
export function useLevaControls(showLevaControls) {
  // 1. Cell Shading Ultra-Smooth (Normal mode only - automatically enabled)
  // ✅ Simplified controls: only essentials for elegant and powerful rendering
  const cellShading = useControls('🎨 Cell Shading', {
    bands: { value: 100, min: 50, max: 150, step: 5, label: 'Resolution' },
    smoothness: { value: 0.45, min: 0.2, max: 0.6, step: 0.05, label: 'Smoothness' },
    rimIntensity: { value: 0.4, min: 0, max: 1, step: 0.05, label: 'Rim Light' },
    specularIntensity: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Specular' },
    ambientIntensity: { value: 0.45, min: 0.2, max: 0.8, step: 0.05, label: 'Ambient' },
    contrastBoost: { value: 0.9, min: 0.7, max: 1.2, step: 0.05, label: 'Contrast' },
    outlineEnabled: { value: true, label: 'Outlines' },
    outlineThickness: { value: 12.0, min: 5, max: 20, step: 1, label: 'Outline Thickness' },
    outlineColor: { value: '#000000', label: 'Outline Color' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 2. Lighting
  const lighting = useControls('💡 Lighting', {
    ambient: { value: 0.3, min: 0, max: 2, step: 0.1, label: 'Ambient' },
    keyIntensity: { value: 1.8, min: 0, max: 3, step: 0.1, label: 'Key Light' },
    fillIntensity: { value: 0.3, min: 0, max: 2, step: 0.1, label: 'Fill Light' },
    rimIntensity: { value: 0.8, min: 0, max: 2, step: 0.1, label: 'Rim Light' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 3. SSAO (Ambient Occlusion) - Disabled by default as it requires NormalPass
  const ssao = useControls('🌫️ SSAO', {
    enabled: { value: false, label: 'Enable' },
    intensity: { value: 80, min: 0, max: 150, step: 1, label: 'Intensity' },
    radius: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Radius' },
    samples: { value: 31, min: 8, max: 64, step: 1, label: 'Samples' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 4. X-Ray Mode
  const xraySettings = useControls('👁️ X-Ray', {
    opacity: { value: 0.5, min: 0.1, max: 0.9, step: 0.05, label: 'Opacity' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 5. Scene
  const scene = useControls('🌍 Scene', {
    showGrid: { value: true, label: 'Grid' },
    fogDistance: { value: 2.5, min: 0.5, max: 5, step: 0.1, label: 'Fog Distance' },
  }, { collapsed: false, hidden: !showLevaControls });

  return { cellShading, lighting, ssao, xraySettings, scene };
}

