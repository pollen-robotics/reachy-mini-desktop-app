import React, { useState, useCallback } from 'react';
import { Box, Typography, Button, Stack, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Viewer3D from './viewer3d';
import FPSMeter from './FPSMeter';
import AudioLevelBars from './views/active-robot/audio/AudioLevelBars';
import AudioControls from './views/active-robot/audio/AudioControls';
import { getShortComponentName } from '../utils/componentNames';

/**
 * Page de développement pour tester le RobotViewer3D en isolation
 * Accès automatique via http://localhost:5173/#dev
 */
export default function DevPlayground() {
  const [mode, setMode] = useState('audio-controls'); // 'audio-controls', 'normal', 'scan', 'hardware-scan' ou 'audio-speaker'
  const [currentComponent, setCurrentComponent] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanComplete, setScanComplete] = useState(false); // Scan completed successfully
  const [scanError, setScanError] = useState(null); // Simulated scan error
  const [errorMesh, setErrorMesh] = useState(null); // Mesh to highlight on error
  const [availableMeshes, setAvailableMeshes] = useState([]); // All meshes from robot

  const handleScanComplete = useCallback(() => {
    console.log('✅ Scan completed in DevPlayground');
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentComponent(null);
    setScanComplete(true); // ✅ Display success
  }, []);

  const handleScanMesh = useCallback((mesh, index, total) => {
    const componentName = getShortComponentName(mesh, index, total);
    setCurrentComponent(componentName);
    setScanProgress(prev => ({
      current: Math.max(prev.current, index),
      total: total
    }));
  }, []);

  const handleMeshesReady = useCallback((meshes) => {
    console.log('📦 Meshes ready in DevPlayground:', meshes.length);
    setAvailableMeshes(meshes);
  }, []);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    // Reset scan state when changing mode
    setCurrentComponent(null);
    setScanProgress({ current: 0, total: 0 });
    setScanComplete(false);
    setScanError(null);
    setErrorMesh(null);
    setAvailableMeshes([]); // Reset meshes when changing mode
  };

  const handleToggleError = useCallback(() => {
    if (scanError) {
      // Clear error
      setScanError(null);
      setErrorMesh(null);
    } else {
      // Simulate error - find SPECIFICALLY camera meshes
      let meshToError = null;
      
      if (availableMeshes.length > 0) {
        // Helper function to check if a mesh is part of the camera
        const isCameraMesh = (mesh) => {
          const meshName = (mesh.name || '').toLowerCase();
          
          // Check mesh name directly
          if (meshName.includes('camera') || meshName.includes('xl_330')) {
            return true;
          }
          
          // Traverse hierarchy to find camera parent
          let current = mesh;
          let depth = 0;
          while (current && current.parent && depth < 10) {
            const parentName = (current.parent.name || '').toLowerCase();
            const currentName = (current.name || '').toLowerCase();
            
            if (parentName.includes('camera') || currentName.includes('camera') ||
                parentName.includes('xl_330') || currentName.includes('xl_330')) {
              return true;
            }
            
            current = current.parent;
            depth++;
          }
          
          return false;
        };
        
        // Find ALL camera meshes
        const cameraMeshes = availableMeshes.filter(isCameraMesh);
        
        if (cameraMeshes.length > 0) {
          // Use the first camera mesh found
          meshToError = cameraMeshes[0];
          console.log(`🔴 Found ${cameraMeshes.length} camera mesh(es), using first one:`, {
            name: meshToError.name,
            uuid: meshToError.uuid,
            position: meshToError.position?.toArray(),
            hasBoundingBox: !!meshToError.geometry?.boundingBox,
            allCameraMeshes: cameraMeshes.map(m => ({ name: m.name, uuid: m.uuid }))
          });
        } else {
          console.warn('⚠️ No camera meshes found in available meshes. Available mesh names:', 
            availableMeshes.slice(0, 10).map(m => m.name || m.uuid));
          // Don't set an error if we can't find the camera
          return;
        }
        
        // Ensure bounding box is computed
        if (meshToError && meshToError.geometry && !meshToError.geometry.boundingBox) {
          meshToError.geometry.computeBoundingBox();
          console.log('📦 Computed bounding box for camera error mesh');
        }
      } else {
        console.warn('⚠️ No meshes available yet');
        return;
      }
      
      setScanError({
        action: true,
        code: 'CAMERA_ERROR_001'
      });
      setErrorMesh(meshToError);
    }
  }, [scanError, availableMeshes]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: 'rgba(250, 250, 252, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        p: 4,
      }}
    >
      <FPSMeter />
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#333' }}>
        🔬 Dev Playground
      </Typography>
      
      <Stack direction="row" spacing={2}>
        <Button 
          variant={mode === 'audio-controls' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => handleModeChange('audio-controls')}
          sx={{ textTransform: 'none' }}
        >
          Audio Controls (Exact Context)
        </Button>
        <Button 
          variant={mode === 'audio-speaker' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => handleModeChange('audio-speaker')}
          sx={{ textTransform: 'none' }}
        >
          Audio Speaker
        </Button>
        <Button 
          variant={mode === 'normal' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => handleModeChange('normal')}
          sx={{ textTransform: 'none' }}
        >
          3D Viewer
        </Button>
        <Button 
          variant={mode === 'scan' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => handleModeChange('scan')}
          sx={{ textTransform: 'none' }}
        >
          Scan View
        </Button>
        <Button 
          variant={mode === 'hardware-scan' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => handleModeChange('hardware-scan')}
          sx={{ textTransform: 'none' }}
        >
          Hardware Scan
        </Button>
      </Stack>
      
      <Box sx={{ 
        width: '100%', 
        maxWidth: mode === 'audio-controls' ? '900px' : mode === 'normal' ? '600px' : mode === 'audio-speaker' ? '800px' : '450px', 
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: 'center',
      }}>
        {/* Audio Controls - Exact context reproduction */}
        {mode === 'audio-controls' ? (
          <Box sx={{
            width: '100%',
            maxWidth: '900px',
            height: '600px',
            bgcolor: '#f5f5f5',
            borderRadius: '16px',
            p: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'row',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}>
            {/* Left column (450px) - Exact reproduction */}
            <Box
              sx={{
                width: '450px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                px: 3,
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarGutter: 'stable',
                position: 'relative',
                zIndex: 1,
                height: '100%',
                bgcolor: '#f5f5f5',
                '&::-webkit-scrollbar': {
                  width: '6px',
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'rgba(0, 0, 0, 0.1)',
                  borderRadius: '3px',
                },
                '&:hover::-webkit-scrollbar-thumb': {
                  background: 'rgba(0, 0, 0, 0.15)',
                },
              }}
            >
              {/* Audio Controls - Exact reproduction */}
              <Box sx={{ width: '100%', mt: 4 }}>
                <AudioControls
                  volume={75}
                  microphoneVolume={50}
                  onVolumeChange={(val) => console.log('Volume:', val)}
                  onMicrophoneChange={(enabled) => console.log('Microphone:', enabled)}
                  darkMode={false}
                />
              </Box>
            </Box>

            {/* Right column - Empty space to match exact layout */}
            <Box
              sx={{
                flex: 1,
                bgcolor: '#ffffff',
                height: '100%',
              }}
            />
          </Box>
        ) : mode === 'audio-speaker' ? (
          <Box sx={{ 
            width: '100%', 
            maxWidth: '600px',
            height: '200px',
            bgcolor: '#1a1a1a',
            borderRadius: '12px',
            p: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AudioLevelBars 
              isActive={true} 
              color="rgba(255, 255, 255, 0.35)" 
              barCount={8} 
            />
          </Box>
        ) : (
        <Box sx={{ 
          width: '100%', 
          height: mode === 'normal' ? '400px' : '380px',
        }}>
          {mode === 'normal' ? (
            <Viewer3D 
              key="normal-view"
              isActive={true}
              initialMode="normal"
              forceLoad={true}
              enableDebug={true}
              forceLevaOpen={true}
              useHeadFollowCamera={false}
              useCinematicCamera={false}
            />
          ) : mode === 'scan' ? (
            <Viewer3D 
              key="scan-view"
              isActive={false}
              initialMode="xray"
              hideControls={true}
              forceLoad={true}
              hideGrid={true}
              hideBorder={true}
              showScanEffect={false}
              cameraPreset="scan"
              useCinematicCamera={false}
              enableDebug={true}
              forceLevaOpen={true}
            />
          ) : (
            <Viewer3D 
              key="hardware-scan-view"
              isActive={true}
              antennas={[-10, -10]}
              initialMode="xray"
              hideControls={true}
              forceLoad={true}
              hideGrid={true}
              hideBorder={true}
              showScanEffect={!scanError}
              onScanComplete={handleScanComplete}
              onScanMesh={handleScanMesh}
              cameraPreset="scan"
              useCinematicCamera={true}
              enableDebug={true}
              forceLevaOpen={true}
              errorFocusMesh={errorMesh}
              onMeshesReady={handleMeshesReady}
            />
          )}
        </Box>
        )}

        {/* Hardware Scan Progress UI */}
        {mode === 'hardware-scan' && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
              width: '100%',
              maxWidth: '400px',
            }}
          >
            {/* Error UI */}
            {scanError ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.5,
                  maxWidth: '360px',
                  minHeight: '90px',
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  Hardware Error
                </Typography>
                
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#333',
                      lineHeight: 1.5,
                    }}
                  >
                    {scanError.action ? (
                      <>
                        <Box component="span" sx={{ fontWeight: 700 }}>Check</Box> the{' '}
                        <Box component="span" sx={{ fontWeight: 700 }}>camera cable</Box> connection and{' '}
                        <Box component="span" sx={{ fontWeight: 700 }}>restart</Box>
                      </>
                    ) : (
                      'Hardware error detected'
                    )}
                  </Typography>
                </Box>
                
                {scanError.code && (
                  <Typography
                    sx={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: '#999',
                      fontFamily: 'monospace',
                      bgcolor: 'rgba(239, 68, 68, 0.05)',
                      px: 1.5,
                      py: 0.5,
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    {scanError.code}
                  </Typography>
                )}
              </Box>
            ) : (
              /* Normal scan progress */
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {scanComplete ? (
                  // ✅ Success checkmark
                  <CheckCircleIcon
                    sx={{
                      fontSize: 18,
                      color: '#16a34a',
                    }}
                  />
                ) : (
                  // 🔄 Spinner en cours
                  <CircularProgress 
                    size={16} 
                    thickness={4} 
                    sx={{ 
                      color: 'rgba(0, 0, 0, 0.3)',
                    }} 
                  />
                )}
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: scanComplete ? '#16a34a' : '#333',
                    letterSpacing: '0.2px',
                    transition: 'color 0.3s ease',
                  }}
                >
                  {scanComplete ? 'Scan complete' : 'Scanning hardware'}
                </Typography>
                {!scanComplete && (
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#999',
                      fontFamily: 'monospace',
                      ml: 0.5,
                    }}
                  >
                    {scanProgress.current}/{scanProgress.total}
                  </Typography>
                )}
              </Box>
            )}

            {/* Toggle Error Button */}
            <Button
              variant={scanError ? 'contained' : 'outlined'}
              color={scanError ? 'error' : 'primary'}
              size="small"
              onClick={handleToggleError}
              sx={{
                textTransform: 'none',
                mt: 1,
              }}
            >
              {scanError ? 'Clear Error' : 'Trigger Error'}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

