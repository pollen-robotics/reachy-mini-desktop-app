import { useEffect, useRef } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';
import { getAppWindow } from '../../utils/windowUtils';
import useAppStore from '../../store/useAppStore';
import type { FullAppState } from '../../store/useStore';

type ViewName = 'compact' | 'expanded';

interface TargetSize {
  width: number;
  height: number;
}

/**
 * Resize the window instantly while keeping it centered.
 *
 * On macOS, animated resizes triggered by setSize() cause flickering.
 * The workaround: resize instantly and recenter explicitly.
 *
 * ⚠️ IMPORTANT: we use scaleFactor to convert PhysicalSize → LogicalSize
 * because innerSize() returns physical pixels, not logical ones.
 * On macOS with a transparent titlebar, height can drift by ~30px between
 * programmatic and manual resizes because of NSWindowStyleMaskFullSizeContentView.
 */
async function resizeWindowInstantly(targetWidth: number, targetHeight: number): Promise<void> {
  // No-op outside of Tauri.
  if (!window.__TAURI__) {
    return;
  }

  try {
    const appWindow = getAppWindow();

    // Pin the minimum size to this view's dimensions so the window can't be
    // shrunk below the view's natural layout (e.g. the 900px-wide expanded/sim
    // view). Applied before the early-return so the minimum tracks the view even
    // when the size already matches, and before setSize so an expanded→compact
    // shrink isn't clamped by a stale, larger minimum.
    await appWindow.setMinSize(new LogicalSize(targetWidth, targetHeight));

    // Get the current size AND the scale factor for consistent comparison.
    const currentSize = await appWindow.innerSize();
    const scaleFactor = await appWindow.scaleFactor();

    // Convert PhysicalSize → LogicalSize for a coherent comparison.
    const currentLogicalWidth = Math.round(currentSize.width / scaleFactor);
    const currentLogicalHeight = Math.round(currentSize.height / scaleFactor);

    // If already at target size (with a 2px tolerance for rounding), bail out.
    const widthMatch = Math.abs(currentLogicalWidth - targetWidth) <= 2;
    const heightMatch = Math.abs(currentLogicalHeight - targetHeight) <= 2;

    if (widthMatch && heightMatch) {
      return;
    }

    // setSize with LogicalSize handles the scale factor automatically.
    await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));

    // Center window on screen.
    await moveWindow(Position.Center);
  } catch {
    // Tauri window APIs can fail in edge cases (window just closed, etc.).
  }
}

/**
 * Hook to automatically manage window resize based on the current view.
 *
 * @param view Current view name ('compact' or 'expanded').
 */
export function useWindowResize(view: ViewName | string | undefined): void {
  const previousView = useRef<string | null>(null);
  const isInitialized = useRef<boolean>(false);
  const wasFullscreen = useRef<boolean>(false);

  // Resizing the window while fullscreen would force it back out of fullscreen, so
  // this hook must react to the fullscreen flag too (not just the view).
  const isFullscreen = useAppStore((state: FullAppState) => state.isFullscreen);

  useEffect(() => {
    // Sizes per view (fixed height 670px, only width changes).
    const FIXED_HEIGHT = 670;
    const sizes: Record<ViewName, TargetSize> = {
      compact: { width: 450, height: FIXED_HEIGHT }, // FindingRobot, ReadyToStart, Starting, Closing
      expanded: { width: 900, height: FIXED_HEIGHT }, // ActiveRobotView (2x wider)
    };

    const targetSize = view ? sizes[view as ViewName] : undefined;
    if (!targetSize) {
      return;
    }

    // While fullscreen, NEVER call setSize — the fixed 670px height would yank the
    // window out of fullscreen (this is what caused the "downscale after a health
    // check": the robot going active flips compact→expanded mid-fullscreen). Just
    // remember the desired view so we can size correctly once the user exits.
    if (isFullscreen) {
      previousView.current = view ?? null;
      wasFullscreen.current = true;
      return;
    }

    const justExitedFullscreen = wasFullscreen.current;
    wasFullscreen.current = false;

    // First render: initialize without animating.
    if (!isInitialized.current) {
      isInitialized.current = true;
      previousView.current = view ?? null;

      if (window.__TAURI__) {
        const appWindow = getAppWindow();
        // Match the initial minimum to the initial view (e.g. expanded when a
        // launch lands straight on an active robot) so it can't shrink below it.
        appWindow.setMinSize(new LogicalSize(targetSize.width, targetSize.height)).catch(() => {});
        appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height)).catch(() => {
          // Ignore - window may have just closed.
        });
      }
      return;
    }

    // Resize when the view changed, OR when we just exited fullscreen — on exit
    // Tauri restores the pre-fullscreen size, which is stale if the view changed
    // while we were fullscreen, so re-apply the current view's size.
    if (!justExitedFullscreen && previousView.current === view) {
      return;
    }

    previousView.current = view ?? null;

    resizeWindowInstantly(targetSize.width, targetSize.height);
  }, [view, isFullscreen]);
}
