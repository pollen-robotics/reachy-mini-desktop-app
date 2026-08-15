import { useMemo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import {
  ACCENT,
  STATUS,
  RADIUS,
  DURATION,
  accentAlpha,
  blackAlpha,
  whiteAlpha,
  transition,
} from '@styles/tokens';

// 🎨 AUTOMATIC MODE DETECTION
// VITE_WEB_MODE=true → Web-only dashboard (served by daemon)
// /dev path → DevPlayground
// Otherwise → Normal Tauri App
const isWebMode = import.meta.env.VITE_WEB_MODE === 'true' || !window.__TAURI__;
const isDevPath = window.location.pathname === '/dev' || window.location.hash === '#dev';
const isJournalWindow = window.location.hash === '#journal';
const isLogViewer = window.location.hash === '#log-viewer';
const DEV_MODE = isDevPath && !isWebMode;

// React 19 dev builds emit a performance.measure() per component per commit,
// and the measure timeline is unbounded native memory. This app commits at
// 20Hz, so clear it periodically. Production builds emit no such measures.
if (import.meta.env.DEV) {
  setInterval(() => {
    performance.clearMeasures();
    performance.clearMarks();
  }, 10_000);
}

// Mock Tauri APIs if not in Tauri (browser/web mode)
if (typeof window !== 'undefined' && !window.__TAURI__) {
  window.__TAURI__ = {
    core: {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        console.log('[Mock Tauri] invoke:', cmd, args);
        return Promise.resolve({ status: 'mocked' });
      },
    },
  };

  const mockWindow: MockTauriWindow = {
    startDragging: () => {
      return Promise.resolve();
    },
    label: isWebMode ? 'web-dashboard' : 'dev-window',
  };

  window.mockGetCurrentWindow = () => mockWindow;
}

import App from './components/App';
import DevPlayground from './components/DevPlayground';
import WebApp from './components/WebApp';
import JournalWindow from './views/bluetooth-support/JournalWindow';
import LogViewerWindow from './views/log-viewer/LogViewerWindow';
import ErrorBoundary from './components/ErrorBoundary';
import useAppStore from './store/useAppStore';

// Robot 3D model (glb) is preloaded by GLTFRobot via useGLTF.preload.

// Theme wrapper component that adapts to darkMode
function ThemeWrapper({ children }: { children: ReactNode }) {
  const darkMode = useAppStore((state: { darkMode: boolean }) => state.darkMode);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
          primary: {
            main: ACCENT.main,
            light: ACCENT.light,
            dark: ACCENT.dark,
            contrastText: '#fff',
          },
          secondary: {
            main: '#764ba2',
          },
          success: {
            main: STATUS.success,
          },
          error: {
            main: STATUS.error,
          },
          divider: darkMode ? whiteAlpha(0.12) : blackAlpha(0.18),
        },
        components: {
          MuiButton: {
            defaultProps: {
              disableRipple: false,
            },
            styleOverrides: {
              root: {
                transition: transition('all', DURATION.slow),
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: RADIUS.lg,
              },
              outlined: {
                borderColor: ACCENT.main,
                color: ACCENT.main,
                '&:hover': {
                  borderColor: ACCENT.dark,
                  backgroundColor: accentAlpha(0.08),
                },
              },
            },
          },
          MuiCircularProgress: {
            styleOverrides: {
              root: {
                display: 'block',
              },
              svg: {
                display: 'block',
                overflow: 'visible',
              },
              circle: {
                strokeLinecap: 'round',
              },
            },
          },
          MuiTooltip: {
            styleOverrides: {
              tooltip: {
                backgroundColor: darkMode ? whiteAlpha(0.95) : blackAlpha(0.9),
                color: darkMode ? '#1d1d1f' : '#fff',
                fontSize: '11px',
                fontWeight: 500,
                padding: '10px 14px',
                borderRadius: RADIUS.md,
                boxShadow: darkMode
                  ? `0 4px 12px ${blackAlpha(0.25)}`
                  : `0 4px 12px ${blackAlpha(0.15)}`,
                maxWidth: '300px',
                lineHeight: 1.6,
              },
              arrow: {
                color: darkMode ? whiteAlpha(0.95) : blackAlpha(0.9),
              },
            },
          },
          MuiAccordion: {
            styleOverrides: {
              root: {
                boxShadow: 'none !important',
                backgroundColor: 'transparent !important',
                '&:before': {
                  display: 'none !important',
                },
                '&.Mui-expanded': {
                  boxShadow: 'none !important',
                },
              },
            },
          },
          MuiAccordionSummary: {
            styleOverrides: {
              root: {
                backgroundColor: 'transparent !important',
                '&.Mui-expanded': {
                  backgroundColor: 'transparent !important',
                },
              },
            },
          },
          MuiAccordionDetails: {
            styleOverrides: {
              root: {
                backgroundColor: 'transparent !important',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                '&.MuiAccordion-root': {
                  boxShadow: 'none !important',
                  backgroundColor: 'transparent !important',
                  background: 'transparent !important',
                  '&.Mui-expanded': {
                    backgroundColor: 'transparent !important',
                    background: 'transparent !important',
                  },
                },
                '&.MuiAccordionSummary-root': {
                  backgroundColor: 'transparent !important',
                  background: 'transparent !important',
                  '&.Mui-expanded': {
                    backgroundColor: 'transparent !important',
                    background: 'transparent !important',
                  },
                },
                '&.MuiAccordionDetails-root': {
                  backgroundColor: 'transparent !important',
                  background: 'transparent !important',
                },
              },
            },
          },
        },
      }),
    [darkMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

// Choose component to display based on mode
// Priority: Journal > WebMode > DevMode > Normal App
const RootComponent = isLogViewer
  ? LogViewerWindow
  : isJournalWindow
    ? JournalWindow
    : isWebMode
      ? WebApp
      : DEV_MODE
        ? DevPlayground
        : App;

if (import.meta.env.DEV) {
  console.log(`[Main] Mode: ${isWebMode ? 'WEB' : DEV_MODE ? 'DEV' : 'TAURI'}`);
}

// 🚀 No StrictMode for production robot app
// StrictMode double-invokes effects in dev, causing WebSocket/connection issues
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <ThemeWrapper>
    <ErrorBoundary>
      <div style={{ width: '100%', height: '100%' }}>
        <RootComponent />
      </div>
    </ErrorBoundary>
  </ThemeWrapper>
);
