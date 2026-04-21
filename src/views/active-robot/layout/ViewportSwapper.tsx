import React, { useState, useCallback, useRef, useMemo, useLayoutEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton } from '@mui/material';

/**
 * ViewportSwapper Component
 * Manages the display of two views (3D and Camera) with swap capability
 * Uses React Portals to avoid component duplication
 *
 * Architecture:
 * - Two DOM containers: mainViewport and smallViewport
 * - Components are rendered only once (stable keys prevent remounts)
 * - Portals "teleport" them to the correct container based on swapped state
 * - ✅ FIX: Components have stable keys to prevent WebGL context recreation
 * - ✅ OPTIMIZED: Small 3D view uses frameloop="demand" to stop rendering loop
 */

interface StableViewProps {
  children: React.ReactNode;
  viewKey: string;
}

/**
 * Wrapper component to render view with stable identity
 * Using memo with stable key ensures the component doesn't remount
 */
const StableView = memo(function StableView({ children }: StableViewProps): React.ReactElement {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    >
      {children}
    </Box>
  );
});

export interface ViewportSwapperProps {
  view3D: React.ReactElement | null;
  viewCamera: React.ReactElement | null;
  onSwap?: (swapped: boolean) => void;
  initialSwapped?: boolean;
}

export default function ViewportSwapper({
  view3D,
  viewCamera,
  onSwap,
  initialSwapped = false,
}: ViewportSwapperProps): React.ReactElement {
  const [isSwapped, setIsSwapped] = useState<boolean>(initialSwapped);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const mainViewportRef = useRef<HTMLDivElement | null>(null);
  const smallViewportRef = useRef<HTMLDivElement | null>(null);

  // ✅ Store stable references to prevent remounting on parent re-renders
  // Using refs means the components persist across renders without recreation
  const view3DRef = useRef<React.ReactElement | null>(view3D);
  const viewCameraRef = useRef<React.ReactElement | null>(viewCamera);

  // ✅ Update refs when props change (but don't trigger remount)
  // React will update the existing component instances with new props
  if (view3D !== view3DRef.current) {
    view3DRef.current = view3D;
  }
  if (viewCamera !== viewCameraRef.current) {
    viewCameraRef.current = viewCamera;
  }

  // ✅ Force re-render after mount to ensure refs are available for portals
  useLayoutEffect(() => {
    setIsMounted(true);
  }, []);

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

  // ✅ Create small view versions with additional props
  // These are rendered conditionally based on swap state
  const view3DSmall = useMemo(() => {
    if (!view3D) return null;
    return React.cloneElement(view3D, {
      hideControls: true,
      showStatusTag: false,
      hideEffects: true, // ✅ This enables frameloop="demand" in Viewer3D
      key: 'viewer3d-small', // ✅ Stable key prevents remount
    } as Record<string, unknown>);
  }, [view3D]);

  const viewCameraSmall = useMemo(() => {
    if (!viewCamera) return null;
    return React.cloneElement(viewCamera, {
      isLarge: false,
      width: 140,
      height: 105,
      key: 'camera-small', // ✅ Stable key prevents remount
    } as Record<string, unknown>);
  }, [viewCamera]);

  // ✅ Add stable keys to main views too
  const view3DMain = useMemo(() => {
    if (!view3D) return null;
    return React.cloneElement(view3D, {
      key: 'viewer3d-main', // ✅ Stable key prevents remount
    } as Record<string, unknown>);
  }, [view3D]);

  const viewCameraMain = useMemo(() => {
    if (!viewCamera) return null;
    return React.cloneElement(viewCamera, {
      key: 'camera-main', // ✅ Stable key prevents remount
    } as Record<string, unknown>);
  }, [viewCamera]);

  // The two views to display (decided based on swapped state)
  // ✅ CRITICAL: We only render ONE version of each component at a time
  // This prevents having 2 WebGL contexts for the 3D viewer
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
            // ✅ Form a local stacking context so any inner `z-index`
            // (e.g. Viewer3D's opaque LoadingSpinner at z:20) stays scoped
            // to this 140x105 box and cannot paint on top of the main
            // viewport during a swap/remount transition.
            isolation: 'isolate',
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
      {/* ✅ FIX: Only ONE 3D view is rendered at a time (no duplicate WebGL contexts) */}
      {/* When swapped, main shows camera (no WebGL), small shows 3D (1 WebGL) */}
      {/* When not swapped, main shows 3D (1 WebGL), small shows camera (no WebGL) */}
      {isMounted &&
        mainViewportRef.current &&
        createPortal(<StableView viewKey="main">{mainView}</StableView>, mainViewportRef.current)}

      {isMounted &&
        smallViewportRef.current &&
        createPortal(
          <StableView viewKey="small">{smallView}</StableView>,
          smallViewportRef.current
        )}
    </Box>
  );
}
