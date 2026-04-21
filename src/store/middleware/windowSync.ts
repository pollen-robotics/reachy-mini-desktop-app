import type { StateCreator, StoreApi } from 'zustand';
import { extractChangedUpdates } from '../../utils/stateComparison';

const ROBOT_STATE_THROTTLE_MS = 250; // 4Hz max for robot state IPC sync

type Updates = Record<string, unknown>;
type EmitStoreUpdate = (updates: Updates) => Promise<void>;

/**
 * Middleware to sync store state to other windows via Tauri events
 *
 * This middleware:
 * - Detects if current window is the main window
 * - Emits state updates to secondary windows via Tauri events
 * - Only syncs relevant state keys
 * - Uses optimized comparison functions to avoid unnecessary emissions
 * - Throttles high-frequency state (robotStateFull) to avoid IPC flooding
 */
export const windowSyncMiddleware =
  <T>(config: StateCreator<T, [], [], T>): StateCreator<T, [], [], T> =>
  (set, get, api: StoreApi<T>) => {
    let isMainWindow = false;
    let emitStoreUpdate: EmitStoreUpdate | null = null;
    let initPromise: Promise<void> | null = null;

    // Throttle state for robotStateFull
    let pendingRobotState: unknown = null;
    let robotStateThrottleTimer: ReturnType<typeof setTimeout> | null = null;

    const relevantKeys = [
      'darkMode',
      'isActive',
      'robotStatus',
      'busyReason',
      'isCommandRunning',
      'isAppRunning',
      'isInstalling',
      'robotStateFull',
      'activeMoves',
      // Log streams consumed by the standalone LogViewerWindow.
      // `logs` is the local daemon ring buffer (Rust-polled) and is replaced
      // wholesale once per poll; the slice's reference-equality guard in
      // `setLogs` ensures we only re-emit when the tail actually changes.
      'logs',
      'frontendLogs',
      'appLogs',
    ];

    const initWindowSync = async (): Promise<void> => {
      if (initPromise) return initPromise;

      initPromise = (async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const { emit, listen } = await import('@tauri-apps/api/event');
          const currentWindow = await getCurrentWindow();
          isMainWindow = currentWindow.label === 'main';

          if (isMainWindow) {
            emitStoreUpdate = async (updates: Updates) => {
              try {
                if (Object.keys(updates).length > 0) {
                  await emit('store-update', updates);
                }
              } catch {
                // Silently fail if not in Tauri or event system not available
              }
            };

            // Snapshot handshake: secondary windows emit `store-snapshot-request`
            // on mount so they can hydrate without waiting for the next change.
            // We reply with a full snapshot of the relevant keys via the usual
            // `store-update` channel.
            await listen('store-snapshot-request', () => {
              const state = get() as unknown as Record<string, unknown>;
              const snapshot: Updates = {};
              for (const key of relevantKeys) {
                if (key in state) snapshot[key] = state[key];
              }
              emitStoreUpdate?.(snapshot);
            });
          }
        } catch {
          // Not in Tauri environment, skip sync
        }
      })();

      return initPromise;
    };

    initWindowSync();

    /**
     * Flush any pending throttled robot state to secondary windows.
     */
    const flushRobotState = (): void => {
      robotStateThrottleTimer = null;
      if (pendingRobotState && emitStoreUpdate) {
        emitStoreUpdate({ robotStateFull: pendingRobotState });
        pendingRobotState = null;
      }
    };

    /**
     * Process a Zustand state change and emit relevant diffs to secondary windows.
     * robotStateFull is throttled to avoid serializing a large object 20x/s.
     */
    const processStateUpdate = (prevState: T): void => {
      const newState = get();
      const changedUpdates = extractChangedUpdates(
        prevState as unknown as Record<string, unknown>,
        newState as unknown as Record<string, unknown>,
        relevantKeys as ReadonlyArray<string>
      ) as Updates;

      if (Object.keys(changedUpdates).length === 0) return;

      // Separate robotStateFull from the rest - it needs throttling
      if ('robotStateFull' in changedUpdates) {
        pendingRobotState = changedUpdates.robotStateFull;
        delete changedUpdates.robotStateFull;

        if (!robotStateThrottleTimer) {
          robotStateThrottleTimer = setTimeout(flushRobotState, ROBOT_STATE_THROTTLE_MS);
        }
      }

      // Emit non-throttled changes immediately
      if (Object.keys(changedUpdates).length > 0 && emitStoreUpdate) {
        emitStoreUpdate(changedUpdates);
      }
    };

    type SetParam = Parameters<StoreApi<T>['setState']>[0];
    type ReplaceParam = Parameters<StoreApi<T>['setState']>[1];

    const wrappedSet = (updates: SetParam, replace?: ReplaceParam): void => {
      const prevState = get();
      // Zustand's overloaded setState requires us to forward as-is; the cast is safe
      // because we are delegating to the underlying set with the same arguments.
      (set as (u: SetParam, r?: ReplaceParam) => void)(updates, replace);

      if (emitStoreUpdate) {
        processStateUpdate(prevState);
      } else if (initPromise) {
        initPromise
          .then(() => {
            if (emitStoreUpdate) {
              processStateUpdate(prevState);
            }
          })
          .catch(() => {
            // Not in Tauri environment or init failed — silently skip sync
          });
      }
    };

    return config(wrappedSet as typeof set, get, api);
  };
