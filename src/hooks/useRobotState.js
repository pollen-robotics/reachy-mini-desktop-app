import { useState, useEffect, useRef } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../config/daemon';

/**
 * Hook pour récupérer l'état complet du robot depuis l'API daemon
 * Utilise les VRAIS champs de l'API : control_mode, head_joints, body_yaw, etc.
 * 
 * ⚠️ NE gère PAS la détection de crash (délégué à useDaemonHealthCheck)
 */
export function useRobotState(isActive) {
  const { isDaemonCrashed } = useAppStore();
  const [robotState, setRobotState] = useState({
    isOn: null,           // Moteurs allumés (control_mode === 'enabled')
    isMoving: false,      // Moteurs en mouvement (détecté)
  });
  
  const lastPositionsRef = useRef(null);
  const movementTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      setRobotState({ isOn: null, isMoving: false });
      return;
    }

    const fetchState = async () => {
      try {
        // ✅ Fetch state avec timeout standardisé (silencieux car polling)
        const stateResponse = await fetchWithTimeout(
          buildApiUrl('/api/state/full?with_control_mode=true&with_head_joints=true&with_body_yaw=true&with_antenna_positions=true'),
          {},
          DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
          { silent: true } // ⚡ Ne pas logger (polling toutes les 500ms)
        );
        
        if (stateResponse.ok) {
          const data = await stateResponse.json();
          
          // ✅ Utiliser control_mode du daemon (enabled/disabled)
          const motorsOn = data.control_mode === 'enabled';
          
          // ✅ Détection de mouvement basée sur les changements de position
          let isMoving = false;
          
          if (data.body_yaw !== undefined && data.antennas_position) {
            const currentPositions = {
              body_yaw: data.body_yaw,
              antennas: data.antennas_position,
            };
            
            // Comparer avec la frame précédente
            if (lastPositionsRef.current) {
              const yawDiff = Math.abs(currentPositions.body_yaw - lastPositionsRef.current.body_yaw);
              const antennaDiff = currentPositions.antennas && lastPositionsRef.current.antennas
                ? Math.abs(currentPositions.antennas[0] - lastPositionsRef.current.antennas[0]) +
                  Math.abs(currentPositions.antennas[1] - lastPositionsRef.current.antennas[1])
                : 0;
              
              // ✅ Seuil augmenté pour filtrer les tremblements : > 0.01 radians (~0.6°)
              if (yawDiff > 0.01 || antennaDiff > 0.01) {
                isMoving = true;
                
                // Reset timeout : considérer comme "en mouvement" pendant 800ms après le dernier changement
                if (movementTimeoutRef.current) {
                  clearTimeout(movementTimeoutRef.current);
                }
                movementTimeoutRef.current = setTimeout(() => {
                  setRobotState(prev => ({ ...prev, isMoving: false }));
                }, 800);
              }
            }
            
            lastPositionsRef.current = currentPositions;
          }
          
          // ✅ Log détaillé pour debug (tous les 10 appels)
          if (!fetchState.callCount) fetchState.callCount = 0;
          fetchState.callCount++;
          
          if (fetchState.callCount % 10 === 1) {
            console.log('🤖 Robot state from daemon:', {
              control_mode: data.control_mode,
              motors_on: motorsOn,
              is_moving: isMoving,
              body_yaw: data.body_yaw?.toFixed(3),
              antennas: data.antennas_position?.map(a => a.toFixed(3)),
            });
          }
          
          setRobotState({
            isOn: motorsOn,
            isMoving: isMoving,
          });
          
          // ✅ Pas de resetTimeouts() ici, géré par useDaemonHealthCheck
        }
      } catch (error) {
        // ✅ Pas de incrementTimeouts() ici, géré par useDaemonHealthCheck
        // On log juste l'erreur si ce n'est pas un timeout (déjà géré ailleurs)
        if (error.name !== 'TimeoutError' && !error.message?.includes('timed out')) {
          console.warn('⚠️ Robot state fetch error:', error.message);
        }
      }
    };

    // Ne pas poll si le daemon est crashé
    if (isDaemonCrashed) {
      console.warn('⚠️ Daemon crashed, stopping robot state polling');
      return;
    }

    // Fetch initial
    fetchState();

    // ✅ Refresh fréquent pour détecter mouvement en temps réel
    const interval = setInterval(fetchState, DAEMON_CONFIG.INTERVALS.ROBOT_STATE);

    return () => {
      clearInterval(interval);
      if (movementTimeoutRef.current) {
        clearTimeout(movementTimeoutRef.current);
      }
    };
  }, [isActive, isDaemonCrashed]);

  return robotState;
}

