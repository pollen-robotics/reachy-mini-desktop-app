import { useState, useEffect, useRef, useCallback } from 'react';
import { useActiveRobotContext } from '../../context';

/**
 * ✅ REFACTORED: Simplified hook to handle app actions
 * Installation tracking moved to useAppInstallation hook
 *
 * Uses ActiveRobotContext for decoupling from global stores
 */
export function useAppHandlers({
  currentApp,
  activeJobs,
  installApp,
  removeApp,
  startApp,
  stopCurrentApp,
  triggerUpdate,
  showToast,
}) {
  const { robotState, actions, api } = useActiveRobotContext();
  const { lockForApp, unlockApp, lockForInstall, unlockInstall, setInstallResult } = actions;
  const { isCommandRunning } = robotState;
  const DAEMON_CONFIG = api.config;

  const [expandedApp, setExpandedApp] = useState(null);
  const [startingApp, setStartingApp] = useState(null);

  const waitingForPollingRef = useRef(false);

  // Stable ref holding latest values for all callbacks.
  // This allows useCallback([]) handlers to always read fresh deps
  // without causing re-renders in memoized children.
  const latest = useRef({});
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

  const handleInstall = useCallback(async appInfo => {
    const { lockForInstall, installApp, setInstallResult, unlockInstall, showToast } =
      latest.current;
    try {
      lockForInstall(appInfo.name, 'install');
      await installApp(appInfo);
    } catch (err) {
      console.error('Failed to install:', err);
      setInstallResult(null);
      unlockInstall();
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const message = err.userFriendly
          ? err.message
          : `${appInfo.name}: System permission required. Please accept the permission dialog if it appears.`;
        if (showToast) showToast(message, 'warning');
      } else {
        if (showToast) showToast(`Failed to install ${appInfo.name}: ${err.message}`, 'error');
      }
    }
  }, []);

  const handleUninstall = useCallback(async appName => {
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
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const message = err.userFriendly
          ? err.message
          : `${appName}: System permission required. Please accept the permission dialog if it appears.`;
        if (showToast) showToast(message, 'warning');
      } else {
        if (showToast) showToast(`Failed to uninstall ${appName}: ${err.message}`, 'error');
      }
    }
  }, []);

  const handleUpdate = useCallback(async appName => {
    const { lockForInstall, triggerUpdate, setInstallResult, unlockInstall, showToast } =
      latest.current;
    try {
      lockForInstall(appName, 'update');
      await triggerUpdate(appName);
    } catch (err) {
      console.error('Failed to update:', err);
      setInstallResult(null);
      unlockInstall();
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const message = err.userFriendly
          ? err.message
          : `${appName}: System permission required. Please accept the permission dialog if it appears.`;
        if (showToast) showToast(message, 'warning');
      } else {
        if (showToast) showToast(`Failed to update ${appName}: ${err.message}`, 'error');
      }
    }
  }, []);

  const handleStartApp = useCallback(async appName => {
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
        showToast('Please wait for the current action to finish', 'warning');
        return;
      }
      // NOTE: concurrent-launch gate lives in RightPanel via
      // <CentralBusyOverlay>, which masks the launcher whenever a remote
      // web app holds the robot. No secondary gate needed here.

      const isCurrentAppActive =
        currentApp &&
        currentApp.info &&
        currentApp.info.name !== appName &&
        (currentApp.state === 'running' || currentApp.state === 'starting');

      if (isCurrentAppActive) {
        const shouldStop = window.confirm(
          `${currentApp.info.name} is currently running. Stop it and launch ${appName}?`
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
      console.error(`Failed to start ${appName}:`, err);
      setStartingApp(null);
      waitingForPollingRef.current = false;
      latest.current.unlockApp();
      if (latest.current.showToast) {
        latest.current.showToast(`Failed to start ${appName}: ${err.message}`, 'error');
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
    (appName, jobType) => {
      for (const [jobId, job] of activeJobs.entries()) {
        if (job.appName === appName && job.type === jobType) {
          return true;
        }
      }
      return false;
    },
    [activeJobs]
  );

  const getJobInfo = useCallback(
    (appName, jobType) => {
      for (const [jobId, job] of activeJobs.entries()) {
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
