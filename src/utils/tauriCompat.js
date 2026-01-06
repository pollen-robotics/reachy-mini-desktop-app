/**
 * Tauri Compatibility Layer
 * 
 * Provides fallbacks for Tauri APIs when running in web-only mode.
 * In web mode, we use fetch() to call the daemon's REST API directly.
 * 
 * Usage:
 *   import { invoke, listen, isWebMode } from '@utils/tauriCompat';
 */

// Detect if we're running in Tauri or pure web mode
export const isWebMode = typeof window !== 'undefined' && !window.__TAURI__;

// Base URL for API calls in web mode (daemon runs on same host)
const API_BASE_URL = '';

/**
 * Invoke a Tauri command or fallback to REST API
 * In web mode, maps Tauri commands to REST endpoints
 */
export const invoke = async (command, args = {}) => {
  if (!isWebMode) {
    // Use real Tauri invoke
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke(command, args);
  }

  // Web mode: map Tauri commands to REST API calls
  
  
  // Map common Tauri commands to REST endpoints
  const commandMap = {
    // Daemon commands
    'start_daemon': { method: 'POST', url: '/api/daemon/start' },
    'stop_daemon': { method: 'POST', url: '/api/daemon/stop' },
    'get_daemon_status': { method: 'GET', url: '/api/daemon/status' },
    
    // App commands
    'install_app': { method: 'POST', url: '/api/apps/install' },
    'uninstall_app': { method: 'POST', url: '/api/apps/uninstall' },
    'start_app': { method: 'POST', url: '/api/apps/start' },
    'stop_app': { method: 'POST', url: '/api/apps/stop' },
    'list_apps': { method: 'GET', url: '/api/apps/list' },
    
    // Sign binaries (macOS specific - no-op in web mode)
    'sign_python_binaries': { method: 'GET', url: null, noop: true },
  };

  const mapping = commandMap[command];
  
  if (!mapping) {
    console.warn(`[WebMode] Unknown command: ${command}, returning null`);
    return null;
  }
  
  if (mapping.noop) {
    
    return { success: true };
  }

  try {
    const options = {
      method: mapping.method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (mapping.method !== 'GET' && Object.keys(args).length > 0) {
      options.body = JSON.stringify(args);
    }
    
    const response = await fetch(`${API_BASE_URL}${mapping.url}`, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[WebMode] invoke error for ${command}:`, error);
    throw error;
  }
};

/**
 * Listen to Tauri events or fallback to polling/EventSource
 * In web mode, we use polling for simplicity
 */
export const listen = async (event, callback) => {
  if (!isWebMode) {
    // Use real Tauri listen
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen(event, callback);
  }

  
  
  // Web mode: use polling for sidecar events
  // For sidecar-stdout/stderr, we don't have real-time events in web mode
  // The app logs are fetched via REST API instead
  
  if (event === 'sidecar-stdout' || event === 'sidecar-stderr') {
    // Return a no-op unlisten function
    // App logs are handled differently in web mode (polling via REST)
    return () => {};
  }

  // For other events, return no-op
  console.warn(`[WebMode] Event ${event} not supported in web mode`);
  return () => {};
};

/**
 * Emit a Tauri event (no-op in web mode)
 */
export const emit = async (event, payload) => {
  if (!isWebMode) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    return tauriEmit(event, payload);
  }
  
  
  // No-op in web mode
};

/**
 * Get current window (mock in web mode)
 */
export const getCurrentWindow = () => {
  if (!isWebMode) {
    // Dynamic import for Tauri
    return import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
  }
  
  // Mock window object for web mode
  return {
    label: 'main',
    setTitle: async () => {},
    setSize: async () => {},
    setPosition: async () => {},
    center: async () => {},
    close: async () => {},
    minimize: async () => {},
    maximize: async () => {},
    isMaximized: async () => false,
    isMinimized: async () => false,
    show: async () => {},
    hide: async () => {},
    setFocus: async () => {},
  };
};

/**
 * Open URL in browser
 */
export const openUrl = async (url) => {
  if (!isWebMode) {
    const { open } = await import('@tauri-apps/plugin-shell');
    return open(url);
  }
  
  // Web mode: use window.open
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Get app version (mock in web mode)
 */
export const getVersion = async () => {
  if (!isWebMode) {
    const { getVersion: tauriGetVersion } = await import('@tauri-apps/api/app');
    return tauriGetVersion();
  }
  
  // Web mode: fetch from daemon status
  try {
    const response = await fetch('/api/daemon/status');
    const data = await response.json();
    return data.version || 'web';
  } catch {
    return 'web';
  }
};

export default {
  isWebMode,
  invoke,
  listen,
  emit,
  getCurrentWindow,
  openUrl,
  getVersion,
};

