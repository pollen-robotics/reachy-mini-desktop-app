/**
 * Shared recovery helpers for the WebRTC stream provider.
 *
 * Every way the camera stream can fail — the signaling socket dropping, the
 * consumer session raising an error, or the stream never arriving before the
 * connect deadline — needs the same two things: drop the dead consumer session
 * so the next `producerAdded` is not short-circuited by a stale ref, and get a
 * retry on the books. Keeping that in one place is what stops a new failure
 * path from silently becoming a dead end.
 */

export interface ClosableSession {
  close: () => void;
}

/** Minimal shape of a React ref, so these helpers stay testable without React. */
export interface MutableRef<T> {
  current: T;
}

/** Delay before retrying once a stream has been running at least once. */
export const RECONNECT_DELAY = 2000;

/** Shorter delay for the first attempts, before any stream has arrived. */
export const INITIAL_RECONNECT_DELAY = 500;

/**
 * Close and forget a consumer session.
 *
 * The provider's `producerAdded` handler bails out early while `sessionRef` is
 * non-null, so a session that is left behind after a failure blocks every later
 * attempt on that producer. `close()` is best-effort: the session may already
 * be torn down on the daemon side.
 */
export function closeStalledSession(sessionRef: MutableRef<ClosableSession | null>): void {
  if (!sessionRef.current) {
    return;
  }

  try {
    sessionRef.current.close();
  } catch {
    // Ignore close errors - the session may already be gone.
  }

  sessionRef.current = null;
}

export interface ScheduleReconnectOptions {
  /** `true` once a stream has arrived at least once, which relaxes the delay. */
  hasConnectedBefore: boolean;
  /** Checked both now and again when the timer fires. */
  isMounted: () => boolean;
  /** Called when the delay elapses. */
  reconnect: () => void;
}

/**
 * Arm a reconnect timer unless one is already pending.
 *
 * @returns `true` when a retry was scheduled (the caller should show
 *   "connecting"), `false` when one was already pending or the provider is
 *   unmounted (the caller keeps its own terminal state).
 */
export function scheduleReconnect(
  reconnectTimerRef: MutableRef<ReturnType<typeof setTimeout> | null>,
  { hasConnectedBefore, isMounted, reconnect }: ScheduleReconnectOptions
): boolean {
  if (!isMounted() || reconnectTimerRef.current) {
    return false;
  }

  reconnectTimerRef.current = setTimeout(
    () => {
      reconnectTimerRef.current = null;
      if (isMounted()) {
        reconnect();
      }
    },
    hasConnectedBefore ? RECONNECT_DELAY : INITIAL_RECONNECT_DELAY
  );

  return true;
}
