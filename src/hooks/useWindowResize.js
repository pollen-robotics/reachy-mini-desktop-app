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

    // Si déjà à la bonne taille, ne rien faire
    if (startWidth === targetWidth && startHeight === targetHeight) {
      console.log('✅ Already at target size');
      return;
    }

    // Appliquer le resize
    await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
    
    // Centrer la fenêtre sur l'écran
    await moveWindow(Position.Center);
    
    console.log(`✅ Window resized to ${targetWidth}x${targetHeight} and centered`);
  } catch (error) {
    console.error('❌ Window resize error:', error);
  }
}

/**
 * Hook pour gérer automatiquement le resize de fenêtre selon la vue
 * @param {string} view - Nom de la vue actuelle ('compact' ou 'expanded')
 */
export function useWindowResize(view) {
  const previousView = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    console.log(`🔍 useWindowResize - Current view: ${view}, Previous view: ${previousView.current}, Initialized: ${isInitialized.current}`);

    // Définir les tailles selon la vue (hauteur fixe 670px, seule la largeur change)
    const FIXED_HEIGHT = 670;
    const sizes = {
      compact: { width: 450, height: FIXED_HEIGHT },    // Vues : RobotNotDetected, ReadyToStart, Starting, Closing
      expanded: { width: 900, height: FIXED_HEIGHT },   // Vue : ActiveRobotView (2x plus large)
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
      
      // Setter la taille immédiatement
      if (window.__TAURI__) {
        const appWindow = getCurrentWindow();
        appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height))
          .then(() => console.log('✅ Initial size set'))
          .catch(err => console.error('❌ Failed to set initial size:', err));
      }
      return;
    }

    // Ne redimensionner que si la vue change réellement
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

