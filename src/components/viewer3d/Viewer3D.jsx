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
  backgroundColor = '#e0e0e0', // Couleur de fond du canvas
  // Props du robot
  antennas = null, // Position des antennes [left, right] (null = position par défaut)
  headPose = null, // Position de la tête (null = position par défaut)
  yawBody = null, // Rotation du corps (null = position par défaut)
  // Props pour le status tag
  showStatusTag = false, // Affiche le tag de statut en bas à droite
  isOn = null, // État des moteurs
  isMoving = false, // Robot en mouvement
  robotStatus = null, // ✨ État principal de la state machine
  busyReason = null, // ✨ Raison si busy
  // Props pour les effets
  hideEffects = false, // Cache les effets de particules (pour le petit viewer)
}) {
  // ✅ Récupérer la config de caméra
  const cameraConfig = typeof cameraPreset === 'string' 
    ? CAMERA_PRESETS[cameraPreset] 
    : { ...CAMERA_PRESETS.normal, ...cameraPreset };
  // Hook custom pour la connexion WebSocket au daemon
  // ✅ Permettre la connexion WebSocket si isActive OU forceLoad (pour que le robot bouge même si isActive est temporairement false)
  const robotState = useRobotWebSocket(isActive || forceLoad);
  
  // ✅ Utiliser les props fournies ou celles du robotState WebSocket
  // Si antennas n'est pas fourni et robotState.antennas est null, utiliser [0, 0] (replié)
  const finalAntennas = antennas !== null ? antennas : (robotState.antennas || [0, 0]);
  const finalHeadPose = headPose !== null ? headPose : robotState.headPose;
  const finalYawBody = yawBody !== null ? yawBody : robotState.yawBody;
  
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
  
  // ✨ Déterminer le statut du robot pour le tag (avec state machine)
  const getStatusTag = () => {
    // Si robotStatus fourni, utiliser la state machine (NOUVEAU)
    if (robotStatus) {
      switch (robotStatus) {
        case 'disconnected':
          return { label: 'Offline', color: '#999' };
        
        case 'ready-to-start':
          return { label: 'Ready to Start', color: '#3b82f6' };
        
        case 'starting':
          return { label: 'Starting', color: '#3b82f6', animated: true };
        
        case 'ready':
          // Si motors on → Ready, si off → Standby
          if (isOn === true) {
            return { label: 'Ready', color: '#22c55e' };
          } else if (isOn === false) {
            return { label: 'Standby', color: '#FF9500' };
          }
          return { label: 'Connected', color: '#3b82f6' };
        
        case 'busy':
          // Labels spécifiques selon la raison
          const busyLabels = {
            'moving': { label: 'Moving', color: '#a855f7' },
            'command': { label: 'Executing', color: '#a855f7' },
            'app-running': { label: 'App Running', color: '#f59e0b' },
            'installing': { label: 'Installing', color: '#3b82f6' },
          };
          const busyInfo = busyLabels[busyReason] || { label: 'Busy', color: '#a855f7' };
          return { ...busyInfo, animated: true };
        
        case 'stopping':
          return { label: 'Stopping', color: '#ef4444', animated: true };
        
        case 'crashed':
          return { label: 'Crashed', color: '#ef4444' };
        
        default:
          return { label: 'Unknown', color: '#999' };
      }
    }
    
    // Fallback legacy (si robotStatus pas fourni)
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
      return { label: 'Standby', color: '#FF9500' };
    }
    
    return { label: 'Connected', color: '#3b82f6' };
  };
  
  const status = getStatusTag();

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      background: backgroundColor,
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
          background: backgroundColor,
          border: hideBorder ? 'none' : '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: hideBorder ? '0' : '16px',
        }}
      >
        <color attach="background" args={[backgroundColor]} />
               <Scene 
                headPose={finalHeadPose}
                yawBody={finalYawBody}
                antennas={finalAntennas} 
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
            bgcolor: status.color === '#22c55e' ? 'rgba(34, 197, 94, 0.12)' : 
                     status.color === '#FF9500' ? 'rgba(255, 149, 0, 0.12)' :
                     status.color === '#3b82f6' ? 'rgba(59, 130, 246, 0.12)' :
                     status.color === '#a855f7' ? 'rgba(168, 85, 247, 0.12)' :
                     status.color === '#f59e0b' ? 'rgba(245, 158, 11, 0.12)' :
                     status.color === '#ef4444' ? 'rgba(239, 68, 68, 0.12)' :
                     status.color === '#999' ? 'rgba(153, 153, 153, 0.12)' : 'rgba(0, 0, 0, 0.06)',
            border: `1.5px solid ${
              status.color === '#22c55e' ? 'rgba(34, 197, 94, 0.3)' : 
              status.color === '#FF9500' ? 'rgba(255, 149, 0, 0.3)' :
              status.color === '#3b82f6' ? 'rgba(59, 130, 246, 0.3)' :
              status.color === '#a855f7' ? 'rgba(168, 85, 247, 0.35)' :
              status.color === '#f59e0b' ? 'rgba(245, 158, 11, 0.35)' :
              status.color === '#ef4444' ? 'rgba(239, 68, 68, 0.4)' :
              status.color === '#999' ? 'rgba(153, 153, 153, 0.25)' : 'rgba(0, 0, 0, 0.12)'
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

