import React, { useState, useCallback } from 'react';
import { Box, Typography, Button, Stack, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Viewer3D from './viewer3d';
import { getShortComponentName } from '../utils/componentNames';

/**
 * Page de développement pour tester le RobotViewer3D en isolation
 * Accès automatique via http://localhost:5173/#dev
 */
export default function DevPlayground() {
  const [mode, setMode] = useState('normal'); // 'normal', 'scan' ou 'hardware-scan'
  const [currentComponent, setCurrentComponent] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanComplete, setScanComplete] = useState(false); // Scan completed successfully

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

  const handleModeChange = (newMode) => {
    setMode(newMode);
    // Reset scan state when changing mode
    setCurrentComponent(null);
    setScanProgress({ current: 0, total: 0 });
    setScanComplete(false);
  };

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
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#333' }}>
        🔬 Dev Playground
      </Typography>
      
      <Stack direction="row" spacing={2}>
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
        maxWidth: mode === 'normal' ? '600px' : '450px', 
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: 'center',
      }}>
        {/* 3D Viewer */}
        <Box sx={{ 
          width: '100%', 
          height: mode === 'normal' ? '400px' : '380px',
        }}>
          {mode === 'normal' ? (
            <Viewer3D 
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
              isActive={true}
              antennas={[-10, -10]}
              initialMode="xray"
              hideControls={true}
              forceLoad={true}
              hideGrid={true}
              hideBorder={true}
              showScanEffect={true}
              onScanComplete={handleScanComplete}
              onScanMesh={handleScanMesh}
              cameraPreset="scan"
              useCinematicCamera={true}
              enableDebug={true}
              forceLevaOpen={true}
            />
          )}
        </Box>

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
            {/* Titre + spinner/checkmark + compteur discret */}
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
          </Box>
        )}
      </Box>
    </Box>
  );
}

