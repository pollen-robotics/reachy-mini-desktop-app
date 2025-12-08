import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for auto-scrolling with @tanstack/react-virtual
 * 
 * Behavior:
 * - By default: auto-scroll is always active, always at maximum scroll position
 * - If user scrolls up: auto-scroll is disabled, user can navigate freely
 * - If user scrolls back to bottom: auto-scroll is re-enabled
 * 
 * @param {Object} params
 * @param {Object} params.virtualizer - Virtualizer instance from useVirtualizer
 * @param {number} params.totalCount - Total number of logs
 * @param {boolean} [params.enabled=true] - Enable auto-scroll
 * @param {boolean} [params.compact=false] - Compact mode (to calculate item spacing)
 * @param {boolean} [params.simpleStyle=false] - Simple style mode (to calculate padding)
 * @param {React.RefObject} [params.scrollElementRef] - Direct ref to the scroll element (fallback)
 * @returns {Object} { handleScroll }
 */
export const useVirtualizerScroll = ({ 
  virtualizer, 
  totalCount,
  enabled = true,
  compact = false,
  simpleStyle = false,
  scrollElementRef = null,
}) => {
  const prevLogCountRef = useRef(totalCount);
  const isAutoScrollEnabledRef = useRef(true); // Start with auto-scroll enabled
  const isScrollingProgrammaticallyRef = useRef(false); // Track if we're scrolling programmatically
  const lastScrollTopRef = useRef(0); // Track last scroll position to detect direction
  const scrollTimeoutRef = useRef(null); // For clearing scroll flag
  const wasAtBottomRef = useRef(false); // Track if we were at bottom (for logging)
  
  // Threshold for "at bottom" detection (in pixels)
  // Increased to account for rounding and padding issues
  const AT_BOTTOM_THRESHOLD = 8;
  
  /**
   * Force scroll to absolute bottom
   */
  const scrollToBottom = useCallback((smooth = false) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVirtualizerScroll] scrollToBottom called:', {
        hasVirtualizer: !!virtualizer,
        enabled,
        isAutoScrollEnabled: isAutoScrollEnabledRef.current,
        totalCount,
        smooth,
        compact,
      });
    }
    
    if (!virtualizer || !enabled || !isAutoScrollEnabledRef.current || totalCount === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVirtualizerScroll] scrollToBottom skipped (conditions not met)');
      }
      return;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVirtualizerScroll] 🚀 Starting programmatic scroll to bottom');
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
      let scrollElement = null;
      
      // First try: use virtualizer.getScrollElement if available
      if (virtualizer && typeof virtualizer.getScrollElement === 'function') {
        try {
          scrollElement = virtualizer.getScrollElement();
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[useVirtualizerScroll] Error calling getScrollElement:', error);
          }
        }
      }
      
      // Fallback: use direct ref if available
      if (!scrollElement && scrollElementRef && scrollElementRef.current) {
        scrollElement = scrollElementRef.current;
      }
      
      if (!scrollElement) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useVirtualizerScroll] ⚠️ No scroll element available, retrying in 50ms...');
        }
        // Retry after a short delay
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
        const paddingBottom = simpleStyle ? 16 : (compact ? 4 : 4);
        
        // Calculate max scroll position
        // virtualizerTotalSize already includes spacing for all items
        // The last item has no marginBottom, so we use virtualizerTotalSize directly
        // Add paddingBottom to allow scrolling to see the last item with padding
        const maxScrollTop = Math.max(0, virtualizerTotalSize + paddingBottom - clientHeight);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[useVirtualizerScroll] 📊 Scroll calculation:', {
            virtualizerTotalSize,
            paddingBottom,
            itemSpacing,
            clientHeight,
            maxScrollTop,
            currentScrollTop,
            needsScroll: Math.abs(currentScrollTop - maxScrollTop) > 1,
          });
        }
        
        // ALWAYS scroll to max position (force it)
        scrollElement.scrollTop = maxScrollTop;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[useVirtualizerScroll] ✅ FORCED scroll to:', maxScrollTop, 'from:', currentScrollTop);
        }
        
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
              let scrollElement = null;
              if (virtualizer && typeof virtualizer.getScrollElement === 'function') {
                try {
                  scrollElement = virtualizer.getScrollElement();
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
              const virtualizerTotalSize = virtualizer ? virtualizer.getTotalSize() : scrollElement.scrollHeight;
              const paddingBottom = simpleStyle ? 16 : (compact ? 4 : 4);
              // Use virtualizerTotalSize + paddingBottom to see the last item completely with padding
              const maxScrollTop = Math.max(0, virtualizerTotalSize + paddingBottom - scrollElement.clientHeight);
              
              // Force to exact max if needed
              if (Math.abs(scrollTop - maxScrollTop) > 1) {
                scrollElement.scrollTop = maxScrollTop;
                if (process.env.NODE_ENV === 'development') {
                  console.log('[useVirtualizerScroll] 🔧 Final correction:', {
                    oldScrollTop: scrollTop,
                    newScrollTop: maxScrollTop,
                    difference: scrollTop - maxScrollTop,
                  });
                }
              }
              
              // Update last scroll position
              lastScrollTopRef.current = scrollElement.scrollTop;
              
              // Reset flag after scroll is complete
              if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
              }
              scrollTimeoutRef.current = setTimeout(() => {
                isScrollingProgrammaticallyRef.current = false;
                if (process.env.NODE_ENV === 'development') {
                  console.log('[useVirtualizerScroll] ✅ Scroll complete, final position:', scrollElement.scrollTop);
                }
              }, 300);
            } catch (error) {
              isScrollingProgrammaticallyRef.current = false;
              if (process.env.NODE_ENV === 'development') {
                console.warn('[useVirtualizerScroll] Error in double-check:', error);
              }
            }
          });
        });
      } catch (error) {
        isScrollingProgrammaticallyRef.current = false;
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useVirtualizerScroll] ❌ Scroll error:', error);
        }
      }
    };
    
    // Use requestAnimationFrame to ensure DOM is updated, then call performScroll
    requestAnimationFrame(() => {
      performScroll();
    });
  }, [virtualizer, totalCount, enabled, compact, simpleStyle]);
  
  /**
   * Check if user is at the bottom of the scroll container
   */
  const isAtBottom = useCallback(() => {
    if (!virtualizer) return false;
    
    try {
      const scrollElement = virtualizer.getScrollElement();
      if (!scrollElement) return false;
      
      const { scrollTop, clientHeight } = scrollElement;
      const virtualizerTotalSize = virtualizer.getTotalSize();
      const paddingBottom = simpleStyle ? 16 : (compact ? 4 : 4);
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
  const handleScroll = useCallback((e) => {
    if (!enabled || !virtualizer) return;
    
    const scrollElement = e.target;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    
    // Calculate paddingBottom (same as paddingTop)
    const paddingBottom = simpleStyle ? 16 : (compact ? 4 : 4);
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
    
    // Log when touching the bottom
    if (atBottom && !wasAtBottomRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVirtualizerScroll] 🎯 Touched bottom of scroll container', {
          scrollTop,
          scrollHeight,
          virtualizerTotalSize,
          paddingBottom,
          clientHeight,
          distanceFromBottom,
          maxScrollTop,
        });
      }
      wasAtBottomRef.current = true;
    } else if (!atBottom && wasAtBottomRef.current) {
      wasAtBottomRef.current = false;
    }
    
    // Always re-enable auto-scroll when at bottom (even if already enabled)
    if (atBottom) {
      if (!wasAutoScrollEnabled) {
        isAutoScrollEnabledRef.current = true;
        if (process.env.NODE_ENV === 'development') {
          console.log('[useVirtualizerScroll] ✅ Auto-scroll RE-ENABLED (user reached bottom)', {
            distanceFromBottom,
            scrollTop,
            scrollHeight,
            virtualizerTotalSize,
            paddingBottom,
            clientHeight,
          });
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.log('[useVirtualizerScroll] 📍 At bottom, auto-scroll already enabled', {
          distanceFromBottom,
        });
      }
    } else if (scrolledUp) {
      // User scrolled UP significantly (not down): disable auto-scroll
      // This only happens on manual user scroll, not during programmatic scroll
      if (wasAutoScrollEnabled) {
        isAutoScrollEnabledRef.current = false;
        if (process.env.NODE_ENV === 'development') {
          console.log('[useVirtualizerScroll] ⛔ Auto-scroll DISABLED (user scrolled up)', {
            scrollDelta,
            scrollTop,
            lastScrollTop,
            distanceFromBottom,
          });
        }
      }
    }
    // If scrolled down or small movement, don't change state (might be catching up or programmatic)
  }, [enabled, virtualizer, AT_BOTTOM_THRESHOLD, compact, simpleStyle]);
  
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
  }, [enabled, totalCount, virtualizer, scrollToBottom]);
  
  /**
   * Auto-scroll when new logs are added (only if auto-scroll is enabled)
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVirtualizerScroll] Effect triggered:', {
        enabled,
        hasVirtualizer: !!virtualizer,
        totalCount,
        prevCount: prevLogCountRef.current,
        isAutoScrollEnabled: isAutoScrollEnabledRef.current,
      });
    }
    
    if (!enabled || !virtualizer) {
      prevLogCountRef.current = totalCount;
      return;
    }
    
    const prevCount = prevLogCountRef.current;
    const hasNewLogs = totalCount > prevCount;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVirtualizerScroll] Checking new logs:', {
        hasNewLogs,
        isAutoScrollEnabled: isAutoScrollEnabledRef.current,
        willScroll: hasNewLogs && isAutoScrollEnabledRef.current,
      });
    }
    
    if (hasNewLogs && isAutoScrollEnabledRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVirtualizerScroll] 📜 New logs detected, triggering auto-scroll:', {
          newLogsCount: totalCount - prevCount,
          totalCount,
        });
      }
      // Use double requestAnimationFrame to ensure virtualizer has rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      });
    } else if (hasNewLogs && !isAutoScrollEnabledRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVirtualizerScroll] ⏸️ New logs but auto-scroll is disabled, skipping');
      }
    }
    
    prevLogCountRef.current = totalCount;
  }, [totalCount, enabled, scrollToBottom, virtualizer]);
  
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
