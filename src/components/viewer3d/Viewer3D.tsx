import React, { useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Box } from '@mui/material';
import * as THREE from 'three';
import Scene from './Scene';
import WebGLCleanup from './WebGLCleanup';
import SettingsOverlay from './SettingsOverlay';
import SettingsButton from './components/SettingsButton';
import StatusTag from './components/StatusTag';
import LoadingSpinner from './components/LoadingSpinner';
import { FPSMeter } from '../FPSMeter';
import { useRobotWebSocket, useCoalescedRobotState } from './hooks';
import useAppStore from '../../store/useAppStore';
import { selectIsBusy } from '../../store/slices';
import type { BusyReason, RobotStatus } from '../../types/robot';

// ============================================================================
// Camera presets
// ============================================================================

interface CameraPresetConfig {
  position: [number, number, number];
  fov: number;
  target: [number, number, number];
  minDistance: number;
  maxDistance: number;
}

const CAMERA_PRESETS: Record<'normal' | 'scan', CameraPresetConfig> = {
  normal: {
    position: [-0.25, 0.35, 0.55],
    fov: 50,
    target: [0, 0.2, 0],
    minDistance: 0.2,
    maxDistance: 0.6,
  },
  scan: {
    position: [0, 0.22, 0.5],
    fov: 55,
    target: [0, 0.12, 0],
    minDistance: 0.15,
    maxDistance: 0.5,
  },
};

// ============================================================================
// Props
// ============================================================================

