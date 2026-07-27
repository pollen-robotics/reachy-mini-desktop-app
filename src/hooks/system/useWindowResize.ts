import { useEffect, useRef } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '../../utils/tauriCompat';
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
  if (!isMacOS()) {
    await invoke('resize_main_window', {
      width: targetWidth,
      height: targetHeight,
      center: true,
    });
    return;
  }

  const appWindow = getAppWindow();
  await ensureWindowCanResize();
  await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
  await appWindow.center();
}

/**
 * Resize the window instantly while keeping it centered.
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

      if (!isMacOS()) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const { width: afterWidth } = await getLogicalWindowSize();
        if (Math.abs(afterWidth - targetWidth) > 2) {
          await applyWindowSize(targetWidth, targetHeight);
        }
      }
    } else if (!isMacOS()) {
      await invoke('resize_main_window', {
        width: targetWidth,
        height: targetHeight,
        center: true,
      });
    } else {
      await getAppWindow().center();
    }
  } catch (error) {
    console.warn('[window] Failed to resize window:', error);
  }
}

/**
 * Hook to automatically manage window resize based on the current view.
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

/** Expanded layout size for the active robot view. */
export const EXPANDED_WINDOW_SIZE = { width: 900, height: 670 } as const;

/**
 * Ensure the expanded layout is applied when the active robot view mounts.
 * GTK/Linux can miss the first resize triggered during view transitions.
 */
export function useExpandedWindowOnMount(): void {
  useEffect(() => {
    if (!window.__TAURI__ || isMacOS()) {
      return;
    }

    const timer = window.setTimeout(() => {
      void resizeWindowInstantly(EXPANDED_WINDOW_SIZE.width, EXPANDED_WINDOW_SIZE.height);
    }, 150);

    return () => window.clearTimeout(timer);
  }, []);
}
