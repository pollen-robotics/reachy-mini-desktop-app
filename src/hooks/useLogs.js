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
  
  // Fonction pour ajouter un log frontend
  const logCommand = useCallback((message, type = 'info') => {
    // Le timestamp est maintenant ajouté automatiquement par addFrontendLog
    addFrontendLog(message);
  }, [addFrontendLog]);
  
  // Log une action API (requête vers le daemon)
  const logApiAction = useCallback((action, details = '', success = true) => {
    // Le timestamp est maintenant ajouté automatiquement par addFrontendLog
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

