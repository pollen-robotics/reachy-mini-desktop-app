import { useRef, useCallback, useEffect } from 'react';

/**
 * Event Bus for Daemon Lifecycle Management
 * 
 * Centralizes all daemon-related events to avoid race conditions and improve traceability.
 * All events are logged for debugging purposes.
 * 
 * Events:
 * - daemon:start:attempt - User initiated daemon start
 * - daemon:start:success - Daemon process started successfully
 * - daemon:start:error - Error during daemon startup
 * - daemon:start:timeout - Daemon didn't become active within timeout
 * - daemon:crash - Daemon process terminated unexpectedly
 * - daemon:hardware:error - Hardware error detected from stderr
 * - daemon:health:success - Daemon responding successfully
 * - daemon:health:failure - Daemon not responding (timeout)
 * - daemon:stop - Daemon stop initiated
 */
class DaemonEventBus {
  constructor() {
    this.listeners = new Map();
    this.eventLog = [];
    this.maxLogSize = 100;
  }

  /**
   * Emit an event to all registered listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data = null) {
    const timestamp = Date.now();
    
    // Log event for debugging
    const logEntry = { event, data, timestamp };
    this.eventLog.push(logEntry);
    
    // Keep log size manageable
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }
    
    // Log to console in dev mode (but skip frequent events to avoid spam)
    const silentEvents = ['daemon:health:success', 'robot:state:updated'];
    if (process.env.NODE_ENV === 'development' && !silentEvents.includes(event)) {
      
    }
    
    // Notify all listeners
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data, logEntry);
      } catch (error) {
        console.error(`[DaemonEventBus] Error in handler for ${event}:`, error);
      }
    });
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        if (handlers.length === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name (optional, removes all if not provided)
   */
  off(event = null) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get event log for debugging
   * @returns {Array} Event log entries
   */
  getEventLog() {
    return [...this.eventLog];
  }

  /**
   * Clear event log
   */
  clearEventLog() {
    this.eventLog = [];
  }
}

/**
 * Hook to access the daemon event bus
 * Creates a singleton instance that persists across re-renders
 */
export const useDaemonEventBus = () => {
  const eventBusRef = useRef(null);
  
  // Create singleton instance
  if (!eventBusRef.current) {
    eventBusRef.current = new DaemonEventBus();
  }
  
  const eventBus = eventBusRef.current;
  
  // Cleanup on unmount (optional, but good practice)
  useEffect(() => {
    return () => {
      // Don't clear listeners on unmount - event bus should persist
      // Only clear if explicitly needed
    };
  }, []);
  
  return {
    emit: useCallback((event, data) => eventBus.emit(event, data), [eventBus]),
    on: useCallback((event, handler) => eventBus.on(event, handler), [eventBus]),
    off: useCallback((event) => eventBus.off(event), [eventBus]),
    getEventLog: useCallback(() => eventBus.getEventLog(), [eventBus]),
    clearEventLog: useCallback(() => eventBus.clearEventLog(), [eventBus]),
  };
};

