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
    
    // ✅ Check global lock (quick action OR app running)
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
      { label } // ⚡ Label will be used in automatic log
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
    // Choreographies and emotions are longer, lock for 5 seconds
    await sendCommand(`/api/move/play/recorded-move-dataset/${dataset}/${move}`, move, 5000);
  }, [isActive, sendCommand]);

  return {
    sendCommand,
    playRecordedMove,
    isCommandRunning,
  };
};

