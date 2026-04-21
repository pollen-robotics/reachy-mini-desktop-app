import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';

export interface ResizeObserverOptions {
  box?: ResizeObserverBoxOptions;
}

export interface ObservedSize {
  width: number;
  height: number;
}

export interface ObservedSizeWithDPR extends ObservedSize {
  dpr: number;
  scaledWidth: number;
  scaledHeight: number;
}

type TimeoutId = ReturnType<typeof setTimeout>;

/**
 * Custom useResizeObserver hook - Best practices 2025
 *
 * Uses ResizeObserver with entries to get dimensions directly.
 * Avoids timing issues with flexbox and asynchronous layouts.
 * Specifically handles Tauri window resizes which can be asynchronous.
 */
export function useResizeObserver(
  ref: RefObject<Element | null>,
  options: ResizeObserverOptions = {}
): ObservedSize {
  const { box = 'border-box' } = options;
  const [size, setSize] = useState<ObservedSize>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const isWindowResizingRef = useRef<boolean>(false);

  // Callback to update size in an optimized way.
  const updateSize = useCallback<ResizeObserverCallback>(entries => {
    // Use requestAnimationFrame to synchronize with rendering.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!entries || entries.length === 0) return;

      const entry = entries[0];

      // Use entry dimensions directly (more reliable than getBoundingClientRect).
      // borderBoxSize is preferred as it includes padding and border.
      let width = 0;
      let height = 0;

      if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
        // Modern API with borderBoxSize (better precision).
        const borderBox = entry.borderBoxSize[0];
        width = borderBox.inlineSize;
        height = borderBox.blockSize;
      } else if (entry.contentBoxSize && entry.contentBoxSize.length > 0) {
        // Fallback to contentBoxSize.
        const contentBox = entry.contentBoxSize[0];
        width = contentBox.inlineSize;
        height = contentBox.blockSize;
      } else {
        // Fallback to contentRect (old API, less precise).
        width = entry.contentRect.width;
        height = entry.contentRect.height;
      }

      // Round to avoid subpixel issues.
      width = Math.floor(width);
      height = Math.floor(height);

      // ✅ If we're resizing the window (Tauri), use double RAF
      // to let the layout stabilize completely.
      if (isWindowResizingRef.current) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setSize(prev => {
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
        setSize(prev => {
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

    observerRef.current = new ResizeObserver(updateSize);

    observerRef.current.observe(element, { box });

    // ✅ Immediate initialization.
    const initializeSize = (): void => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);
        setSize({ width, height });
      }
    };

    initializeSize();

    // ✅ Re-check after a few frames to handle asynchronous layouts
    // (particularly important after a Tauri window resize).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initializeSize();
      });
    });

    // ✅ Listen to window resize to handle asynchronous Tauri resizes.
    let resizeTimeout: TimeoutId | null = null;
    const handleWindowResize = (): void => {
      isWindowResizingRef.current = true;

      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        isWindowResizingRef.current = false;
      }, 200); // 200ms should be enough for Tauri to finish the resize.
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      isWindowResizingRef.current = false;
    };
  }, [ref, box, updateSize]);

  return size;
}

/**
 * Hook to get dimensions with device pixel ratio.
 * Useful for canvases that need precise dimensions.
 */
export function useResizeObserverWithDPR(ref: RefObject<Element | null>): ObservedSizeWithDPR {
  const size = useResizeObserver(ref);
  const [dpr, setDpr] = useState<number>(1);

  useEffect(() => {
    const updateDPR = (): void => {
      const newDpr = window.devicePixelRatio || 1;
      setDpr(newDpr);
    };

    updateDPR();

    // Listen to DPR changes (rare but possible).
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
