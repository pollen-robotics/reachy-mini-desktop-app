# 🤖 Viewer 3D - Reachy Mini

Module de visualisation 3D pour le robot Reachy Mini.

## 📁 Structure

```
viewer3d/
├── components/
│   ├── RobotViewer3D.jsx    # Composant principal avec Canvas et UI
│   ├── Scene.jsx             # Scène 3D (lumières, environnement, post-processing)
│   └── URDFRobot.jsx         # Chargement et animation du modèle URDF
│
├── hooks/
│   └── useRobotWebSocket.js  # Hook WebSocket pour connexion au daemon
│
├── config/
│   └── levaControls.js       # Configuration centralisée des contrôles Leva
│
├── utils/
│   └── materials.js          # Utilitaires pour création/gestion des matériaux
│
└── index.js                  # Exports publics du module
```

## 🎯 Composants Principaux

### `RobotViewer3D`
- Point d'entrée du visualiseur 3D
- Gère l'UI (boutons mode Normal/X-Ray, Settings)
- Intègre le CameraFeed
- Props : `isActive`, `enableDebug`, `forceLevaOpen`

### `Scene`
- Configuration de la scène 3D
- Éclairage 3-points
- Post-processing (SSAO)
- Gestion des contrôles Leva

### `URDFRobot`
- Chargement du modèle URDF depuis les assets locaux
- Système dual de matériaux (Normal/X-Ray)
- Animation en temps réel (tête, antennes, corps)

## 🔧 Hooks Custom

### `useRobotWebSocket(isActive)`
Hook pour gérer la connexion WebSocket au daemon Reachy.

**Retourne :**
```javascript
{
  headPose: Float32Array(16),  // Matrice 4x4 de pose de la tête
  yawBody: number,             // Rotation du corps
  antennas: [left, right]      // Positions des antennes
}
```

## 🎨 Système de Matériaux

Le module `utils/materials.js` fournit :
- `createCellShadingGradient(bands)` - Gradient pour cell shading (4 bandes par défaut)
- `createNormalMaterial(color, gradient)` - Matériau normal (gradient null par défaut = rendu standard)
- `createXRayMaterial(color, gradient, opacity)` - Matériau transparent
- `applyNormalMaterialSettings(material, settings, gradient, color)` - Application des paramètres
- `applyXRayMaterialSettings(material, opacity, color)` - Application X-Ray

## 📡 WebSocket

Connexion : `ws://localhost:8000/api/state/ws/full`

**Paramètres :**
- `frequency=10` - 10 Hz
- `with_head_pose=true` - Matrice 4x4
- `use_pose_matrix=true` - Format matriciel
- `with_head_joints=true` - Joints Stewart + yaw_body
- `with_antenna_positions=true` - Positions des antennes

## 🎮 Contrôles Leva (Debug)

5 groupes de contrôles :
1. **🎨 Cell Shading** - Activer, bandes, lissage
2. **💡 Éclairage** - Ambient, Key, Fill, Rim lights
3. **🌫️ SSAO** - Ambient occlusion
4. **👁️ X-Ray** - Opacité du mode transparent
5. **🌍 Scène** - Grille, distance fog

## 🚀 Usage

```jsx
import RobotViewer3D from './viewer3d';

<RobotViewer3D 
  isActive={daemonActive}
  enableDebug={false}
  forceLevaOpen={false}
/>
```

