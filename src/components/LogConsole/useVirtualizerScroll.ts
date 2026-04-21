import { useEffect, useRef, useCallback } from 'react';
import type React from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

type VirtualizerWithScrollElement = Virtualizer<HTMLElement, Element> & {
  getScrollElement?: () => HTMLElement | null;
};

export interface UseVirtualizerScrollParams {
  virtualizer: Virtualizer<HTMLElement, Element> | null | undefined;
  totalCount: number;
  /**
   * Current `virtualizer.getTotalSize()` value. Passed in from the component
   * so we re-trigger auto-scroll whenever the virtualizer re-measures an
   * item (e.g. a multi-line log that was initially estimated as one line).
   * Without this, the first `scrollToBottom` lands on the *estimated* max
   * offset, and subsequent `measureElement` callbacks grow the total size
   * without pinning the viewport back to the bottom.
   */
  totalSize?: number;
  enabled?: boolean;
  compact?: boolean;
  simpleStyle?: boolean;
  scrollElementRef?: React.RefObject<HTMLElement | null> | null;
}

export interface UseVirtualizerScrollResult {
  handleScroll: (e: React.UIEvent<HTMLElement>) => void;
}

/**
 * Hook for auto-scrolling with @tanstack/react-virtual
 *
 * Behavior:
 * - By default: auto-scroll is always active, always at maximum scroll position
 * - If user scrolls up: auto-scroll is disabled, user can navigate freely
 * - If user scrolls back to bottom: auto-scroll is re-enabled
 */
