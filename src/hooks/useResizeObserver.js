import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook personnalisé useResizeObserver - Meilleures pratiques 2025
 * 
 * Utilise ResizeObserver avec les entries pour obtenir les dimensions directement
 * Évite les problèmes de timing avec flexbox et les layouts asynchrones
 * Gère spécialement les resize de fenêtre Tauri qui peuvent être asynchrones
 * 
 * @param {React.RefObject} ref - Référence à l'élément à observer
 * @param {Object} options - Options pour ResizeObserver
 * @param {string} options.box - Type de box à observer ('border-box', 'content-box', 'device-pixel-content-box')
 * @returns {Object} - { width, height } en pixels (0 si non disponible)
 */
export function useResizeObserver(ref, options = {}) {
  const { box = 'border-box' } = options;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef(null);
  const rafRef = useRef(null);
  const isWindowResizingRef = useRef(false);

  // Callback pour mettre à jour la taille de manière optimisée
  const updateSize = useCallback((entries) => {
    // Utiliser requestAnimationFrame pour synchroniser avec le rendu
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!entries || entries.length === 0) return;

      const entry = entries[0];
      
      // Utiliser les dimensions de l'entry directement (plus fiable que getBoundingClientRect)
      // borderBoxSize est préféré car il inclut padding et border
      let width = 0;
      let height = 0;

      if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
        // API moderne avec borderBoxSize (meilleure précision)
        const borderBox = entry.borderBoxSize[0];
        width = borderBox.inlineSize;
        height = borderBox.blockSize;
      } else if (entry.contentBoxSize && entry.contentBoxSize.length > 0) {
        // Fallback sur contentBoxSize
        const contentBox = entry.contentBoxSize[0];
        width = contentBox.inlineSize;
        height = contentBox.blockSize;
      } else {
        // Fallback sur contentRect (ancienne API, moins précise)
        width = entry.contentRect.width;
        height = entry.contentRect.height;
      }

      // Arrondir pour éviter les problèmes de subpixel
      width = Math.floor(width);
      height = Math.floor(height);

      // ✅ Si on est en train de resizer la fenêtre (Tauri), utiliser un double RAF
      // pour laisser le layout se stabiliser complètement
      if (isWindowResizingRef.current) {
        // Double RAF pour laisser le layout se stabiliser après resize Tauri
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setSize(prev => {
              // Ne mettre à jour que si les dimensions ont changé et sont valides
              if (prev.width !== width || prev.height !== height) {
                if (width > 0 && height > 0) {
                  return { width, height };
                }
              }
              return prev;
            });
          });
        });
      } else {
        // Mise à jour normale
        setSize(prev => {
          // Ne mettre à jour que si les dimensions ont changé
          if (prev.width === width && prev.height === height) {
            return prev;
          }
          return { width, height };
        });
      }
    });
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      setSize({ width: 0, height: 0 });
      return;
    }

    // Créer l'observer avec les options
    observerRef.current = new ResizeObserver(updateSize);
    
    // Observer l'élément avec la box spécifiée
    observerRef.current.observe(element, { box });

    // ✅ Initialisation immédiate
    const initializeSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);
        setSize({ width, height });
      }
    };

    // Initialisation immédiate
    initializeSize();

    // ✅ Re-vérification après quelques frames pour gérer les layouts asynchrones
    // Particulièrement important après un resize de fenêtre Tauri
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initializeSize();
      });
    });

    // ✅ Écouter les resize de fenêtre pour gérer les resize Tauri asynchrones
    // Marquer qu'on est en train de resizer pour utiliser un double RAF
    let resizeTimeout = null;
    const handleWindowResize = () => {
      // Marquer qu'on est en train de resizer
      isWindowResizingRef.current = true;
      
      // Réinitialiser le flag après un court délai
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        isWindowResizingRef.current = false;
      }, 200); // 200ms devrait être suffisant pour que Tauri termine le resize
    };

    window.addEventListener('resize', handleWindowResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      // Réinitialiser les refs
      isWindowResizingRef.current = false;
    };
  }, [ref, box, updateSize]);

  return size;
}

/**
 * Hook pour obtenir les dimensions avec device pixel ratio
 * Utile pour les canvas qui ont besoin de dimensions précises
 * 
 * @param {React.RefObject} ref - Référence à l'élément à observer
 * @returns {Object} - { width, height, dpr, scaledWidth, scaledHeight }
 */
export function useResizeObserverWithDPR(ref) {
  const size = useResizeObserver(ref);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    // Mettre à jour le DPR si nécessaire
    const updateDPR = () => {
      const newDpr = window.devicePixelRatio || 1;
      setDpr(newDpr);
    };

    updateDPR();
    
    // Écouter les changements de DPR (peu fréquent mais possible)
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mediaQuery.addEventListener('change', updateDPR);

    return () => {
      mediaQuery.removeEventListener('change', updateDPR);
    };
  }, []);

  return {
    width: size.width,
    height: size.height,
    dpr,
    scaledWidth: size.width * dpr,
    scaledHeight: size.height * dpr,
  };
}

