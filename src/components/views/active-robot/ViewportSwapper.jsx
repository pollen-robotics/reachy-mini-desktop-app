import React, { useState, useCallback, useRef, useMemo, cloneElement } from 'react';
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
 * - ✅ OPTIMIZED: Memoized cloned views to avoid re-creation on every render
 * - ✅ OPTIMIZED: Small 3D view uses frameloop="demand" to stop rendering loop
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
    setIsSwapped(prev => {
      const newSwapped = !prev;
    if (onSwap) {
        onSwap(newSwapped);
    }
      return newSwapped;
    });
  }, [onSwap]);
  
  // ✅ OPTIMIZED: Memoize cloned views to avoid re-creation on every render
  const view3DSmallProps = useMemo(() => ({
    hideControls: true,
    showStatusTag: false,
    hideEffects: true, // ✅ This enables frameloop="demand" in Viewer3D
  }), []);
  
  const viewCameraSmallProps = useMemo(() => ({
    isLarge: false,
    width: 140,
    height: 105,
  }), []);
  
  // ✅ OPTIMIZED: Memoize cloned components to prevent unnecessary remounts
  const view3DMain = useMemo(() => view3D, [view3D]);
  const view3DSmall = useMemo(() => cloneElement(view3D, view3DSmallProps), [view3D, view3DSmallProps]);
  const viewCameraMain = useMemo(() => viewCamera, [viewCamera]);
  const viewCameraSmall = useMemo(() => cloneElement(viewCamera, viewCameraSmallProps), [viewCamera, viewCameraSmallProps]);
  
  // The two views to display (decided based on swapped state)
  const mainView = isSwapped ? viewCameraMain : view3DMain;
  const smallView = isSwapped ? view3DSmall : viewCameraSmall;
  
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        // Fixed height based on camera aspect ratio to keep consistent height
          aspectRatio: `${cameraAspectRatio}`,
        minHeight: 250, // Minimum height fallback
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
          bottom: -60,
          right: 20,
          width: 140,
          height: 105,
          // z-index hierarchy: 10 = UI controls (small viewport overlay)
          zIndex: 10,
          '&:hover .swap-button': {
            opacity: 1,
          },
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
          className="swap-button"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 20,
            height: 20,
            minWidth: 20,
            bgcolor: 'rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(4px)',
            color: '#fff',
            fontSize: '14px',
            padding: 0,
            zIndex: 10,
            opacity: 0,
            transition: 'all 0.2s ease',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.3)',
              transform: 'scale(1.2)',
            },
          }}
          title="Swap video and 3D view"
        >
          ⇄
        </IconButton>
      </Box>
      
      {/* Portals: teleport views to containers */}
      {/* ✅ OPTIMIZED: Both views are rendered but small 3D view uses frameloop="demand" */}
      {mainViewportRef.current && createPortal(
        <Box 
          sx={{ 
            width: '100%', 
            height: '100%',
            display: 'block',
          }}
        >
          {mainView}
        </Box>,
        mainViewportRef.current
      )}
      
      {smallViewportRef.current && createPortal(
        <Box 
          sx={{ 
            width: '100%', 
            height: '100%',
            display: 'block',
            // ✅ Small view is always rendered but 3D view uses frameloop="demand" when hideEffects=true
            // This stops the rendering loop while keeping the Canvas mounted (avoids remount cost)
          }}
        >
          {smallView}
        </Box>,
        smallViewportRef.current
      )}
    </Box>
  );
}

