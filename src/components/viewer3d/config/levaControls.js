import { useControls } from 'leva';

/**
 * Configuration centralisée des contrôles Leva pour la scène 3D
 * Tous les groupes sont dépliés par défaut et cachés si showLevaControls=false
 */
export function useLevaControls(showLevaControls) {
  // 1. Cell Shading Ultra-Smooth (mode Normal uniquement - activé automatiquement)
  const cellShading = useControls('🎨 Cell Shading Ultra-Smooth', {
    bands: { value: 12, min: 2, max: 30, step: 1, label: 'Résolution (bandes)' },
    smoothness: { value: 0.4, min: 0, max: 0.7, step: 0.05, label: 'Lissage transitions' },
    rimIntensity: { value: 0.35, min: 0, max: 2, step: 0.05, label: 'Intensité rim light' },
    specularIntensity: { value: 0.25, min: 0, max: 1.5, step: 0.05, label: 'Intensité spéculaire' },
    ambientIntensity: { value: 0.4, min: 0, max: 1, step: 0.05, label: 'Intensité ambiante' },
    contrastBoost: { value: 0.85, min: 0.5, max: 2.0, step: 0.05, label: 'Boost contraste' },
    outlineEnabled: { value: true, label: 'Contours silhouette' },
    outlineThickness: { value: 15.0, min: 0.5, max: 20, step: 0.5, label: 'Épaisseur contours (px)' },
    internalLinesEnabled: { value: true, label: 'Lignes internes' },
    internalLinesIntensity: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Intensité lignes internes' },
    outlineColor: { value: '#000000', label: 'Couleur contours' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 2. Éclairage
  const lighting = useControls('💡 Éclairage', {
    ambient: { value: 0.3, min: 0, max: 2, step: 0.1, label: 'Ambient' },
    keyIntensity: { value: 1.8, min: 0, max: 3, step: 0.1, label: 'Key Light' },
    fillIntensity: { value: 0.3, min: 0, max: 2, step: 0.1, label: 'Fill Light' },
    rimIntensity: { value: 0.8, min: 0, max: 2, step: 0.1, label: 'Rim Light' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 3. SSAO (Ambient Occlusion) - Désactivé par défaut car nécessite NormalPass
  const ssao = useControls('🌫️ SSAO', {
    enabled: { value: false, label: 'Activer' },
    intensity: { value: 80, min: 0, max: 150, step: 1, label: 'Intensité' },
    radius: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Rayon' },
    samples: { value: 31, min: 8, max: 64, step: 1, label: 'Échantillons' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 4. Mode X-Ray
  const xraySettings = useControls('👁️ X-Ray', {
    opacity: { value: 0.15, min: 0.1, max: 0.9, step: 0.05, label: 'Opacité' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 5. Scène
  const scene = useControls('🌍 Scène', {
    showGrid: { value: true, label: 'Grille' },
    fogDistance: { value: 2.5, min: 0.5, max: 5, step: 0.1, label: 'Distance fog' },
  }, { collapsed: false, hidden: !showLevaControls });

  return { cellShading, lighting, ssao, xraySettings, scene };
}

