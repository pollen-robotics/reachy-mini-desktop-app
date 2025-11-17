import React, { useState, useCallback, useRef, useEffect, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton } from '@mui/material';

/**
 * ViewportSwapper Component
 * Manages the display of two views (3D and Camera) with swap capability
 * Uses React Portals to avoid component duplication
 * 
 * Architecture:
 * - Two DOM containers: mainViewport and smallViewport
 * - Components are rendered only once
 * - Portals "teleport" them to the correct container based on swapped state
 */
export default function ViewportSwapper({
  view3D,           // ReactNode: the 3D component (Viewer3D)
  viewCamera,       // ReactNode: the camera component (CameraFeed)
  onSwap,           // Optional callback when swap occurs
  initialSwapped = false, // Initial swap state
}) {
  const [isSwapped, setIsSwapped] = useState(initialSwapped);
  const mainViewportRef = useRef(null);
  const smallViewportRef = useRef(null);
  
  // Camera aspect ratio (640x480 = 4:3)
  const cameraAspectRatio = 640 / 480; // 1.333...
  
  // Handle swap
  const handleSwap = useCallback(() => {
    setIsSwapped(prev => !prev);
    if (onSwap) {
      onSwap(!isSwapped);
    }
  }, [isSwapped, onSwap]);
  
  // Props for views based on their size
  const view3DSmallProps = {
    hideControls: true,
    showStatusTag: false,
    hideEffects: true,
    // Keep the same camera as the main view
  };
  
  const viewCameraSmallProps = {
    isLarge: false,
    width: 120,
    height: 90,
  };
  
  // Clone components with appropriate props
  const view3DMain = view3D;
  const view3DSmall = cloneElement(view3D, view3DSmallProps);
  const viewCameraMain = viewCamera;
  const viewCameraSmall = cloneElement(viewCamera, viewCameraSmallProps);
  
  // The two views to display (decided based on swapped state)
  const mainView = isSwapped ? viewCameraMain : view3DMain;
  const smallView = isSwapped ? view3DSmall : viewCameraSmall;
  
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        // If camera is displayed, use 4:3 aspect ratio
        // Otherwise, let height adapt with minHeight for 3D viewer
        ...(isSwapped ? {
          aspectRatio: `${cameraAspectRatio}`,
        } : {
          height: '100%',
          minHeight: 280, // Minimum height for 3D viewer
        }),
      }}
    >
      {/* Main viewport (large) */}
      <Box
        ref={mainViewportRef}
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          overflow: 'visible',
          position: 'relative',
        }}
      />
      
      {/* Small viewport (bottom right, overlapping the viewer) */}
      <Box
        sx={{
          position: 'absolute',
          bottom: -45,
          right: 12,
          width: 120,
          height: 90,
          zIndex: 10,
        }}
      >
        <Box
          ref={smallViewportRef}
          sx={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            position: 'relative',
          }}
        />
        
        {/* Swap button on small viewport */}
        <IconButton
          onClick={handleSwap}
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            minWidth: 20,
            bgcolor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(4px)',
            color: '#fff',
            fontSize: '14px',
            padding: 0,
            zIndex: 10,
            transition: 'all 0.2s ease',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.5)',
              transform: 'scale(1.2)',
            },
          }}
          title="Swap video and 3D view"
        >
          ⇄
        </IconButton>
      </Box>
      
      {/* Portals: teleport views to containers */}
      {mainViewportRef.current && createPortal(
        <Box sx={{ width: '100%', height: '100%' }}>
          {mainView}
        </Box>,
        mainViewportRef.current
      )}
      
      {smallViewportRef.current && createPortal(
        <Box sx={{ width: '100%', height: '100%' }}>
          {smallView}
        </Box>,
        smallViewportRef.current
      )}
    </Box>
  );
}

