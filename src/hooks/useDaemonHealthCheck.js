import { useEffect } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../config/daemon';

/**
 * 🏥 Hook centralisé pour la détection de santé du daemon
 * 
 * UN SEUL endroit pour incrémenter le compteur de timeouts
 * Remplace les appels dispersés dans useDaemon et useRobotState
 * 
 * ⚠️ SKIP pendant installations (daemon peut être surchargé)
 */
export function useDaemonHealthCheck() {
  const { 
    isDaemonCrashed, 
    isInstalling,
    isActive,
    incrementTimeouts, 
    resetTimeouts 
  } = useAppStore();
  
  useEffect(() => {
    // Ne pas checker si déjà détecté comme crashé
    if (isDaemonCrashed) {
      console.warn('⚠️ Daemon marked as crashed, health check disabled');
      return;
    }
    
    // Ne pas checker si daemon pas actif
    if (!isActive) {
      return;
    }
    
    const checkHealth = async () => {
      // ⚠️ SKIP pendant installations (daemon peut être surchargé par pip install)
      if (isInstalling) {
        console.log('⏭️ Skipping health check (installation in progress)');
        return;
      }
      
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.STATE_FULL),
          {},
          DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK,
          { silent: true } // Ne pas logger (polling)
        );
        
        if (response.ok) {
          resetTimeouts(); // ✅ Succès → reset le compteur
        } else {
          // Réponse mais pas OK → pas un timeout, ne pas incrémenter
          console.warn('⚠️ Daemon responded but not OK:', response.status);
        }
      } catch (error) {
        // ❌ Timeout → incrémenter le compteur
        if (error.name === 'TimeoutError' || error.message?.includes('timed out')) {
          console.warn('⚠️ Health check timeout, incrementing counter');
          incrementTimeouts();
        }
      }
    };
    
    // Premier check immédiat
    checkHealth();
    
    // ✅ Health check toutes les 2s
    const interval = setInterval(checkHealth, DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK);
    
    return () => clearInterval(interval);
  }, [isDaemonCrashed, isInstalling, isActive, incrementTimeouts, resetTimeouts]);
}

