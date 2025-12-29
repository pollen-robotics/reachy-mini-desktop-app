import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

// 🎨 AUTOMATIC MODE DETECTION
// VITE_WEB_MODE=true → Web-only dashboard (served by daemon)
// /dev path → DevPlayground
// Otherwise → Normal Tauri App
const isWebMode = import.meta.env.VITE_WEB_MODE === 'true' || !window.__TAURI__;
const isDevPath = window.location.pathname === '/dev' || window.location.hash === '#dev';
const DEV_MODE = isDevPath && !isWebMode;

// Mock Tauri APIs if not in Tauri (browser/web mode)
if (typeof window !== 'undefined' && !window.__TAURI__) {
  window.__TAURI__ = {
    core: {
      invoke: (cmd, args) => {
        console.log('[Mock Tauri] invoke:', cmd, args);
        return Promise.resolve({ status: 'mocked' });
      }
    }
  };
  
  const mockWindow = {
    startDragging: () => {
      return Promise.resolve();
    },
    label: isWebMode ? 'web-dashboard' : 'dev-window'
  };
  
  window.mockGetCurrentWindow = () => mockWindow;
}

import App from './components/App';
import DevPlayground from './components/DevPlayground';
import WebApp from './components/WebApp';
import robotModelCache from './utils/robotModelCache';
import useAppStore from './store/useAppStore';

// 🚀 Preload robot 3D model (FORCE complete reload)
robotModelCache.clear();

// Wait a bit to ensure clear is effective
setTimeout(() => {
  robotModelCache.load().catch((err) => {
    console.error('❌ Failed to preload robot model:', err);
  });
}, 100);

// Theme wrapper component that adapts to darkMode
function ThemeWrapper({ children }) {
  const darkMode = useAppStore(state => state.darkMode);
  
  const theme = useMemo(() => createTheme({
  palette: {
      mode: darkMode ? 'dark' : 'light',
    primary: {
      main: '#FF9500',
      light: '#FFB340',
      dark: '#E08500',
      contrastText: '#fff',
    },
    secondary: {
      main: '#764ba2',
    },
    success: {
      main: '#22c55e',
    },
    error: {
      main: '#ef4444',
    },
      divider: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.18)',
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableRipple: false,
        },
        styleOverrides: {
          root: {
            // ✅ Assure que les transitions fonctionnent correctement
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: '10px',
          },
          outlined: {
            // ✅ Style primary outlined par défaut
            borderColor: '#FF9500',
            color: '#FF9500',
            '&:hover': {
              borderColor: '#E08500',
              backgroundColor: 'rgba(255, 149, 0, 0.08)',
            },
          },
        },
      },
      MuiCircularProgress: {
        styleOverrides: {
          root: {
            // ✅ Ensure SVG displays correctly
            display: 'block',
          },
          svg: {
            // ✅ Ensure SVG is not clipped
            display: 'block',
            overflow: 'visible',
          },
          circle: {
            // ✅ Ensure circle is visible
            strokeLinecap: 'round',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)',
            color: darkMode ? '#1d1d1f' : '#fff',
            fontSize: '11px',
            fontWeight: 500,
            padding: '10px 14px',
            borderRadius: '8px',
            boxShadow: darkMode 
              ? '0 4px 12px rgba(0, 0, 0, 0.25)' 
              : '0 4px 12px rgba(0, 0, 0, 0.15)',
            maxWidth: '300px',
            lineHeight: 1.6,
          },
          arrow: {
            color: darkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)',
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
  }), [darkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

// Choose component to display based on mode
// Priority: WebMode > DevMode > Normal App
const RootComponent = isWebMode ? WebApp : (DEV_MODE ? DevPlayground : App);

console.log(`[Main] Mode: ${isWebMode ? 'WEB' : (DEV_MODE ? 'DEV' : 'TAURI')}`);

// 🚀 No StrictMode for production robot app
// StrictMode double-invokes effects in dev, causing WebSocket/connection issues
ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeWrapper>
    <div style={{ width: '100%', height: '100%' }}>
      <RootComponent />
    </div>
  </ThemeWrapper>
);

