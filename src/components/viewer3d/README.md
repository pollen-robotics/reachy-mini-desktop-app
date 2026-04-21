# Viewer 3D - Reachy Mini

Self-contained 3D visualization module for the Reachy Mini robot, built on
`@react-three/fiber`, `@react-three/drei`, and `three`.

It handles URDF loading, live joint tracking from a single websocket, cinematic
/ orbit camera modes, scan and error-highlight effects, dark mode theming, and
a loading overlay that hides the "mount flash" before the first real pose is
applied.

## Structure

```
viewer3d/
├── Viewer3D.tsx               # Shell: Canvas + overlay UI + robot state wiring
├── Scene.tsx                  # 3D scene (lights, fog, grid, effects, robot, camera)
├── URDFRobot.tsx              # URDF load, pose-ready tracking, joint animation
├── CinematicCamera.tsx        # Animated camera used in scan / error views
├── WebGLCleanup.tsx           # Disposes GPU resources when the Canvas unmounts
├── SettingsOverlay.tsx        # Full-screen settings panel (WiFi, cache, updates, ...)
├── components/
│   ├── LoadingSpinner.tsx     # Opaque overlay + spinner until the pose is ready
│   ├── SettingsButton.tsx     # Top-right floating settings button
│   └── StatusTag.tsx          # Bottom-left pill: Ready / Moving / Starting / ...
├── effects/
│   ├── ScanEffect.tsx         # Progressive scan effect
│   ├── PremiumScanEffect.tsx  # Premium world-class scan effect
│   ├── ErrorHighlight.tsx     # Error mesh highlighting
│   ├── ParticleEffect.tsx     # Particle effects (sleep, love, ...)
│   └── particles/
│       └── NoiseGenerator.ts  # Noise generation for particles
├── settings/                  # Cards for the settings panel
│   ├── SectionHeader.tsx
│   ├── SettingsCacheCard.tsx
│   ├── SettingsDaemonCard.tsx
│   ├── SettingsPreferencesCard.tsx
│   ├── SettingsResetCard.tsx
│   ├── SettingsUpdateCard.tsx
│   ├── SettingsWifiCard.tsx
│   └── ChangeWifiOverlay.tsx
├── hooks/
│   ├── useRobotWebSocket.ts       # Reads robot state from the Zustand store
│   └── useCoalescedRobotState.ts  # Merges props + store with stable references
└── index.ts                    # Public module exports
```

Utils that live outside the module but belong to the viewer:

```
src/utils/viewer3d/
├── materials.ts           # X-ray / wireframe material factories
├── applyRobotMaterials.ts # Apply materials to every mesh of a URDF tree
└── findErrorMeshes.ts     # Resolve the set of meshes to highlight for an error
src/utils/arraysEqual.ts   # Tolerance-based array comparison (0.3° default)
```

## Main components

### `RobotViewer3D` (`Viewer3D.tsx`)

Entry point of the viewer. Owns:

- The `<Canvas>` (antialias, ACES tone mapping, DPR capped at 2x, optional
  transparent alpha)
- The camera presets (`normal`, `scan`, or a custom partial override)
- The overlay UI: `<SettingsButton>`, `<StatusTag>`, `<FPSMeter>` (DEV only),
  `<SettingsOverlay>`, and the `<LoadingSpinner>` that hides the mount flash

Pose handoff flow:

1. `useRobotWebSocket(shouldConnect)` reads the live state from the Zustand
   store. `shouldConnect = isActive || (forceLoad && headJoints != null)`.
2. `useCoalescedRobotState` merges that state with explicit prop overrides
   (`headPose`, `headJoints`, `antennas`, `yawBody`) and keeps stable array
   references as long as values are equal within tolerance.
3. The coalesced state is passed to `<Scene>`, which forwards it to
   `<URDFRobot>`.
4. `<URDFRobot>` reports back through `onPoseReady(ready)`, which drives the
   spinner visibility.

### `Scene`

Declarative 3D scene composed of:

- Three-point directional lighting with a warm rim light, plus ambient fill
- Fog that matches the current background (adaptive to dark mode)
- Adaptive grid (major / minor line colors depend on dark mode)
- `<URDFRobot>`, `<ScanEffect>` / `<PremiumScanEffect>`, `<ErrorHighlight>`,
  and either `<CinematicCamera>` or `<OrbitControls>`

