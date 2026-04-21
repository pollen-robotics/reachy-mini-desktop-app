/**
 * Tauri Compatibility Layer.
 *
 * Provides fallbacks for Tauri APIs when running in web-only mode.
 * In web mode, we use fetch() to call the daemon's REST API directly.
 *
 * Usage:
 *
 * ```ts
 * import { invoke, listen, isWebMode } from '@utils/tauriCompat';
 * ```
 */

import type { EventCallback, UnlistenFn } from '@tauri-apps/api/event';

// ============================================================================
// MODE DETECTION
// ============================================================================

/** True when the app is running in a plain browser (no Tauri runtime injected). */
export const isWebMode: boolean =
  typeof window !== 'undefined' && !(window as Window & { __TAURI__?: unknown }).__TAURI__;

// Base URL for API calls in web mode (daemon runs on same host).
const API_BASE_URL = '';

// ============================================================================
// COMMAND ↔ REST MAPPING
// ============================================================================

interface CommandMapping {
  method: 'GET' | 'POST';
  url: string | null;
  noop?: boolean;
}

const commandMap: Record<string, CommandMapping> = {
  // Daemon commands
  start_daemon: { method: 'POST', url: '/api/daemon/start' },
  stop_daemon: { method: 'POST', url: '/api/daemon/stop' },
  get_daemon_status: { method: 'GET', url: '/api/daemon/status' },

  // App commands
  install_app: { method: 'POST', url: '/api/apps/install' },
  uninstall_app: { method: 'POST', url: '/api/apps/uninstall' },
  start_app: { method: 'POST', url: '/api/apps/start' },
  stop_app: { method: 'POST', url: '/api/apps/stop' },
  list_apps: { method: 'GET', url: '/api/apps/list' },

  // Environment reset (Tauri-only - no-op in web mode)
  reset_apps_venv: { method: 'GET', url: null, noop: true },
  reset_python_env: { method: 'GET', url: null, noop: true },

  // External daemon mode flag (Rust-side only - no-op in web mode)
  set_daemon_external_mode: { method: 'GET', url: null, noop: true },
};

// ============================================================================
// INVOKE
// ============================================================================

/**
 * Invoke a Tauri command, or fall back to the REST API in web mode.
 */
export const invoke = async <T = unknown>(
  command: string,
  args: Record<string, unknown> = {}
): Promise<T | null> => {
  if (!isWebMode) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(command, args);
  }

  const mapping = commandMap[command];

  if (!mapping) {
    console.warn(`[WebMode] Unknown command: ${command}, returning null`);
    return null;
  }

  if (mapping.noop) {
    return { success: true } as unknown as T;
  }

  if (!mapping.url) return null;

  try {
    const options: RequestInit = {
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

    return (await response.json()) as T;
  } catch (error) {
    console.error(`[WebMode] invoke error for ${command}:`, error);
    throw error;
  }
};

// ============================================================================
// LISTEN / EMIT
// ============================================================================

/**
 * Listen to Tauri events, or fall back to a no-op in web mode.
 *
 * Note: real-time sidecar streams (`sidecar-stdout`, `sidecar-stderr`) are
 * not relayed in web mode; the daemon REST API is queried instead.
 */
export const listen = async <T = unknown>(
  event: string,
  callback: EventCallback<T>
): Promise<UnlistenFn> => {
  if (!isWebMode) {
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen<T>(event, callback);
  }

  if (event === 'sidecar-stdout' || event === 'sidecar-stderr') {
    return () => {};
  }

  console.warn(`[WebMode] Event ${event} not supported in web mode`);
  return () => {};
};

/**
 * Emit a Tauri event (no-op in web mode).
 */
export const emit = async (event: string, payload?: unknown): Promise<void> => {
  if (!isWebMode) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    await tauriEmit(event, payload);
  }
};

// ============================================================================
// WINDOW
// ============================================================================

interface WindowLike {
  label: string;
  setTitle: (title: string) => Promise<void>;
  setSize: (size: unknown) => Promise<void>;
  setPosition: (position: unknown) => Promise<void>;
  center: () => Promise<void>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  isMinimized: () => Promise<boolean>;
  show: () => Promise<void>;
  hide: () => Promise<void>;
  setFocus: () => Promise<void>;
}

/**
 * Get current window. Returns a mock with no-op methods in web mode.
 */
export const getCurrentWindow = (): WindowLike | Promise<unknown> => {
  if (!isWebMode) {
    return import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
  }

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

// ============================================================================
// SHELL / APP
// ============================================================================

/**
 * Open URL in browser (Tauri shell plugin or `window.open` in web mode).
 */
export const openUrl = async (url: string): Promise<void> => {
  if (!isWebMode) {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Get app version. In web mode falls back to the daemon `/api/daemon/status`.
 */
export const getVersion = async (): Promise<string> => {
  if (!isWebMode) {
    const { getVersion: tauriGetVersion } = await import('@tauri-apps/api/app');
    return tauriGetVersion();
  }

  try {
    const response = await fetch('/api/daemon/status');
    const data = (await response.json()) as { version?: string };
    return data.version ?? 'web';
  } catch {
    return 'web';
  }
};

const tauriCompat = {
  isWebMode,
  invoke,
  listen,
  emit,
  getCurrentWindow,
  openUrl,
  getVersion,
} as const;

export default tauriCompat;
