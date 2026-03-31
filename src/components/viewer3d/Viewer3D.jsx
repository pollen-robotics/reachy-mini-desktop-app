import React, { useEffect, useState, useMemo, useRef, memo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { IconButton, Switch, Tooltip, Box, Typography, Button } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import GridOnIcon from '@mui/icons-material/GridOn';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import CircleIcon from '@mui/icons-material/Circle';
// Leva removed - was never displayed
import * as THREE from 'three';
import Scene from './Scene';
import { useRobotWebSocket } from './hooks';
import useAppStore from '../../store/useAppStore';
import { selectIsBusy } from '../../store/slices';
import { ROBOT_STATUS } from '../../constants/robotStatus';
import { arraysEqual } from '../../utils/arraysEqual';
import SettingsOverlay from './SettingsOverlay';
import { FPSMeter } from '../FPSMeter';
import FullscreenOverlay from '../FullscreenOverlay';
import PulseButton from '../PulseButton';
import { invoke } from '@tauri-apps/api/core';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';
import reachyUpdateBoxSvg from '../../assets/reachy-update-box.svg';

/**
 * WebGL Context Cleanup Component
 * Ensures WebGL resources are properly disposed when Canvas unmounts
 */
function WebGLCleanup() {
  const { gl, scene } = useThree();

  useEffect(() => {
    return () => {
      // Dispose all geometries and materials in scene
      scene?.traverse(object => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });

      // Dispose renderer resources
      gl?.dispose();

      // Force WebGL context loss to free GPU memory
      const loseContext = gl?.getContext()?.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
    };
  }, [gl, scene]);

  return null;
}

/**
 * Main 3D viewer component
 * Manages UI and orchestrates 3D scene
 */
// ✅ Camera presets
const CAMERA_PRESETS = {
  normal: {
    position: [-0.25, 0.35, 0.55], // 3/4 view from left, slightly further
    fov: 50,
    target: [0, 0.2, 0],
    minDistance: 0.2,
    maxDistance: 0.6,
  },
  scan: {
    position: [0, 0.22, 0.5], // Closer: Z reduced from 0.62 to 0.50
    fov: 55,
    target: [0, 0.12, 0],
    minDistance: 0.15,
    maxDistance: 0.5,
  },
};

