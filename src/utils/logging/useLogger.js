import { useCallback } from 'react';
import { useStore } from '../../store';
import { LOG_LEVELS, LOG_EMOJIS, LOG_PREFIXES, LOG_CATEGORIES } from './constants';

/**
 * React hook for logging in components.
 * Each method routes to addFrontendLog with the appropriate category.
 */
export function useLogger() {
  const addFrontendLog = useStore(state => state.addFrontendLog);
  const addAppLog = useStore(state => state.addAppLog);

  const info = useCallback(
    (message, category = LOG_CATEGORIES.FRONTEND) => {
      addFrontendLog(message, LOG_LEVELS.INFO, category);
    },
    [addFrontendLog]
  );

  const success = useCallback(
    (message, category = LOG_CATEGORIES.FRONTEND) => {
      const formatted = `${LOG_EMOJIS.SUCCESS} ${message}`;
      addFrontendLog(formatted, LOG_LEVELS.SUCCESS, category);
    },
    [addFrontendLog]
  );

  const warning = useCallback(
    (message, category = LOG_CATEGORIES.FRONTEND) => {
      const formatted = `${LOG_EMOJIS.WARNING} ${message}`;
      addFrontendLog(formatted, LOG_LEVELS.WARNING, category);
    },
    [addFrontendLog]
  );

  const error = useCallback(
    (message, category = LOG_CATEGORIES.FRONTEND) => {
      const formatted = `${LOG_EMOJIS.ERROR} ${message}`;
      addFrontendLog(formatted, LOG_LEVELS.ERROR, category);
    },
    [addFrontendLog]
  );

  const api = useCallback(
    (method, endpoint, ok, details = '') => {
      const icon = ok ? LOG_EMOJIS.SUCCESS : LOG_EMOJIS.ERROR;
      const message = details
        ? `${icon} ${method} ${endpoint}: ${details}`
        : `${icon} ${method} ${endpoint}`;
      addFrontendLog(message, ok ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR, LOG_CATEGORIES.FRONTEND);
    },
    [addFrontendLog]
  );

  const daemon = useCallback(
    (message, level = LOG_LEVELS.INFO) => {
      const formatted = `${LOG_PREFIXES.DAEMON} ${message}`;
      addFrontendLog(formatted, level, LOG_CATEGORIES.DAEMON);
    },
    [addFrontendLog]
  );

  const app = useCallback(
    (appName, message, level = LOG_LEVELS.INFO) => {
      addAppLog(message, appName, level);
    },
    [addAppLog]
  );

  const userAction = useCallback(
    (action, details = '') => {
      const message = details ? `${action}: ${details}` : action;
      addFrontendLog(message, LOG_LEVELS.INFO, LOG_CATEGORIES.FRONTEND);
    },
    [addFrontendLog]
  );

  const permission = useCallback(
    message => {
      const formatted = `${LOG_EMOJIS.PERMISSION} ${message}`;
      addFrontendLog(formatted, LOG_LEVELS.WARNING, LOG_CATEGORIES.FRONTEND);
    },
    [addFrontendLog]
  );

  const timeout = useCallback(
    message => {
      const formatted = `${LOG_EMOJIS.TIMEOUT} ${message}`;
      addFrontendLog(formatted, LOG_LEVELS.WARNING, LOG_CATEGORIES.FRONTEND);
    },
    [addFrontendLog]
  );

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
