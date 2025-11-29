import { useState, useEffect, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { extractErrorMessage, formatUserErrorMessage, isRecoverableError as checkRecoverableError } from '../../utils/errorUtils';
import { isDevMode } from '../../utils/devMode';
import { DAEMON_CONFIG, isOnline } from '../../config/daemon';

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
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const retryCountRef = useRef(0);
  const lastCheckTimeRef = useRef(null);
  const isCheckingRef = useRef(false); // Prevent multiple simultaneous checks

  // Use centralized error utility (DRY)
  const isRecoverableError = useCallback((err) => {
    return checkRecoverableError(err);
  }, []);

  /**
   * Retry with exponential backoff
   */
  const sleep = useCallback((ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  /**
   * Checks if an update is available with automatic retry
   */
  const checkForUpdates = useCallback(async (retryCount = 0) => {
    // Prevent retry if already at max
    if (retryCount > maxRetries) {
      console.warn('⚠️ Max retries reached, stopping update check');
      setIsChecking(false);
      isCheckingRef.current = false;
      return null;
    }

    // Prevent multiple simultaneous checks
    if (isCheckingRef.current && retryCount === 0) {
      console.warn('⚠️ Update check already in progress, skipping');
      return null;
    }

    // ✅ Check internet connectivity BEFORE making network request
    // Uses centralized isOnline() helper (DRY)
    if (!isOnline()) {
      console.warn('⚠️ navigator.onLine reports offline, skipping update check');
      setIsChecking(false);
      isCheckingRef.current = false;
      setError('No internet connection. Please check your network settings.');
      return null;
    }

    isCheckingRef.current = true;
    setIsChecking(true);
    setError(null);

    try {
      const update = await check();
      
      // Reset retry count on success
      retryCountRef.current = 0;
      lastCheckTimeRef.current = Date.now();
      isCheckingRef.current = false;
      
      if (update) {
        setUpdateAvailable(update);
        return update;
      } else {
        setUpdateAvailable(null);
        return null;
      }
    } catch (err) {
      // Extract error message using centralized utility (DRY)
      const errorMessage = extractErrorMessage(err);
      const errorString = errorMessage.toLowerCase();
      
      console.error(`❌ Error checking for updates (attempt ${retryCount + 1}/${maxRetries}):`, errorMessage);
      
      // Automatic retry for recoverable errors (only if under max retries)
      if (isRecoverableError(err) && retryCount < maxRetries) {
        const delay = retryDelay * Math.pow(2, retryCount); // Exponential backoff
        
        console.log(`🔄 Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
        await sleep(delay);
        retryCountRef.current = retryCount + 1;
        return checkForUpdates(retryCount + 1);
      }
      
      // Non-recoverable error or max retries reached
      // In dev mode, be more lenient - don't show errors for missing update server
      const isDev = isDevMode();
      const isMissingUpdateServer = errorString.includes('release json') || 
                                    errorString.includes('could not fetch') ||
                                    errorString.includes('404');
      
      let userErrorMessage = null;
      
      // In dev mode, silently ignore missing update server (normal case)
      if (isDev && isMissingUpdateServer) {
        console.log('ℹ️ Update server not available (dev mode - this is normal)');
        // Don't set error in dev mode for missing server
      } else if (isRecoverableError(err) || isMissingUpdateServer) {
        // Production: show user-friendly message
        userErrorMessage = `Unable to check for updates. Please check your internet connection.`;
      } else {
        // Other errors: format and show
        userErrorMessage = formatUserErrorMessage(errorMessage);
      }
      
      // Only set error if we've exhausted retries and have a message (don't show error during retries)
      if (retryCount >= maxRetries && userErrorMessage) {
        setError(userErrorMessage);
      }
      isCheckingRef.current = false;
      setIsChecking(false);
      return null;
    }
  }, [maxRetries, retryDelay, isRecoverableError, sleep]);

  /**
   * Downloads and installs the update with robust error handling
   */
  const downloadAndInstall = useCallback(async (update, retryCount = 0) => {
    if (!update) {
      console.warn('⚠️ No update available');
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

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setDownloadProgress(0);
            lastProgress = 0;
            targetProgress = 0;
            // Safety timeout: if no progress for 30s, consider as error
            progressTimeout = setTimeout(() => {
              console.warn('⚠️ Download stalled, timeout...');
            }, 30000);
            break;
          
          case 'Progress':
            const { chunkLength, contentLength } = event.data;
            const progress = contentLength > 0 
              ? Math.round((chunkLength / contentLength) * 100)
              : 0;
            
            // Always update target, even for small changes
            targetProgress = progress;
            
            // Update immediately if significant change or if it's the first time
            const timeSinceLastUpdate = Date.now() - lastUpdateTime;
            if (Math.abs(progress - lastProgress) >= 0.5 || timeSinceLastUpdate > 100 || progress === 100) {
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
            if (progressTimeout) {
              clearTimeout(progressTimeout);
              progressTimeout = setTimeout(() => {
                console.warn('⚠️ Download stalled, timeout...');
              }, 30000);
            }
            
            break;
          
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
      
      // downloadAndInstall should handle restart automatically,
      // but we call relaunch() explicitly to ensure restart happens
      // Note: In dev mode, relaunch might not work correctly
      try {
        // Small delay to ensure installation is complete before restarting
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.UPDATE_CHECK.RETRY_DELAY));
        
        // Attempt to relaunch
        await relaunch();
        
        // If we reach here, relaunch didn't work (shouldn't happen)
        console.warn('⚠️ Relaunch returned without error, but app should have restarted');
      } catch (relaunchError) {
        console.error('❌ Error during relaunch:', relaunchError);
        // In dev mode, relaunch might fail - this is expected
        // The app should still restart automatically via Tauri's updater mechanism
        // Don't throw here, as the update was successful
      }
    } catch (err) {
      console.error(`❌ Error installing update (attempt ${retryCount + 1}/${maxRetries}):`, err);
      
      // Extract and format error message using centralized utilities (DRY)
      let errorMessage = formatUserErrorMessage(extractErrorMessage(err));
      
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
      }, [maxRetries, retryDelay, isRecoverableError, sleep]);

  /**
   * Installe la mise à jour disponible
   */
  const installUpdate = useCallback(async () => {
    if (updateAvailable) {
      await downloadAndInstall(updateAvailable);
    }
  }, [updateAvailable, downloadAndInstall]);

  /**
   * Ignore la mise à jour disponible
   */
  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(null);
  }, []);

  // Listen for online/offline events to retry when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      console.log('✅ Internet connection restored');
      // Clear error if we were offline
      setError((prevError) => {
        if (prevError && prevError.includes('No internet connection')) {
          return null;
        }
        return prevError;
      });
      // Retry update check if autoCheck is enabled and not already checking
      if (autoCheck && !isCheckingRef.current) {
        // Use a small delay to ensure state is updated
        setTimeout(() => {
          if (!isCheckingRef.current && isOnline()) {
            checkForUpdates();
          }
        }, 500);
      }
    };

    const handleOffline = () => {
      console.warn('⚠️ Internet connection lost');
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
      
      if (timeSinceLastCheck > 5 * 60 * 1000) { // 5 minutes
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
    dismissUpdate,
  };
};

