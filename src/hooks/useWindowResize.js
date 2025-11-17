import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';

/**
 * Redimensionner la fenêtre instantanément en gardant le centre
 * Sur macOS, les animations de resize par setSize() causent du flickering
 * Solution : resize instantané + repositionnement pour centrer
 */
async function resizeWindowInstantly(targetWidth, targetHeight) {
  // Mock pour le navigateur
  if (!window.__TAURI__) {
    console.log(`[MOCK] Window resize to ${targetWidth}x${targetHeight}`);
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    
    // Obtenir la taille actuelle
    const currentSize = await appWindow.innerSize();
    const startWidth = currentSize.width;
    const startHeight = currentSize.height;

    console.log(`🔄 Resizing: ${startWidth}x${startHeight} → ${targetWidth}x${targetHeight}`);

    // If already at correct size, do nothing
    if (startWidth === targetWidth && startHeight === targetHeight) {
      console.log('✅ Already at target size');
      return;
    }

    // Apply resize
    await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
    
    // Center window on screen
    await moveWindow(Position.Center);
    
    console.log(`✅ Window resized to ${targetWidth}x${targetHeight} and centered`);
  } catch (error) {
    console.error('❌ Window resize error:', error);
  }
}

/**
 * Hook to automatically manage window resize according to view
 * @param {string} view - Current view name ('compact' or 'expanded')
 */
export function useWindowResize(view) {
  const previousView = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    console.log(`🔍 useWindowResize - Current view: ${view}, Previous view: ${previousView.current}, Initialized: ${isInitialized.current}`);

    // Set sizes according to view (fixed height 670px, only width changes)
    const FIXED_HEIGHT = 670;
    const sizes = {
      compact: { width: 450, height: FIXED_HEIGHT },    // Views: RobotNotDetected, ReadyToStart, Starting, Closing
      expanded: { width: 900, height: FIXED_HEIGHT },   // View: ActiveRobotView (2x wider)
    };

    const targetSize = sizes[view];
    if (!targetSize) {
      console.warn(`⚠️ Unknown view: ${view}`);
      return;
    }

    // Premier render : initialiser sans animer
    if (!isInitialized.current) {
      console.log(`🎬 First render, setting initial size to ${targetSize.width}x${targetSize.height}`);
      isInitialized.current = true;
      previousView.current = view;
      
      // Set size immediately
      if (window.__TAURI__) {
        const appWindow = getCurrentWindow();
        appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height))
          .then(() => console.log('✅ Initial size set'))
          .catch(err => console.error('❌ Failed to set initial size:', err));
      }
      return;
    }

    // Only resize if view actually changes
    if (previousView.current === view) {
      console.log('⏭️ Same view, skipping resize');
      return;
    }

    const oldView = previousView.current;
    previousView.current = view;

    console.log(`🔄 View changed: ${oldView} → ${view}, resizing to ${targetSize.width}x${targetSize.height}`);
    resizeWindowInstantly(targetSize.width, targetSize.height);
  }, [view]);
}

