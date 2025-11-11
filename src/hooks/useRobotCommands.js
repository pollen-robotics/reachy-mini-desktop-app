import { useCallback } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../config/daemon';

export const useRobotCommands = () => {
  const { isActive, isCommandRunning, setIsCommandRunning } = useAppStore();

  const sendCommand = useCallback(async (endpoint, label, lockDuration = 2000) => {
    if (!isActive) {
      console.warn(`❌ Cannot send ${label}: daemon not active`);
      return;
    }
    
    // ✅ Vérifier le verrouillage global (quick action OU app en cours)
    if (useAppStore.getState().isBusy()) {
      const currentAppName = useAppStore.getState().currentAppName;
      if (currentAppName) {
        console.warn(`⚠️ Command ${label} ignored: ${currentAppName} app is running`);
      } else {
        console.warn(`⚠️ Command ${label} ignored: another command is running`);
      }
      return;
    }
    
    setIsCommandRunning(true);
    
    // Log dans la console navigateur
    console.log(`🤖 Command: ${label} → ${endpoint}`);
    
    // Fire and forget avec logging automatique via fetchWithTimeout
    fetchWithTimeout(
      buildApiUrl(endpoint),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label } // ⚡ Le label sera utilisé dans le log automatique
    )
      .catch(e => {
        console.error(`❌ ${label} ERROR:`, e.message);
      })
      .finally(() => {
        // Unlock commands after lock duration
        setTimeout(() => {
          setIsCommandRunning(false);
          console.log(`🔓 Commands unlocked (${label} finished)`);
        }, lockDuration);
      });
  }, [isActive, isCommandRunning, setIsCommandRunning]);

  const playRecordedMove = useCallback(async (dataset, move) => {
    if (!isActive) return;
    // Chorégraphies et émotions sont plus longues, on lock pour 5 secondes
    await sendCommand(`/api/move/play/recorded-move-dataset/${dataset}/${move}`, move, 5000);
  }, [isActive, sendCommand]);

  return {
    sendCommand,
    playRecordedMove,
    isCommandRunning,
  };
};

