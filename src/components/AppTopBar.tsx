import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import { getAppWindow } from '../utils/windowUtils';
import { getVersion } from '@utils/tauriCompat';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '../store/useAppStore';

/**
 * Common TopBar component for all views
 * Displays app version and handles window dragging
 *
 * Uses a React Portal to render directly in the body, ensuring it stays
 * above MUI Modals (which also use portals) regardless of parent stacking context.
 */
export default function AppTopBar(): React.ReactPortal {
  const { darkMode, connectionMode, rightPanelView } = useAppStore();
  const [currentVersion, setCurrentVersion] = useState<string | null>('');
  const [isMainWindow, setIsMainWindow] = useState<boolean>(true);
  const appWindow = getAppWindow();

  const isConnected = connectionMode !== null;

  useEffect(() => {
    getVersion()
      .then((v: string | null | undefined) => setCurrentVersion(v ?? null))
      .catch(() => {
        setCurrentVersion(null);
      });

    const checkWindow = async (): Promise<void> => {
      try {
        const w = await getCurrentWindow();
        setIsMainWindow(w.label === 'main');
      } catch {
        setIsMainWindow(true);
      }
    };

    checkWindow();
  }, []);

  // Render via portal to escape parent stacking context.
  // z-index 10000000 keeps AppTopBar above all modals so drag always works.
  // Any interactive element that must be clickable within the top 33px of a modal
  // (e.g. a close button) must be rendered at z-index > 10000000, typically via
  // its own portal (see FullscreenOverlay).
  return createPortal(
    <Box
      onMouseDown={async (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        try {
          await appWindow.startDragging();
        } catch (err) {
          console.error('Drag error:', err);
        }
      }}
      sx={{
        position: 'fixed',
        top: 0,
        left: 65,
        right: rightPanelView === 'embedded-app' ? '450px' : 0,
        height: 33,
        cursor: 'move',
        userSelect: 'none',
        WebkitAppRegion: 'drag',
        bgcolor: 'transparent',
        zIndex: 10000000,
        transition: 'right 0.15s ease',
      }}
    >
      {isMainWindow && !isConnected && (
        <Typography
          sx={{
            position: 'absolute',
            top: 10,
            right: 12,
            fontSize: 9,
            color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
            fontWeight: 500,
            letterSpacing: '0.02em',
            pointerEvents: 'none',
            fontFamily: 'SF Mono, Monaco, Menlo, monospace',
            lineHeight: 1.2,
          }}
        >
          {currentVersion ? `v${currentVersion}` : 'unknown version'}
        </Typography>
      )}
    </Box>,
    document.body
  );
}
