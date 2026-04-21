/**
 * Window Manager - Dedicated Tauri windows for robot app web UIs.
 *
 * Manages the full lifecycle: create -> focus -> close -> cleanup.
 * Each app gets at most one window; re-opening focuses the existing one.
 *
 * Cleanup is driven by Tauri events (destroyed / error) so the cache stays in
 * sync even when a window is closed via its native controls.
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getAllWindows } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../store/useAppStore';

const APP_WINDOW_PREFIX = 'app-';
const CASCADE_STEP = 20; // logical px offset per window

const windowRefs: Map<string, WebviewWindow> = new Map();
let cascadeIndex = 0;

export interface OpenAppWindowOptions {
  width?: number;
  height?: number;
}

/**
 * Convert an app name to a valid Tauri window label. Tauri labels must be
 * alphanumeric / dashes / underscores only.
 */
function appNameToLabel(appName: string): string {
  return APP_WINDOW_PREFIX + appName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

/**
 * Resolve a window reference with layered fallbacks:
 * 1. Module cache 2. Tauri label lookup 3. Full enumeration.
 */
async function resolveWindow(label: string): Promise<WebviewWindow | null> {
  const cached = windowRefs.get(label);
  if (cached) return cached;

  try {
    const win = await WebviewWindow.getByLabel(label);
    if (win) {
      windowRefs.set(label, win);
      return win;
    }
  } catch {
    // Label lookup unavailable - try enumeration
  }

  try {
    const all = await getAllWindows();
    const win = all.find(w => w.label === label);
    if (win) {
      windowRefs.set(label, win as unknown as WebviewWindow);
      return win as unknown as WebviewWindow;
    }
  } catch {
    // Enumeration failed - give up
  }

  return null;
}

/** Remove all traces of a window from caches and Zustand store. */
function purge(label: string): void {
  windowRefs.delete(label);
  try {
    useAppStore.getState().removeOpenWindow?.(label);
  } catch {
    // Store may be unavailable after HMR
  }

  const hasAppWindows = [...windowRefs.keys()].some(l => l.startsWith(APP_WINDOW_PREFIX));
  if (!hasAppWindows) cascadeIndex = 0;
}

/** Close a window with retry and dual-strategy fallback (JS -> Rust). */
async function closeByLabel(label: string, maxAttempts = 2): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const win = await resolveWindow(label);
    if (!win) {
      purge(label);
      return;
    }

    try {
      await win.close();
      purge(label);
      return;
    } catch {
      // JS close failed - fall through to Rust
    }

    try {
      await invoke('close_window', { windowLabel: label });
      purge(label);
      return;
    } catch {
      // Both strategies failed - retry after short delay
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 100 * attempt));
    }
  }

  purge(label);
}

/**
 * Open an app's web interface in a dedicated Tauri window. If the window
 * already exists it is focused instead of re-created. Falls back to `null` on
 * failure so callers can open a browser tab.
 */
export async function openAppWindow(
  appName: string,
  url: string,
  options: OpenAppWindowOptions = {}
): Promise<WebviewWindow | null> {
  const label = appNameToLabel(appName);

  const existing = await resolveWindow(label);
  if (existing) {
    try {
      await existing.setFocus();
      return existing;
    } catch {
      purge(label);
    }
  }

  const offset = cascadeIndex * CASCADE_STEP;

  try {
    const win = new WebviewWindow(label, {
      url,
      title: appName,
      width: options.width ?? 900,
      height: options.height ?? 700,
      center: true,
      resizable: true,
      decorations: true,
      focus: true,
    });

    windowRefs.set(label, win);
    cascadeIndex++;

    void win.once('tauri://created', async () => {
      if (offset > 0) {
        try {
          const factor = await win.scaleFactor();
          const pos = await win.outerPosition();
          const px = Math.round(offset * factor);
          await win.setPosition(new PhysicalPosition(pos.x + px, pos.y + px));
        } catch {
          // Positioning is best-effort
        }
      }
      try {
        useAppStore.getState().addOpenWindow?.(label);
      } catch {
        // Store unavailable
      }
    });

    void win.once('tauri://error', () => purge(label));
    void win.once('tauri://destroyed', () => purge(label));

    return win;
  } catch {
    purge(label);
    return null;
  }
}

/** Close a specific app's window by app name. */
export async function closeAppWindow(appName: string): Promise<void> {
  await closeByLabel(appNameToLabel(appName));
}

/** Close every open app window (e.g. on robot disconnect). */
export async function closeAllAppWindows(): Promise<void> {
  const labels = [...windowRefs.keys()].filter(l => l.startsWith(APP_WINDOW_PREFIX));
  await Promise.allSettled(labels.map(l => closeByLabel(l)));
}
