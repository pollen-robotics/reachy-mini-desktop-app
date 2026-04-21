import { findErrorConfig, createErrorFromConfig, type HardwareErrorObject } from './hardwareErrors';
import { logError } from './logging';
import { telemetry } from './telemetry';
import useAppStore from '../store/useAppStore';

/**
 * Centralized daemon error handler.
 *
 * Single source of truth for handling all daemon-related errors.
 * Ensures consistent error handling across the application.
 */

export type DaemonErrorType =
  | 'startup'
  | 'crash'
  | 'hardware'
  | 'timeout'
  | 'daemon_error'
  | string;

export interface DaemonErrorContext {
  code?: string | number | null;
  status?: string | number | null;
  [key: string]: unknown;
}

/**
 * Handle a daemon-related error: build a user-facing error object, push it to
 * the store, log it and emit a telemetry event.
 *
 * @param errorType - High-level category (`startup`, `crash`, `hardware`, `timeout`, ...).
 * @param error - The raw error (string, `Error` or anything stringifiable).
 * @param context - Extra metadata (status code, exit status, ...).
 * @returns The error object that was pushed to the store.
 */
export const handleDaemonError = (
  errorType: DaemonErrorType,
  error: unknown,
  context: DaemonErrorContext = {}
): HardwareErrorObject => {
  const store = useAppStore.getState();
  const { setHardwareError, transitionTo, setStartupError } = store;

  let errorMessage: string;
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String((error as { message: unknown }).message ?? 'Unknown error');
  } else if (error != null) {
    errorMessage = String(error);
  } else {
    errorMessage = 'Unknown error';
  }

  const errorConfig = findErrorConfig(errorMessage);

  let errorObject: HardwareErrorObject;

  if (errorConfig) {
    errorObject = createErrorFromConfig(errorConfig, errorMessage);
    console.warn(`Hardware error detected (${errorConfig.type}):`, errorMessage);
  } else {
    switch (errorType) {
      case 'startup':
        errorObject = {
          type: 'daemon_startup',
          message: errorMessage,
          messageParts: { text: 'Failed to', bold: 'start daemon', suffix: '' },
          code: context.code != null ? String(context.code) : null,
          cameraPreset: 'scan',
        };
        break;

      case 'crash':
        errorObject = {
          type: 'daemon_crash',
          message: `Daemon process terminated unexpectedly (status: ${context.status ?? 'unknown'})`,
          messageParts: {
            text: 'Daemon process',
            bold: 'terminated unexpectedly',
            suffix: `(status: ${context.status ?? 'unknown'})`,
          },
          code: context.status != null ? String(context.status) : null,
          cameraPreset: 'scan',
        };
        break;

      case 'timeout':
        errorObject = {
          type: 'daemon_timeout',
          message:
            errorMessage ||
            'Daemon did not become active within 30 seconds. Please check the robot connection.',
          messageParts: {
            text: 'Daemon did not become active within',
            bold: '30 seconds',
            suffix: 'Please check the robot connection.',
          },
          code: 'TIMEOUT_30S',
          cameraPreset: 'scan',
        };
        break;

      case 'hardware':
        errorObject = {
          type: 'hardware',
          message: errorMessage,
          messageParts: { text: '', bold: '', suffix: '' },
          code: context.code != null ? String(context.code) : null,
          cameraPreset: 'scan',
        };
        break;

      default:
        errorObject = {
          type: 'daemon_error',
          message: errorMessage,
          messageParts: { text: '', bold: '', suffix: '' },
          code: context.code != null ? String(context.code) : null,
          cameraPreset: 'scan',
        };
    }
  }

  setHardwareError(errorObject);
  setStartupError(errorMessage);

  // Ensure robotStatus is `starting` to keep the scan view active.
  transitionTo.starting();

  logError(`Daemon ${errorType} error: ${errorMessage}`);

  const connectionMode = store.connectionMode;
  telemetry.connectionError({
    mode: connectionMode ?? undefined,
    error_type: errorType,
    error_message: errorMessage?.slice(0, 200),
  });

  return errorObject;
};

export interface CreateDaemonErrorOptions {
  messageParts?: HardwareErrorObject['messageParts'];
  code?: string | null;
  cameraPreset?: string;
}

/**
 * Helper to create daemon error objects (for consistency).
 */
export const createDaemonError = (
  type: string,
  message: string,
  options: CreateDaemonErrorOptions = {}
): HardwareErrorObject => {
  return {
    type,
    message,
    messageParts: options.messageParts ?? { text: '', bold: '', suffix: '' },
    code: options.code ?? null,
    cameraPreset: options.cameraPreset ?? 'scan',
  };
};
