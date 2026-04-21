import { useRef, useCallback } from 'react';
import { TIMINGS } from './constants';
import { isAppInInstalledList } from './helpers';
import type { InstalledAppLike } from './helpers';

interface StartPollingParams {
  appName: string;
  installedApps: InstalledAppLike[];
  onAppFound: () => void;
  onTimeout: () => void;
  refreshApps?: () => void;
}

interface PollingStatus {
  isPolling: boolean;
  attempts: number;
  maxAttempts: number;
}

interface UseInstallationPollingReturn {
  startPolling: (params: StartPollingParams) => void;
  stopPolling: () => void;
  getPollingStatus: () => PollingStatus;
}

export function useInstallationPolling(): UseInstallationPollingReturn {
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef<number>(0);

  const stopPolling = useCallback((): void => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    attemptsRef.current = 0;
  }, []);

  const startPolling = useCallback(
    ({ appName, installedApps, onAppFound, onTimeout, refreshApps }: StartPollingParams): void => {
      stopPolling();

      attemptsRef.current = 0;

      if (refreshApps) {
        refreshApps();
      }

      pollingIntervalRef.current = setInterval(() => {
        attemptsRef.current++;

        if (isAppInInstalledList(appName, installedApps)) {
          stopPolling();
          onAppFound();
          return;
        }

        if (attemptsRef.current >= TIMINGS.POLLING.MAX_ATTEMPTS) {
          stopPolling();
          onTimeout();
          return;
        }

        if (refreshApps && attemptsRef.current % TIMINGS.POLLING.REFRESH_INTERVAL === 0) {
          refreshApps();
        }
      }, TIMINGS.POLLING.INTERVAL);
    },
    [stopPolling]
  );

  const getPollingStatus = useCallback((): PollingStatus => {
    return {
      isPolling: pollingIntervalRef.current !== null,
      attempts: attemptsRef.current,
      maxAttempts: TIMINGS.POLLING.MAX_ATTEMPTS,
    };
  }, []);

  return {
    startPolling,
    stopPolling,
    getPollingStatus,
  };
}
