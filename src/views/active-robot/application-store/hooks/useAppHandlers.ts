import { useState, useEffect, useRef, useCallback } from 'react';
import { useActiveRobotContext } from '../../context';

type AnyRecord = Record<string, unknown>;

interface AppInfo {
  name: string;
  [key: string]: unknown;
}

interface CurrentApp {
  info?: { name?: string } & AnyRecord;
  state?: string;
  [key: string]: unknown;
}

interface JobLike {
  appName?: string;
  type?: string;
  [key: string]: unknown;
}

type ShowToast = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => void;

interface UseAppHandlersParams {
  currentApp: CurrentApp | null | undefined;
  activeJobs: Map<string, JobLike>;
  installApp: (appInfo: AppInfo) => Promise<unknown>;
  removeApp: (appName: string) => Promise<unknown>;
  startApp: (appName: string) => Promise<unknown>;
  stopCurrentApp: () => Promise<unknown>;
  triggerUpdate: (appName: string) => Promise<unknown>;
  showToast?: ShowToast;
}

interface UseAppHandlersReturn {
  expandedApp: string | null;
  setExpandedApp: React.Dispatch<React.SetStateAction<string | null>>;
  startingApp: string | null;
  handleInstall: (appInfo: AppInfo) => Promise<void>;
  handleUninstall: (appName: string) => Promise<void>;
  handleUpdate: (appName: string) => Promise<void>;
  handleStartApp: (appName: string) => Promise<void>;
  isJobRunning: (appName: string, jobType: string) => boolean;
  getJobInfo: (appName: string, jobType?: string) => JobLike | null;
  stopCurrentApp: () => Promise<unknown>;
}

