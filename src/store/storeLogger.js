/**
 * 🎯 Store Logger - Production-grade logging for state management
 *
 * Provides concise, structured logs for key store events:
 * - Connection lifecycle (connect, disconnect)
 * - State transitions
 * - App installation
 *
 * Format: [Store] emoji action → details
 *
 * Also sends telemetry events for key actions.
 */

import { telemetry } from '../utils/telemetry';

const isDev = process.env.NODE_ENV === 'development';

// Log levels
const LOG_LEVELS = {
  LIFECYCLE: true, // Connection/disconnection - always log
  TRANSITION: true, // State transitions - always log
  DEBUG: isDev, // Debug info - dev only
};

/**
 * Format connection mode for display
 */
const formatMode = (mode, host) => {
  if (!mode) return 'none';
  if (mode === 'wifi' && host) return `wifi(${host})`;
  return mode;
};

/**
 * Core logger
 */
const log = (emoji, action, details = '') => {
  const detailStr = details ? ` → ${details}` : '';
};

/**
 * Lifecycle logs - Connection events
 */
export const logConnect = (mode, options = {}) => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  const { remoteHost, portName } = options;
  const target = mode === 'wifi' ? remoteHost : portName || 'local';
  log('🔌', 'CONNECT', `mode=${mode} target=${target}`);

  // 📊 Telemetry - NOTE: robot_connected is now emitted when connection is ESTABLISHED
  // (in robotSlice.js transitionTo.sleeping/ready), not at connection ATTEMPT
};

export const logDisconnect = (prevMode, reason = '') => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  const reasonStr = reason ? ` (${reason})` : '';
  log('🔌', 'DISCONNECT', `from=${prevMode || 'none'}${reasonStr}`);

  // 📊 Telemetry
  telemetry.robotDisconnected({ mode: prevMode, reason });
};

export const logReset = (scope = 'all') => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('🔄', 'RESET', scope);
};

/**
 * State transition logs
 */
export const logReady = () => {
  if (!LOG_LEVELS.TRANSITION) return;
  log('✅', 'READY', 'robot active');
};

export const logBusy = reason => {
  if (!LOG_LEVELS.TRANSITION) return;
  log('⏳', 'BUSY', reason);
};

export const logCrash = error => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('💥', 'CRASH', error || 'daemon crashed');
};

/**
 * App lifecycle logs
 */
export const logAppStart = appName => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('▶️', 'APP START', appName);

  // 📊 Telemetry
  telemetry.hfAppStarted({ app_id: appName });
};

export const logAppStop = appName => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('⏹️', 'APP STOP', appName || 'none');

  // 📊 Telemetry
  if (appName) {
    telemetry.hfAppStopped({ app_id: appName });
  }
};

export const logInstallStart = (appName, jobType) => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('📦', `${jobType?.toUpperCase() || 'INSTALL'} START`, appName);
  // Note: Installation telemetry is sent at logInstallEnd (with success/failure)
};

export const logInstallEnd = (appName, success, durationSec, jobType = 'install') => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  const emoji = success ? '✅' : '❌';
  log(emoji, `${jobType?.toUpperCase() || 'INSTALL'} END`, appName);

  // 📊 Telemetry
  if (jobType === 'remove') {
    // Uninstall event
    telemetry.hfAppUninstalled({ app_id: appName });
  } else {
    // Install event
    telemetry.hfAppInstalled({ app_id: appName, success, duration_sec: durationSec });
  }
};

export default {
  logConnect,
  logDisconnect,
  logReset,
  logReady,
  logBusy,
  logCrash,
  logAppStart,
  logAppStop,
  logInstallStart,
  logInstallEnd,
};
