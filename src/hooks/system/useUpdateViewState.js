import { useReducer, useEffect, useRef, useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Reducer for managing update view display state
 * Handles minimum display time, dev mode, and all update lifecycle states
 */
const updateViewReducer = (state, action) => {
  switch (action.type) {
    case 'INIT_DEV_MODE':
      // Dev mode: start with checkStartTime set to now
      return {
        ...state,
        checkStartTime: Date.now(),
        isDevMode: true,
      };

    case 'START_CHECK':
      // Production: check just started
      return {
        ...state,
        checkStartTime: Date.now(),
        isDevMode: false,
        minTimeElapsed: false,
      };

    case 'CHECK_COMPLETE_NO_UPDATE':
      // Check completed, no update available
      // Keep showing until min time elapsed
      return {
        ...state,
        minTimeElapsed: false, // Will be set by timer
      };

    case 'MIN_TIME_ELAPSED':
      // Minimum display time has elapsed
      // ✅ Mark as completed so we never show again after disconnect
      return {
        ...state,
        minTimeElapsed: true,
        hasCompletedOnce: true,
      };

    case 'ERROR_OCCURRED':
      // Error occurred, need min time + grace period
      return {
        ...state,
        minTimeElapsed: false, // Will be set by timer with grace period
      };

    case 'ERROR_GRACE_PERIOD_ELAPSED':
      // Error grace period (min time + 1s) has elapsed
      // ✅ Mark as completed so we never show again after disconnect
      return {
        ...state,
        minTimeElapsed: true,
        hasCompletedOnce: true,
      };

    case 'RESET':
      // Reset state (when daemon becomes active/starting/stopping)
      // ✅ PRESERVE hasCompletedOnce - we should never show update view again after first check
      return {
        checkStartTime: null,
        minTimeElapsed: false,
        isDevMode: false,
        hasCompletedOnce: state.hasCompletedOnce, // Keep this!
      };

    default:
      return state;
  }
};

/**
 * Hook to manage update view display state with useReducer
 * Handles all cases: dev mode, production mode, minimum display time, errors
 * 
 * @param {boolean} isDev - Whether in dev mode
 * @param {boolean} isChecking - Whether update check is in progress
 * @param {object|null} updateAvailable - Update object if available
 * @param {boolean} isDownloading - Whether update is downloading
 * @param {string|null} updateError - Error message if any
 * @param {boolean} isActive - Whether daemon is active
 * @param {boolean} isStarting - Whether daemon is starting
 * @param {boolean} isStopping - Whether daemon is stopping
 * @returns {boolean} shouldShowUpdateView - Whether to show the update view
 */
export const useUpdateViewState = ({
  isDev,
  isChecking,
  updateAvailable,
  isDownloading,
  updateError,
  isActive,
  isStarting,
  isStopping,
}) => {
  const [state, dispatch] = useReducer(updateViewReducer, {
    checkStartTime: null,
    minTimeElapsed: false,
    isDevMode: false,
    hasCompletedOnce: false, // ✅ Tracks if update check was completed at least once
  });

  const timerRef = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Reset state when daemon becomes active/starting/stopping
  useEffect(() => {
    if (isActive || isStarting || isStopping) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      dispatch({ type: 'RESET' });
    }
  }, [isActive, isStarting, isStopping]);

  // DEV MODE: Initialize on mount
  useEffect(() => {
    // ✅ Don't re-show if we already completed the check once
    if (state.hasCompletedOnce) return;
    if (isDev && state.checkStartTime === null) {
      dispatch({ type: 'INIT_DEV_MODE' });
    }
  }, [isDev, state.checkStartTime, state.hasCompletedOnce]);

  // DEV MODE: Handle minimum display time
  useEffect(() => {
    if (!isDev || !state.checkStartTime || state.isDevMode === false) return;

    const elapsed = Date.now() - state.checkStartTime;
    const minTime = DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK;

    if (elapsed >= minTime) {
      // Minimum time already elapsed
      dispatch({ type: 'MIN_TIME_ELAPSED' });
    } else {
      // Wait for remaining time
      const remainingTime = minTime - elapsed;
      timerRef.current = setTimeout(() => {
        dispatch({ type: 'MIN_TIME_ELAPSED' });
        timerRef.current = null;
      }, remainingTime);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isDev, state.checkStartTime, state.isDevMode]);

  // PRODUCTION MODE: Start tracking when check begins OR when view should be shown
  // ✅ CRITICAL: Initialize checkStartTime as soon as we should show the view
  // This ensures minimum display time even if check completes very quickly
  useEffect(() => {
    if (isDev) return;
    
    // Initialize checkStartTime if we should show the view but it's not set yet
    // This handles cases where:
    // 1. isChecking becomes true (normal case)
    // 2. Check completes so fast that isChecking is already false when this runs
    // 3. updateAvailable/downloading/error appears before checkStartTime is set
    const shouldShow = isChecking || updateAvailable || isDownloading || updateError;
    if (shouldShow && state.checkStartTime === null) {
      dispatch({ type: 'START_CHECK' });
    }
  }, [isDev, isChecking, updateAvailable, isDownloading, updateError, state.checkStartTime]);
  
  // ✅ ADDITIONAL SAFETY: If check completed very quickly (isChecking went false before we initialized),
  // initialize checkStartTime now to ensure minimum display time
  useEffect(() => {
    if (isDev) return;
    if (state.checkStartTime !== null) return; // Already initialized
    // ✅ CRITICAL: Don't re-show update view if we already completed the check once
    // This prevents the bug where disconnecting from robot would show update view again
    if (state.hasCompletedOnce) return;
    
    // If we're not checking anymore but we should show the view (no update, no error, no download),
    // it means check completed very quickly. Initialize now to ensure minimum time.
    if (!isChecking && !updateAvailable && !isDownloading && !updateError) {
      // Only initialize if we're in a state where we should show the view
      // This prevents initializing when view shouldn't be shown
      const shouldShow = !isActive && !isStarting && !isStopping;
      if (shouldShow) {
        dispatch({ type: 'START_CHECK' });
      }
    }
  }, [isDev, isChecking, updateAvailable, isDownloading, updateError, isActive, isStarting, isStopping, state.checkStartTime, state.hasCompletedOnce]);

  // PRODUCTION MODE: Check completed - ensure minimum display time
  useEffect(() => {
    if (isDev) return;
    
    // If update available, downloading, or error, cancel any pending timer
    // (we'll keep showing anyway, no need to wait for min time)
    if (updateAvailable || isDownloading || updateError) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    
    // Check completed with no update/error/download
    // Need to ensure minimum display time
    if (!isChecking && state.checkStartTime !== null && !state.minTimeElapsed) {
      const elapsed = Date.now() - state.checkStartTime;
      const minTime = DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK;

      if (elapsed >= minTime) {
        // Minimum time already elapsed
        dispatch({ type: 'MIN_TIME_ELAPSED' });
      } else {
        // Wait for remaining time
        const remainingTime = minTime - elapsed;
        timerRef.current = setTimeout(() => {
          dispatch({ type: 'MIN_TIME_ELAPSED' });
          timerRef.current = null;
        }, remainingTime);
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isDev, isChecking, updateAvailable, isDownloading, updateError, state.checkStartTime, state.minTimeElapsed]);

  // PRODUCTION MODE: Handle error case - allow continuation after minimum time + grace period
  useEffect(() => {
    if (isDev) return;
    if (!updateError || state.checkStartTime === null) return;

    const elapsed = Date.now() - state.checkStartTime;
    const minTime = DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK;
    const gracePeriod = 1000; // 1 second grace period for errors

    if (elapsed >= minTime + gracePeriod) {
      // Grace period elapsed
      if (!state.minTimeElapsed) {
        dispatch({ type: 'ERROR_GRACE_PERIOD_ELAPSED' });
      }
    } else {
      // Wait for grace period
      const remainingTime = minTime + gracePeriod - elapsed;
      timerRef.current = setTimeout(() => {
        dispatch({ type: 'ERROR_GRACE_PERIOD_ELAPSED' });
        timerRef.current = null;
      }, remainingTime);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isDev, updateError, state.checkStartTime, state.minTimeElapsed]);

  // Compute shouldShowUpdateView
  const shouldShowUpdateView = useMemo(() => {
    // ✅ CRITICAL: Never show again if we already completed the update check once
    // This prevents the bug where disconnecting from robot would show update view again
    if (state.hasCompletedOnce) return false;
    
    // Don't show if daemon is active/starting/stopping
    if (isActive || isStarting || isStopping) return false;

    // Show if checking, downloading, update available, or error
    if (isChecking || updateAvailable || isDownloading || updateError) return true;

    // Show if minimum display time not elapsed yet
    if (state.checkStartTime !== null && !state.minTimeElapsed) return true;

    return false;
  }, [
    isActive,
    isStarting,
    isStopping,
    isChecking,
    updateAvailable,
    isDownloading,
    updateError,
    state.checkStartTime,
    state.minTimeElapsed,
    state.hasCompletedOnce,
  ]);

  return shouldShowUpdateView;
};

