import { useEffect, useRef } from 'react';
import { getAppWindow } from '../../utils/windowUtils';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';

/**
 * Redimensionner la fenêtre instantanément en gardant le centre
 * Sur macOS, les animations de resize par setSize() causent du flickering
 * Solution : resize instantané + repositionnement pour centrer
 * 
 * ⚠️ IMPORTANT: On utilise scaleFactor pour convertir PhysicalSize → LogicalSize
 * car innerSize() retourne des pixels physiques, pas logiques.
 * Sur macOS avec titlebar transparente, la hauteur peut varier de ~30px
 * entre resize programmatique et resize manuel à cause de NSWindowStyleMaskFullSizeContentView.
 */
async function resizeWindowInstantly(targetWidth, targetHeight) {
  // Mock pour le navigateur
  if (!window.__TAURI__) {
    console.log('[resizeWindowInstantly] ⚠️ Not in Tauri, skipping');
    return;
  }

  try {
    const appWindow = getAppWindow();
    console.log('[resizeWindowInstantly] 🎯 Got appWindow:', appWindow?.label);
    
    // Obtenir la taille actuelle ET le scale factor pour comparer correctement
    const currentSize = await appWindow.innerSize();
    const scaleFactor = await appWindow.scaleFactor();
    
    // Convertir PhysicalSize → LogicalSize pour comparaison cohérente
    const currentLogicalWidth = Math.round(currentSize.width / scaleFactor);
    const currentLogicalHeight = Math.round(currentSize.height / scaleFactor);

    console.log('[resizeWindowInstantly] 📐 Current size:', {
      physical: { width: currentSize.width, height: currentSize.height },
      logical: { width: currentLogicalWidth, height: currentLogicalHeight },
      scaleFactor,
      target: { width: targetWidth, height: targetHeight },
    });

    // If already at correct size (with 2px tolerance for rounding), do nothing
    const widthMatch = Math.abs(currentLogicalWidth - targetWidth) <= 2;
    const heightMatch = Math.abs(currentLogicalHeight - targetHeight) <= 2;
    
    if (widthMatch && heightMatch) {
      console.log('[resizeWindowInstantly] ✅ Already at target size, skipping');
      return;
    }

    // Apply resize - setSize avec LogicalSize gère automatiquement le scale factor
    console.log('[resizeWindowInstantly] 🔄 Calling setSize...');
    await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
    console.log('[resizeWindowInstantly] ✅ setSize completed');
    
    // Center window on screen
    console.log('[resizeWindowInstantly] 🔄 Calling moveWindow(Center)...');
    await moveWindow(Position.Center);
    console.log('[resizeWindowInstantly] ✅ moveWindow completed');
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
    // Set sizes according to view (fixed height 650px, only width changes)
    const FIXED_HEIGHT = 670;
    const sizes = {
      compact: { width: 450, height: FIXED_HEIGHT },    // Views: FindingRobot, ReadyToStart, Starting, Closing
      expanded: { width: 900, height: FIXED_HEIGHT },   // View: ActiveRobotView (2x wider)
    };

    const targetSize = sizes[view];
    if (!targetSize) {
      console.warn(`⚠️ Unknown view: ${view}`);
      return;
    }

    // First render: initialize without animating
    if (!isInitialized.current) {
      isInitialized.current = true;
      previousView.current = view;
      
      // Set size immediately
      if (window.__TAURI__) {
        const appWindow = getAppWindow();
        appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height))
          .catch(err => console.error('❌ Failed to set initial size:', err));
      }
      return;
    }

    // Only resize if view actually changes
    if (previousView.current === view) {
      return;
    }

    // 🔍 DEBUG: Log view change
    console.log(`[WindowResize] 🎯 View changed: ${previousView.current} → ${view}`, {
      targetWidth: targetSize.width,
      targetHeight: targetSize.height,
    });

    previousView.current = view;

    resizeWindowInstantly(targetSize.width, targetSize.height);
  }, [view]);
}

