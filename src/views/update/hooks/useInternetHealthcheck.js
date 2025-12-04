import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchExternal } from '../../../config/daemon';

/**
 * Hook to check internet connectivity with a robust hybrid approach
 * Combines navigator.onLine (fast) with real healthcheck (reliable)
 * Uses Cloudflare DNS endpoint which is designed for connectivity checks
 * 
 * @param {object} options - Configuration options
 * @param {number} options.interval - Check interval in ms (default: 5000 = 5s)
 * @param {number} options.timeout - Request timeout in ms (default: 3000 = 3s)
 * @param {string} options.endpoint - Healthcheck endpoint (default: Cloudflare DNS)
 * @returns {object} Internet connectivity status
 * @returns {boolean} isOnline - Current internet connectivity status
 * @returns {boolean} isChecking - Whether a check is currently in progress
 * @returns {boolean} hasChecked - Whether at least one check has completed
 */
export function useInternetHealthcheck({
  interval = 5000,
  timeout = 3000,
  // Use a reliable public healthcheck endpoint with valid SSL certificate
  // httpbin.org is a well-known testing service with proper certificates
  endpoint = 'https://httpbin.org/status/200', // Simple status endpoint, reliable and has valid cert
} = {}) {
  // Initialize with navigator.onLine for immediate feedback
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return null; // null = not checked yet
  });
  const [hasChecked, setHasChecked] = useState(false); // Track if we've had at least one real check
  const hasPerformedFirstCheckRef = useRef(false); // Track if we've performed at least one check attempt
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const consecutiveFailuresRef = useRef(0); // Track consecutive failures to avoid false negatives

  // Listen to navigator.onLine changes for fast detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setHasChecked(true); // Mark as checked when navigator reports offline
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const performHealthcheck = useCallback(async () => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsChecking(true);
    
    // Mark that we've attempted at least one check
    if (!hasPerformedFirstCheckRef.current) {
      hasPerformedFirstCheckRef.current = true;
    }

    try {
      const controller = abortControllerRef.current;
      
      // Use fetchExternal (Tauri's standardized fetch with timeout)
      // Cloudflare DNS endpoint is designed for connectivity checks and doesn't require CORS
      // Use no-cors mode to avoid CORS issues - we can't check status but can detect network errors
      const response = await fetchExternal(
        endpoint,
        {
          method: 'GET',
          mode: 'no-cors', // Avoid CORS issues - we can't read response but can detect network errors
          cache: 'no-cache',
          signal: controller.signal,
        },
        timeout,
        { silent: true } // Don't log healthcheck requests
      );

      // With no-cors, we can't check response.ok or status, but if we get here without error,
      // it means the network request succeeded (even if we can't read the response)
      // This is a valid and robust way to check connectivity
      consecutiveFailuresRef.current = 0; // Reset failure counter
      setIsOnline(true);
      setHasChecked(true); // Mark as checked after successful check
    } catch (error) {
      // Only update if not aborted (abort means component unmounted or new check started)
      if (error.name !== 'AbortError') {
        console.warn('⚠️ Internet healthcheck error:', error.name, error.message);
        consecutiveFailuresRef.current += 1;
        // Only mark as offline after 2 consecutive failures (avoid false negatives)
        if (consecutiveFailuresRef.current >= 2) {
          setIsOnline(false);
        }
        // Always mark as checked after first attempt (even if it fails)
        // This ensures the UI indicator appears even if the first check fails
        setHasChecked(true);
      }
    } finally {
      setIsChecking(false);
      abortControllerRef.current = null;
    }
  }, [endpoint, timeout]);

  useEffect(() => {
    // Perform initial check immediately
    performHealthcheck();

    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      performHealthcheck();
    }, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [interval, performHealthcheck]);

  return { isOnline, isChecking, hasChecked };
}

