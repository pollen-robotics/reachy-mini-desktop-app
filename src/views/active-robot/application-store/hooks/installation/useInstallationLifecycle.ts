import { useEffect, useRef, useCallback } from 'react';
import { useActiveRobotContext } from '../../../context';
import { JOB_TYPES, RESULT_STATES } from './constants';
import { findJobByAppName, wasJobRemoved, isJobFailed, generateJobKey } from './helpers';
import type { JobInfo, InstalledAppLike } from './helpers';
import { useInstallationPolling } from './useInstallationPolling';

interface UseInstallationLifecycleParams {
  activeJobs: Map<string, JobInfo>;
  installedApps: InstalledAppLike[];
  showToast?: (message: string, severity: 'success' | 'error' | 'warning' | 'info') => void;
  refreshApps?: () => void;
  onInstallSuccess?: () => void;
  isLoading?: boolean;
}

export function useInstallationLifecycle({
  activeJobs,
  installedApps,
  showToast,
  refreshApps,
  onInstallSuccess,
  isLoading = false,
}: UseInstallationLifecycleParams): void {
  void refreshApps;
  void installedApps;
  const pendingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { stopPolling } = useInstallationPolling();

  const { robotState, actions } = useActiveRobotContext();
  const { installingAppName, installJobType, installStartTime, jobSeenOnce, processedJobs } =
    robotState;
  const { unlockInstall, setInstallResult, markJobAsSeen, markJobAsProcessed } = actions;

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach(clearTimeout);
      pendingTimeouts.current = [];

      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (!installingAppName) {
      stopPolling();
    }
  }, [installingAppName, stopPolling]);

  const closeAfterDelay = useCallback(
    (shouldCloseModal: boolean = false): void => {
      const appName = installingAppName;
      const isUninstall = installJobType === JOB_TYPES.REMOVE;
      const isUpdate = installJobType === JOB_TYPES.UPDATE;

      unlockInstall();

      if (shouldCloseModal && onInstallSuccess) {
        onInstallSuccess();
      }

      if (showToast) {
        const actionType = isUninstall ? 'uninstalled' : isUpdate ? 'updated' : 'installed';
        showToast(`${appName} ${actionType} successfully`, 'success');
      }
    },
    [unlockInstall, onInstallSuccess, showToast, installJobType, installingAppName]
  );

  const showErrorAndClose = useCallback(
    (_shouldCloseModal: boolean = false): void => {
      void _shouldCloseModal;
      // TODO(ts): store types declare setInstallResult accepts only 'success' | 'error' | null,
      // but runtime uses RESULT_STATES.FAILED ('failed'). Narrow cast to preserve behavior.
      setInstallResult(RESULT_STATES.FAILED as unknown as 'success' | 'error' | null);

      if (showToast) {
        const isUninstall = installJobType === JOB_TYPES.REMOVE;
        const isUpdate = installJobType === JOB_TYPES.UPDATE;
        const actionVerb = isUninstall ? 'uninstall' : isUpdate ? 'update' : 'install';
        showToast(`Failed to ${actionVerb} ${installingAppName}`, 'error');
      }
    },
    [setInstallResult, showToast, installJobType, installingAppName]
  );

  const handleSuccessfulCompletion = useCallback(
    (wasCompleted: boolean): void => {
      const isUninstall = installJobType === JOB_TYPES.REMOVE;

      if (!wasCompleted) {
        showErrorAndClose(false);
        return;
      }

      closeAfterDelay(!isUninstall);
    },
    [installJobType, closeAfterDelay, showErrorAndClose]
  );

  useEffect(() => {
    if (!installingAppName) {
      return;
    }

    const jobKey = generateJobKey(installingAppName, installJobType as string);
    if (processedJobs.includes(jobKey)) {
      return;
    }

    const job = findJobByAppName(activeJobs, installingAppName);

    if (job && !jobSeenOnce) {
      markJobAsSeen();
    }

    const jobWasRemovedResult = wasJobRemoved(job, installStartTime, jobSeenOnce);

    const jobIsFailed = isJobFailed(job);

    const shouldWaitForLoading = jobWasRemovedResult && isLoading;

    if (!jobWasRemovedResult && !jobIsFailed) {
      return;
    }

    if (shouldWaitForLoading) {
      return;
    }

    markJobAsProcessed(installingAppName, installJobType as string);

    if (jobIsFailed) {
      showErrorAndClose(false);
    } else {
      handleSuccessfulCompletion(true);
    }
  }, [
    activeJobs,
    installedApps,
    installingAppName,
    installJobType,
    installStartTime,
    jobSeenOnce,
    processedJobs,
    isLoading,
    markJobAsSeen,
    markJobAsProcessed,
    closeAfterDelay,
    showErrorAndClose,
    handleSuccessfulCompletion,
  ]);
}
