import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getAllWindows } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../store/useAppStore';

/**
 * Production-ready Window Manager for Tauri v2
 * 
 * Features:
 * - Centralized window lifecycle management
 * - Automatic cleanup and state synchronization
 * - Robust error handling with retry logic
 * - Window state validation
 * - Event-driven architecture
 * 
 * NOTE: Controller and Expressions are now displayed in the right panel instead of separate windows.
 * This code is kept for potential future use or if window-based display is needed again.
 * Currently, no secondary windows are configured.
 */

// Window configuration registry
const WINDOW_CONFIGS = {};

// Window references cache (for fast access)
const windowRefs = new Map();

// Window state tracking
const windowStates = new Map();

/**
 * Get window reference with multiple fallback strategies
 */
async function getWindowReference(windowLabel) {
  // Strategy 1: Use cached reference
  let window = windowRefs.get(windowLabel);
  if (window) {
    return window;
  }

  // Strategy 2: Use WebviewWindow.getByLabel (Tauri v2 API)
  try {
    window = WebviewWindow.getByLabel(windowLabel);
    if (window) {
      windowRefs.set(windowLabel, window);
      return window;
    }
  } catch (error) {
    console.warn(`Failed to get window by label ${windowLabel}:`, error);
  }

  // Strategy 3: Search in all windows
  try {
    const allWindows = await getAllWindows();
    window = allWindows.find(w => w.label === windowLabel);
    if (window) {
      windowRefs.set(windowLabel, window);
      return window;
    }
  } catch (error) {
    console.warn(`Failed to get all windows:`, error);
  }

  return null;
}

/**
 * Close window with retry logic and multiple strategies
 */
async function closeWindowInternal(windowLabel, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const window = await getWindowReference(windowLabel);
      
      if (!window) {
        // Window doesn't exist, clean up state
        cleanupWindowState(windowLabel);
        return true;
      }

      // Strategy 1: Use window.close() method
      if (typeof window.close === 'function') {
        try {
          await window.close();
          cleanupWindowState(windowLabel);
          return true;
        } catch (error) {
          console.warn(`Attempt ${attempt}: window.close() failed:`, error);
        }
      }

      // Strategy 2: Use Rust command (more reliable)
      try {
        await invoke('close_window', { windowLabel });
        cleanupWindowState(windowLabel);
        return true;
      } catch (error) {
        console.warn(`Attempt ${attempt}: Rust close_window failed:`, error);
      }

      // If both strategies fail and we have retries left, wait before retrying
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    } catch (error) {
      console.error(`Close attempt ${attempt} failed for ${windowLabel}:`, error);
      if (attempt === retries) {
        // Final attempt failed, clean up state anyway
        cleanupWindowState(windowLabel);
        throw error;
      }
    }
  }

  // All retries exhausted
  cleanupWindowState(windowLabel);
  return false;
}

/**
 * Clean up window state (references, store, etc.)
 */
function cleanupWindowState(windowLabel) {
  windowRefs.delete(windowLabel);
  windowStates.delete(windowLabel);
  
  // Safely remove from store (may not exist after hot reload)
  try {
    const store = useAppStore.getState();
    if (store && typeof store.removeOpenWindow === 'function') {
      store.removeOpenWindow(windowLabel);
    }
  } catch (error) {
    // Silently fail if store is not available (e.g., after hot reload)
    console.debug('Could not remove window from store (expected after hot reload):', error);
  }
}

/**
 * Send initial state to a newly created window
 */
async function sendInitialStateToWindow(windowLabel) {
  try {
    const { emit } = await import('@tauri-apps/api/event');
    const state = useAppStore.getState();
    
    // Send complete initial state that secondary windows need
    const initialState = {
      darkMode: state.darkMode ?? false,
      isActive: state.isActive ?? false,
      robotStatus: state.robotStatus ?? 'disconnected',
      busyReason: state.busyReason ?? null,
      isCommandRunning: state.isCommandRunning ?? false,
      isAppRunning: state.isAppRunning ?? false,
      isInstalling: state.isInstalling ?? false,
      robotStateFull: state.robotStateFull ?? { data: null, lastUpdate: null, error: null },
      activeMoves: state.activeMoves ?? [],
      frontendLogs: state.frontendLogs ?? [], // Include logs in initial state
    };
    
    // Send initial state immediately and also after a short delay to ensure it's received
    // This handles cases where the window is still initializing
    const sendState = async () => {
      try {
        await emit('store-update', initialState);
        console.log(`📤 Sent initial state to window '${windowLabel}':`, {
          isActive: initialState.isActive,
          robotStatus: initialState.robotStatus,
          hasRobotStateFull: !!initialState.robotStateFull?.data,
        });
      } catch (emitError) {
        console.warn(`Failed to emit initial state to ${windowLabel}:`, emitError);
      }
    };
    
    // Send immediately
    sendState();
    
    // Also send after a short delay to catch windows that weren't ready
    setTimeout(sendState, 500);
  } catch (error) {
    console.warn(`Failed to send initial state to ${windowLabel}:`, error);
  }
}

