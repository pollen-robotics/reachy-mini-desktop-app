import { useState, useCallback } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../../../config/daemon';
import useAppStore from '../../../store/useAppStore';
import { ROBOT_STATUS } from '../../../constants/robotStatus';

/**
 * Hook to manage robot wake/sleep state transitions
 * 
 * Encapsulates all the logic for:
 * - Enabling/disabling motors
 * - Playing wake_up/goto_sleep animations
 * - Managing state transitions
 * 
 * @returns {Object} Wake/sleep controls and state
 */
export function useWakeSleep() {
  const { robotStatus, transitionTo } = useAppStore();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState(null);
  
  // Optimistic UI state - toggle appears checked immediately on wake click
  const [optimisticAwake, setOptimisticAwake] = useState(false);
  
  // Derived states
  const isSleeping = robotStatus === ROBOT_STATUS.SLEEPING;
  const isAwake = robotStatus === ROBOT_STATUS.READY || robotStatus === ROBOT_STATUS.BUSY;
  const canToggle = !isTransitioning && (isSleeping || robotStatus === ROBOT_STATUS.READY);
  
  // For UI display: use optimistic state during wake transition
  const displayAwake = optimisticAwake || isAwake;
  const displaySleeping = !displayAwake;
  
  /**
   * Enable motors via API
   */
  const enableMotors = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/enabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Enable motors' }
    );
    
    if (!response.ok) {
      throw new Error('Failed to enable motors');
    }
    
    // Verify motor status
    const statusResponse = await fetchWithTimeout(
      buildApiUrl('/api/motors/status'),
      { method: 'GET' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Check motor status' }
    );
    const status = await statusResponse.json();
    console.log('🔧 Motor status:', status);
    
    return status;
  }, []);
  
  /**
   * Disable motors via API
   */
  const disableMotors = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/disabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Disable motors' }
    );
    
    if (!response.ok) {
      throw new Error('Failed to disable motors');
    }
  }, []);
  
  /**
   * Play wake_up animation via API
   */
  const playWakeUpAnimation = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/move/play/wake_up'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Wake up animation' }
    );
    
    if (!response.ok) {
      throw new Error('Failed to play wake_up animation');
    }
    
    const data = await response.json();
    console.log('✅ Wake up animation started, UUID:', data.uuid);
    return data;
  }, []);
  
  /**
   * Play goto_sleep animation via API
   */
  const playGoToSleepAnimation = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/move/play/goto_sleep'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Goto sleep animation' }
    );
    
    if (!response.ok) {
      throw new Error('Failed to play goto_sleep animation');
    }
    
    const data = await response.json();
    console.log('✅ Goto sleep animation started, UUID:', data.uuid);
    return data;
  }, []);
  
  /**
   * Wait for animation to complete
   * TODO: Could be improved to poll actual animation status instead of fixed timeout
   */
  const waitForAnimation = useCallback(async () => {
    await new Promise(resolve => 
      setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION)
    );
  }, []);
  
  /**
   * Wake up the robot
   * 
   * Sequence:
   * 1. Enable motors
   * 2. Wait for motors to initialize (300ms)
   * 3. Play wake_up animation
   * 4. Wait for animation to complete
   * 5. Transition to ready state
   */
  const wakeUp = useCallback(async () => {
    if (!canToggle || !isSleeping) {
      console.warn('Cannot wake up: invalid state');
      return false;
    }
    
    setIsTransitioning(true);
    setOptimisticAwake(true); // Immediately show toggle as "awake" for better UX
    setError(null);
    
    try {
      console.log('🌅 Waking up robot...');
      
      // 1. Enable motors
      await enableMotors();
      
      // 2. Small delay for motor initialization
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 3. Play wake_up animation
      await playWakeUpAnimation();
      
      // 4. Wait for animation to complete
      await waitForAnimation();
      
      // 5. Transition to ready
      transitionTo.ready();
      console.log('✅ Robot is now awake');
      
      return true;
    } catch (err) {
      console.error('Wake up error:', err);
      setError(err.message);
      setOptimisticAwake(false); // Revert optimistic state on error
      // Stay in sleeping state on error
      return false;
    } finally {
      setIsTransitioning(false);
      setOptimisticAwake(false); // Clear optimistic state (real state takes over)
    }
  }, [canToggle, isSleeping, enableMotors, playWakeUpAnimation, waitForAnimation, transitionTo]);
  
  /**
   * Put the robot to sleep
   * 
   * Sequence:
   * 1. Transition to sleeping state (blocks all actions immediately)
   * 2. Play goto_sleep animation
   * 3. Wait for animation to complete
   * 4. Disable motors
   */
  const goToSleep = useCallback(async () => {
    if (!canToggle || isSleeping) {
      console.warn('Cannot go to sleep: invalid state');
      return false;
    }
    
    setIsTransitioning(true);
    setError(null);
    
    try {
      console.log('😴 Sending robot to sleep...');
      
      // 1. Transition immediately to sleeping (blocks all actions)
      transitionTo.sleeping();
      
      // 2. Play goto_sleep animation
      await playGoToSleepAnimation();
      
      // 3. Wait for animation to complete
      await waitForAnimation();
      
      // 4. Disable motors
      await disableMotors();
      
      console.log('✅ Robot is now sleeping');
      return true;
    } catch (err) {
      console.error('Go to sleep error:', err);
      setError(err.message);
      // Revert to ready on error
      transitionTo.ready();
      return false;
    } finally {
      setIsTransitioning(false);
    }
  }, [canToggle, isSleeping, transitionTo, playGoToSleepAnimation, waitForAnimation, disableMotors]);
  
  /**
   * Toggle between wake and sleep states
   */
  const toggle = useCallback(async () => {
    if (isSleeping) {
      return wakeUp();
    } else {
      return goToSleep();
    }
  }, [isSleeping, wakeUp, goToSleep]);
  
  return {
    // State (display states include optimistic UI)
    isSleeping: displaySleeping,
    isAwake: displayAwake,
    isTransitioning,
    canToggle,
    error,
    
    // Actions
    wakeUp,
    goToSleep,
    toggle,
  };
}

