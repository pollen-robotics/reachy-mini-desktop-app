import { findErrorConfig, createErrorFromConfig } from './hardwareErrors';
import { logError } from './logging';
import { telemetry } from './telemetry';

/**
 * Centralized daemon error handler
 *
 * Single source of truth for handling all daemon-related errors.
 * Ensures consistent error handling across the application.
 *
 * @param {string} errorType - Type of error ('startup', 'crash', 'hardware', 'timeout')
 * @param {Error|string|Object} error - Error object, message, or data
 * @param {Object} context - Additional context (code, status, etc.)
 * @returns {Object} Error object that was set
 */
export const handleDaemonError = (errorType, error, context = {}) => {
  // Always get fresh store state
  const useAppStore = require('../store/useAppStore').default;
  const store = useAppStore.getState();

  const { setHardwareError, transitionTo, setStartupError } = store;

  let errorObject = null;
  let errorMessage = null;

  // Extract error message
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error?.message) {
    errorMessage = error.message;
  } else if (error) {
    errorMessage = String(error);
  } else {
    errorMessage = 'Unknown error';
  }

  // Try to find error config for hardware errors
  const errorConfig = findErrorConfig(errorMessage);

  if (errorConfig) {
    // Use centralized error config
    errorObject = createErrorFromConfig(errorConfig, errorMessage);
    console.warn(`⚠️ Hardware error detected (${errorConfig.type}):`, errorMessage);
  } else {
    // Create error object based on error type
    switch (errorType) {
      case 'startup':
        errorObject = {
          type: 'daemon_startup',
          message: errorMessage,
          messageParts: {
            text: 'Failed to',
            bold: 'start daemon',
            suffix: '',
          },
          code: context.code || null,
          cameraPreset: 'scan',
        };
        break;

      case 'crash':
        errorObject = {
          type: 'daemon_crash',
          message: `Daemon process terminated unexpectedly (status: ${context.status || 'unknown'})`,
          messageParts: {
            text: 'Daemon process',
            bold: 'terminated unexpectedly',
            suffix: `(status: ${context.status || 'unknown'})`,
          },
          code: context.status || null,
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
        // Generic hardware error (no specific config found)
        errorObject = {
          type: 'hardware',
          message: errorMessage,
          messageParts: null,
          code: context.code || null,
          cameraPreset: 'scan',
        };
        break;

      default:
        errorObject = {
          type: 'daemon_error',
          message: errorMessage,
          messageParts: null,
          code: context.code || null,
          cameraPreset: 'scan',
        };
    }
  }

  // Set error in store
  setHardwareError(errorObject);
  setStartupError(errorMessage);

  // ✅ CRITICAL: Ensure robotStatus is 'starting' to keep scan view active
  transitionTo.starting();

  // Log to frontend logs using standardized logger
  const logMessage = `Daemon ${errorType} error: ${errorMessage}`;
  logError(logMessage);

  // 📊 Telemetry - Track connection error
  const connectionMode = store.connectionMode;
  telemetry.connectionError({
    mode: connectionMode,
    error_type: errorType,
  });

  return errorObject;
};

/**
 * Helper to create daemon error objects (for consistency)
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 * @returns {Object} Error object
 */
export const createDaemonError = (type, message, options = {}) => {
  return {
    type,
    message,
    messageParts: options.messageParts || null,
    code: options.code || null,
    cameraPreset: options.cameraPreset || 'scan',
  };
};
