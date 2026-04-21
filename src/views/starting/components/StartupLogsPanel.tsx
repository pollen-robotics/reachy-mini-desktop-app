import { Box } from '@mui/material';
import type React from 'react';
import LogConsoleUntyped from '@components/LogConsole';
import FullscreenOverlayUntyped from '../../../components/FullscreenOverlay';

// These two components haven't migrated to TS yet - cast locally.
const FullscreenOverlay = FullscreenOverlayUntyped as unknown as React.FC<{
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  darkMode?: boolean;
  showCloseButton?: boolean;
  centeredY?: boolean;
}>;
const LogConsole = LogConsoleUntyped as unknown as React.FC<Record<string, unknown>>;

export interface StartupLogsPanelProps {
  logs: unknown[];
  darkMode: boolean;
  /**
   * During bootstrap we make the mini console visible (it's the only
   * informative output users have during the long first-run setup).
   */
  prominentMini: boolean;
  /**
   * When the startup pipeline has crashed we intentionally HIDE the mini
   * console: the status card (`ScanErrorDisplay`) now owns all the error
   * context and exposes a "Copy logs" action for developers who need the
   * raw stream, so the floating panel was only visual noise on top.
   */
  hasError?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onClose: () => void;
}

/**
 * Two-in-one logs UI for the startup phase:
 *   - a fixed-position mini console at the bottom of the screen,
 *   - a fullscreen overlay that takes over when the user expands it.
 */
export default function StartupLogsPanel({
  logs,
  darkMode,
  prominentMini,
  hasError = false,
  expanded,
  onExpand,
  onClose,
}: StartupLogsPanelProps): React.ReactElement {
  // Mini console visibility:
  //   - crash         : UNMOUNT (the error card fully owns that state now)
  //   - bootstrap     : mount, opacity 0.8 (long-running, user reassurance)
  //   - normal connect: unmount entirely (nothing to look at, keeps the view clean)
  const showMini = !hasError && prominentMini;
  const miniOpacity = 0.8;

  return (
    <>
      {showMini && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '420px',
            zIndex: 1000,
            opacity: miniOpacity,
            transition: 'opacity 0.3s ease-in-out',
          }}
        >
          <LogConsole
            logs={logs}
            darkMode={darkMode}
            includeStoreLogs={true}
            compact={true}
            showTimestamp={false}
            lines={6}
            emptyMessage="Waiting for logs..."
            onExpand={onExpand}
            sx={{
              bgcolor: darkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />
        </Box>
      )}

      <FullscreenOverlay
        open={expanded}
        onClose={onClose}
        darkMode={darkMode}
        showCloseButton={true}
        centeredY={false}
      >
        <Box
          sx={{
            width: 'calc(100vw - 80px)',
            maxWidth: '1200px',
            height: '82vh',
            maxHeight: '800px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            mt: 'auto',
            mb: 5,
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <LogConsole
              logs={logs}
              darkMode={darkMode}
              includeStoreLogs={true}
              compact={false}
              showTimestamp={true}
              height="100%"
              fullSize={true}
              forceMode="dev"
              emptyMessage="No logs yet..."
            />
          </Box>
        </Box>
      </FullscreenOverlay>
    </>
  );
}
