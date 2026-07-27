import { useEffect, useRef } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';
import { getAppWindow } from '../../utils/windowUtils';
import { isMacOS } from '../../utils/platform';

type ViewName = 'compact' | 'expanded';

interface TargetSize {
  width: number;
  height: number;
}

async function ensureWindowCanResize(): Promise<void> {
  if (isMacOS()) {
    return;
  }

  const appWindow = getAppWindow();
  await appWindow.setResizable(true);
  await appWindow.setMaximizable(true);
}

async function getLogicalWindowSize(): Promise<{ width: number; height: number }> {
  const appWindow = getAppWindow();
  const currentSize = await appWindow.innerSize();
  const scaleFactor = await appWindow.scaleFactor();

  return {
    width: Math.round(currentSize.width / scaleFactor),
    height: Math.round(currentSize.height / scaleFactor),
  };
}

async function applyWindowSize(targetWidth: number, targetHeight: number): Promise<void> {
  const appWindow = getAppWindow();
  await ensureWindowCanResize();

  if (!isMacOS()) {
    await appWindow.setMinSize(new LogicalSize(targetWidth, targetHeight));
  }

  await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
  await moveWindow(Position.Center);
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
  if (!window.__TAURI__) {
    return;
  }

  try {
    const { width: currentWidth, height: currentHeight } = await getLogicalWindowSize();
    const widthMatch = Math.abs(currentWidth - targetWidth) <= 2;
    const heightMatch = Math.abs(currentHeight - targetHeight) <= 2;

    if (!widthMatch || !heightMatch) {
      await applyWindowSize(targetWidth, targetHeight);

      // Linux/Windows GTK can ignore the first resize right after enabling resizable.
      if (!isMacOS()) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const { width: afterWidth } = await getLogicalWindowSize();
        if (Math.abs(afterWidth - targetWidth) > 2) {
          await applyWindowSize(targetWidth, targetHeight);
        }
      }
    } else {
      await moveWindow(Position.Center);
    }
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

  useEffect(() => {
    const FIXED_HEIGHT = 670;
    const sizes: Record<ViewName, TargetSize> = {
      compact: { width: 450, height: FIXED_HEIGHT },
      expanded: { width: 900, height: FIXED_HEIGHT },
    };

    const targetSize = view ? sizes[view as ViewName] : undefined;
    if (!targetSize) {
      return;
    }

    if (previousView.current === view) {
      return;
    }

    previousView.current = view ?? null;
    void resizeWindowInstantly(targetSize.width, targetSize.height);
  }, [view]);
}
