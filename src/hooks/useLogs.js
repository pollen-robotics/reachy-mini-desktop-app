import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../store/useAppStore';

export const useLogs = () => {
  const { logs, setLogs, addFrontendLog } = useAppStore();

  const fetchLogs = useCallback(async () => {
    try {
      const fetchedLogs = await invoke('get_logs');
      setLogs(fetchedLogs);
    } catch (e) {
      console.error('Error fetching logs:', e);
    }
  }, [setLogs]);
  
  // Function to add a frontend log
  const logCommand = useCallback((message, type = 'info') => {
    // Timestamp is now automatically added by addFrontendLog
    addFrontendLog(message);
  }, [addFrontendLog]);
  
  // Log an API action (request to daemon)
  const logApiAction = useCallback((action, details = '', success = true) => {
    // Timestamp is now automatically added by addFrontendLog
    const icon = success ? '✓' : '❌';
    const message = details ? `${icon} ${action}: ${details}` : `${icon} ${action}`;
    addFrontendLog(message);
  }, [addFrontendLog]);

  return {
    logs,
    fetchLogs,
    logCommand,
    logApiAction,
  };
};

