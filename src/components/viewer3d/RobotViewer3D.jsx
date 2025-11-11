import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { IconButton, Switch, Tooltip, Box, Typography } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import GridOnIcon from '@mui/icons-material/GridOn';
import SettingsIcon from '@mui/icons-material/Settings';
import ThreeSixtyOutlinedIcon from '@mui/icons-material/ThreeSixtyOutlined';
import MyLocationOutlinedIcon from '@mui/icons-material/MyLocationOutlined';
import CircleIcon from '@mui/icons-material/Circle';
import { Leva } from 'leva';
import * as THREE from 'three';
import Scene from './Scene';
import CameraFeed from '../camera/CameraFeed';
import useRobotWebSocket from './hooks/useRobotWebSocket';

/**
 * Composant principal du visualiseur 3D
 * Gère l'UI et orchestre la scène 3D
 */
// ✅ Presets de caméra
const CAMERA_PRESETS = {
  normal: {
    position: [0, 0.25, 0.25],
    fov: 50,
    target: [0, 0.2, 0],
    minDistance: 0.2,
    maxDistance: 0.6,
  },
  scan: {
    position: [0, 0.22, 0.35],
    fov: 55,
    target: [0, 0.12, 0],
    minDistance: 0.15,
    maxDistance: 0.5,
  },
};