export function useAppHandlers({
  currentApp,
  activeJobs,
  installApp,
  removeApp,
  startApp,
  stopCurrentApp,
  triggerUpdate,
  showToast,
}: UseAppHandlersParams): UseAppHandlersReturn {
  const { robotState, actions, api } = useActiveRobotContext();
  const { lockForApp, unlockApp, lockForInstall, unlockInstall, setInstallResult } = actions;
  const { isCommandRunning } = robotState;
  const DAEMON_CONFIG = api.config as { APP_INSTALLATION: { HANDLER_DELAY: number } };

  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [startingApp, setStartingApp] = useState<string | null>(null);

  const waitingForPollingRef = useRef<boolean>(false);

  const latest = useRef<{
    lockForInstall: typeof lockForInstall;
    unlockInstall: typeof unlockInstall;
    setInstallResult: typeof setInstallResult;
    installApp: typeof installApp;
    removeApp: typeof removeApp;
    startApp: typeof startApp;
    stopCurrentApp: typeof stopCurrentApp;
    triggerUpdate: typeof triggerUpdate;
    showToast: ShowToast | undefined;
    lockForApp: typeof lockForApp;
    unlockApp: typeof unlockApp;
    isCommandRunning: boolean;
    currentApp: CurrentApp | null | undefined;
    DAEMON_CONFIG: typeof DAEMON_CONFIG;
  }>({
    lockForInstall,
    unlockInstall,
    setInstallResult,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    triggerUpdate,
    showToast,
    lockForApp,
    unlockApp,
    isCommandRunning,
    currentApp,
    DAEMON_CONFIG,
  });
  latest.current = {
    lockForInstall,
    unlockInstall,
    setInstallResult,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    triggerUpdate,
    showToast,
    lockForApp,
    unlockApp,
    isCommandRunning,
    currentApp,
    DAEMON_CONFIG,
  };

  const handleInstall = useCallback(async (appInfo: AppInfo): Promise<void> => {
    const { lockForInstall, installApp, setInstallResult, unlockInstall, showToast } =
      latest.current;
    try {
      lockForInstall(appInfo.name, 'install');
      await installApp(appInfo);
    } catch (err) {
      console.error('Failed to install:', err);
      setInstallResult(null);
      unlockInstall();
      const error = err as Error & { userFriendly?: boolean };
      if (error.name === 'PermissionDeniedError' || error.name === 'SystemPopupTimeoutError') {
        const message = error.userFriendly
          ? error.message
          : `${appInfo.name}: System permission required. Please accept the permission dialog if it appears.`;
        if (showToast) showToast(message, 'warning');
      } else {
        if (showToast) showToast(`Failed to install ${appInfo.name}: ${error.message}`, 'error');
      }
    }
  }, []);

  const handleUninstall = useCallback(async (appName: string): Promise<void> => {
    const { lockForInstall, removeApp, setInstallResult, unlockInstall, showToast } =
      latest.current;
    try {
      lockForInstall(appName, 'remove');
      await removeApp(appName);
      setExpandedApp(null);
    } catch (err) {
      console.error('Failed to uninstall:', err);
      setInstallResult(null);
      unlockInstall();
      const error = err as Error & { userFriendly?: boolean };
      if (error.name === 'PermissionDeniedError' || error.name === 'SystemPopupTimeoutError') {
        const message = error.userFriendly
          ? error.message
          : `${appName}: System permission required. Please accept the permission dialog if it appears.`;
        if (showToast) showToast(message, 'warning');
      } else {
        if (showToast) showToast(`Failed to uninstall ${appName}: ${error.message}`, 'error');
      }
    }
  }, []);

  const handleUpdate = useCallback(async (appName: string): Promise<void> => {
    const { lockForInstall, triggerUpdate, setInstallResult, unlockInstall, showToast } =
      latest.current;
    try {
      lockForInstall(appName, 'update');
      await triggerUpdate(appName);
    } catch (err) {
      console.error('Failed to update:', err);
      setInstallResult(null);
      unlockInstall();
      const error = err as Error & { userFriendly?: boolean };
      if (error.name === 'PermissionDeniedError' || error.name === 'SystemPopupTimeoutError') {
        const message = error.userFriendly
          ? error.message
          : `${appName}: System permission required. Please accept the permission dialog if it appears.`;
        if (showToast) showToast(message, 'warning');
      } else {
        if (showToast) showToast(`Failed to update ${appName}: ${error.message}`, 'error');
      }
    }
  }, []);

  const handleStartApp = useCallback(async (appName: string): Promise<void> => {
    const {
      isCommandRunning,
      currentApp,
      showToast,
      stopCurrentApp,
      unlockApp,
      DAEMON_CONFIG,
      startApp,
      lockForApp,
    } = latest.current;
    try {
      if (isCommandRunning) {
        if (showToast) showToast('Please wait for the current action to finish', 'warning');
        return;
      }

      const isCurrentAppActive =
        currentApp &&
        currentApp.info &&
        currentApp.info.name !== appName &&
        (currentApp.state === 'running' || currentApp.state === 'starting');

      if (isCurrentAppActive) {
        const shouldStop = window.confirm(
          `${currentApp?.info?.name} is currently running. Stop it and launch ${appName}?`
        );
        if (!shouldStop) return;

        await stopCurrentApp();
        unlockApp();
        await new Promise(resolve =>
          setTimeout(resolve, DAEMON_CONFIG.APP_INSTALLATION.HANDLER_DELAY)
        );
      } else if (currentApp && currentApp.info) {
        unlockApp();
      }

      setStartingApp(appName);
      waitingForPollingRef.current = true;

      await startApp(appName);
      lockForApp(appName);
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to start ${appName}:`, err);
      setStartingApp(null);
      waitingForPollingRef.current = false;
      latest.current.unlockApp();
      if (latest.current.showToast) {
        latest.current.showToast(`Failed to start ${appName}: ${error.message}`, 'error');
      }
    }
  }, []);

  useEffect(() => {
    if (!waitingForPollingRef.current) return;

    const isPollingConfirmed =
      currentApp &&
      currentApp.info &&
      currentApp.info.name === startingApp &&
      (currentApp.state === 'starting' || currentApp.state === 'running');

    if (isPollingConfirmed) {
      setStartingApp(null);
      waitingForPollingRef.current = false;
    }
  }, [currentApp, startingApp]);

  useEffect(() => {
    if (!startingApp || !waitingForPollingRef.current) return;

    const safetyTimeout = setTimeout(() => {
      if (waitingForPollingRef.current && startingApp) {
        console.warn(`[AppHandlers] Safety timeout: clearing startingApp for ${startingApp}`);
        setStartingApp(null);
        waitingForPollingRef.current = false;
      }
    }, 5000);

    return () => clearTimeout(safetyTimeout);
  }, [startingApp]);

  const isJobRunning = useCallback(
    (appName: string, jobType: string): boolean => {
      for (const [, job] of activeJobs.entries()) {
        if (job.appName === appName && job.type === jobType) {
          return true;
        }
      }
      return false;
    },
    [activeJobs]
  );

  const getJobInfo = useCallback(
    (appName: string, jobType?: string): JobLike | null => {
      for (const [, job] of activeJobs.entries()) {
        if (job.appName === appName && (jobType === undefined || job.type === jobType)) {
          return job;
        }
      }
      return null;
    },
    [activeJobs]
  );

  return {
    expandedApp,
    setExpandedApp,
    startingApp,
    handleInstall,
    handleUninstall,
    handleUpdate,
    handleStartApp,
    isJobRunning,
    getJobInfo,
    stopCurrentApp,
  };
}
