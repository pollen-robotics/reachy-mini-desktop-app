import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '@store/useAppStore';
import type { AppState } from '@/types/store';

type UnlistenFn = () => void;

/**
 * Hook to synchronize store state between windows
 *
 * In Tauri, each window has its own JavaScript context, so Zustand stores
 * are separate. This hook ensures secondary windows stay in sync with the main window.
 *
 * Uses Tauri events for cross-window communication (Tauri-approved approach).
 */
export function useWindowSync(): void {
  useEffect(() => {
    const unlistenFunctions: UnlistenFn[] = [];
    let isMounted = true;

    // Check if we're the main window
    const checkAndSetup = async (): Promise<void> => {
      try {
        const currentWindow = await getCurrentWindow();
        const isMainWindow = currentWindow.label === 'main';

        // Only secondary windows need to listen
        if (isMainWindow || !isMounted) {
          return;
        }

        const { listen, emit } = await import('@tauri-apps/api/event');

        // Listen to general store updates from main window
        const unlistenGeneral = await listen<Partial<AppState>>('store-update', event => {
          if (!isMounted) return;

          const updates = event.payload;
          if (updates && typeof updates === 'object') {
            // Update store - this will trigger React re-renders
            // Use setState with true to ensure React components update
            // TODO(ts): setState with replace:true requires the full state.
            // Preserving runtime behavior from the original JS implementation.
            (useAppStore.setState as (updates: unknown, replace?: boolean) => void)(updates, true);
          }
        });
        unlistenFunctions.push(unlistenGeneral);

        // Request an initial snapshot so we don't wait for the next change
        // to populate. The middleware running in the main window replies via
        // the same `store-update` channel. Safe to fire-and-forget.
        void emit('store-snapshot-request');
      } catch (error) {
        console.error('❌ Failed to setup window sync listeners:', error);
      }
    };

    checkAndSetup();

    // Cleanup
    return () => {
      isMounted = false;
      unlistenFunctions.forEach(unlisten => {
        if (typeof unlisten === 'function') {
          unlisten();
        }
      });
    };
  }, []);
}

/**
 * Emit store update to other windows
 * Call this from main window when store state changes
 */
export async function emitStoreUpdate(key: string, value: unknown): Promise<void> {
  const currentWindow = getCurrentWindow();

  // Only main window should emit
  if (currentWindow.label !== 'main') {
    return;
  }

  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(`store-update:${key}`, value);
  } catch (error) {
    console.error(`❌ Failed to emit store update for ${key}:`, error);
  }
}

/**
 * Emit multiple store updates at once
 */
export async function emitStoreUpdates(updates: Partial<AppState>): Promise<void> {
  const currentWindow = getCurrentWindow();

  // Only main window should emit
  if (currentWindow.label !== 'main') {
    return;
  }

  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('store-update', updates);
  } catch (error) {
    console.error('❌ Failed to emit store updates:', error);
  }
}