/**
 * Setup window event listeners for proper lifecycle management
 */
function setupWindowListeners(window, windowLabel) {
  // Track window creation
  window.once('tauri://created', async () => {
    console.log(`✅ Window '${windowLabel}' created`);
    windowStates.set(windowLabel, 'created');
    
    try {
      // Apply transparent titlebar style (macOS)
      await invoke('apply_transparent_titlebar', { windowLabel });
      
      // Mark window as ready and track in store
      windowStates.set(windowLabel, 'ready');
      
      // Safely add to store (may not exist after hot reload)
      try {
        const store = useAppStore.getState();
        if (store && typeof store.addOpenWindow === 'function') {
          store.addOpenWindow(windowLabel);
        }
      } catch (error) {
        console.debug('Could not add window to store (expected after hot reload):', error);
      }
      
      // Send initial state to the new window (including darkMode, isActive, etc.)
      await sendInitialStateToWindow(windowLabel);
    } catch (error) {
      console.error(`❌ Failed to setup window '${windowLabel}':`, error);
      windowStates.set(windowLabel, 'error');
    }
  });

  // Track window destruction
  window.once('tauri://destroyed', () => {
    console.log(`🔴 Window '${windowLabel}' destroyed`);
    cleanupWindowState(windowLabel);
  });

  // Track window errors
  window.once('tauri://error', (error) => {
    console.error(`❌ Error in window '${windowLabel}':`, error);
    windowStates.set(windowLabel, 'error');
    cleanupWindowState(windowLabel);
  });
}

/**
 * Create a new window with proper configuration and lifecycle management
 */
async function createWindow(windowLabel) {
  const config = WINDOW_CONFIGS[windowLabel];
  if (!config) {
    throw new Error(`Unknown window label: ${windowLabel}`);
  }

  // Check if window already exists
  const existingWindow = await getWindowReference(windowLabel);
  if (existingWindow) {
    // Window exists, focus it instead of creating a new one
    try {
      await existingWindow.setFocus();
      return existingWindow;
    } catch (error) {
      console.warn(`Failed to focus existing window ${windowLabel}, will create new one:`, error);
      // Continue to create new window
    }
  }

  // Create new window
  const window = new WebviewWindow(windowLabel, config);
  
  // Store reference immediately
  windowRefs.set(windowLabel, window);
  windowStates.set(windowLabel, 'creating');

  // Setup lifecycle listeners
  setupWindowListeners(window, windowLabel);

  return window;
}

/**
 * Public API: Close a window
 */
export async function closeWindow(windowLabel) {
  try {
    await closeWindowInternal(windowLabel);
  } catch (error) {
    console.error(`❌ Failed to close window ${windowLabel}:`, error);
    // Ensure cleanup even on error
    cleanupWindowState(windowLabel);
  }
}

/**
 * Public API: Get window state
 */
export function getWindowState(windowLabel) {
  return windowStates.get(windowLabel) || 'unknown';
}

/**
 * Public API: Check if window is open
 */
export async function isWindowOpen(windowLabel) {
  const window = await getWindowReference(windowLabel);
  return window !== null;
}

/**
 * Public API: Close all secondary windows
 */
export async function closeAllSecondaryWindows() {
    const secondaryWindows = [];
  const closePromises = secondaryWindows.map(label => closeWindow(label).catch(error => {
    console.error(`Failed to close ${label}:`, error);
  }));
  await Promise.allSettled(closePromises);
}

/**
 * Initialize window manager: sync state with actual windows on startup
 */
export async function initializeWindowManager() {
  try {
    const allWindows = await getAllWindows();
    const secondaryLabels = [];
    
    for (const label of secondaryLabels) {
      const window = allWindows.find(w => w.label === label);
      if (window) {
        // Window exists, sync state
        windowRefs.set(label, window);
        windowStates.set(label, 'ready');
        
        // Safely add to store (may not exist after hot reload)
        const store = useAppStore.getState();
        if (store && typeof store.addOpenWindow === 'function') {
          store.addOpenWindow(label);
        }
        
        // Re-setup listeners for existing windows
        setupWindowListeners(window, label);
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize window manager:', error);
  }
}
