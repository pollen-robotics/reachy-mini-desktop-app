import { useState, useEffect, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  extractErrorMessage,
  formatUserErrorMessage,
  isRecoverableError as checkRecoverableError,
  getDetailedUpdateErrorMessage,
} from '../../utils/errorUtils';
import { isDevMode } from '../../utils/devMode';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Hook to manage automatic application updates
 * Enhanced version with retry logic and robust error handling
 *
 * @param {object} options - Configuration options
 * @param {boolean} options.autoCheck - Automatically check on startup (default: true)
 * @param {number} options.checkInterval - Check interval in ms (default: 3600000 = 1h)
 * @param {number} options.maxRetries - Maximum number of retries on error (default: 3)
 * @param {number} options.retryDelay - Initial delay between retries in ms (default: 1000)
 * @returns {object} State and update functions
 */
export const useUpdater = ({
  autoCheck = true,
  checkInterval = 3600000, // 1 hour by default
  maxRetries = 3,
  retryDelay = 1000,
} = {}) => {
  // 🧪 DEBUG: Force update available for testing
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const retryCountRef = useRef(0);
  const lastCheckTimeRef = useRef(null);
  const isCheckingRef = useRef(false); // Prevent multiple simultaneous checks

  // Use centralized error utility (DRY)
  const isRecoverableError = useCallback(err => {
    return checkRecoverableError(err);
  }, []);

  /**
   * Retry with exponential backoff
   */
  const sleep = useCallback(ms => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  /**
   * Checks if an update is available with automatic retry
   */
  const checkForUpdates = useCallback(
    async (retryCount = 0) => {
      // Prevent retry if already at max
      if (retryCount > maxRetries) {
        setIsChecking(false);
        isCheckingRef.current = false;
        return null;
      }

      // Prevent multiple simultaneous checks
      if (isCheckingRef.current && retryCount === 0) {
        return null;
      }

      // ✅ Try to fetch latest.json directly - if it works, we have internet + we know if there's an update
      // No need for separate healthcheck - the update check itself tells us about connectivity

      isCheckingRef.current = true;
      setIsChecking(true);
      setError(null);

      // ✅ CRITICAL FIX: Add timeout to prevent infinite blocking
      // If check() hangs (network issue, GitHub down, etc.), we timeout after 30s
      const CHECK_TIMEOUT = DAEMON_CONFIG.UPDATE_CHECK.CHECK_TIMEOUT || 30000;
      let timeoutId = null;

      try {
        // Wrapper check() with timeout using Promise.race
        const checkPromise = check();
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error('Update check timeout: The update server did not respond within 30 seconds')
            );
          }, CHECK_TIMEOUT);
        });

        const update = await Promise.race([checkPromise, timeoutPromise]);

        // ✅ Clear timeout if check succeeded (guaranteed cleanup)
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Reset retry count on success
        retryCountRef.current = 0;
        lastCheckTimeRef.current = Date.now();
        isCheckingRef.current = false;
        setIsChecking(false); // ✅ Ensure isChecking is always set to false on success

        if (update) {
          setUpdateAvailable(update);
          return update;
        } else {
          setUpdateAvailable(null);
          return null;
        }
      } catch (err) {
        // ✅ CRITICAL: Always clear timeout in case of error (guaranteed cleanup)
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Extract error message using centralized utility (DRY)
        const errorMessage = extractErrorMessage(err);
        const errorString = errorMessage.toLowerCase();

        // ✅ Detect timeout errors as recoverable
        const isTimeout =
          errorString.includes('timeout') || errorString.includes('did not respond');

        // Check if this is a missing update server error (common in dev mode)
        const isMissingUpdateServer =
          errorString.includes('release json') ||
          errorString.includes('could not fetch') ||
          errorString.includes('404');
        const isDev = isDevMode();

        // In dev mode, immediately stop checking if update server is missing (no retries needed)
        if (isDev && isMissingUpdateServer) {
          isCheckingRef.current = false;
          setIsChecking(false);
          setUpdateAvailable(null);
          setError(null);
          return null;
        }

        // ✅ Use detailed error message function for better user feedback
        const detailedError = getDetailedUpdateErrorMessage(err, retryCount, maxRetries, isTimeout);

        // ✅ Treat timeout as recoverable error (retry if under max retries)
        const shouldRetry = (isRecoverableError(err) || isTimeout) && retryCount < maxRetries;

        // Automatic retry for recoverable errors or timeouts (only if under max retries)
        if (shouldRetry) {
          const delay = retryDelay * Math.pow(2, retryCount); // Exponential backoff

          // ✅ Synchronize retryCountRef with retryCount
          retryCountRef.current = retryCount + 1;

          // ✅ Show retry message to user (non-blocking, will be replaced by final error if all retries fail)
          if (retryCount === 0) {
            // Only show on first retry to avoid spam
            setError(detailedError);
          }

          await sleep(delay);
          return checkForUpdates(retryCount + 1);
        }

        // Non-recoverable error or max retries reached
        // ✅ Use detailed error message with full context
        const userErrorMessage = getDetailedUpdateErrorMessage(
          err,
          retryCount,
          maxRetries,
          isTimeout
        );

        // Only set error if we've exhausted retries and have a message (don't show error during retries)
        if (retryCount >= maxRetries && userErrorMessage) {
          setError(userErrorMessage);
        }

        // ✅ CRITICAL: Always reset isChecking to false, even on error
        isCheckingRef.current = false;
        setIsChecking(false);
        return null;
      }
    },
    [maxRetries, retryDelay, isRecoverableError, sleep]
  );

  /**
   * Downloads and installs the update with robust error handling
   */
  const downloadAndInstall = useCallback(
    async (update, retryCount = 0) => {
      if (!update) {
        return;
      }

      setIsDownloading(true);
      setDownloadProgress(0);
      setError(null);

      let lastProgress = 0;
      let lastUpdateTime = Date.now();
      let progressTimeout = null;
      let animationFrameId = null;
      let targetProgress = 0;
      let currentDisplayProgress = 0;
      let downloadAborted = false;

      // Cleanup helper (production-grade)
      const cleanup = () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        if (progressTimeout) {
          clearTimeout(progressTimeout);
          progressTimeout = null;
        }
      };

      try {
        // Check if download was aborted before starting
        if (downloadAborted) {
          return;
        }

        // Animation function for smooth interpolation
        const animateProgress = () => {
          if (currentDisplayProgress < targetProgress) {
            // Linear interpolation for smooth animation
            const increment = Math.max(0.5, (targetProgress - currentDisplayProgress) * 0.1);
            currentDisplayProgress = Math.min(targetProgress, currentDisplayProgress + increment);
            setDownloadProgress(Math.round(currentDisplayProgress));
            animationFrameId = requestAnimationFrame(animateProgress);
          } else {
            animationFrameId = null;
          }
        };

        await update.downloadAndInstall(event => {
          switch (event.event) {
            case 'Started':
              setDownloadProgress(0);
              lastProgress = 0;
              targetProgress = 0;
              // Safety timeout: if no progress for 60s, abort download
              progressTimeout = setTimeout(() => {
                downloadAborted = true;
                cleanup();
                setIsDownloading(false);
                setDownloadProgress(0);
                setError('Download timeout. Please check your internet connection and try again.');
              }, 60000); // 60 seconds timeout
              break;

            case 'Progress': {
              const { chunkLength, contentLength } = event.data;
              const progress =
                contentLength > 0 ? Math.round((chunkLength / contentLength) * 100) : 0;

              // Always update target, even for small changes
              targetProgress = progress;

              // Update immediately if significant change or if it's the first time
              const timeSinceLastUpdate = Date.now() - lastUpdateTime;
              if (
                Math.abs(progress - lastProgress) >= 0.5 ||
                timeSinceLastUpdate > 100 ||
                progress === 100
              ) {
                // Stop animation if target reached
                if (animationFrameId) {
                  cancelAnimationFrame(animationFrameId);
                  animationFrameId = null;
                }
                currentDisplayProgress = progress;
                setDownloadProgress(progress);
                lastProgress = progress;
                lastUpdateTime = Date.now();
              } else {
                // Start animation for smooth interpolation
                if (!animationFrameId) {
                  animationFrameId = requestAnimationFrame(animateProgress);
                }
              }

              // Reset timeout if progress detected
              if (progressTimeout && !downloadAborted) {
                clearTimeout(progressTimeout);
                progressTimeout = setTimeout(() => {
                  downloadAborted = true;
                  cleanup();
                  setIsDownloading(false);
                  setDownloadProgress(0);
                  setError(
                    'Download timeout. Please check your internet connection and try again.'
                  );
                }, 60000); // 60 seconds timeout
              }

              break;
            }

            case 'Finished':
              // Stop animation and cleanup
              cleanup();
              setDownloadProgress(100);
              targetProgress = 100;
              break;

            default:
              break;
          }
        });

        // Explicitly relaunch after install; Tauri's updater doesn't always
        // auto-restart (especially on consecutive updates in the same session).
        try {
          await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.UPDATE_CHECK.RETRY_DELAY));
          await relaunch();
        } catch {
          // relaunch() can fail on the second consecutive update (stale process
          // handle after the first in-place binary swap). Surface it to the user.
          setIsDownloading(false);
          setDownloadProgress(100);
          setError('Update installed successfully. Please restart the app manually to apply it.');
        }
      } catch (err) {
        // Extract and format error message using centralized utilities (DRY)
        const rawErrorMessage = extractErrorMessage(err);
        let errorMessage = formatUserErrorMessage(rawErrorMessage);

        // Automatic retry for recoverable errors during download
        if (isRecoverableError(err) && retryCount < maxRetries) {
          const delay = retryDelay * Math.pow(2, retryCount);
          await sleep(delay);
          return downloadAndInstall(update, retryCount + 1);
        }

        // Non-recoverable error or max retries reached
        if (isRecoverableError(err)) {
          errorMessage = `Network error while downloading update (${retryCount + 1}/${maxRetries} attempts). Please try again later.`;
        }

        setError(errorMessage);
        setIsDownloading(false);
        setDownloadProgress(0);

        // Clean up on error (production-grade)
        cleanup();
      }
    },
    [maxRetries, retryDelay, isRecoverableError, sleep]
  );

  /**
   * Installs the available update
   */
  const installUpdate = useCallback(async () => {
    if (updateAvailable) {
      await downloadAndInstall(updateAvailable);
    }
  }, [updateAvailable, downloadAndInstall]);

  // Listen for online/offline events to retry when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      // Clear error if we were offline
      setError(prevError => {
        if (prevError && prevError.includes('No internet connection')) {
          return null;
        }
        return prevError;
      });
      // Retry update check if autoCheck is enabled and not already checking
      if (autoCheck && !isCheckingRef.current) {
        // Use a small delay to ensure state is updated
        setTimeout(() => {
          if (!isCheckingRef.current && navigator.onLine) {
            checkForUpdates();
          }
        }, 500);
      }
    };

    const handleOffline = () => {
      // If we're checking, stop and show error
      if (isCheckingRef.current) {
        isCheckingRef.current = false;
        setIsChecking(false);
        setError('No internet connection. Please check your network settings.');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoCheck, checkForUpdates]);

  // Automatic check on startup (with delay to avoid blocking startup)
  useEffect(() => {
    if (autoCheck && !isCheckingRef.current) {
      // Wait for app to be fully loaded before checking
      const timeout = setTimeout(() => {
        checkForUpdates();
      }, DAEMON_CONFIG.UPDATE_CHECK.STARTUP_DELAY);

      return () => clearTimeout(timeout);
    }
  }, [autoCheck, checkForUpdates]);

  // Periodic check (only if no recent check)
  useEffect(() => {
    if (!autoCheck || checkInterval <= 0) return;

    const interval = setInterval(() => {
      // Don't check if a check was done recently (< 5 min)
      const timeSinceLastCheck = lastCheckTimeRef.current
        ? Date.now() - lastCheckTimeRef.current
        : Infinity;

      if (timeSinceLastCheck > 5 * 60 * 1000) {
        // 5 minutes
        checkForUpdates();
      }
    }, checkInterval);

    return () => clearInterval(interval);
  }, [autoCheck, checkInterval, checkForUpdates]);

  return {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    checkForUpdates,
    installUpdate,
  };
};
