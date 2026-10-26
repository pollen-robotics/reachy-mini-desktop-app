import { useEffect, useRef } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getAppWindow } from '../../utils/windowUtils';

type ViewName = 'compact' | 'expanded';
type AppWindow = ReturnType<typeof getAppWindow>;

interface WindowSize {
  width: number;
  height: number;
}

// Default (and minimum) logical size per view. Fixed height, only width changes.
const FIXED_HEIGHT = 670;
const VIEW_SIZES: Record<ViewName, WindowSize> = {
  compact: { width: 450, height: FIXED_HEIGHT }, // FindingRobot, ReadyToStart, Starting, Closing
  expanded: { width: 900, height: FIXED_HEIGHT }, // ActiveRobotView (two 450px columns)
};

// Rounding tolerance when converting physical → logical pixels on fractional scale factors.
const SIZE_TOLERANCE = 2;

function isViewName(view: string | undefined): view is ViewName {
  return view === 'compact' || view === 'expanded';
}

function sameSize(a: WindowSize, b: WindowSize): boolean {
  return (
    Math.abs(a.width - b.width) <= SIZE_TOLERANCE && Math.abs(a.height - b.height) <= SIZE_TOLERANCE
  );
}

/**
 * ⚠️ IMPORTANT: innerSize() returns physical pixels, setSize(LogicalSize) takes logical ones.
 * Convert with scaleFactor so comparisons stay coherent on HiDPI displays.
 */
async function getLogicalInnerSize(appWindow: AppWindow): Promise<WindowSize> {
  const size = await appWindow.innerSize();
  const scaleFactor = await appWindow.scaleFactor();
  return {
    width: Math.round(size.width / scaleFactor),
    height: Math.round(size.height / scaleFactor),
  };
}

/**
 * Apply the window constraints for a view.
 *
 * The window is user-resizable on every platform. This only:
 * - enforces a per-view minimum size (the robot view needs two 450px columns);
 * - restores the compact panel size when leaving the robot view, remembering the
 *   size the user picked so it is restored on the next connection;
 * - grows (never shrinks) the window when entering the robot view.
 */
async function applyViewSize(
  view: ViewName,
  previousView: ViewName | null,
  savedExpandedSize: { current: WindowSize | null }
): Promise<void> {
  const appWindow = getAppWindow();
  const viewSize = VIEW_SIZES[view];
  const isTransition = previousView !== null && previousView !== view;

  if (view === 'compact') {
    if (previousView === 'expanded') {
      const isFullscreen = await appWindow.isFullscreen();
      const isMaximized = await appWindow.isMaximized();
      if (!isFullscreen && !isMaximized) {
        savedExpandedSize.current = await getLogicalInnerSize(appWindow);
      }
      if (isFullscreen) {
        await appWindow.setFullscreen(false);
      }
      if (isMaximized) {
        await appWindow.unmaximize();
      }
    }

    // Lower the minimum first, otherwise the shrink below is clamped.
    await appWindow.setMinSize(new LogicalSize(viewSize.width, viewSize.height));

    const current = await getLogicalInnerSize(appWindow);
    if (!sameSize(current, viewSize)) {
      await appWindow.setSize(new LogicalSize(viewSize.width, viewSize.height));
      if (isTransition) {
        await appWindow.center();
      }
    }
    return;
  }

  await appWindow.setMinSize(new LogicalSize(viewSize.width, viewSize.height));

  const current = await getLogicalInnerSize(appWindow);
  const preferred = (isTransition && savedExpandedSize.current) || current;
  const target: WindowSize = {
    width: Math.max(preferred.width, viewSize.width),
    height: Math.max(preferred.height, viewSize.height),
  };

  if (sameSize(current, target)) {
    return;
  }

  await appWindow.setSize(new LogicalSize(target.width, target.height));
  if (isTransition) {
    await appWindow.center();
  }
}

/**
 * Hook to keep the window size consistent with the current view.
 *
 * @param view Current view name ('compact' or 'expanded').
 */
export function useWindowResize(view: ViewName | string | undefined): void {
  const previousView = useRef<ViewName | null>(null);
  const savedExpandedSize = useRef<WindowSize | null>(null);
  // Serialize window operations so fast view switches don't interleave.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!isViewName(view) || previousView.current === view) {
      return;
    }

    const fromView = previousView.current;
    previousView.current = view;

    // No-op outside of Tauri (web/dev mode mocks window.__TAURI__ but not the internals).
    if (!window.__TAURI_INTERNALS__) {
      return;
    }

    queue.current = queue.current
      .then(() => applyViewSize(view, fromView, savedExpandedSize))
      .catch((err: unknown) => {
        console.warn('[useWindowResize] Failed to apply window size:', err);
      });
  }, [view]);
}