Implementation notes:

- All static configuration (`LIGHTING`, `SCENE`, `XRAY_OPACITY_*`,
  `FOG_COLOR_*`, `GRID_COLORS`, `SCAN_COLORS`) is hoisted as module constants
  so the refs are stable across renders.
- Error-mesh resolution is delegated to `utils/viewer3d/findErrorMeshes`.
- The `window.kinematics` debug payload is only exposed in
  `import.meta.env.DEV`, never in production builds.
- `React.memo` comparator invalidates on meaningful prop changes
  (`dataVersion`, `darkMode`, `allowZeroPose`, `errorFocusMesh`, ...).

### `URDFRobot`

Loads the URDF model from `robotModelCache`, clones it, collects all meshes,
and animates the joints at ~20 Hz.

Pose-ready logic (fixes the mount flash):

- If the store already has a valid `head_joints` snapshot at load time, the
  joints are applied synchronously and the primitive mounts immediately.
- Otherwise:
  - If `allowZeroPose` is `true` (scan / xray views with no websocket data),
    the model mounts with a zero pose (the x-ray effect masks it anyway).
  - Else the model is staged in a ref and only mounted once `useFrame` sees a
    valid `headJoints` array (7 values) and applies it. The primitive never
    renders in the wrong pose.
- `onPoseReady(true)` is called once the model is mounted and materials have
  been applied. The parent uses it to drive the overlay spinner.

Joint helpers are factored out (`applyHeadJoints`, `applyPassiveJoints`,
`applyAntennaJoints`, `resetAllJoints`) so the load path, the useFrame update,
and the pending-to-ready promotion all share the same code.

## Loading overlay

`components/LoadingSpinner.tsx` renders a fully opaque `Box` over the Canvas
(no blur, `z-index: 20`) while the viewer is waiting for the first pose. It
completely hides the WebGL surface, so the default URDF pose is never visible.

Timing in `Viewer3D.tsx`:

1. Spinner is shown while `shouldWaitForPose && !isPoseReady`.
2. Once `isPoseReady` flips to `true`, a 500 ms grace period starts. The
   spinner stays on top during that window so the Canvas has time to settle
   visually (materials, first frame, Stewart animation).
3. After the grace, the overlay fades out in 250 ms.

Controls:

- `shouldWaitForPose = showLoadingUntilPose ?? isActive`
  - By default the spinner only runs for live-robot views (`isActive=true`).
  - Pass `showLoadingUntilPose` explicitly to force it on / off.
- `allowZeroPose = !shouldWaitForPose`
  - Forwarded to `URDFRobot` so scan / xray views mount immediately with a
    zero pose.

## Custom hooks

### `useRobotWebSocket(isActive)`

Reads robot state from the centralized Zustand store. Does not open a
websocket itself; `useRobotStateWebSocket` (in `App.tsx`) owns the single
20 Hz connection.

Returns:

```ts
{
  headPose: number[] | null;      // 4x4 head pose matrix (16 values)
  headJoints: number[] | null;    // [yaw_body, stewart_1..6]
  passiveJoints: number[] | null; // 21 passive joints (daemon or WASM fallback)
  yawBody: number;
  antennas: [left, right];
  dataVersion: number;
}
```

WASM fallback: when the daemon doesn't provide passive joints (e.g. USB mode
with `AnalyticalKinematics`), they are computed locally via the Rust WASM
module `useKinematicsWasm` (< 1 ms per frame).

### `useCoalescedRobotState({ enabled, robotState, antennas, headPose, headJoints, yawBody })`

Merges explicit props with the websocket-driven state and returns stable
references (reuses the previous array if it's equal to the new one within
tolerance). Replaces five copy/pasted `useMemo + useRef` blocks that used to
live in `Viewer3D`.

Returned shape:

```ts
{
  headPose: number[] | null;
  headJoints: number[] | null;
  yawBody: number | null;
  antennas: number[];                // always non-null, defaults to [0, 0]
  passiveJoints: number[] | { array?: number[] } | null;
}
```

## Camera presets

Two built-in presets are resolved via `resolveCameraConfig(cameraPreset)`.

