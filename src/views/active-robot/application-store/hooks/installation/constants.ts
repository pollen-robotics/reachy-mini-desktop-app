import { DAEMON_CONFIG } from '@config/daemon';

export const JOB_TYPES = {
  INSTALL: 'install',
  REMOVE: 'remove',
  UPDATE: 'update',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export const RESULT_STATES = {
  IN_PROGRESS: null,
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;

export type ResultState = (typeof RESULT_STATES)[keyof typeof RESULT_STATES];

export const JOB_STATUS = {
  STARTING: 'starting',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const TIMINGS = {
  MIN_DISPLAY_TIME: {
    INSTALL: 0,
    REMOVE: DAEMON_CONFIG.MIN_DISPLAY_TIMES.APP_UNINSTALL,
  },

  RESULT_DISPLAY_DELAY: DAEMON_CONFIG.APP_INSTALLATION.RESULT_DISPLAY_DELAY,

  POLLING: {
    INTERVAL: 500,
    MAX_ATTEMPTS: 10,
    REFRESH_INTERVAL: 2,
  },

  STALE_JOB: {
    TIMEOUT: 90000,
    CHECK_INTERVAL: 5000,
  },
};

export const NETWORK_ERROR_MESSAGE =
  'Network issue detected. The download seems stuck. Please check your internet connection and try again later.';

export const LOG_SUCCESS_PATTERNS: string[] = [
  'successfully installed',
  'successfully uninstalled',
  'completed successfully',
  "job 'install' completed",
  "job 'remove' completed",
  "job 'update' completed",
];

export const LOG_ERROR_PATTERNS: string[] = [
  'failed',
  'error:',
  'error ',
  'exception',
  'traceback',
];