export default function RobotViewer3D({
  isActive,
  initialMode = 'normal', // 'normal' or 'xray'
  hideControls = false, // Hide control buttons
  forceLoad = false, // Force robot loading even if isActive=false
  hideGrid = false, // Hide floor grid
  hideBorder = false, // Hide canvas border
  showScanEffect = false, // Show scan effect
  usePremiumScan = false, // Use premium world-class scan effect
  onScanComplete = null, // Callback when scan is complete
  onScanMesh = null, // Callback for each scanned mesh
  onMeshesReady = null, // Callback when robot meshes are ready
  cameraPreset = 'normal', // Camera preset ('normal' | 'scan') or custom object
  useCinematicCamera = false, // Use animated camera instead of OrbitControls
  errorFocusMesh = null, // Mesh to focus on in case of error
  backgroundColor = '#e0e0e0', // Canvas background color
  wireframe = false, // ✅ Wireframe mode
  // Robot props
  antennas = null, // Antenna positions [left, right] (null = default position)
  headPose = null, // Head position (null = default position)
  headJoints = null, // Head joints [yaw_body, stewart_1, ..., stewart_6] (null = use WebSocket data)
  yawBody = null, // Body rotation (null = default position)
  // Status tag props
  showStatusTag = false, // Show status tag at bottom right
  isOn = null, // Motor state
  isMoving = false, // Robot moving
  robotStatus = null, // ✨ Main state machine state
  busyReason = null, // ✨ Reason if busy
  // Effect props
  hideEffects = false, // Hide particle effects (for small viewer)
  // Canvas transform props
  canvasScale = 1, // Scale for canvas (default 1)
  canvasTranslateX = 0, // TranslateX for canvas (default 0)
  canvasTranslateY = 0, // TranslateY for canvas (default 0)
}) {
  // ✅ Get camera config
  const cameraConfig =
    typeof cameraPreset === 'string'
      ? CAMERA_PRESETS[cameraPreset]
      : { ...CAMERA_PRESETS.normal, ...cameraPreset };
  // Custom hook for WebSocket connection to daemon
  // ✅ IMPORTANT: Do NOT connect to WebSocket if isActive=false AND headJoints=null is explicitly passed
  // This allows having a completely static robot (for hardware scan view)
  // If headJoints is explicitly null AND isActive=false, NEVER connect to WebSocket
  // headJoints === null means "static robot", headJoints === undefined means "use WebSocket"
  const shouldConnectWebSocket = isActive || (forceLoad && headJoints !== null);
  const robotState = useRobotWebSocket(shouldConnectWebSocket);

  // ✅ Use provided props or those from WebSocket robotState
  // If headJoints is explicitly null, NEVER use WebSocket data for movements
  // This ensures the robot remains static in the scan view
  // ✅ OPTIMIZED: Memoize computed props with stable references to avoid unnecessary recalculations
  // Use refs to compare values numerically instead of relying on object references
  const prevAntennasRef = useRef(null);
  const prevHeadPoseRef = useRef(null);
  const prevHeadJointsRef = useRef(null);
  const prevYawBodyRef = useRef(null);
  const prevPassiveJointsRef = useRef(null);

  // 🔄 Reset refs when disconnecting (robot switch cleanup)
  useEffect(() => {
    if (!shouldConnectWebSocket) {
      prevAntennasRef.current = null;
      prevHeadPoseRef.current = null;
      prevHeadJointsRef.current = null;
      prevYawBodyRef.current = null;
      prevPassiveJointsRef.current = null;
    }
  }, [shouldConnectWebSocket]);

  // ✅ OPTIMIZED: Only recalculate if values actually changed (not just reference)
  const finalAntennas = useMemo(() => {
    const value =
      antennas !== null
        ? antennas
        : shouldConnectWebSocket
          ? robotState.antennas || [0, 0]
          : [0, 0];
    if (!arraysEqual(value, prevAntennasRef.current)) {
      prevAntennasRef.current = value;
      return value;
    }
    return prevAntennasRef.current || value;
  }, [antennas, shouldConnectWebSocket, robotState.antennas]);

  const finalHeadPose = useMemo(() => {
    const value =
      headPose !== null ? headPose : shouldConnectWebSocket ? robotState.headPose : null;
    if (value && (!prevHeadPoseRef.current || !arraysEqual(value, prevHeadPoseRef.current))) {
      prevHeadPoseRef.current = value;
      return value;
    }
    if (!value && prevHeadPoseRef.current) {
      prevHeadPoseRef.current = null;
      return null;
    }
    return prevHeadPoseRef.current || value;
  }, [headPose, shouldConnectWebSocket, robotState.headPose]);

  const finalHeadJoints = useMemo(() => {
    const value =
      headJoints !== null ? headJoints : shouldConnectWebSocket ? robotState.headJoints : null;
    if (value && (!prevHeadJointsRef.current || !arraysEqual(value, prevHeadJointsRef.current))) {
      prevHeadJointsRef.current = value;
      return value;
    }
    if (!value && prevHeadJointsRef.current) {
      prevHeadJointsRef.current = null;
      return null;
    }
    return prevHeadJointsRef.current || value;
  }, [headJoints, shouldConnectWebSocket, robotState.headJoints]);

  const finalYawBody = useMemo(() => {
    const value = yawBody !== null ? yawBody : shouldConnectWebSocket ? robotState.yawBody : null;
    if (value !== undefined && Math.abs(value - (prevYawBodyRef.current ?? 0)) > 0.005) {
      prevYawBodyRef.current = value;
      return value;
    }
    return prevYawBodyRef.current ?? value ?? null;
  }, [yawBody, shouldConnectWebSocket, robotState.yawBody]);

  // 🚀 GAME-CHANGING: Extract passiveJoints from unified WebSocket
  const finalPassiveJoints = useMemo(() => {
    const value = shouldConnectWebSocket ? robotState.passiveJoints : null;
    const prevPassive = Array.isArray(prevPassiveJointsRef.current)
      ? prevPassiveJointsRef.current
      : prevPassiveJointsRef.current?.array;
    const currentPassive = Array.isArray(value) ? value : value?.array;
    if (value && (!prevPassiveJointsRef.current || !arraysEqual(currentPassive, prevPassive))) {
      prevPassiveJointsRef.current = value;
      return value;
    }
    if (!value && prevPassiveJointsRef.current) {
      prevPassiveJointsRef.current = null;
      return null;
    }
    return prevPassiveJointsRef.current || value;
  }, [shouldConnectWebSocket, robotState.passiveJoints]);

  const [isTransparent, setIsTransparent] = useState(initialMode === 'xray');
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);

  // Startup update notification state
  const [showStartupUpdateModal, setShowStartupUpdateModal] = useState(false);
  const [startupUpdateInfo, setStartupUpdateInfo] = useState(null);
  const [pendingUpdateInfo, setPendingUpdateInfo] = useState(null);
  const wasActiveRef = useRef(false);

  // ✅ Get state from store
  const darkMode = useAppStore(state => state.darkMode);
  const isBusy = useAppStore(selectIsBusy);

  // ✅ Adapt backgroundColor based on darkMode if not explicitly provided
  // If transparent, keep transparent. Otherwise adapt default color to darkMode
  const effectiveBackgroundColor =
    backgroundColor === 'transparent'
      ? 'transparent'
      : backgroundColor === '#e0e0e0'
        ? darkMode
          ? '#1a1a1a'
          : '#e0e0e0'
        : backgroundColor;

  // Check for update once when daemon becomes active (startup notification)
  useEffect(() => {
    if (isActive && !wasActiveRef.current && !hideControls) {
      wasActiveRef.current = true;

      const timer = setTimeout(async () => {
        try {
          if (!navigator.onLine) return;

          const preRelease = (() => {
            try {
              const stored = localStorage.getItem('preReleaseUpdates');
              return stored ? JSON.parse(stored) : false;
            } catch {
              return false;
            }
          })();

          const { connectionMode } = useAppStore.getState();
          let updateData = null;

          if (connectionMode === 'wifi') {
            const response = await fetchWithTimeout(
              buildApiUrl(`/update/available?pre_release=${preRelease}`),
              {},
              DAEMON_CONFIG.TIMEOUTS.COMMAND,
              { label: 'Startup update check', silent: true }
            );
            if (response.ok) {
              const data = await response.json();
              updateData = data.update?.reachy_mini || null;
            }
          } else if (connectionMode !== 'external') {
            updateData = await invoke('check_daemon_update', { preRelease });
          }

          if (updateData?.is_available) {
            setStartupUpdateInfo(updateData);
            setShowStartupUpdateModal(true);
          }
        } catch {
          // Silent fail - startup update check is non-critical
        }
      }, 3000);

      return () => clearTimeout(timer);
    }

    if (!isActive) {
      wasActiveRef.current = false;
    }
  }, [isActive, hideControls]);

  const handleCloseSettings = useCallback(() => {
    setShowSettingsOverlay(false);
    setPendingUpdateInfo(null);
  }, []);

  // ✨ Determine robot status for tag (with state machine)
  const getStatusTag = () => {
    // If robotStatus provided, use state machine (NEW)
    if (robotStatus) {
      switch (robotStatus) {
        case ROBOT_STATUS.DISCONNECTED:
          return { label: 'Offline', color: '#999' };

        case ROBOT_STATUS.READY_TO_START:
          return { label: 'Ready to Start', color: '#3b82f6' };

        case ROBOT_STATUS.STARTING:
          return { label: 'Starting', color: '#3b82f6', animated: true };

        case ROBOT_STATUS.SLEEPING:
          return { label: 'Sleeping', color: '#6b7280' };

        case ROBOT_STATUS.READY:
          if (isOn === true) {
            return { label: 'Ready', color: '#22c55e' };
          } else if (isOn === false) {
            return { label: 'Standby', color: '#6b7280' };
          }
          return { label: 'Connected', color: '#3b82f6' };

        case ROBOT_STATUS.BUSY: {
          const busyLabels = {
            moving: { label: 'Moving', color: '#a855f7' },
            command: { label: 'Executing', color: '#a855f7' },
            'app-running': { label: 'App Running', color: '#a855f7' },
            installing: { label: 'Installing', color: '#3b82f6' },
          };
          const busyInfo = busyLabels[busyReason] || { label: 'Busy', color: '#a855f7' };
          return { ...busyInfo, animated: true };
        }

        case ROBOT_STATUS.STOPPING:
          return { label: 'Stopping', color: '#ef4444', animated: true };

        case ROBOT_STATUS.CRASHED:
          return { label: 'Crashed', color: '#ef4444' };

        default:
          return { label: 'Unknown', color: '#999' };
      }
    }

    // Legacy fallback (if robotStatus not provided)
    if (!isActive) {
      return { label: 'Offline', color: '#999' };
    }

    if (isMoving) {
      return { label: 'Moving', color: '#a855f7', animated: true };
    }

    if (isOn === true) {
      return { label: 'Ready', color: '#22c55e' };
    }

    if (isOn === false) {
      return { label: 'Standby', color: '#6b7280' };
    }

    return { label: 'Connected', color: '#3b82f6' };
  };

  const status = getStatusTag();

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background:
          effectiveBackgroundColor === 'transparent' ? 'transparent' : effectiveBackgroundColor,
        backgroundColor:
          effectiveBackgroundColor === 'transparent' ? 'transparent' : effectiveBackgroundColor,
        borderRadius: hideBorder ? '0' : '16px',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <Canvas
        camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
        dpr={[1, 2]} // ✅ OPTIMIZED: Limit to 2x pixel ratio (3x too heavy for most GPUs)
        frameloop={hideEffects ? 'demand' : 'always'} // ✅ Stop rendering loop for small/hidden views
        gl={{
          antialias: true, // ✅ MSAA anti-aliasing enabled
          alpha: effectiveBackgroundColor === 'transparent',
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping, // ✅ Professional tone mapping
          toneMappingExposure: 1.0,
          outputEncoding: THREE.sRGBEncoding, // ✅ sRGB encoding for better color accuracy (reduces banding)
          stencil: false, // Disable stencil buffer for better performance
          depth: true, // Enable depth buffer
          logarithmicDepthBuffer: false, // Keep standard depth buffer for better performance
        }}
        onCreated={({ gl }) => {
          // ✅ Disable automatic sorting of transparent objects to avoid flickering
          gl.sortObjects = false;
          // ✅ Set clear color for transparent background
          if (effectiveBackgroundColor === 'transparent') {
            gl.setClearColor(0x000000, 0);
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          background:
            effectiveBackgroundColor === 'transparent' ? 'transparent' : effectiveBackgroundColor,
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
        {/* ✅ WebGL cleanup on unmount to prevent context accumulation */}
        <WebGLCleanup />
        {effectiveBackgroundColor !== 'transparent' && (
          <color attach="background" args={[effectiveBackgroundColor]} />
        )}
        <Scene
          headPose={finalHeadPose}
          headJoints={finalHeadJoints} // ✅ Use joints directly
          passiveJoints={finalPassiveJoints} // 🚀 GAME-CHANGING: Pass passiveJoints from unified WebSocket
          yawBody={finalYawBody}
          antennas={finalAntennas}
          isActive={isActive}
          isTransparent={isTransparent}
          wireframe={wireframe} // ✅ Wireframe mode
          forceLoad={forceLoad}
          hideGrid={hideGrid}
          showScanEffect={showScanEffect}
          usePremiumScan={usePremiumScan}
          onScanComplete={onScanComplete}
          onScanMesh={onScanMesh}
          onMeshesReady={onMeshesReady}
          cameraConfig={cameraConfig}
          useCinematicCamera={useCinematicCamera}
          errorFocusMesh={errorFocusMesh}
          hideEffects={hideEffects}
          darkMode={darkMode}
          dataVersion={robotState.dataVersion} // ⚡ OPTIMIZED: Skip comparisons in URDFRobot
        />
      </Canvas>

      {/* Note: Camera Feed swap is now handled by ViewportSwapper component */}

      {/* Top Right Controls */}
      {!hideControls && (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            // z-index hierarchy: 10 = UI controls (buttons, tooltips)
            zIndex: 10,
          }}
        >
          {/* Settings Button - Disabled when robot is busy */}
          <Tooltip title="Settings" placement="top" arrow>
            <span>
              <IconButton
                onClick={() => setShowSettingsOverlay(true)}
                size="small"
                disabled={isBusy}
                sx={{
                  width: 36,
                  height: 36,
                  transition: 'all 0.2s ease',
                  color: isBusy ? (darkMode ? '#666' : '#999') : '#FF9500',
                  bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid',
                  borderColor: isBusy
                    ? darkMode
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.1)'
                    : darkMode
                      ? 'rgba(255, 149, 0, 0.5)'
                      : 'rgba(255, 149, 0, 0.4)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: darkMode
                    ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                    : '0 2px 8px rgba(0, 0, 0, 0.08)',
                  opacity: isBusy ? 0.4 : 1,
                  '&:hover': {
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                    borderColor: '#FF9500',
                    transform: isBusy ? 'none' : 'scale(1.05)',
                  },
                  '&:active': {
                    transform: isBusy ? 'none' : 'scale(0.95)',
                  },
                  '&.Mui-disabled': {
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.6)',
                    color: darkMode ? '#666' : '#999',
                    borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  },
                }}
              >
                <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>

          {/* View Mode Toggle - COMMENTED */}
          {/* <Tooltip
            title={isTransparent ? 'Wireframe View - Click for solid' : 'Solid View - Click for wireframe'}
            placement="top"
            arrow
          >
            <IconButton
              onClick={() => setIsTransparent(!isTransparent)}
              size="small"
              sx={{
                width: 32,
                height: 32,
                transition: 'all 0.2s ease',
                opacity: 0.7,
                '&:hover': {
                  opacity: 1,
                  bgcolor: 'rgba(0, 0, 0, 0.04)',
                },
              }}
            >
              {isTransparent ? (
                <GridOnIcon sx={{ fontSize: 16, color: '#666' }} />
              ) : (
                <VisibilityOutlinedIcon sx={{ fontSize: 16, color: '#666' }} />
              )}
            </IconButton>
          </Tooltip> */}
        </Box>
      )}

      {/* FPS Meter - Above Status Tag (dev only) */}
      {!hideControls && import.meta.env.DEV && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 50, // Above status tag (which is at bottom: 12, height ~36px)
            left: 12, // Same left position as status tag
            zIndex: 11, // Just above status tag (zIndex: 10)
          }}
        >
          <FPSMeter darkMode={darkMode} />
        </Box>
      )}

      {/* Status Tag - Bottom Left (🤖 State Machine) */}
      {!hideControls && showStatusTag && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            borderRadius: '10px',
            bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            border: `1.5px solid ${
              status.color === '#22c55e'
                ? 'rgba(34, 197, 94, 0.3)'
                : status.color === '#6b7280'
                  ? 'rgba(107, 114, 128, 0.3)'
                  : status.color === '#3b82f6'
                    ? 'rgba(59, 130, 246, 0.3)'
                    : status.color === '#a855f7'
                      ? 'rgba(168, 85, 247, 0.35)'
                      : status.color === '#ef4444'
                        ? 'rgba(239, 68, 68, 0.4)'
                        : status.color === '#999'
                          ? 'rgba(153, 153, 153, 0.25)'
                          : 'rgba(0, 0, 0, 0.12)'
            }`,
            backdropFilter: 'blur(10px)',
            transition: 'none',
            // z-index hierarchy: 10 = UI controls (status tag)
            zIndex: 10,
          }}
        >
          <CircleIcon
            sx={{
              fontSize: 7,
              color: status.color,
              ...(status.animated && {
                animation: 'pulse-dot 1.5s ease-in-out infinite',
                '@keyframes pulse-dot': {
                  '0%, 100%': {
                    opacity: 1,
                    transform: 'scale(1)',
                  },
                  '50%': {
                    opacity: 0.6,
                    transform: 'scale(1.3)',
                  },
                },
              }),
            }}
          />
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: status.color,
              letterSpacing: '0.2px',
            }}
          >
            {status.label}
          </Typography>
        </Box>
      )}

      {/* Settings Overlay */}
      <SettingsOverlay
        open={showSettingsOverlay}
        onClose={handleCloseSettings}
        darkMode={darkMode}
        initialUpdateInfo={pendingUpdateInfo}
        autoShowUpdateConfirm={!!pendingUpdateInfo}
      />

      {/* Startup Update Notification */}
      <FullscreenOverlay
        open={showStartupUpdateModal}
        onClose={() => setShowStartupUpdateModal(false)}
        darkMode={darkMode}
        zIndex={10000}
        backdropOpacity={0.8}
        backdropBlur={10}
        debugName="StartupUpdateNotification"
        centeredX={true}
        centeredY={true}
        showCloseButton={true}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            mx: 'auto',
            px: 3,
            textAlign: 'center',
          }}
        >
          <Box sx={{ mb: 3 }}>
            <img
              src={reachyUpdateBoxSvg}
              alt="Update available"
              style={{ width: 120, height: 120 }}
            />
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
            Update Available
          </Typography>

          <Typography sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.6, mb: 1 }}>
            A new version is ready to install.
          </Typography>

          <Typography sx={{ fontSize: 15, fontWeight: 500, mb: 4 }}>
            <span style={{ color: darkMode ? '#888' : '#999' }}>
              {startupUpdateInfo?.current_version}
            </span>
            {' → '}
            <span style={{ color: darkMode ? '#fff' : '#222', fontWeight: 700 }}>
              {startupUpdateInfo?.available_version}
            </span>
          </Typography>

          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button
              onClick={() => setShowStartupUpdateModal(false)}
              variant="text"
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': {
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              }}
            >
              Later
            </Button>
            <PulseButton
              onClick={() => {
                setShowStartupUpdateModal(false);
                setPendingUpdateInfo(startupUpdateInfo);
                setShowSettingsOverlay(true);
              }}
              darkMode={darkMode}
              sx={{ minWidth: 160 }}
            >
              Update now
            </PulseButton>
          </Box>
        </Box>
      </FullscreenOverlay>
    </div>
  );
}
