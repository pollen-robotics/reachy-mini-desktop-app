/**
 * Logs Slice - Manages all types of logs (daemon, frontend, app)
 * 
 * Note: We don't import DAEMON_CONFIG here to avoid circular dependencies
 * (daemon.js imports useRobotStore which imports useStore which imports slices)
 */

// Default max logs (same as DAEMON_CONFIG.LOGS values)
const MAX_FRONTEND_LOGS = 500;
const MAX_APP_LOGS = 500;
const MAX_DAEMON_OUTPUT_LOGS = 1000; // Larger buffer for daemon stdout/stderr

/**
 * Initial state for logs slice
 */
export const logsInitialState = {
  logs: [],              // Daemon lifecycle logs (from Tauri IPC - startup/stop messages)
  daemonOutputLogs: [],  // Daemon stdout/stderr logs (real Python output)
  frontendLogs: [],      // Frontend action logs (API calls, user actions)
  appLogs: [],           // App logs (from running apps)
};

/**
 * Create logs slice
 * @param {Function} set - Zustand set function
 * @param {Function} get - Zustand get function
 * @returns {Object} Logs slice state and actions
 */
export const createLogsSlice = (set, get) => ({
  ...logsInitialState,
  
  // Set daemon logs - merge intelligently to avoid unnecessary re-renders
  setLogs: (newLogs) => set((state) => {
    if (state.logs === newLogs || (Array.isArray(state.logs) && Array.isArray(newLogs) && 
        state.logs.length === newLogs.length && 
        state.logs.length > 0 && 
        state.logs[state.logs.length - 1] === newLogs[newLogs.length - 1])) {
      return state;
    }
    return { logs: newLogs };
  }),
  
  // Add frontend log
  addFrontendLog: (message, level = 'info') => {
    if (message == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[addFrontendLog] Received null/undefined message, skipping');
      }
      return;
    }
    
    const validLevels = ['info', 'success', 'warning', 'error'];
    const normalizedLevel = validLevels.includes(level) ? level : 'info';
    const sanitizedMessage = String(message).slice(0, 10000);
    
    try {
      const now = Date.now();
      let formattedTimestamp;
      try {
        formattedTimestamp = new Date(now).toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          hour12: false
        });
      } catch (e) {
        formattedTimestamp = new Date(now).toISOString().substring(11, 19);
      }
      
      set((state) => {
        const newLog = {
          timestamp: formattedTimestamp,
          timestampNumeric: now,
          message: sanitizedMessage,
          source: 'frontend',
          level: normalizedLevel,
        };
        
        const newFrontendLogs = [
          ...state.frontendLogs.slice(-MAX_FRONTEND_LOGS),
          newLog
        ];
        
        return { frontendLogs: newFrontendLogs };
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[addFrontendLog] Error adding log:', error);
      }
    }
  },
  
  // Add app log
  addAppLog: (message, appName, level = 'info') => {
    if (message == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[addAppLog] Received null/undefined message, skipping');
      }
      return;
    }
    
    const sanitizedMessage = String(message).slice(0, 10000);
    const sanitizedAppName = appName ? String(appName).slice(0, 100) : undefined;
    const sanitizedLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info';
    
    try {
      const now = Date.now();
      let formattedTimestamp;
      try {
        formattedTimestamp = new Date(now).toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          hour12: false
        });
      } catch (e) {
        formattedTimestamp = new Date(now).toISOString().substring(11, 19);
      }
      
      const newLog = {
        timestamp: formattedTimestamp,
        timestampNumeric: now,
        message: sanitizedMessage,
        source: 'app',
        appName: sanitizedAppName,
        level: sanitizedLevel,
      };
      
      set((state) => {
        // Deduplication
        const lastLog = state.appLogs[state.appLogs.length - 1];
        const isDuplicate = lastLog && 
            lastLog.message === sanitizedMessage && 
            lastLog.appName === sanitizedAppName &&
            lastLog.timestampNumeric && 
            (now - lastLog.timestampNumeric) < 100;
        
        if (isDuplicate) {
          return state;
        }
        
        return {
          appLogs: [
            ...state.appLogs.slice(-MAX_APP_LOGS),
            newLog
          ]
        };
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[addAppLog] Error adding log:', error);
      }
    }
  },
  
  // Add daemon output log (stdout/stderr from Python daemon)
  addDaemonOutputLog: (message, stream = 'stdout') => {
    if (message == null || message === '') {
      return;
    }
    
    const sanitizedMessage = String(message).slice(0, 10000);
    const sanitizedStream = ['stdout', 'stderr'].includes(stream) ? stream : 'stdout';
    
    try {
      const now = Date.now();
      let formattedTimestamp;
      try {
        formattedTimestamp = new Date(now).toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          hour12: false
        });
      } catch (e) {
        formattedTimestamp = new Date(now).toISOString().substring(11, 19);
      }
      
      const newLog = {
        timestamp: formattedTimestamp,
        timestampNumeric: now,
        message: sanitizedMessage,
        source: 'daemon',
        stream: sanitizedStream,
      };
      
      set((state) => {
        // Deduplication (avoid exact same message within 100ms)
        const lastLog = state.daemonOutputLogs[state.daemonOutputLogs.length - 1];
        const isDuplicate = lastLog && 
            lastLog.message === sanitizedMessage && 
            lastLog.timestampNumeric && 
            (now - lastLog.timestampNumeric) < 100;
        
        if (isDuplicate) {
          return state;
        }
        
        return {
          daemonOutputLogs: [
            ...state.daemonOutputLogs.slice(-MAX_DAEMON_OUTPUT_LOGS),
            newLog
          ]
        };
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[addDaemonOutputLog] Error adding log:', error);
      }
    }
  },
  
  // Clear app logs
  clearAppLogs: (appName) => set((state) => ({
    appLogs: appName 
      ? state.appLogs.filter(log => log.appName !== appName)
      : []
  })),
  
  // Clear daemon output logs
  clearDaemonOutputLogs: () => set({ daemonOutputLogs: [] }),
  
  // Clear all logs (for reset)
  clearAllLogs: () => set({
    logs: [],
    daemonOutputLogs: [],
    frontendLogs: [],
    appLogs: [],
  }),
});
