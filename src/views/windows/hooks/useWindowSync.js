import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '@store/useAppStore';

/**
 * Hook to synchronize store state between windows
 * 
 * In Tauri, each window has its own JavaScript context, so Zustand stores
 * are separate. This hook ensures secondary windows stay in sync with the main window.
 * 
 * Uses Tauri events for cross-window communication (Tauri-approved approach).
 */
export function useWindowSync() {
  useEffect(() => {
    let unlistenFunctions = [];
    let isMounted = true;
    
    // Check if we're the main window
    const checkAndSetup = async () => {
      try {
        const currentWindow = await getCurrentWindow();
        const isMainWindow = currentWindow.label === 'main';
        
        // Only secondary windows need to listen
        if (isMainWindow || !isMounted) {
          return;
        }
        
        const { listen } = await import('@tauri-apps/api/event');
        
        // Listen to general store updates from main window
        const unlistenGeneral = await listen('store-update', (event) => {
          if (!isMounted) return;
          
          const updates = event.payload;
          if (updates && typeof updates === 'object') {
            // Update store - this will trigger React re-renders
            // Use setState with true to ensure React components update
            useAppStore.setState(updates, true);
          }
        });
        unlistenFunctions.push(unlistenGeneral);
        
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
export async function emitStoreUpdate(key, value) {
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
export async function emitStoreUpdates(updates) {
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

