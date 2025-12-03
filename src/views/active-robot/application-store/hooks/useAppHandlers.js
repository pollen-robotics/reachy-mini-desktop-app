import { useState } from 'react';
import useAppStore from '@store/useAppStore';
import { DAEMON_CONFIG } from '@config/daemon';

/**
 * ✅ REFACTORED: Simplified hook to handle app actions
 * Installation tracking moved to useAppInstallation hook
 */
export function useAppHandlers({
  currentApp,
  activeJobs,
  installApp,
  removeApp,
  startApp,
  stopCurrentApp,
  showToast,
}) {
  const { lockForApp, unlockApp, lockForInstall, unlockInstall, setInstallResult } = useAppStore();
  
  const [expandedApp, setExpandedApp] = useState(null);
  const [startingApp, setStartingApp] = useState(null);

  // ✅ Helper: Handle installation errors consistently
  const handleInstallError = (err, appName, action = 'install') => {
    console.error(`Failed to ${action}:`, err);

    // Reset on error
    setInstallResult(null);
    unlockInstall();
    
    // User-friendly error messages
    if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
      const message = err.userFriendly 
        ? err.message 
        : `${appName}: System permission required. Please accept the permission dialog if it appears.`;
      
      if (showToast) {
        showToast(message, 'warning');
      }
    } else {
          if (showToast) {
        showToast(`Failed to ${action} ${appName}: ${err.message}`, 'error');
            }
          }
      };
      
  // ✅ REFACTORED: Simplified install handler
  const handleInstall = async (appInfo) => {
    try {
      // Lock store state and start tracking
      lockForInstall(appInfo.name, 'install');
      
      // Launch installation (async, returns job_id)
      await installApp(appInfo);
      
      // Note: Job tracking and completion handled by useAppInstallation hook
    } catch (err) {
      handleInstallError(err, appInfo.name, 'install');
        }
  };
  
  // ✅ REFACTORED: Simplified uninstall handler
  const handleUninstall = async (appName) => {
    try {
      // Lock store state and start tracking
      lockForInstall(appName, 'remove');
      
      // Launch uninstallation (async, returns job_id)
      await removeApp(appName);
      setExpandedApp(null);
      
      // Note: Job tracking and completion handled by useAppInstallation hook
    } catch (err) {
      handleInstallError(err, appName, 'uninstall');
    }
  };
  
  const handleStartApp = async (appName) => {
    try {
      // ✅ Check if robot is busy (quick action in progress)
      if (useAppStore.getState().isCommandRunning) {
        showToast('Please wait for the current action to finish', 'warning');
        console.warn(`⚠️ Cannot start ${appName}: quick action is running`);
        return;
      }
      
      // Check if another app is already running
      if (currentApp && currentApp.info && currentApp.info.name !== appName) {
        const shouldStop = window.confirm(`${currentApp.info.name} is currently running. Stop it and launch ${appName}?`);
        if (!shouldStop) return;
        
        // Stop the current app
        await stopCurrentApp();
        unlockApp(); // Unlock
        // Wait a bit for the app to stop
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.APP_INSTALLATION.HANDLER_DELAY));
      }
      
      setStartingApp(appName);
      const result = await startApp(appName);
      
      // ✅ Lock to prevent quick actions
      lockForApp(appName);
      
      setStartingApp(null);
    } catch (err) {
      console.error(`❌ Failed to start ${appName}:`, err);
      setStartingApp(null);
      unlockApp(); // Ensure unlock on error
      alert(`Failed to start app: ${err.message}`);
    }
  };
  
  // Check if an app is being installed/removed
  const isJobRunning = (appName, jobType) => {
    for (const [jobId, job] of activeJobs.entries()) {
      if (job.appName === appName && job.type === jobType) {
        return true;
      }
    }
    return false;
  };
  
  // Get job info (status + logs)
  const getJobInfo = (appName, jobType) => {
    for (const [jobId, job] of activeJobs.entries()) {
      if (job.appName === appName && job.type === jobType) {
        return job;
      }
    }
    return null;
  };

  return {
    expandedApp,
    setExpandedApp,
    startingApp,
    handleInstall,
    handleUninstall,
    handleStartApp,
    isJobRunning,
    getJobInfo,
    stopCurrentApp,
  };
}

