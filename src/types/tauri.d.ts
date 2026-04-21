/**
 * Minimal ambient declarations for `window.__TAURI__`.
 *
 * In Tauri runtime the real internals are injected by the Tauri shell.
 * In web mode ([src/main.tsx](../main.tsx) installs a mock), a small
 * `invoke` shim is used.
 *
 * We keep this loose (`unknown`) on purpose - typed API calls should go
 * through `@tauri-apps/api/core`'s `invoke<T>()` at the call site rather
 * than relying on `window.__TAURI__` directly.
 */
declare global {
  interface MockTauriWindow {
    startDragging: () => Promise<void>;
    label: string;
  }

  interface Window {
    __TAURI__?: {
      core?: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      [key: string]: unknown;
    };
    __TAURI_INTERNALS__?: unknown;
    mockGetCurrentWindow?: () => MockTauriWindow;
  }
}

export {};
