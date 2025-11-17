# 🤖 Viewer 3D - Reachy Mini

3D visualization module for Reachy Mini robot.

## 📁 Structure

```
viewer3d/
├── components/
│   ├── RobotViewer3D.jsx    # Main component with Canvas and UI
│   ├── Scene.jsx             # 3D scene (lights, environment, post-processing)
│   └── URDFRobot.jsx         # URDF model loading and animation
│
├── hooks/
│   └── useRobotWebSocket.js  # WebSocket hook for daemon connection
│
├── config/
│   └── levaControls.js       # Centralized Leva controls configuration
│
├── utils/
│   └── materials.js          # Utilities for material creation/management
│
└── index.js                  # Public module exports
```

## 🎯 Main Components

### `RobotViewer3D`
- Entry point of 3D viewer
- Manages UI (Normal/X-Ray mode buttons, Settings)
- Integrates CameraFeed
- Props : `isActive`, `enableDebug`, `forceLevaOpen`

### `Scene`
- 3D scene configuration
- 3-point lighting
- Post-processing (SSAO)
- Leva controls management

### `URDFRobot`
- URDF model loading from local assets
- Dual material system (Normal/X-Ray)
- Real-time animation (head, antennas, body)

## 🔧 Custom Hooks

### `useRobotWebSocket(isActive)`
Hook to manage WebSocket connection to Reachy daemon.

**Returns :**
```javascript
{
  headPose: Float32Array(16),  // 4x4 head pose matrix
  yawBody: number,             // Body rotation
  antennas: [left, right]      // Antenna positions
}
```

## 🎨 Material System

The `utils/materials.js` module provides :
- `createCellShadingGradient(bands)` - Gradient for cell shading (4 bands by default)
- `createNormalMaterial(color, gradient)` - Normal material (null gradient by default = standard rendering)
- `createXRayMaterial(color, gradient, opacity)` - Transparent material
- `applyNormalMaterialSettings(material, settings, gradient, color)` - Parameter application
- `applyXRayMaterialSettings(material, opacity, color)` - X-Ray application

## 📡 WebSocket

Connection : `ws://localhost:8000/api/state/ws/full`

**Parameters :**
- `frequency=10` - 10 Hz
- `with_head_pose=true` - 4x4 matrix
- `use_pose_matrix=true` - Matrix format
- `with_head_joints=true` - Stewart joints + yaw_body
- `with_antenna_positions=true` - Antenna positions

## 🎮 Leva Controls (Debug)

5 control groups :
1. **🎨 Cell Shading** - Enable, bands, smoothing
2. **💡 Lighting** - Ambient, Key, Fill, Rim lights
3. **🌫️ SSAO** - Ambient occlusion
4. **👁️ X-Ray** - Transparent mode opacity
5. **🌍 Scene** - Grid, distance fog

## 🚀 Usage

```jsx
import Viewer3D from './viewer3d';

<Viewer3D 
  isActive={daemonActive}
  enableDebug={false}
  forceLevaOpen={false}
/>
```

