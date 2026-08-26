import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import useAppStore from '../../store/useAppStore';
import type { FullAppState } from '../../store/useStore';
import { getAppWindow } from '../../utils/windowUtils';

/** Fixed design height of every view (matches useWindowResize). */
const DESIGN_HEIGHT = 670;

/** How much of the window's height growth becomes zoom (0 = never, 1 = fill height). */
const ZOOM_DAMPEN = 0.3;
/** Clamp so tiny windows don't vanish and huge monitors don't over-zoom. */
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 1.25;
/** Skip a setZoom whose change from the last applied value is imperceptible. */
const ZOOM_EPSILON = 0.002;

/**
 * Bridges the store `isFullscreen` flag with the real OS window fullscreen state
 * in both directions, wires keyboard shortcuts (F11 toggles, Esc exits), and
 * scales the whole UI to fill the screen while fullscreen via webview zoom.
 *
 * The layout itself is fluid (fills the window width), so zoom only controls
 * magnification: it scales the whole UI up/down with the window height so a
 * larger/fullscreen window gets a bigger UI. Crisp, since page zoom re-renders.
 *
 * Call once from the app root.
 */
export function useFullscreenSync(): void {
  const isFullscreen = useAppStore((state: FullAppState) => state.isFullscreen);

  // Store -> OS window. Tauri restores the prior window size automatically on
  // exit, and useWindowResize won't fight it (the view name doesn't change).
  useEffect(() => {
    if (!window.__TAURI__) return;
    void (async () => {
      try {
        await getAppWindow().setFullscreen(isFullscreen);
      } catch {
        // Window may have just closed, or there is no real Tauri window.
      }
    })();
  }, [isFullscreen]);

  // Whole-UI magnification via webview zoom. Page zoom re-renders the document at
  // the target scale (crisp text/UI, unlike a CSS transform). The layout is fluid
  // and fills the width on its own, so zoom only sets "how big" — scaled to the
  // window HEIGHT so a taller / fullscreen window gets a proportionally bigger UI.
  //
  // Viewport-driven (NOT gated on `isFullscreen`) so it also responds to plain
  // corner-drag resizing and native-fullscreen-as-maximize.
  //
  // The zoom is applied *directly* (no easing) so the UI scales in exact lockstep
  // with the window frame. Fullscreen enter/exit on macOS is an instant frame jump
  // (a single resize event, not an animation), so easing the zoom toward it left
  // the content still scaling for ~180ms after the frame had already settled — a
  // visible bounce. Snapping instead keeps content and frame in sync: instant when
  // the frame is instant, smooth-tracking during a continuous drag.
  //
  // The remaining smoothness guard is single-flight reads: a `resize` burst can't
  // spawn overlapping innerSize()/scaleFactor() IPC calls that resolve out of order
  // and apply a stale (smaller) zoom after a newer one (the original "jumping").
  // A `pending` flag coalesces the burst into one re-read of the latest size.
  useEffect(() => {
    if (!window.__TAURI__) return;
    let cancelled = false;
    let appliedZoom = 1; // last value actually pushed to the webview
    let reading = false; // single-flight guard for the IPC size reads
    let pending = false; // a resize arrived mid-read → re-read once we're done

    const computeTargetZoom = async (): Promise<number> => {
      // OS window physical size (zoom-independent) → logical CSS px. Using this
      // rather than window.innerHeight (which setZoom itself changes) avoids a
      // feedback loop.
      const appWindow = getAppWindow();
      const size = await appWindow.innerSize();
      const scaleFactor = await appWindow.scaleFactor();
      const logicalH = size.height / scaleFactor;
      // Gentle magnification: the fluid layout already fills the window, so zoom is
      // just a light size bump for larger windows — NOT a fill-to-height. Only a
      // fraction of the height growth becomes zoom, clamped so it never feels
      // "zoomed in".
      const fit = logicalH / DESIGN_HEIGHT;
      const raw = 1 + (fit - 1) * ZOOM_DAMPEN;
      const clamped = Number.isFinite(raw) ? Math.min(Math.max(raw, ZOOM_MIN), ZOOM_MAX) : 1;
      return clamped;
    };

    const applyZoom = async (): Promise<void> => {
      if (cancelled) return;
      if (reading) {
        // A read is in flight; remember to re-read the newest size afterwards so
        // the end of a resize isn't dropped.
        pending = true;
        return;
      }
      reading = true;
      let target = appliedZoom;
      try {
        do {
          pending = false;
          target = await computeTargetZoom();
        } while (pending && !cancelled);
      } catch {
        // Zoom is best-effort; ignore transient window errors.
        return;
      } finally {
        reading = false;
      }
      if (cancelled) return;
      // Snap straight to the target; skip imperceptible changes to avoid churning
      // setZoom (which re-renders the document) on sub-pixel resize jitter.
      if (Math.abs(target - appliedZoom) >= ZOOM_EPSILON) {
        appliedZoom = target;
        void getCurrentWebview()
          .setZoom(target)
          .catch(() => {});
      }
    };

    void applyZoom();

    // Recompute on every window resize (fullscreen enter/exit, display change).
    const onResize = (): void => {
      void applyZoom();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // OS window -> store: keep state correct when the user enters/exits fullscreen
  // via native gestures (macOS green button, Ctrl+Cmd+F, Esc).
  useEffect(() => {
    if (!window.__TAURI__) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    try {
      const appWindow = getCurrentWindow();
      appWindow
        .onResized(async () => {
          try {
            const actual = await appWindow.isFullscreen();
            const state = useAppStore.getState();
            if (actual !== state.isFullscreen) {
              state.setFullscreen(actual);
            }
          } catch {
            // ignore transient window errors
          }
        })
        .then(fn => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => {
          // ignore listener registration errors
        });
    } catch {
      // ignore
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Keyboard shortcuts: F11 toggles, Esc exits when fullscreen.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault();
        useAppStore.getState().toggleFullscreen();
      } else if (e.key === 'Escape' && useAppStore.getState().isFullscreen) {
        e.preventDefault();
        useAppStore.getState().setFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