export const useVirtualizerScroll = ({
  virtualizer,
  totalCount,
  totalSize = 0,
  enabled = true,
  compact = false,
  simpleStyle = false,
  scrollElementRef = null,
}: UseVirtualizerScrollParams): UseVirtualizerScrollResult => {
  const prevLogCountRef = useRef<number>(totalCount);
  const prevTotalSizeRef = useRef<number>(totalSize);
  const isAutoScrollEnabledRef = useRef<boolean>(true); // Start with auto-scroll enabled
  const isScrollingProgrammaticallyRef = useRef<boolean>(false); // Track if we're scrolling programmatically
  const lastScrollTopRef = useRef<number>(0); // Track last scroll position to detect direction
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // For clearing scroll flag
  const wasAtBottomRef = useRef<boolean>(false); // Track if we were at bottom (for logging)

  // Threshold for "at bottom" detection (in pixels)
  // Increased to account for rounding and padding issues
  const AT_BOTTOM_THRESHOLD = 8;

  /**
   * Force scroll to absolute bottom
   */
  const scrollToBottom = useCallback(
    (smooth: boolean = false) => {
      if (!virtualizer || !enabled || !isAutoScrollEnabledRef.current || totalCount === 0) {
        return;
      }

      // Mark that we're scrolling programmatically
      isScrollingProgrammaticallyRef.current = true;

      // Mark that we're scrolling programmatically
      isScrollingProgrammaticallyRef.current = true;

      // Helper function to actually perform the scroll
      const performScroll = () => {
        if (!virtualizer || !isAutoScrollEnabledRef.current) {
          isScrollingProgrammaticallyRef.current = false;
          return;
        }

        // Try to get scroll element - use direct ref as fallback
        let scrollElement: HTMLElement | null = null;

        // First try: use virtualizer.getScrollElement if available
        const v = virtualizer as VirtualizerWithScrollElement | null | undefined;
        if (v && typeof v.getScrollElement === 'function') {
          try {
            scrollElement = v.getScrollElement() as HTMLElement | null;
          } catch {
            // Ignore
          }
        }

        // Fallback: use direct ref if available
        if (!scrollElement && scrollElementRef && scrollElementRef.current) {
          scrollElement = scrollElementRef.current;
        }

        if (!scrollElement) {
          // Retry after a short delay (silently to avoid console spam)
          setTimeout(() => {
            if (isAutoScrollEnabledRef.current) {
              performScroll();
            } else {
              isScrollingProgrammaticallyRef.current = false;
            }
          }, 50);
          return;
        }

        try {
          const { clientHeight, scrollTop: currentScrollTop } = scrollElement;
          const virtualizerTotalSize = virtualizer.getTotalSize();
          const itemSpacing = compact ? 1.6 : 2.4;

          // Calculate paddingBottom (same as paddingTop)
          const paddingBottom = simpleStyle ? 16 : compact ? 4 : 4;

          // Calculate max scroll position
          // virtualizerTotalSize already includes spacing for all items
          // The last item has no marginBottom, so we use virtualizerTotalSize directly
          // Add paddingBottom to allow scrolling to see the last item with padding
          const maxScrollTop = Math.max(0, virtualizerTotalSize + paddingBottom - clientHeight);

          // ALWAYS scroll to max position (force it)
          scrollElement.scrollTop = maxScrollTop;

          // Update last scroll position
          lastScrollTopRef.current = scrollElement.scrollTop;

          // Double-check after rendering to ensure we're at the exact max
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!virtualizer || !isAutoScrollEnabledRef.current) {
                isScrollingProgrammaticallyRef.current = false;
                return;
              }

              try {
                // Get scroll element again (might have changed)
                let scrollElement: HTMLElement | null = null;
                const v2 = virtualizer as VirtualizerWithScrollElement | null | undefined;
                if (v2 && typeof v2.getScrollElement === 'function') {
                  try {
                    scrollElement = v2.getScrollElement() as HTMLElement | null;
                  } catch (error) {
                    // Ignore
                  }
                }
                if (!scrollElement && scrollElementRef && scrollElementRef.current) {
                  scrollElement = scrollElementRef.current;
                }

                if (!scrollElement) {
                  isScrollingProgrammaticallyRef.current = false;
                  return;
                }

                const { scrollTop } = scrollElement;
                const virtualizerTotalSize = virtualizer
                  ? virtualizer.getTotalSize()
                  : scrollElement.scrollHeight;
                const paddingBottom = simpleStyle ? 16 : compact ? 4 : 4;
                // Use virtualizerTotalSize + paddingBottom to see the last item completely with padding
                const maxScrollTop = Math.max(
                  0,
                  virtualizerTotalSize + paddingBottom - scrollElement.clientHeight
                );

                // Force to exact max if needed
                if (Math.abs(scrollTop - maxScrollTop) > 1) {
                  scrollElement.scrollTop = maxScrollTop;
                }

                // Update last scroll position
                lastScrollTopRef.current = scrollElement.scrollTop;

                // Reset flag after scroll is complete
                if (scrollTimeoutRef.current) {
                  clearTimeout(scrollTimeoutRef.current);
                }
                scrollTimeoutRef.current = setTimeout(() => {
                  isScrollingProgrammaticallyRef.current = false;
                }, 300);
              } catch {
                isScrollingProgrammaticallyRef.current = false;
              }
            });
          });
        } catch {
          isScrollingProgrammaticallyRef.current = false;
        }
      };

      // Use requestAnimationFrame to ensure DOM is updated, then call performScroll
      requestAnimationFrame(() => {
        performScroll();
      });
    },
    [virtualizer, totalCount, enabled, compact, simpleStyle, scrollElementRef]
  );

  /**
   * Check if user is at the bottom of the scroll container
   */
  const isAtBottom = useCallback((): boolean => {
    if (!virtualizer) return false;

    try {
      const v = virtualizer as VirtualizerWithScrollElement;
      const scrollElement = (
        typeof v.getScrollElement === 'function' ? v.getScrollElement() : null
      ) as HTMLElement | null;
      if (!scrollElement) return false;

      const { scrollTop, clientHeight } = scrollElement;
      const virtualizerTotalSize = virtualizer.getTotalSize();
      const paddingBottom = simpleStyle ? 16 : compact ? 4 : 4;
      const maxScrollTop = Math.max(0, virtualizerTotalSize + paddingBottom - clientHeight);
      const distanceFromBottom = maxScrollTop - scrollTop;

      return Math.abs(distanceFromBottom) <= AT_BOTTOM_THRESHOLD;
    } catch (error) {
      return false;
    }
  }, [virtualizer, compact, simpleStyle]);

  /**
   * Handle scroll events to detect user interaction
   * - Only disable auto-scroll if user manually scrolls UP (not during programmatic scroll)
   * - If user scrolls back to bottom: re-enable auto-scroll
   */
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      if (!enabled || !virtualizer) return;

      const scrollElement = e.target as HTMLElement;
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;

      // Calculate paddingBottom (same as paddingTop)
      const paddingBottom = simpleStyle ? 16 : compact ? 4 : 4;
      // Use virtualizerTotalSize + paddingBottom to see the last item completely with padding
      const virtualizerTotalSize = virtualizer ? virtualizer.getTotalSize() : scrollHeight;
      const maxScrollTop = Math.max(0, virtualizerTotalSize + paddingBottom - clientHeight);
      const distanceFromBottom = maxScrollTop - scrollTop;
      const atBottom = Math.abs(distanceFromBottom) <= AT_BOTTOM_THRESHOLD;

      // If we're scrolling programmatically, DON'T disable auto-scroll
      // Just update position and return early
      if (isScrollingProgrammaticallyRef.current) {
        // Update last scroll position even during programmatic scroll
        lastScrollTopRef.current = scrollTop;
        // Keep auto-scroll enabled during programmatic scroll
        if (!isAutoScrollEnabledRef.current) {
          isAutoScrollEnabledRef.current = true;
        }
        return;
      }

      // Manual user scroll - detect direction and state
      const lastScrollTop = lastScrollTopRef.current;

      // Only update if scrollTop actually changed (avoid false positives)
      if (scrollTop === lastScrollTop) {
        return;
      }

      // Detect scroll direction: if scrollTop decreased significantly, user scrolled UP
      // Use a threshold to avoid false positives from small adjustments
      const scrollDelta = scrollTop - lastScrollTop;
      const scrolledUp = scrollDelta < -5; // Only consider it "up" if moved more than 5px up

      // Update last scroll position
      lastScrollTopRef.current = scrollTop;

      const wasAutoScrollEnabled = isAutoScrollEnabledRef.current;

      // Track if we're at bottom
      if (atBottom && !wasAtBottomRef.current) {
        wasAtBottomRef.current = true;
      } else if (!atBottom && wasAtBottomRef.current) {
        wasAtBottomRef.current = false;
      }

      // Always re-enable auto-scroll when at bottom (even if already enabled)
      if (atBottom) {
        if (!wasAutoScrollEnabled) {
          isAutoScrollEnabledRef.current = true;
        }
      } else if (scrolledUp) {
        // User scrolled UP significantly (not down): disable auto-scroll
        // This only happens on manual user scroll, not during programmatic scroll
        if (wasAutoScrollEnabled) {
          isAutoScrollEnabledRef.current = false;
        }
      }
      // If scrolled down or small movement, don't change state (might be catching up or programmatic)
    },
    [enabled, virtualizer, AT_BOTTOM_THRESHOLD, compact, simpleStyle]
  );

  /**
   * Scroll to bottom when virtualizer becomes available
   */
  useEffect(() => {
    if (enabled && totalCount > 0 && virtualizer && isAutoScrollEnabledRef.current) {
      const timeoutId = setTimeout(() => {
        scrollToBottom(false);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [enabled, totalCount, virtualizer, scrollToBottom]);

  /**
   * Auto-scroll when new logs are added (only if auto-scroll is enabled)
   */
  useEffect(() => {
    if (!enabled || !virtualizer) {
      prevLogCountRef.current = totalCount;
      return;
    }

    const prevCount = prevLogCountRef.current;
    const hasNewLogs = totalCount > prevCount;

    if (hasNewLogs && isAutoScrollEnabledRef.current) {
      // Use double requestAnimationFrame to ensure virtualizer has rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      });
    }

    prevLogCountRef.current = totalCount;
  }, [totalCount, enabled, scrollToBottom, virtualizer]);

  /**
   * Follow-up pin to bottom when the virtualizer's total size grows without
   * the item count changing. This happens on every multi-line log: the item
   * is first rendered at its estimated single-line height, then the inner
   * `measureElement` callback remeasures it and the total size jumps up. If
   * we don't re-scroll here, the viewport stays anchored at the (now stale)
   * offset computed from the estimated size and the user sees the bottom
   * row clipped.
   */
  useEffect(() => {
    if (!enabled || !virtualizer) {
      prevTotalSizeRef.current = totalSize;
      return;
    }
    const prev = prevTotalSizeRef.current;
    prevTotalSizeRef.current = totalSize;
    if (totalSize > prev && isAutoScrollEnabledRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [totalSize, enabled, virtualizer, scrollToBottom]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleScroll,
  };
};
