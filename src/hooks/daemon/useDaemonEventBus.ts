/**
 * Event Bus for Daemon Lifecycle Management
 *
 * True module-level singleton shared by every consumer.
 * All events are logged for debugging purposes.
 *
 * Events:
 * - daemon:start:attempt - User initiated daemon start
 * - daemon:start:success - Daemon sidecar process started successfully
 * - daemon:start:error - Error during daemon startup
 * - daemon:start:timeout - Daemon didn't become active within timeout
 * - daemon:ready - Daemon reports state=running AND /api/state/full is 200
 *                  (single source of truth for "backend fully operational").
 *                  Emitted exactly once per start cycle by useDaemonLifecycle.
 * - daemon:crash - Daemon process terminated unexpectedly
 * - daemon:hardware:error - Hardware error detected (via stderr or API)
 * - daemon:health:success - Daemon responding successfully
 * - daemon:health:failure - Daemon not responding (timeout)
 * - daemon:stop - Daemon stop initiated
 */

export interface DaemonLogEntry {
  event: string;
  data: unknown;
  timestamp: number;
}

export type DaemonEventHandler = (data: unknown, logEntry: DaemonLogEntry) => void;

export interface DaemonEventBusInstance {
  emit: (event: string, data?: unknown) => void;
  on: (event: string, handler: DaemonEventHandler) => () => void;
}

class DaemonEventBus implements DaemonEventBusInstance {
  private listeners: Map<string, DaemonEventHandler[]> = new Map();
  private eventLog: DaemonLogEntry[] = [];
  private readonly maxLogSize: number = 100;

  /**
   * Emit an event to all registered listeners
   */
  emit(event: string, data: unknown = null): void {
    const timestamp = Date.now();

    const logEntry: DaemonLogEntry = { event, data, timestamp };
    this.eventLog.push(logEntry);

    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data, logEntry);
      } catch {
        // Silently swallow handler errors to avoid one broken listener
        // tearing down the entire daemon lifecycle.
      }
    });
  }

  /**
   * Register an event listener
   * Returns an unsubscribe function.
   */
  on(event: string, handler: DaemonEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);

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
}

// Module-level singleton — every call to useDaemonEventBus() returns the same instance.
const daemonEventBus: DaemonEventBusInstance = new DaemonEventBus();

/**
 * Hook to access the daemon event bus (true singleton).
 * The returned object is referentially stable across renders and components.
 */
export const useDaemonEventBus = (): DaemonEventBusInstance => daemonEventBus;
