/**
 * Development mode detection utility.
 * Checks if the app is running in development mode.
 */

interface ViteEnv {
  DEV?: boolean;
  MODE?: string;
  TAURI_DEBUG?: boolean | string;
  [key: string]: unknown;
}

/**
 * Detects if the app is running in development mode.
 */
export function isDevMode(): boolean {
  const env = (import.meta as ImportMeta).env as ViteEnv | undefined;

  if (env?.DEV || env?.MODE === 'development') {
    return true;
  }

  if (env?.TAURI_DEBUG === 'true' || env?.TAURI_DEBUG === true) {
    return true;
  }

  if (typeof window !== 'undefined' && !(window as Window & { __TAURI__?: unknown }).__TAURI__) {
    return true;
  }

  return false;
}
