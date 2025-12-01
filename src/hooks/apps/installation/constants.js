/**
 * Installation Constants
 * Centralized configuration for app installation/uninstallation lifecycle
 */

import { DAEMON_CONFIG } from '../../../config/daemon';

/**
 * Installation job types
 */
export const JOB_TYPES = {
  INSTALL: 'install',
  REMOVE: 'remove',
};

/**
 * Installation result states
 */
export const RESULT_STATES = {
  IN_PROGRESS: null,
  SUCCESS: 'success',
  FAILED: 'failed',
};

/**
 * Job status values from API
 */
export const JOB_STATUS = {
  STARTING: 'starting',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Timing configuration
 */
export const TIMINGS = {
  // Minimum display time before considering operation complete
  MIN_DISPLAY_TIME: {
    INSTALL: 0, // No minimum for install
    REMOVE: DAEMON_CONFIG.MIN_DISPLAY_TIMES.APP_UNINSTALL, // 4s for uninstall
  },
  
  // Delay after showing result before closing overlay
  RESULT_DISPLAY_DELAY: DAEMON_CONFIG.APP_INSTALLATION.RESULT_DISPLAY_DELAY, // 3s
  
  // Polling configuration for waiting for app to appear in list
  POLLING: {
    INTERVAL: 500, // Check every 500ms
    MAX_ATTEMPTS: 10, // 10 attempts = 5s max (reduced from 15s)
    REFRESH_INTERVAL: 2, // Refresh apps list every 2 attempts (1s)
  },
};

/**
 * Success indicators in logs (case-insensitive patterns)
 */
export const LOG_SUCCESS_PATTERNS = [
  'successfully installed',
  'successfully uninstalled',
  'completed successfully',
  "job 'install' completed",
  "job 'remove' completed",
];

/**
 * Error indicators in logs (case-insensitive patterns)
 */
export const LOG_ERROR_PATTERNS = [
  'failed',
  'error:',
  'error ',
  'exception',
  'traceback',
];

