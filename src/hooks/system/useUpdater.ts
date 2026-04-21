import { useState, useEffect, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import type { Update, DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  extractErrorMessage,
  formatUserErrorMessage,
  isRecoverableError as checkRecoverableError,
  getDetailedUpdateErrorMessage,
} from '../../utils/errorUtils';
import { isDevMode } from '../../utils/devMode';
import { DAEMON_CONFIG } from '../../config/daemon';

export interface UseUpdaterOptions {
  /** Automatically check on startup (default: true). */
  autoCheck?: boolean;
  /** Check interval in ms (default: 3_600_000, 1h). */
  checkInterval?: number;
  /** Maximum number of retries on recoverable errors (default: 3). */
  maxRetries?: number;
  /** Initial delay between retries in ms, used as base for exponential backoff (default: 1000). */
  retryDelay?: number;
}

export interface UseUpdaterResult {
  updateAvailable: Update | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
  checkForUpdates: (retryCount?: number) => Promise<Update | null>;
  installUpdate: () => Promise<void>;
}

type TimeoutId = ReturnType<typeof setTimeout>;

/**
 * Hook that manages automatic application updates with retry logic and
 * robust error handling.
 */
export const useUpdater = ({
  autoCheck = true,
  checkInterval = 3600000,
  maxRetries = 3,
  retryDelay = 1000,
}: UseUpdaterOptions = {}): UseUpdaterResult => {
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const retryCountRef = useRef<number>(0);
  const lastCheckTimeRef = useRef<number | null>(null);
  const isCheckingRef = useRef<boolean>(false); // Prevents overlapping checks.

  const isRecoverableError = useCallback((err: unknown): boolean => {
    return checkRecoverableError(err);
  }, []);

  const sleep = useCallback((ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  /**
   * Checks if an update is available, with automatic retry on recoverable
   * errors (network, timeouts). The outer call passes `retryCount = 0`;
   * recursive retries increment it up to `maxRetries`.
   */
  const checkForUpdates = useCallback(
    async (retryCount: number = 0): Promise<Update | null> => {
      if (retryCount > maxRetries) {
        setIsChecking(false);
        isCheckingRef.current = false;
        return null;
      }

      // Prevent overlapping checks - only enforced on the initial call so that
      // recursive retries from a single invocation still go through.
      if (isCheckingRef.current && retryCount === 0) {
        return null;
      }

      // ✅ Try fetching latest.json directly - if it works we have internet
      // AND we know if an update is available, no separate healthcheck needed.

      isCheckingRef.current = true;
      setIsChecking(true);
      setError(null);

      // ✅ Add a timeout to prevent indefinitely blocking on a hanging check()
      // (network issue, GitHub down, etc.) - default 30s.
      const CHECK_TIMEOUT: number = DAEMON_CONFIG.UPDATE_CHECK.CHECK_TIMEOUT || 30000;
      let timeoutId: TimeoutId | null = null;

      try {
        const checkPromise = check();
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error('Update check timeout: The update server did not respond within 30 seconds')
            );
          }, CHECK_TIMEOUT);
        });

        const update = await Promise.race([checkPromise, timeoutPromise]);

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        retryCountRef.current = 0;
        lastCheckTimeRef.current = Date.now();
        isCheckingRef.current = false;
        setIsChecking(false);

        if (update) {
          setUpdateAvailable(update);
          return update;
        }
        setUpdateAvailable(null);
        return null;
      } catch (err) {
        // ✅ Always clean up the timeout on error.
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        const errorMessage: string = extractErrorMessage(err);
        const errorString = errorMessage.toLowerCase();

        const isTimeout =
          errorString.includes('timeout') || errorString.includes('did not respond');

        // Missing update server is the common dev-mode failure mode.
        const isMissingUpdateServer =
          errorString.includes('release json') ||
          errorString.includes('could not fetch') ||
          errorString.includes('404');
        const isDev: boolean = isDevMode();

        // In dev mode with no update server, stop immediately without retries.
        if (isDev && isMissingUpdateServer) {
          isCheckingRef.current = false;
          setIsChecking(false);
          setUpdateAvailable(null);
          setError(null);
          return null;
        }

        const detailedError: string = getDetailedUpdateErrorMessage(
          err,
          retryCount,
          maxRetries,
          isTimeout
        );

        // Treat timeouts as recoverable.
        const shouldRetry = (isRecoverableError(err) || isTimeout) && retryCount < maxRetries;

        if (shouldRetry) {
          const delay = retryDelay * Math.pow(2, retryCount);

          retryCountRef.current = retryCount + 1;

          // Show a retry hint only on the first retry to avoid spamming the UI.
          if (retryCount === 0) {
            setError(detailedError);
          }

          await sleep(delay);
          return checkForUpdates(retryCount + 1);
        }

        // Non-recoverable or retries exhausted.
        const userErrorMessage: string = getDetailedUpdateErrorMessage(
          err,
          retryCount,
          maxRetries,
          isTimeout
        );

        if (retryCount >= maxRetries && userErrorMessage) {
          setError(userErrorMessage);
        }

        isCheckingRef.current = false;
        setIsChecking(false);
        return null;
      }
    },
    [maxRetries, retryDelay, isRecoverableError, sleep]
  );

  /**
   * Downloads and installs the update with robust error handling (smooth
   * progress interpolation, 60s inactivity timeout, retries).
   */
  const downloadAndInstall = useCallback(
    async (update: Update | null, retryCount: number = 0): Promise<void> => {
      if (!update) {
        return;
      }

      setIsDownloading(true);
      setDownloadProgress(0);
      setError(null);

      let lastProgress = 0;
      let lastUpdateTime = Date.now();
      let progressTimeout: TimeoutId | null = null;
      let animationFrameId: number | null = null;
      let targetProgress = 0;
      let currentDisplayProgress = 0;
      let downloadAborted = false;

      const cleanup = (): void => {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        if (progressTimeout !== null) {
          clearTimeout(progressTimeout);
          progressTimeout = null;
        }
      };

      try {
        if (downloadAborted) {
          return;
        }

        const animateProgress = (): void => {
          if (currentDisplayProgress < targetProgress) {
            // Linear interpolation for smooth animation.
            const increment = Math.max(0.5, (targetProgress - currentDisplayProgress) * 0.1);
            currentDisplayProgress = Math.min(targetProgress, currentDisplayProgress + increment);
            setDownloadProgress(Math.round(currentDisplayProgress));
            animationFrameId = requestAnimationFrame(animateProgress);
          } else {
            animationFrameId = null;
          }
        };

        await update.downloadAndInstall((event: DownloadEvent) => {
          switch (event.event) {
            case 'Started':
              setDownloadProgress(0);
              lastProgress = 0;
              targetProgress = 0;
              // Abort if no progress for 60s.
              progressTimeout = setTimeout(() => {
                downloadAborted = true;
                cleanup();
                setIsDownloading(false);
                setDownloadProgress(0);
                setError('Download timeout. Please check your internet connection and try again.');
              }, 60000);
              break;

            case 'Progress': {
              // Older Tauri updater versions included `contentLength` on Progress
              // events; newer ones only type `chunkLength`. Read both through a
              // relaxed cast so we remain compatible at runtime.
              const progressData = event.data as { chunkLength?: number; contentLength?: number };
              const chunkLength = progressData.chunkLength ?? 0;
              const contentLength = progressData.contentLength ?? 0;
              const progress =
                contentLength > 0 ? Math.round((chunkLength / contentLength) * 100) : 0;

              targetProgress = progress;

              // Flush immediately on significant change, on throttle, or at 100%.
              const timeSinceLastUpdate = Date.now() - lastUpdateTime;
              if (
                Math.abs(progress - lastProgress) >= 0.5 ||
                timeSinceLastUpdate > 100 ||
                progress === 100
              ) {
                if (animationFrameId !== null) {
                  cancelAnimationFrame(animationFrameId);
                  animationFrameId = null;
                }
                currentDisplayProgress = progress;
                setDownloadProgress(progress);
                lastProgress = progress;
                lastUpdateTime = Date.now();
              } else {
                // Otherwise animate towards the target.
                if (animationFrameId === null) {
                  animationFrameId = requestAnimationFrame(animateProgress);
                }
              }

              // Bump the inactivity watchdog when we see real progress.
              if (progressTimeout !== null && !downloadAborted) {
                clearTimeout(progressTimeout);
                progressTimeout = setTimeout(() => {
                  downloadAborted = true;
                  cleanup();
                  setIsDownloading(false);
                  setDownloadProgress(0);
                  setError(
                    'Download timeout. Please check your internet connection and try again.'
                  );
                }, 60000);
              }

              break;
            }

            case 'Finished':
              cleanup();
              setDownloadProgress(100);
              targetProgress = 100;
              break;

            default:
              break;
          }
        });

        // Explicitly relaunch after install - Tauri's updater doesn't always
        // auto-restart (especially on consecutive updates in the same session).
        try {
          await new Promise<void>(resolve =>
            setTimeout(resolve, DAEMON_CONFIG.UPDATE_CHECK.RETRY_DELAY)
          );
          await relaunch();
        } catch {
          // relaunch() can fail on the second consecutive update (stale process
          // handle after the first in-place binary swap). Surface it to the user.
          setIsDownloading(false);
          setDownloadProgress(100);
          setError('Update installed successfully. Please restart the app manually to apply it.');
        }
      } catch (err) {
        const rawErrorMessage: string = extractErrorMessage(err);
        let errorMessage: string = formatUserErrorMessage(rawErrorMessage);

        if (isRecoverableError(err) && retryCount < maxRetries) {
          const delay = retryDelay * Math.pow(2, retryCount);
          await sleep(delay);
          return downloadAndInstall(update, retryCount + 1);
        }

        if (isRecoverableError(err)) {
          errorMessage = `Network error while downloading update (${retryCount + 1}/${maxRetries} attempts). Please try again later.`;
        }

        setError(errorMessage);
        setIsDownloading(false);
        setDownloadProgress(0);
        cleanup();
      }
    },
    [maxRetries, retryDelay, isRecoverableError, sleep]
  );

  const installUpdate = useCallback(async (): Promise<void> => {
    if (updateAvailable) {
      await downloadAndInstall(updateAvailable);
    }
  }, [updateAvailable, downloadAndInstall]);

  // Online/offline listener - retry when connectivity is restored.
  useEffect(() => {
    const handleOnline = (): void => {
      setError(prevError => {
        if (prevError && prevError.includes('No internet connection')) {
          return null;
        }
        return prevError;
      });
      if (autoCheck && !isCheckingRef.current) {
        setTimeout(() => {
          if (!isCheckingRef.current && navigator.onLine) {
            checkForUpdates();
          }
        }, 500);
      }
    };

    const handleOffline = (): void => {
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

  // Initial check on startup (delayed to avoid blocking the app load).
  useEffect(() => {
    if (autoCheck && !isCheckingRef.current) {
      const timeout = setTimeout(() => {
        checkForUpdates();
      }, DAEMON_CONFIG.UPDATE_CHECK.STARTUP_DELAY);

      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [autoCheck, checkForUpdates]);

  // Periodic check (skipped if we checked recently).
  useEffect(() => {
    if (!autoCheck || checkInterval <= 0) return undefined;

    const interval = setInterval(() => {
      const timeSinceLastCheck =
        lastCheckTimeRef.current !== null ? Date.now() - lastCheckTimeRef.current : Infinity;

      // Skip if we already checked within the last 5 minutes.
      if (timeSinceLastCheck > 5 * 60 * 1000) {
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

export default useUpdater;
