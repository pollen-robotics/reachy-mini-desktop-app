import { useState, useEffect, useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';
import useAppStore from '../../store/useAppStore';

export interface UseUpdateViewStateOptions {
  isChecking: boolean;
  updateAvailable: boolean;
  isDownloading: boolean;
  updateError: boolean | string | null;
  isActive: boolean;
  isStarting: boolean;
  isStopping: boolean;
}

/**
 * Controls visibility of the update view (boot screen).
 *
 * The update view is the FIRST thing users see on launch. It stays visible
 * until we have a definitive answer (update found, no update, or error).
 * A minimum display time prevents the screen from flashing away too fast.
 *
 * Once dismissed, the "checking" screen never reappears in the same session.
 * But if a real update is found later (hourly check), the notification ALWAYS shows.
 */
export const useUpdateViewState = ({
  isChecking,
  updateAvailable,
  isDownloading,
  updateError,
  isActive,
  isStarting,
  isStopping,
}: UseUpdateViewStateOptions): boolean => {
  const [initialCheckDone, setInitialCheckDone] = useState<boolean>(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState<boolean>(false);

  const { updateSkipped } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(
      () => setMinTimeElapsed(true),
      DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK
    );
    return () => clearTimeout(timer);
  }, []);

  // Mark initial check as done when: not checking, no update, min time passed.
  useEffect(() => {
    if (initialCheckDone) return;
    if (isChecking) return;
    if (updateAvailable || isDownloading) return;

    // Error case: wait for min time, then 1s grace period to read the message.
    if (updateError) {
      if (minTimeElapsed) {
        const t = setTimeout(() => setInitialCheckDone(true), 1000);
        return () => clearTimeout(t);
      }
      return undefined;
    }

    // Normal case: check finished with no update, wait for min time.
    if (minTimeElapsed) {
      setInitialCheckDone(true);
    }
    return undefined;
  }, [isChecking, updateAvailable, isDownloading, updateError, minTimeElapsed, initialCheckDone]);

  // Dismiss when daemon takes over (robot connected).
  useEffect(() => {
    if (isActive || isStarting || isStopping) {
      setInitialCheckDone(true);
    }
  }, [isActive, isStarting, isStopping]);

  return useMemo<boolean>(() => {
    if (isActive || isStarting || isStopping) return false;

    // Update found or downloading: ALWAYS show (covers both boot and hourly checks).
    if (updateAvailable || isDownloading) {
      return !(updateSkipped && !isDownloading);
    }

    if (initialCheckDone) return false;

    // Still in the initial boot phase: show checking screen or error.
    if (isChecking || updateError) return true;

    // Keep showing until min time elapses (prevents flash).
    if (!minTimeElapsed) return true;

    return false;
  }, [
    isActive,
    isStarting,
    isStopping,
    isChecking,
    updateAvailable,
    isDownloading,
    updateError,
    updateSkipped,
    initialCheckDone,
    minTimeElapsed,
  ]);
};
