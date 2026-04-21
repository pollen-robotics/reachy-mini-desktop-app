import { useState, useEffect, useRef } from 'react';

/**
 * Track page visibility via the Page Visibility API.
 *
 * Returns `isVisible` (boolean) and automatically calls the provided
 * `onResume` callback when the window becomes visible again after being
 * hidden. This prevents stale state caused by browser/WebView throttling.
 *
 * Prefer this over focus/blur events: blur fires on every window switch
 * (DevTools, another app) which is too aggressive. The Visibility API only
 * fires when the page is actually hidden (minimized, tab switched).
 */
export function useWindowVisible(onResume?: () => void): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  const wasPausedRef = useRef<boolean>(false);
  const onResumeRef = useRef<typeof onResume>(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    const handler = (): void => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);

      if (!visible) {
        wasPausedRef.current = true;
      } else if (wasPausedRef.current) {
        wasPausedRef.current = false;
        onResumeRef.current?.();
      }
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}