export default function RobotViewer3D({ 
  isActive, 
  enableDebug = false, 
  forceLevaOpen = false,
  initialMode = 'normal', // 'normal' ou 'xray'
  hideControls = false, // Cache les boutons de contrôle
  forceLoad = false, // Force le chargement du robot même si isActive=false
  hideGrid = false, // Cache la grille au sol
  hideBorder = false, // Cache la bordure du canvas
  showScanEffect = false, // Affiche l'effet de scan
  onScanComplete = null, // Callback quand le scan est terminé
  onScanMesh = null, // Callback pour chaque mesh scanné
  cameraPreset = 'normal', // Preset de caméra ('normal' | 'scan') ou objet custom
  useCinematicCamera = false, // Utilise une caméra animée au lieu d'OrbitControls
  useHeadFollowCamera = false, // Caméra qui suit la tête du robot
  showCameraToggle = false, // Affiche le toggle pour basculer entre Follow et Free
  errorFocusMesh = null, // Mesh à focus en cas d'erreur
  // Props pour le status tag
  showStatusTag = false, // Affiche le tag de statut en bas à droite
  isOn = null, // État des moteurs
  isMoving = false, // Robot en mouvement
  isCommandRunning = false, // Robot occupé (quick action / app / installation)
  // Props pour le swap
  onSwap = null, // Callback pour swap entre video et 3D
  hideCameraFeed = false, // Cache le flux vidéo (pour mode petit)
  hideEffects = false, // Cache les effets de particules (pour le petit viewer)
}) {
  // ✅ Récupérer la config de caméra
  const cameraConfig = typeof cameraPreset === 'string' 
    ? CAMERA_PRESETS[cameraPreset] 
    : { ...CAMERA_PRESETS.normal, ...cameraPreset };
  // Hook custom pour la connexion WebSocket au daemon
  const robotState = useRobotWebSocket(isActive);
  
  const [isTransparent, setIsTransparent] = useState(initialMode === 'xray');
  const [showLevaControls, setShowLevaControls] = useState(forceLevaOpen);
  
  // 🎥 Camera modes: 'free' | 'locked'
  // - free: Caméra libre avec OrbitControls
  // - locked: Suit la position ET l'orientation de la tête (FPV)
  const [cameraMode, setCameraMode] = useState('free');
  
  // Toggle entre les 2 modes
  const toggleCameraMode = () => {
    setCameraMode(prev => prev === 'free' ? 'locked' : 'free');
  };
  
  // Compute props pour Scene
  const useHeadFollow = cameraMode === 'locked';
  const lockToOrientation = cameraMode === 'locked';
  
  // Déterminer le statut du robot pour le tag
  const getStatusTag = () => {
    if (!isActive) {
      return { label: 'Offline', color: '#999' };
    }
    
    if (isMoving || isCommandRunning) {
      return { label: 'Moving', color: '#a855f7', animated: true };
    }
    
    if (isOn === true) {
      return { label: 'Ready', color: '#22c55e' };
    }
    
    if (isOn === false) {
      return { label: 'Standby', color: '#FF9500' };
    }
    
    return { label: 'Connected', color: '#3b82f6' };
  };
  
  const status = getStatusTag();

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      background: '#fdfcfa',
      position: 'relative',
      overflow: 'visible',
    }}>
      {/* Composant Leva - EN DEHORS du Canvas (composant React UI) */}
      <Leva hidden={!(enableDebug && showLevaControls)} />
      
      <Canvas
        camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
        dpr={[1, 2]} // Support retina displays (pixel ratio 1x à 2x)
        gl={{ 
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block', 
          background: '#fdfcfa',
          border: hideBorder ? 'none' : '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: hideBorder ? '0' : '16px',
        }}
      >
        <color attach="background" args={['#fdfcfa']} />
               <Scene 
                headPose={robotState.headPose}
                yawBody={robotState.yawBody}
                antennas={robotState.antennas} 
                isActive={isActive} 
                isTransparent={isTransparent}
                showLevaControls={enableDebug && showLevaControls}
                forceLoad={forceLoad}
                hideGrid={hideGrid}
                showScanEffect={showScanEffect}
                onScanComplete={onScanComplete}
                onScanMesh={onScanMesh}
                cameraConfig={cameraConfig}
                useCinematicCamera={useCinematicCamera}
              useHeadFollowCamera={useHeadFollowCamera && useHeadFollow}
              lockCameraToHead={lockToOrientation}
              errorFocusMesh={errorFocusMesh}
              hideEffects={hideEffects}
            />
      </Canvas>
      
      
      {/* Camera Feed */}
      {!hideCameraFeed && !hideControls && onSwap && (
        <div style={{
          position: 'absolute',
          bottom: -25,
          right: 24,
          width: '120px',
          height: '90px',
          zIndex: 10,
          transformOrigin: 'bottom right',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <CameraFeed 
            width={120}
            height={90}
            onSwap={onSwap}
            isLarge={false}
          />
        </div>
      )}
      
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
            zIndex: 10,
          }}
        >
          {/* Camera Mode Toggle (si showCameraToggle) */}
          {showCameraToggle && (
            <>
              <Tooltip
                title={
                  cameraMode === 'free' 
                    ? 'Free Camera - Click to lock to head' 
                    : 'Locked - Click for free camera'
                }
                placement="top"
                arrow
              >
                <IconButton
                  onClick={toggleCameraMode}
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
                  {cameraMode === 'free' ? (
                    <ThreeSixtyOutlinedIcon sx={{ fontSize: 16, color: '#666' }} />
                  ) : (
                    <MyLocationOutlinedIcon sx={{ fontSize: 16, color: '#e63946' }} />
                  )}
                </IconButton>
              </Tooltip>

              {/* Separator */}
              <Box
                sx={{
                  width: '1px',
                  height: '14px',
                  bgcolor: 'rgba(0, 0, 0, 0.1)',
                  mx: 0.5,
                }}
              />
            </>
          )}

          {/* View Mode Toggle - Single Button */}
          <Tooltip
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
          </Tooltip>

          {/* Debug Settings (si enableDebug) */}
          {enableDebug && !forceLevaOpen && (
            <>
              {/* Separator */}
              <Box
                sx={{
                  width: '1px',
                  height: '14px',
                  bgcolor: 'rgba(0, 0, 0, 0.1)',
                  mx: 0.5,
                }}
              />

              <Tooltip
                title={showLevaControls ? 'Hide advanced settings' : 'Show advanced settings'}
                placement="top"
                arrow
              >
                <IconButton
                  onClick={() => setShowLevaControls(!showLevaControls)}
                  size="small"
                  sx={{
                    width: 32,
                    height: 32,
                    transition: 'all 0.2s ease',
                    opacity: showLevaControls ? 1 : 0.7,
                    '&:hover': {
                      opacity: 1,
                      bgcolor: 'rgba(0, 0, 0, 0.04)',
                    },
                  }}
                >
                  <SettingsIcon sx={{ fontSize: 16, color: showLevaControls ? '#FF9500' : '#666' }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      )}
      
      {/* Status Tag - Bottom Left */}
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
            bgcolor: status.color === '#22c55e' ? 'rgba(34, 197, 94, 0.12)' : 
                     status.color === '#FF9500' ? 'rgba(255, 149, 0, 0.12)' :
                     status.color === '#3b82f6' ? 'rgba(59, 130, 246, 0.12)' :
                     status.color === '#a855f7' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(0, 0, 0, 0.06)',
            border: `1.5px solid ${
              status.color === '#22c55e' ? 'rgba(34, 197, 94, 0.3)' : 
              status.color === '#FF9500' ? 'rgba(255, 149, 0, 0.3)' :
              status.color === '#3b82f6' ? 'rgba(59, 130, 246, 0.3)' :
              status.color === '#a855f7' ? 'rgba(168, 85, 247, 0.35)' : 'rgba(0, 0, 0, 0.12)'
            }`,
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
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
    </div>
  );
}

