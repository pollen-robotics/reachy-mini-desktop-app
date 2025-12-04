# Robot Position Control Module

Module for controlling the position of the Reachy Mini robot.

## 📁 Structure

```
position-control/
├── RobotPositionControl.jsx    # Main component (orchestration)
├── components/                  # Reusable UI components
│   ├── Joystick2D.jsx          # 2D joystick control
│   ├── VerticalSlider.jsx      # Vertical slider
│   ├── SimpleSlider.jsx        # Horizontal slider
│   └── CircularSlider.jsx     # Circular slider
├── hooks/                       # Business logic hooks
│   ├── useRobotPosition.js     # Main position control hook
│   ├── useRobotAPI.js          # API communication hook
│   ├── useRobotSmoothing.js    # Smoothing logic hook
│   ├── useRobotSync.js         # State synchronization hook
│   └── useActiveMoves.js       # Active moves tracking hook
├── utils/                       # Helper utilities
│   └── formatPose.js           # Pose formatting for logs
└── index.js                     # Main export
```

## 🎯 Architecture

### Main Component
- **RobotPositionControl**: Orchestration and layout
  - Props: `isActive`, `darkMode`, `onResetReady`, `onIsAtInitialPosition`

### UI Components
- **Joystick2D**: 2D control (Position X/Y, Pitch/Yaw)
- **VerticalSlider**: Vertical slider (Position Z)
- **SimpleSlider**: Horizontal slider (Roll, Body Yaw)
- **CircularSlider**: Circular slider for rotation controls

### Business Logic Hooks
- **useRobotPosition**: Main position control hook
  - State management
  - API commands (set_target only)
  - Intelligent logging
  - Continuous animation (requestAnimationFrame)
  
- **useRobotAPI**: Handles API communication
- **useRobotSmoothing**: Manages input smoothing
- **useRobotSync**: Synchronizes robot state
- **useActiveMoves**: Tracks active robot movements

### Utilities
- **formatPoseForLog**: Formats poses for logging
- **hasSignificantChange**: Detects significant changes in pose

## 🔧 Usage

```jsx
import RobotPositionControl from '@views/active-robot/position-control';

<RobotPositionControl 
  isActive={isActive}
  darkMode={darkMode}
  onResetReady={handleResetReady}
  onIsAtInitialPosition={handleIsAtInitialPosition}
/>
```

## 📦 Exports

```javascript
// Main component
import RobotPositionControl from '@views/active-robot/position-control';

// Individual components
import { Joystick2D, VerticalSlider, SimpleSlider, CircularSlider } from '@views/active-robot/position-control/components';

// Hooks
import { useRobotPosition, useRobotAPI, useRobotSmoothing, useRobotSync, useActiveMoves } from '@views/active-robot/position-control/hooks';

// Utils
import { formatPoseForLog, hasSignificantChange } from '@views/active-robot/position-control/utils';
```

