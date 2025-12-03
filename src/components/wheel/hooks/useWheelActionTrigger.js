import { useReducer, useEffect, useRef } from 'react';

/**
 * Hook to manage action triggering system for the wheel
 * Handles the flow: PENDING → CHECK_STABILITY → READY → TRIGGERED
 * 
 * @param {Object} params
 * @param {number} params.rotation - Current rotation in degrees
 * @param {boolean} params.isSpinning - Whether wheel is spinning
 * @param {boolean} params.isDragging - Whether user is dragging
 * @param {Function} params.onActionClick - Callback to trigger action
 * @param {boolean} params.isMounted - Whether component is mounted
 * @returns {Object} { dispatchAction, actionState }
 */
export const useWheelActionTrigger = ({
  rotation,
  isSpinning,
  isDragging,
  onActionClick,
  isMounted,
}) => {
  // Local lock to prevent multiple simultaneous triggers
  const isTriggeringRef = useRef(false);
  
  const actionTriggerReducer = (state, action) => {
    switch (action.type) {
      case 'PENDING':
        return {
          status: 'pending',
          item: action.item,
          timestamp: Date.now(),
          lastRotation: action.rotation,
        };
      
      case 'CANCEL':
        isTriggeringRef.current = false; // Reset lock on cancel
        return {
          status: 'idle',
          item: null,
          timestamp: null,
          lastRotation: action.rotation,
        };
      
      case 'CHECK_STABILITY':
        if (state.status !== 'pending') {
          return { ...state, lastRotation: action.rotation };
        }
        
        const rotationDelta = Math.abs(action.rotation - state.lastRotation);
        const timeSincePending = Date.now() - state.timestamp;
        const minStableTime = 100;
        
        if (rotationDelta < 0.1 && timeSincePending >= minStableTime) {
          return {
            ...state,
            status: 'ready',
            lastRotation: action.rotation,
          };
        }
        
        return {
          ...state,
          lastRotation: action.rotation,
        };
      
      case 'TRIGGERED':
        isTriggeringRef.current = false; // Reset lock after trigger
        return {
          status: 'idle',
          item: null,
          timestamp: null,
          lastRotation: action.rotation,
        };
      
      default:
        return state;
    }
  };
  
  const [actionState, dispatchAction] = useReducer(actionTriggerReducer, {
    status: 'idle',
    item: null,
    timestamp: null,
    lastRotation: rotation,
  });
  
  // Unified action trigger system - handles all states in one place
  useEffect(() => {
    // 1. Cancel pending actions if user starts interacting
    if (isSpinning || isDragging) {
      if (actionState.status === 'pending' || actionState.status === 'ready') {
        isTriggeringRef.current = false; // Reset lock
        dispatchAction({ type: 'CANCEL', rotation });
      }
      return;
    }
    
    // 2. Check stability for pending actions
    if (actionState.status === 'pending') {
      const timeoutId = setTimeout(() => {
        dispatchAction({ type: 'CHECK_STABILITY', rotation });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    
    // 3. Trigger action when ready (with lock to prevent multiple triggers)
    if (actionState.status === 'ready' && actionState.item?.originalAction && onActionClick) {
      // Prevent multiple simultaneous triggers
      if (isTriggeringRef.current) {
        return;
      }
      
      isTriggeringRef.current = true; // Set lock
      
      const timeoutId = setTimeout(() => {
        if (isMounted && onActionClick && actionState.item?.originalAction && isTriggeringRef.current) {
          try {
            onActionClick(actionState.item.originalAction);
            dispatchAction({ type: 'TRIGGERED', rotation });
          } catch (error) {
            console.error('Error triggering action:', error);
            isTriggeringRef.current = false; // Reset lock on error
            dispatchAction({ type: 'CANCEL', rotation });
          }
        } else {
          isTriggeringRef.current = false; // Reset lock if conditions not met
        }
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        // Don't reset lock here - let it be reset by TRIGGERED or CANCEL
      };
    }
  }, [actionState.status, actionState.item, isSpinning, isDragging, rotation, onActionClick, isMounted]);
  
  return { dispatchAction, actionState };
};
