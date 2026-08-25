import { useEffect, useRef } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';
import { getAppWindow } from '../../utils/windowUtils';

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

    // First render: initialize without animating.
    if (!isInitialized.current) {
      isInitialized.current = true;
      previousView.current = view ?? null;

      if (window.__TAURI__) {
        const appWindow = getAppWindow();
        appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height)).catch(() => {
          // Ignore - window may have just closed.
        });
      }
      return;
    }

    // Only resize when the view actually changes.
    if (previousView.current === view) {
      return;
    }

    previousView.current = view ?? null;

    resizeWindowInstantly(targetSize.width, targetSize.height);
  }, [view]);
}
