import React, { useState, useCallback, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import RobotViewer3D from '../viewer3d/RobotViewer3D';
import { getShortComponentName } from '../../utils/componentNames';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Vue affichée pendant le démarrage du daemon
 * Affiche le robot en mode X-ray avec un effet de scan
 * Affiche les erreurs si le démarrage échoue
 */
function StartingView({ startupError }) {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { setHardwareError, darkMode } = useAppStore();
  const [currentComponent, setCurrentComponent] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanError, setScanError] = useState(null);
  const [errorMesh, setErrorMesh] = useState(null); // Le mesh en erreur pour focus camera
  const [isRetrying, setIsRetrying] = useState(false);
  
  const handleRetry = useCallback(async () => {
    console.log('🔄 Retrying scan...');
    setIsRetrying(true);
    
    try {
      // 1. Arrêter le daemon (sans le goto_sleep)
      console.log('🛑 Stopping daemon...');
      await invoke('stop_daemon');
      
      // 2. Attendre que le daemon soit bien arrêté
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. Reset tous les états
      setScanError(null);
      setErrorMesh(null);
      setScanProgress({ current: 0, total: 0 });
      setCurrentComponent(null);
      setHardwareError(null);
      
      // 4. Reload pour relancer un scan complet
      console.log('🔄 Reloading app...');
      window.location.reload();
    } catch (err) {
      console.error('Failed to stop daemon:', err);
      // Reload quand même
      window.location.reload();
    }
  }, [setHardwareError]);
  
  const handleScanComplete = useCallback(() => {
    console.log('✅ Scan 3D completed (visually finished)');
    // Forcer la progression à 100%
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentComponent(null);
    
    // ⚡ ATTENDRE la pause pour voir la barre à 100%, puis lancer la transition
    console.log(`⏱️ Waiting ${DAEMON_CONFIG.ANIMATIONS.SCAN_COMPLETE_PAUSE}ms before transition...`);
    setTimeout(() => {
      console.log('🚀 Triggering transition to ActiveView');
      // Déclencher la transition via le store
      const { setIsStarting, setIsTransitioning, setIsActive } = useAppStore.getState();
      
      // Transition immédiate (pas de délai, la pause de 800ms est déjà passée)
      setIsStarting(false);
      setIsTransitioning(true);
      
      setTimeout(() => {
        setIsTransitioning(false);
        setIsActive(true);
      }, DAEMON_CONFIG.ANIMATIONS.TRANSITION_DURATION);
    }, DAEMON_CONFIG.ANIMATIONS.SCAN_COMPLETE_PAUSE);
  }, []);
  
  const handleScanMesh = useCallback((mesh, index, total) => {
    const componentName = getShortComponentName(mesh, index, total);
    setCurrentComponent(componentName);
    // index vient de ScanEffect qui compte de 1 à total (pas de 0 à total-1)
    // Ne jamais régresser : si current > index, garder current
    setScanProgress(prev => ({
      current: Math.max(prev.current, index),
      total: total
    }));
    
    // ========================================================================
    // ⚠️ SIMULATION D'ERREUR HARDWARE - Pour tester l'UI d'erreur
    // ========================================================================
    // 
    // Pour activer la simulation d'erreur pendant le scan, décommenter le bloc ci-dessous.
    // Cela permet de tester :
    // - L'arrêt du scan au mesh spécifié
    // - Le focus de la caméra sur le composant en erreur
    // - Le changement de couleur du composant en rouge
    // - L'affichage du message d'erreur avec instructions
    // - Le bouton Retry qui relance le daemon
    // - Le blocage de la transition vers ActiveRobotView
    //
    // Pour la production, ce code doit être remplacé par un vrai polling
    // de l'API daemon pour détecter les erreurs hardware réelles.
    // 
    // ========================================================================
    
    /*
    if (index === 50) {
      const errorData = {
        code: "Camera Error - Communication timeout (0x03)",
        action: "Check the camera cable connection and restart",
        component: componentName,
      };
      console.log('⚠️ Hardware error detected on mesh:', mesh);
      console.log('⚠️ Component:', componentName);
      setScanError(errorData);
      setErrorMesh(mesh); // Stocker le mesh pour focus caméra
      setHardwareError(errorData.code); // Bloquer la transition
    }
    */
  }, [setHardwareError]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
      }}
    >
      {/* Titlebar */}
      <Box
        onMouseDown={async (e) => {
          e.preventDefault();
          try {
            await appWindow.startDragging();
          } catch (err) {
            console.error('Drag error:', err);
          }
        }}
        sx={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <Box sx={{ width: 12, height: 12 }} />
        <Box sx={{ height: 20 }} /> {/* Espace pour le drag */}
        <Box sx={{ width: 20, height: 20 }} />
      </Box>

      {/* Content centré */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100% - 44px)',
          px: 4,
          gap: 1.5,
        }}
      >
        {/* Robot Viewer 3D - Design épuré */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '400px',
            position: 'relative',
          }}
        >
          {/* Robot 3D */}
          <Box
            sx={{
              width: '100%',
              height: '360px',
              position: 'relative',
              borderRadius: '20px',
              overflow: 'hidden',
              border: darkMode ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: darkMode 
                ? '0 20px 60px rgba(0, 0, 0, 0.4)'
                : '0 20px 60px rgba(0, 0, 0, 0.1)',
            }}
          >
            <RobotViewer3D 
              isActive={false} 
              initialMode="xray" 
              hideControls={true}
              forceLoad={true}
              hideGrid={true}
              hideBorder={true}
              showScanEffect={!startupError && !scanError}
              onScanComplete={handleScanComplete}
              onScanMesh={handleScanMesh}
              cameraPreset="scan"
              useCinematicCamera={true}
              errorFocusMesh={errorMesh}
            />
          </Box>
        </Box>

        {/* Status - Design minimaliste */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '400px',
            minHeight: '90px',
          }}
        >
          {(startupError || scanError) ? (
            // ❌ Erreur - Design moderne avec instruction en avant
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
                maxWidth: '360px',
                minHeight: '90px', // Même hauteur que le mode scan
              }}
            >
              {/* Titre compact */}
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: darkMode ? '#666' : '#999',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                Hardware Error
              </Typography>
              
              {/* Instruction principale - Plus grande avec mots en gras */}
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: darkMode ? '#f5f5f5' : '#333',
                    lineHeight: 1.5,
                  }}
                >
                  {scanError?.action ? (
                    <>
                      <Box component="span" sx={{ fontWeight: 700 }}>Check</Box> the{' '}
                      <Box component="span" sx={{ fontWeight: 700 }}>camera cable</Box> connection and{' '}
                      <Box component="span" sx={{ fontWeight: 700 }}>restart</Box>
                    </>
                  ) : (
                    startupError
                  )}
                </Typography>
              </Box>
              
              {/* Code d'erreur technique - Plus petit, secondaire */}
              {scanError?.code && (
                <Typography
                  sx={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: darkMode ? '#666' : '#999',
                    fontFamily: 'monospace',
                    bgcolor: darkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  {scanError.code}
                </Typography>
              )}
              
              {/* Bouton Retry */}
              <Button
                variant="outlined"
                startIcon={isRetrying ? <CircularProgress size={15} sx={{ color: '#ef4444' }} /> : <RefreshIcon sx={{ fontSize: 15 }} />}
                onClick={handleRetry}
                disabled={isRetrying}
                sx={{
                  borderColor: '#ef4444',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: 11,
                  px: 2.5,
                  py: 0.75,
                  borderRadius: '10px',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#dc2626',
                    bgcolor: 'rgba(239, 68, 68, 0.04)',
                  },
                  '&:disabled': {
                    borderColor: '#fca5a5',
                    color: '#fca5a5',
                  },
                }}
              >
                {isRetrying ? 'Restarting...' : 'Retry Scan'}
              </Button>
            </Box>
          ) : (
            // 🔄 En cours de scan - Design épuré
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                width: '100%',
              }}
            >
              {/* Titre + spinner */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CircularProgress 
                  size={16} 
                  thickness={4} 
                  sx={{ 
                    color: darkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)',
                  }} 
                />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: darkMode ? '#f5f5f5' : '#333',
                    letterSpacing: '0.2px',
                  }}
                >
                  Scanning hardware
                </Typography>
              </Box>
              
              {/* Barre de progression simple */}
              <Box
                sx={{
                  position: 'relative',
                  width: '60%',
                  height: 2,
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                  borderRadius: '1px',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    width: `${scanProgress.total > 0 ? Math.min(100, (scanProgress.current / scanProgress.total) * 100) : 0}%`,
                    height: '100%',
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              </Box>
              
              {/* Compteur + composant */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: darkMode ? '#666' : '#999',
                    fontFamily: 'monospace',
                  }}
                >
                  {scanProgress.current}/{scanProgress.total}
                </Typography>
                
                {currentComponent && (
                  <>
                    <Box 
                      sx={{ 
                        width: 2, 
                        height: 2, 
                        borderRadius: '50%',
                        bgcolor: darkMode ? '#444' : '#ccc',
                      }} 
                    />
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: darkMode ? '#666' : '#999',
                        fontFamily: 'monospace',
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      {currentComponent}
                    </Typography>
                  </>
                )}
              </Box>
            </Box>
          )}
          </Box>
      </Box>
    </Box>
  );
}

export default StartingView;
