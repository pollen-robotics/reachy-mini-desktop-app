import { useState, useEffect } from 'react';

/**
 * Hook to detect network connectivity status
 * Uses navigator.onLine and listens to online/offline events
 * 
 * Note: navigator.onLine can be unreliable (may report online even without actual Internet),
 * but it's still useful as a first check. Actual network requests will handle real errors.
 * 
 * @returns {object} Network status
 * @returns {boolean} isOnline - Current online status
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Check initial state
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    // Default to online if navigator not available (shouldn't happen in Tauri)
    return true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}

