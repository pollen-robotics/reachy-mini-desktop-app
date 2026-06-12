import { useEffect } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getAppWindow } from '../../utils/windowUtils';

type ViewName = 'compact' | 'expanded';

interface TargetSize {
  width: number;
  height: number;
}

/**
 * Keep the window large enough for the current view without taking over
 * user-driven resizing.
 *
 * IMPORTANT: we use scaleFactor to convert PhysicalSize to LogicalSize
 * because innerSize() returns physical pixels, not logical ones.
 */
async function ensureMinimumWindowSize(targetWidth: number, targetHeight: number): Promise<void> {
  // No-op outside of Tauri.
  if (!window.__TAURI__) {
    return;
  }

  try {
    const appWindow = getAppWindow();
    await appWindow.setMinSize(new LogicalSize(targetWidth, targetHeight));

    // Get the current size AND the scale factor for consistent comparison.
    const currentSize = await appWindow.innerSize();
    const scaleFactor = await appWindow.scaleFactor();

    // Convert PhysicalSize to LogicalSize for a coherent comparison.
    const currentLogicalWidth = Math.round(currentSize.width / scaleFactor);
    const currentLogicalHeight = Math.round(currentSize.height / scaleFactor);

    const nextWidth = Math.max(currentLogicalWidth, targetWidth);
    const nextHeight = Math.max(currentLogicalHeight, targetHeight);

    // Only grow the window when the current view needs more room. Never shrink
    // a size the user chose manually.
    if (nextWidth === currentLogicalWidth && nextHeight === currentLogicalHeight) {
      return;
    }

    // setSize with LogicalSize handles the scale factor automatically.
    await appWindow.setSize(new LogicalSize(nextWidth, nextHeight));
  } catch {
    // Tauri window APIs can fail in edge cases (window just closed, etc.).
  }
}

/**
 * Hook to keep the window usable for the current view.
 *
 * @param view Current view name ('compact' or 'expanded').
 */
export function useWindowResize(view: ViewName | string | undefined): void {
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

    ensureMinimumWindowSize(targetSize.width, targetSize.height);
  }, [view]);
}
