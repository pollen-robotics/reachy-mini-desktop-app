import React, { useState, useCallback } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import RobotViewer3D from './viewer3d/RobotViewer3D';
import { getShortComponentName } from '../utils/componentNames';

/**
 * Page de développement pour tester le RobotViewer3D en isolation
 * Accès automatique via http://localhost:5173/#dev
 */
export default function DevPlayground() {
  const [mode, setMode] = useState('normal'); // 'normal' ou 'scan'

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
          onClick={() => setMode('normal')}
          sx={{ textTransform: 'none' }}
        >
          3D Viewer
        </Button>
        <Button 
          variant={mode === 'scan' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => setMode('scan')}
          sx={{ textTransform: 'none' }}
        >
          Scan View
        </Button>
      </Stack>
      
      <Box sx={{ width: '100%', maxWidth: mode === 'normal' ? '600px' : '450px', height: mode === 'normal' ? '400px' : '380px' }}>
        {mode === 'normal' ? (
          <RobotViewer3D 
            isActive={true}
            forceLoad={true}
            enableDebug={true}
            forceLevaOpen={true}
            useHeadFollowCamera={false}
            useCinematicCamera={false}
          />
        ) : (
          <RobotViewer3D 
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
        )}
      </Box>
    </Box>
  );
}

