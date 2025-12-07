import { useCallback } from 'react';
import useAppStore from '../../store/useAppStore';
import { useLogsStore } from '../../store/useLogsStore';
import { LOG_LEVELS, LOG_EMOJIS, LOG_PREFIXES } from './constants';

/**
 * React hook for logging in components
 * 
 * Provides standardized logging functions with consistent formatting
 * 
 * @example
 * ```jsx
 * function MyComponent() {
 *   const logger = useLogger();
 *   
 *   const handleAction = () => {
 *     logger.success('Action completed');
 *     logger.error('Something went wrong');
 *   };
 * }
 * ```
 */
export function useLogger() {
  const addFrontendLog = useLogsStore(state => state.addFrontendLog);
  const addAppLog = useAppStore(state => state.addAppLog);

  /**
   * Log an info message
   */
  const info = useCallback((message, context = {}) => {
    addFrontendLog(message, LOG_LEVELS.INFO);
  }, [addFrontendLog]);

  /**
   * Log a success message
   */
  const success = useCallback((message, context = {}) => {
    const formattedMessage = `${LOG_EMOJIS.SUCCESS} ${message}`;
    addFrontendLog(formattedMessage, LOG_LEVELS.SUCCESS);
  }, [addFrontendLog]);

  /**
   * Log a warning message
   */
  const warning = useCallback((message, context = {}) => {
    const formattedMessage = `${LOG_EMOJIS.WARNING} ${message}`;
    addFrontendLog(formattedMessage, LOG_LEVELS.WARNING);
  }, [addFrontendLog]);

  /**
   * Log an error message
   */
  const error = useCallback((message, context = {}) => {
    const formattedMessage = `${LOG_EMOJIS.ERROR} ${message}`;
    addFrontendLog(formattedMessage, LOG_LEVELS.ERROR);
  }, [addFrontendLog]);

  /**
   * Log an API call
   */
  const api = useCallback((method, endpoint, success, details = '') => {
    const icon = success ? LOG_EMOJIS.SUCCESS : LOG_EMOJIS.ERROR;
    const message = details 
      ? `${icon} ${method} ${endpoint}: ${details}`
      : `${icon} ${method} ${endpoint}`;
    addFrontendLog(message, success ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR);
  }, [addFrontendLog]);

  /**
   * Log a daemon message
   */
  const daemon = useCallback((message, level = LOG_LEVELS.INFO) => {
    const formattedMessage = `${LOG_PREFIXES.DAEMON} ${message}`;
    addFrontendLog(formattedMessage, level);
  }, [addFrontendLog]);

  /**
   * Log an app message (uses addAppLog)
   */
  const app = useCallback((appName, message, level = LOG_LEVELS.INFO) => {
    addAppLog(message, appName, level);
  }, [addAppLog]);

  /**
   * Log a user action
   */
  const userAction = useCallback((action, details = '') => {
    const message = details 
      ? `${action}: ${details}`
      : action;
    addFrontendLog(message, LOG_LEVELS.INFO);
  }, [addFrontendLog]);

  /**
   * Log a permission-related message
   */
  const permission = useCallback((message) => {
    const formattedMessage = `${LOG_EMOJIS.PERMISSION} ${message}`;
    addFrontendLog(formattedMessage, LOG_LEVELS.WARNING);
  }, [addFrontendLog]);

  /**
   * Log a timeout message
   */
  const timeout = useCallback((message) => {
    const formattedMessage = `${LOG_EMOJIS.TIMEOUT} ${message}`;
    addFrontendLog(formattedMessage, LOG_LEVELS.WARNING);
  }, [addFrontendLog]);

  return {
    info,
    success,
    warning,
    error,
    api,
    daemon,
    app,
    userAction,
    permission,
    timeout,
  };
}

