import { getCurrentWindow } from '@tauri-apps/api/window';

type AppWindow = ReturnType<typeof getCurrentWindow>;

/**
 * Get the current app window, with support for a mock window in dev mode.
 */
export function getAppWindow(): AppWindow {
  return window.mockGetCurrentWindow
    ? (window.mockGetCurrentWindow() as unknown as AppWindow)
    : getCurrentWindow();
}