export interface RobotViewer3DProps {
  isActive: boolean;
  initialMode?: 'normal' | 'xray';
  hideControls?: boolean;
  forceLoad?: boolean;
  hideGrid?: boolean;
  hideBorder?: boolean;
  showScanEffect?: boolean;
  usePremiumScan?: boolean;
  onScanComplete?: (() => void) | null;
  onScanMesh?: ((mesh: THREE.Mesh, index: number, total: number) => void) | null;
  onMeshesReady?: ((meshes: THREE.Mesh[]) => void) | null;
  cameraPreset?: 'normal' | 'scan' | Partial<CameraPresetConfig>;
  useCinematicCamera?: boolean;
  errorFocusMesh?: THREE.Mesh | null;
  backgroundColor?: string;
  wireframe?: boolean;
  antennas?: number[] | null;
  headPose?: number[] | null;
  headJoints?: number[] | null;
  yawBody?: number | null;
  showStatusTag?: boolean;
  isOn?: boolean | null;
  isMoving?: boolean;
  robotStatus?: RobotStatus | null;
  busyReason?: BusyReason | null;
  hideEffects?: boolean;
  canvasScale?: number;
  canvasTranslateX?: number | string;
  canvasTranslateY?: number | string;
  /**
   * Show a spinner overlay until the first valid robot pose is applied.
   * Defaults to `true` when the viewer is tracking a live robot (`isActive`),
   * avoiding the "flash" between mount and first websocket frame.
   */
  showLoadingUntilPose?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function resolveBackground(backgroundColor: string, darkMode: boolean): string {
  if (backgroundColor === 'transparent') return 'transparent';
  if (backgroundColor === '#e0e0e0') return darkMode ? '#1a1a1a' : '#e0e0e0';
  return backgroundColor;
}

function resolveCameraConfig(preset: RobotViewer3DProps['cameraPreset']): CameraPresetConfig {
  return typeof preset === 'string'
    ? CAMERA_PRESETS[preset]
    : { ...CAMERA_PRESETS.normal, ...preset };
}

// ============================================================================
// Component
// ============================================================================

export default function RobotViewer3D({
  isActive,
  initialMode = 'normal',
  hideControls = false,
  forceLoad = false,
  hideGrid = false,
  hideBorder = false,
  showScanEffect = false,
  usePremiumScan = false,
  onScanComplete = null,
  onScanMesh = null,
  onMeshesReady = null,
  cameraPreset = 'normal',
  useCinematicCamera = false,
  errorFocusMesh = null,
  backgroundColor = '#e0e0e0',
  wireframe = false,
  antennas = null,
  headPose = null,
  headJoints = null,
  yawBody = null,
  showStatusTag = false,
  isOn = null,
  isMoving = false,
  robotStatus = null,
  busyReason = null,
  hideEffects = false,
  canvasScale = 1,
  canvasTranslateX = 0,
  canvasTranslateY = 0,
  showLoadingUntilPose,
}: RobotViewer3DProps): React.ReactElement {
  const cameraConfig = resolveCameraConfig(cameraPreset);
  const isTransparent = initialMode === 'xray';

  const darkMode = useAppStore(state => state.darkMode);
  const isBusy = useAppStore(selectIsBusy);

  const effectiveBackgroundColor = resolveBackground(backgroundColor, darkMode);
  const canvasIsTransparent = effectiveBackgroundColor === 'transparent';

  const shouldConnectWebSocket = isActive || (forceLoad && headJoints !== null);
  const robotState = useRobotWebSocket(shouldConnectWebSocket);

  const coalesced = useCoalescedRobotState({
    enabled: shouldConnectWebSocket,
    robotState,
    antennas,
    headPose,
    headJoints,
    yawBody,
  });

  const shouldWaitForPose = showLoadingUntilPose ?? isActive;
  const allowZeroPose = !shouldWaitForPose;
  const [isPoseReady, setIsPoseReady] = useState<boolean>(false);
  const [spinnerGraceElapsed, setSpinnerGraceElapsed] = useState<boolean>(false);
  const handlePoseReady = useCallback((ready: boolean) => {
    setIsPoseReady(ready);
  }, []);

  // Keep the spinner visible for a small grace period after the pose is
  // ready, so the viewer settles visually before we reveal the robot.
  useEffect(() => {
    if (!isPoseReady) {
      setSpinnerGraceElapsed(false);
      return;
    }
    const timer = setTimeout(() => setSpinnerGraceElapsed(true), 500);
    return () => clearTimeout(timer);
  }, [isPoseReady]);

  const showSpinner = shouldWaitForPose && (!isPoseReady || !spinnerGraceElapsed);

  const [showSettingsOverlay, setShowSettingsOverlay] = useState<boolean>(false);
  const openSettings = useCallback(() => setShowSettingsOverlay(true), []);
  const closeSettings = useCallback(() => setShowSettingsOverlay(false), []);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        background: canvasIsTransparent ? 'transparent' : effectiveBackgroundColor,
        backgroundColor: canvasIsTransparent ? 'transparent' : effectiveBackgroundColor,
        borderRadius: hideBorder ? '0' : '16px',
        position: 'relative',
        overflow: 'visible',
        // Form a local stacking context so internal overlays (LoadingSpinner,
        // StatusTag, FPSMeter, SettingsButton) cannot bleed out of this
        // viewer's bounds when it's used as a PIP small view on top of
        // another viewer.
        isolation: 'isolate',
      }}
    >
      <Canvas
        camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
        dpr={[1, 2]}
        frameloop={hideEffects ? 'demand' : 'always'}
        gl={
          {
            antialias: true,
            alpha: canvasIsTransparent,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0,
            // TODO(ts): `outputEncoding` / `sRGBEncoding` are deprecated in newer
            // three.js typings but still honored at runtime. Keep 1:1 behavior.
            outputEncoding: (THREE as unknown as { sRGBEncoding: unknown }).sRGBEncoding,
            stencil: false,
            depth: true,
            logarithmicDepthBuffer: false,
          } as unknown as THREE.WebGLRendererParameters
        }
        onCreated={({ gl }) => {
          gl.sortObjects = false;
          if (canvasIsTransparent) {
            gl.setClearColor(0x000000, 0);
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          background: canvasIsTransparent ? 'transparent' : effectiveBackgroundColor,
          border: hideBorder
            ? 'none'
            : darkMode
              ? '1px solid rgba(255, 255, 255, 0.08)'
              : '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: hideBorder ? '0' : '16px',
          transform: `scale(${canvasScale}) translate(${canvasTranslateX}, ${canvasTranslateY})`,
          transformOrigin: 'center center',
        }}
      >
        <WebGLCleanup />
        {!canvasIsTransparent && <color attach="background" args={[effectiveBackgroundColor]} />}
        <Scene
          headPose={coalesced.headPose}
          headJoints={coalesced.headJoints}
          passiveJoints={coalesced.passiveJoints}
          yawBody={coalesced.yawBody ?? undefined}
          antennas={coalesced.antennas}
          isActive={isActive}
          isTransparent={isTransparent}
          wireframe={wireframe}
          forceLoad={forceLoad}
          hideGrid={hideGrid}
          showScanEffect={showScanEffect}
          usePremiumScan={usePremiumScan}
          onScanComplete={onScanComplete}
          onScanMesh={onScanMesh}
          onMeshesReady={onMeshesReady}
          onPoseReady={handlePoseReady}
          cameraConfig={cameraConfig}
          useCinematicCamera={useCinematicCamera}
          errorFocusMesh={errorFocusMesh}
          hideEffects={hideEffects}
          darkMode={darkMode}
          allowZeroPose={allowZeroPose}
          dataVersion={robotState.dataVersion}
        />
      </Canvas>

      <LoadingSpinner
        visible={showSpinner}
        darkMode={darkMode}
        backgroundColor={canvasIsTransparent ? undefined : effectiveBackgroundColor}
      />

      {!hideControls && (
        <SettingsButton onClick={openSettings} disabled={isBusy} darkMode={darkMode} />
      )}

      {!hideControls && import.meta.env.DEV && (
        <Box sx={{ position: 'absolute', bottom: 50, left: 12, zIndex: 11 }}>
          <FPSMeter darkMode={darkMode} />
        </Box>
      )}

      {!hideControls && showStatusTag && (
        <StatusTag
          isActive={isActive}
          isOn={isOn}
          isMoving={isMoving}
          robotStatus={robotStatus}
          busyReason={busyReason}
          darkMode={darkMode}
        />
      )}

      <SettingsOverlay open={showSettingsOverlay} onClose={closeSettings} darkMode={darkMode} />
    </Box>
  );
}
