import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';

/**
 * Utility to emit store updates to other windows
 * Call this after updating the store in the main window
 */
export async function syncStoreUpdate(updates) {
  try {
    const currentWindow = await getCurrentWindow();
    
    // Only emit from main window
    if (currentWindow.label !== 'main') {
      return;
    }
    
    // Emit updates to other windows
    await emit('store-update', updates);
  } catch (error) {
    // Silently fail if not in Tauri or window API not available
  }
}

