import { useEffect, useRef } from 'react';
import { ROBOT_STATUS, BUSY_REASON } from '../../constants/robotStatus';
import type { RobotStatus, BusyReason } from '../../types/robot';
import type { ToastSeverity } from '../../types/store';

/**
 * Callback invoked when an install request is accepted.
 */
export type DeepLinkInstallHandler = (appName: string) => void;

/**
 * Toast callback contract expected by this hook. Accepts either our internal
 * `ToastSeverity` type or a looser string (the hook doesn't narrow it).
 */
export type DeepLinkToastHandler = (message: string, severity?: ToastSeverity) => void;

export interface UseDeepLinkOptions {
  /** Whether the robot/daemon is active. */
  isActive: boolean;
  /** Whether an app is currently running. */
  isAppRunning: boolean;
  /** Current robot status. */
  robotStatus: RobotStatus | null | undefined;
  /** Why the robot is busy (if applicable). */
  busyReason: BusyReason | null | undefined;
  /** Whether an installation is in progress. */
  isInstalling: boolean;
  /** Whether an app is being stopped. */
  isStoppingApp: boolean;
  /** Whether a command/quick action is running. */
  isCommandRunning: boolean;
  /** Callback when install is requested. */
  onInstallRequest?: DeepLinkInstallHandler;
  /** Toast notification function. */
  showToast?: DeepLinkToastHandler;
}

/**
 * Snapshot of the hook's inputs, held inside a ref so event handlers
 * installed once at mount always see fresh values.
 */
interface DeepLinkStateSnapshot {
  onInstallRequest?: DeepLinkInstallHandler;
  showToast?: DeepLinkToastHandler;
  isActive: boolean;
  isAppRunning: boolean;
  robotStatus: RobotStatus | null | undefined;
  busyReason: BusyReason | null | undefined;
  isInstalling: boolean;
  isStoppingApp: boolean;
  isCommandRunning: boolean;
}

/**
 * Hook to handle deep links for app installation.
 *
 * URL format: `reachymini://install/<app-name>` (path variant) or
 * `reachymini://install?app=<app-name>` (query variant).
 */
export function useDeepLink({
  isActive,
  isAppRunning,
  robotStatus,
  busyReason,
  isInstalling,
  isStoppingApp,
  isCommandRunning,
  onInstallRequest,
  showToast,
}: UseDeepLinkOptions): void {
  // Track whether we've already set up the listener.
  const listenerSetupRef = useRef<boolean>(false);

  // Track whether we've already processed initial URLs.
  const initialUrlsProcessedRef = useRef<boolean>(false);

  // Store latest callback refs to avoid stale closures inside the long-lived listener.
  const callbacksRef = useRef<DeepLinkStateSnapshot>({
    onInstallRequest,
    showToast,
    isActive,
    isAppRunning,
    robotStatus,
    busyReason,
    isInstalling,
    isStoppingApp,
    isCommandRunning,
  });

  // Keep the snapshot in sync with props.
  useEffect(() => {
    callbacksRef.current = {
      onInstallRequest,
      showToast,
      isActive,
      isAppRunning,
      robotStatus,
      busyReason,
      isInstalling,
      isStoppingApp,
      isCommandRunning,
    };
  }, [
    onInstallRequest,
    showToast,
    isActive,
    isAppRunning,
    robotStatus,
    busyReason,
    isInstalling,
    isStoppingApp,
    isCommandRunning,
  ]);

  useEffect(() => {
    // Only run in Tauri environment.
    if (!window.__TAURI__) {
      return undefined;
    }

    // Avoid duplicate listeners.
    if (listenerSetupRef.current) {
      return undefined;
    }

    let unlisten: (() => void) | null = null;

    /**
     * Map the current snapshot to a user-facing "busy" message.
     * Returns null when the robot is available.
     */
    const getBusyMessage = (state: DeepLinkStateSnapshot): string | null => {
      const {
        robotStatus,
        busyReason,
        isInstalling,
        isStoppingApp,
        isCommandRunning,
        isAppRunning,
      } = state;

      if (robotStatus === ROBOT_STATUS.SLEEPING) {
        return 'Robot is asleep. Wake it up first!';
      }

      if (isInstalling) {
        return 'Another app is being installed. Please wait...';
      }

      if (isStoppingApp) {
        return 'An app is stopping. Please wait a moment...';
      }

      if (isAppRunning) {
        return 'An app is currently running. Stop it first!';
      }

      if (isCommandRunning) {
        return 'A command is in progress. Please wait...';
      }

      if (busyReason === BUSY_REASON.MOVING) {
        return 'Robot is moving. Please wait...';
      }

      if (busyReason === BUSY_REASON.COMMAND) {
        return 'A command is running. Please wait...';
      }

      if (busyReason === BUSY_REASON.INSTALLING) {
        return 'Installation in progress. Please wait...';
      }

      if (busyReason === BUSY_REASON.APP_RUNNING) {
        return 'An app is running. Stop it first!';
      }

      if (robotStatus === ROBOT_STATUS.BUSY) {
        return 'Robot is busy. Please wait...';
      }

      return null;
    };

    const handleDeepLink = (url: string): void => {
      const state = callbacksRef.current;
      const { onInstallRequest, showToast, isActive } = state;

      try {
        // Supported formats:
        //   reachymini://install/app-name
        //   reachymini://install?app=app-name
        //   reachymini:///install/app-name (triple slash)
        let appName: string | null = null;

        try {
          const parsed = new URL(url);
          const host = parsed.host || parsed.hostname;
          const pathname = parsed.pathname;

          if (host === 'install' && pathname && pathname !== '/') {
            appName = pathname.replace(/^\//, '');
          } else if (host === 'install') {
            appName = parsed.searchParams.get('app');
          } else if (pathname.startsWith('/install/')) {
            appName = pathname.replace('/install/', '');
          }
        } catch {
          // Fallback: simple string parsing for malformed URLs.
          const match = url.match(/reachymini:\/\/install\/([^/?]+)/);
          if (match) {
            appName = match[1];
          }
        }

        if (!appName) {
          showToast?.('Invalid install link: no app name provided', 'error');
          return;
        }

        if (!isActive) {
          showToast?.('Robot is not connected. Connect first!', 'warning');
          return;
        }

        const busyMessage = getBusyMessage(state);
        if (busyMessage) {
          showToast?.(busyMessage, 'warning');
          return;
        }

        onInstallRequest?.(appName);
      } catch {
        showToast?.('Failed to process install link', 'error');
      }
    };

    const setupListener = async (): Promise<void> => {
      try {
        const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link');

        // First, check if the app was launched with a deep link URL.
        if (!initialUrlsProcessedRef.current) {
          initialUrlsProcessedRef.current = true;
          try {
            const initialUrls = await getCurrent();
            if (initialUrls && initialUrls.length > 0) {
              // Process after a short delay to ensure the app is ready.
              setTimeout(() => {
                handleDeepLink(initialUrls[0]);
              }, 1000);
            }
          } catch {
            // No initial URLs - normal case.
          }
        }

        unlisten = await onOpenUrl((urls: string[]) => {
          if (!urls || urls.length === 0) return;
          handleDeepLink(urls[0]);
        });

        listenerSetupRef.current = true;
      } catch {
        // Plugin not available or errored - silently ignored.
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
        listenerSetupRef.current = false;
      }
    };
  }, []); // Empty deps - setup once on mount.
}

export default useDeepLink;
