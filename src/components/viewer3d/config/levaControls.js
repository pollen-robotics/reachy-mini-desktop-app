import { useControls } from 'leva';

/**
 * Configuration centralisée des contrôles Leva pour la scène 3D
 * Tous les groupes sont dépliés par défaut et cachés si showLevaControls=false
 */
export function useLevaControls(showLevaControls) {
  // 1. Cell Shading Ultra-Smooth (mode Normal uniquement - activé automatiquement)
  // ✅ Contrôles simplifiés : seulement l'essentiel pour un rendu élégant et puissant
  const cellShading = useControls('🎨 Cell Shading', {
    bands: { value: 100, min: 50, max: 150, step: 5, label: 'Résolution' },
    smoothness: { value: 0.45, min: 0.2, max: 0.6, step: 0.05, label: 'Lissage' },
    rimIntensity: { value: 0.4, min: 0, max: 1, step: 0.05, label: 'Rim Light' },
    specularIntensity: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Spéculaire' },
    ambientIntensity: { value: 0.45, min: 0.2, max: 0.8, step: 0.05, label: 'Ambiante' },
    contrastBoost: { value: 0.9, min: 0.7, max: 1.2, step: 0.05, label: 'Contraste' },
    outlineEnabled: { value: true, label: 'Contours' },
    outlineThickness: { value: 12.0, min: 5, max: 20, step: 1, label: 'Épaisseur contours' },
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
    opacity: { value: 0.5, min: 0.1, max: 0.9, step: 0.05, label: 'Opacité' },
  }, { collapsed: false, hidden: !showLevaControls });

  // 5. Scène
  const scene = useControls('🌍 Scène', {
    showGrid: { value: true, label: 'Grille' },
    fogDistance: { value: 2.5, min: 0.5, max: 5, step: 0.1, label: 'Distance fog' },
  }, { collapsed: false, hidden: !showLevaControls });

  return { cellShading, lighting, ssao, xraySettings, scene };
}

