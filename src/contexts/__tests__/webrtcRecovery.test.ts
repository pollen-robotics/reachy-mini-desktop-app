import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  closeStalledSession,
  scheduleReconnect,
  RECONNECT_DELAY,
  INITIAL_RECONNECT_DELAY,
  type ClosableSession,
  type MutableRef,
} from '../webrtcRecovery';

// These helpers back every failure path in `WebRTCStreamContext`: the signaling
// socket dropping, the consumer session erroring, and the stream never arriving
// before the connect deadline.
//
// The deadline path is the one that regressed: it used to only set `ERROR`,
// leaving the stalled session on `sessionRef` (which makes `producerAdded`
// bail out early forever) and scheduling no retry. The camera then stayed dead
// until the app was restarted, even though the robot was healthy — the daemon
// logs this side of it as `ice_negotiation_timeout` from its own watchdog.

function makeSessionRef(session: ClosableSession | null): MutableRef<ClosableSession | null> {
  return { current: session };
}

function makeTimerRef(): MutableRef<ReturnType<typeof setTimeout> | null> {
  return { current: null };
}

describe('closeStalledSession', () => {
  it('closes the session and clears the ref', () => {
    const close = vi.fn();
    const ref = makeSessionRef({ close });

    closeStalledSession(ref);

    expect(close).toHaveBeenCalledTimes(1);
    // `producerAdded` short-circuits while this is non-null, so clearing it is
    // what lets a later producer event open a fresh session.
    expect(ref.current).toBeNull();
  });

  it('still clears the ref when close() throws', () => {
    const ref = makeSessionRef({
      close: () => {
        throw new Error('already torn down');
      },
    });

    expect(() => closeStalledSession(ref)).not.toThrow();
    expect(ref.current).toBeNull();
  });

  it('is a no-op when there is no session', () => {
    const ref = makeSessionRef(null);

    expect(() => closeStalledSession(ref)).not.toThrow();
    expect(ref.current).toBeNull();
  });
});

describe('scheduleReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('schedules a retry and reports that it did', () => {
    const timerRef = makeTimerRef();
    const reconnect = vi.fn();

    const scheduled = scheduleReconnect(timerRef, {
      hasConnectedBefore: false,
      isMounted: () => true,
      reconnect,
    });

    expect(scheduled).toBe(true);
    expect(timerRef.current).not.toBeNull();

    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY);

    expect(reconnect).toHaveBeenCalledTimes(1);
    // Cleared before firing so the next failure can arm a fresh timer.
    expect(timerRef.current).toBeNull();
  });

  it('waits longer once a stream has been seen before', () => {
    const timerRef = makeTimerRef();
    const reconnect = vi.fn();

    scheduleReconnect(timerRef, {
      hasConnectedBefore: true,
      isMounted: () => true,
      reconnect,
    });

    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY);
    expect(reconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(RECONNECT_DELAY - INITIAL_RECONNECT_DELAY);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second timer when one is pending', () => {
    const timerRef = makeTimerRef();
    const reconnect = vi.fn();

    expect(
      scheduleReconnect(timerRef, {
        hasConnectedBefore: false,
        isMounted: () => true,
        reconnect,
      })
    ).toBe(true);

    const pending = timerRef.current;

    expect(
      scheduleReconnect(timerRef, {
        hasConnectedBefore: false,
        isMounted: () => true,
        reconnect,
      })
    ).toBe(false);

    expect(timerRef.current).toBe(pending);

    vi.advanceTimersByTime(RECONNECT_DELAY * 2);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('does not schedule anything once unmounted', () => {
    const timerRef = makeTimerRef();
    const reconnect = vi.fn();

    const scheduled = scheduleReconnect(timerRef, {
      hasConnectedBefore: false,
      isMounted: () => false,
      reconnect,
    });

    expect(scheduled).toBe(false);
    expect(timerRef.current).toBeNull();

    vi.advanceTimersByTime(RECONNECT_DELAY * 2);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('skips the reconnect if the provider unmounts before the timer fires', () => {
    const timerRef = makeTimerRef();
    const reconnect = vi.fn();
    let mounted = true;

    scheduleReconnect(timerRef, {
      hasConnectedBefore: false,
      isMounted: () => mounted,
      reconnect,
    });

    mounted = false;
    vi.advanceTimersByTime(RECONNECT_DELAY * 2);

    expect(reconnect).not.toHaveBeenCalled();
  });
});
