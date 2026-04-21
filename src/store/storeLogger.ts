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
import type { ConnectionMode, StartConnectionOptions } from '../types/robot';

const isDev = process.env.NODE_ENV === 'development';

const LOG_LEVELS = {
  LIFECYCLE: true,
  TRANSITION: true,
  DEBUG: isDev,
};

const log = (emoji: string, action: string, details: string = ''): void => {
  const detailStr = details ? ` → ${details}` : '';
  console.log(`[Store] ${emoji} ${action}${detailStr}`);
};

/**
 * Lifecycle logs - Connection events
 */
export const logConnect = (
  mode: ConnectionMode | string,
  options: StartConnectionOptions = {}
): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  const { remoteHost, portName } = options;
  const target = mode === 'wifi' ? remoteHost : portName || 'local';
  log('🔌', 'CONNECT', `mode=${mode} target=${target}`);

  // 📊 Telemetry - NOTE: robot_connected is now emitted when connection is ESTABLISHED
  // (in robotSlice.ts transitionTo.sleeping/ready), not at connection ATTEMPT
};

export const logDisconnect = (prevMode: ConnectionMode | string | null, reason = ''): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  const reasonStr = reason ? ` (${reason})` : '';
  log('🔌', 'DISCONNECT', `from=${prevMode || 'none'}${reasonStr}`);

  telemetry.robotDisconnected({ mode: prevMode ?? undefined, reason });
};

export const logReset = (scope = 'all'): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('🔄', 'RESET', scope);
};

/**
 * State transition logs
 */
export const logReady = (): void => {
  if (!LOG_LEVELS.TRANSITION) return;
  log('✅', 'READY', 'robot active');
};

export const logBusy = (reason: string | null): void => {
  if (!LOG_LEVELS.TRANSITION) return;
  log('⏳', 'BUSY', reason ?? '');
};

export const logCrash = (error?: string | null): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('💥', 'CRASH', error || 'daemon crashed');
};

/**
 * App lifecycle logs
 */
export const logAppStart = (appName: string): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('▶️', 'APP START', appName);

  telemetry.hfAppStarted({ app_id: appName });
};

export const logAppStop = (appName: string | null): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('⏹️', 'APP STOP', appName || 'none');

  if (appName) {
    telemetry.hfAppStopped({ app_id: appName });
  }
};

export const logInstallStart = (appName: string, jobType?: string): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  log('📦', `${jobType?.toUpperCase() || 'INSTALL'} START`, appName);
};

export const logInstallEnd = (
  appName: string,
  success: boolean,
  durationSec: number | null,
  jobType: string = 'install'
): void => {
  if (!LOG_LEVELS.LIFECYCLE) return;
  const emoji = success ? '✅' : '❌';
  log(emoji, `${jobType?.toUpperCase() || 'INSTALL'} END`, appName);

  if (jobType === 'remove') {
    telemetry.hfAppUninstalled({ app_id: appName });
  } else {
    telemetry.hfAppInstalled({
      app_id: appName,
      success,
      duration_sec: durationSec ?? undefined,
    });
  }
};
