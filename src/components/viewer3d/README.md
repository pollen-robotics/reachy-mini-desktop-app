# 🤖 Viewer 3D - Reachy Mini

3D visualization module for Reachy Mini robot.

## 📁 Structure

```
viewer3d/
├── Viewer3D.jsx              # Main component with Canvas and UI
├── Scene.jsx                 # 3D scene (lights, environment, effects)
├── URDFRobot.jsx             # URDF model loading and animation
├── CinematicCamera.jsx       # Animated camera for scan view
├── SettingsOverlay.jsx       # Settings panel overlay
├── effects/                  # Visual effects
│   ├── ScanEffect.jsx        # Progressive scan effect
│   ├── PremiumScanEffect.jsx # Premium world-class scan effect
│   ├── ErrorHighlight.jsx    # Error mesh highlighting
│   └── ParticleEffect.jsx    # Particle effects (sleep, love, etc.)
├── hooks/
│   └── useRobotWebSocket.js  # WebSocket hook for daemon connection
└── index.js                  # Public module exports

Utils:
- src/utils/viewer3d/materials.js  # X-ray material creation
- src/utils/arraysEqual.js         # Array comparison with tolerance
```

## 🎯 Main Components

### `RobotViewer3D`
- Entry point of 3D viewer
- Manages UI (Settings button, Status tag, FPS meter)
- Props: `isActive`, `initialMode`, `hideControls`, `showScanEffect`, etc.

### `Scene`
- 3D scene configuration
- 3-point lighting (key, fill, rim)
- Fog for fade-out effect
- Grid floor (adapts to dark mode)

### `URDFRobot`
- URDF model loading from cache
- X-ray material system
- Real-time animation via joints (head, antennas, body)

## 🔧 Custom Hooks

### `useRobotWebSocket(isActive)`
Hook to manage WebSocket connection to Reachy daemon.

**Returns:**
```javascript
{
  headPose: Array(16),       // 4x4 head pose matrix
  headJoints: Array(7),      // [yaw_body, stewart_1..6]
  passiveJoints: Array(21),  // Stewart passive joints
  yawBody: number,           // Body rotation
  antennas: [left, right]    // Antenna positions
}
```

## 🎨 Material System

The `src/utils/viewer3d/materials.js` module provides:
- `xrayShader` - Fresnel-based X-ray shader with rim lighting
- `createXrayMaterial(color, options)` - Creates X-ray material with options:
  - `opacity` - Material transparency (default: 0.3)
  - `rimColor` - Rim highlight color
  - `rimIntensity` - Rim effect intensity (default: 0.6)
  - `scanMode` - Use green colors for scan effect

## 📡 WebSocket

Connection: `ws://localhost:8000/api/state/ws/full`

**Parameters:**
- `frequency=10` - 10 Hz update rate
- `with_head_pose=true` - 4x4 matrix
- `with_head_joints=true` - Stewart joints + yaw_body
- `with_passive_joints=true` - Complete Stewart kinematics
- `with_antenna_positions=true` - Antenna positions

## 🚀 Usage

```jsx
import Viewer3D from './viewer3d';

<Viewer3D 
  isActive={daemonActive}
  initialMode="normal"
  hideControls={false}
  showScanEffect={false}
  usePremiumScan={false}
  backgroundColor="#e0e0e0"
/>
```

## ⚡ Performance

- **Memoization**: Scene and URDFRobot are memoized with deep comparison
- **Throttling**: WebSocket updates processed at 10 Hz
- **Object reuse**: Vector3/Matrix4 objects reused to avoid allocations
- **DPR limit**: Capped at 2x for GPU efficiency