| Preset   | Position              | FOV | Target        | Min / Max distance |
| -------- | --------------------- | --- | ------------- | ------------------ |
| `normal` | `[-0.25, 0.35, 0.55]` | 50  | `[0, 0.2, 0]` | 0.2 / 0.6          |
| `scan`   | `[0, 0.22, 0.5]`      | 55  | `[0, 0.12, 0]`| 0.15 / 0.5         |

`cameraPreset` also accepts a `Partial<CameraPresetConfig>` that is merged on
top of the `normal` preset, so callers can override individual fields.

When `useCinematicCamera` is true, the scene uses `<CinematicCamera>` instead
of `<OrbitControls>`. The cinematic camera is meant for scan mode and error
focus (it animates toward the error mesh).

## Material system

`src/utils/viewer3d/materials.ts`:

- `xrayShader` - Fresnel-based X-ray shader with rim lighting
- `createXrayMaterial(color, options)`
  - `opacity` - Material transparency (default: 0.3)
  - `rimColor` - Rim highlight color
  - `rimIntensity` - Rim effect intensity (default: 0.6)
  - `scanMode` - Use green colors for the scan effect

`src/utils/viewer3d/applyRobotMaterials.ts` walks a URDF tree and assigns the
correct material variant based on `{ transparent, wireframe, xrayOpacity,
darkMode }`.

## Data flow

```
┌──────────────────────────────────────────────────────────────┐
│                          App.tsx                              │
│  useRobotStateWebSocket(isActive)                             │
│         │                                                     │
│         ▼                                                     │
│   WebSocket /api/state/ws/full @ 20 Hz                        │
│   (head_pose, head_joints, antennas_position, passive_joints) │
│         │                                                     │
│         ▼                                                     │
│   robotStateFull (Zustand store)                              │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
    Viewer3D.tsx
      ├─ useRobotWebSocket          ← reads store (+ WASM fallback)
      ├─ useCoalescedRobotState     ← stable refs
      │
      ▼
    Scene.tsx
      ├─ <URDFRobot onPoseReady>    ← mounts only when pose is applied
      ├─ <ScanEffect / PremiumScanEffect>
      ├─ <ErrorHighlight>
      └─ <CinematicCamera> | <OrbitControls>
```

## Usage

Live robot view (with spinner + status tag):

```tsx
import Viewer3D from './viewer3d';

<Viewer3D
  isActive={daemonActive}
  forceLoad
  showStatusTag
  isOn={isOn}
  isMoving={isMoving}
  robotStatus={robotStatus}
  busyReason={busyReason}
/>;
```

Scan / hardware-check view (xray + cinematic camera, zero pose is fine):

```tsx
<Viewer3D
  isActive={false}
  forceLoad
  initialMode="xray"
  hideControls
  hideGrid
  hideBorder
  cameraPreset="scan"
  useCinematicCamera
  showScanEffect
  onScanMesh={handleScanMesh}
  onMeshesReady={handleMeshesReady}
  onScanComplete={handleScanComplete}
  errorFocusMesh={errorFocusMesh}
/>;
```

Force the spinner on an otherwise static viewer:

```tsx
<Viewer3D isActive={false} headJoints={joints} showLoadingUntilPose />
```

Integration points in the app:

- `views/active-robot/ActiveRobotView.tsx` - live robot view
- `views/starting/StartupScanView.tsx` - scan mode during startup
- `components/DevPlayground.tsx` - playground for both modes (dev-only route
  at `#dev`)

## Performance notes

- **Single websocket**: all robot data streamed over one 20 Hz connection.
  `useRobotWebSocket` is a plain store reader, not a second socket.
- **Stable references**: `useCoalescedRobotState` reuses the previous array
  when the new one is equal within tolerance, so memoized downstream
  components do not re-render.
- **Memoized scene**: `React.memo(Scene, ...)` invalidates only on meaningful
  prop changes (`dataVersion`, `darkMode`, `allowZeroPose`,
  `errorFocusMesh`, ...).
- **Throttled joint updates**: `useFrame` only applies new joints every 3
  frames, and bails out early if `dataVersion` didn't change.
- **GPU disposal**: `WebGLCleanup` traverses the scene on unmount, disposes
  geometries and materials, then releases the WebGL context.
- **DPR cap**: the Canvas is limited to `dpr={[1, 2]}` for GPU efficiency.
- **WASM kinematics**: < 1 ms per frame to compute the 21 passive joints when
  the daemon doesn't provide them.
