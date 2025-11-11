import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

// 🎨 DÉTECTION AUTOMATIQUE DU MODE
// Si on accède via http://localhost:5173/dev → DevPlayground
// Sinon → App normale
const isDevPath = window.location.pathname === '/dev' || window.location.hash === '#dev';
const DEV_MODE = isDevPath;

// Mock Tauri APIs si pas dans Tauri (navigateur)
if (typeof window !== 'undefined' && !window.__TAURI__) {
  console.log('🔧 Mocking Tauri APIs for browser dev...');
  
  window.__TAURI__ = {
    core: {
      invoke: (cmd, args) => {
        console.log(`[MOCK] Tauri invoke: ${cmd}`, args);
        return Promise.resolve({ status: 'mocked' });
      }
    }
  };
  
  const mockWindow = {
    startDragging: () => {
      console.log('[MOCK] Window dragging');
      return Promise.resolve();
    },
    label: 'dev-window'
  };
  
  window.mockGetCurrentWindow = () => mockWindow;
}

import App from './components/App';
import DevPlayground from './components/DevPlayground';
import robotModelCache from './utils/robotModelCache';

// 🚀 Précharger le modèle 3D du robot (FORCER le rechargement complet)
robotModelCache.clear();
console.log('🧹 Robot cache cleared - FORCE RELOAD');

// Attendre un peu pour s'assurer que le clear est effectif
setTimeout(() => {
  console.log('🚀 Preloading robot 3D model...');
  robotModelCache.load().then(() => {
    console.log('✅ Robot 3D model preloaded and cached');
  }).catch((err) => {
    console.error('❌ Failed to preload robot model:', err);
  });
}, 100);

const theme = createTheme({
  palette: {
    mode: 'light',
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
    divider: 'rgba(0, 0, 0, 0.18)', // Bordures uniformes et contrastées
  },
});

// Choisir le composant à afficher
const RootComponent = DEV_MODE ? DevPlayground : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ width: '100%', height: '100%' }}>
        <RootComponent />
      </div>
    </ThemeProvider>
  </React.StrictMode>
);

