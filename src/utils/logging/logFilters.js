/**
 * Log Filters - patterns to hide from simple mode
 *
 * In dev mode these are bypassed and all logs are shown.
 * This is the ONLY place where filter patterns should be defined.
 */

export const FILTERED_PATTERNS = [
  'uvicorn.error',
  'uvicorn.access',
  'Started server process',
  'Waiting for application startup',
  'Application startup complete',
  'Uvicorn running on',
  'GET /api/',
  'POST /api/',
  'INFO:     127.0.0.1',
  '127.0.0.1:',
  'WebSocket connection',
  'connection open',
  'connection closed',
  '🧹 Cleaning up existing daemons',
  '✓ Daemon started',
  '✓ Daemon stopped',
];

/**
 * Check if a log message should be filtered out (simple mode only)
 * @returns {boolean} True if the message should be HIDDEN
 */
export const shouldFilterLog = message => {
  if (!message || typeof message !== 'string') return false;
  return FILTERED_PATTERNS.some(pattern => message.includes(pattern));
};
