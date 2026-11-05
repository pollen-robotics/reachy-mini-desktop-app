import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RETRY_DELAYS,
  STREAM_CONNECT_TIMEOUT,
  StreamState,
  WebRTCStreamConnection,
  type StreamStateValue,
} from '../webrtcStreamConnection';
import type {
  GstWebRTCAPIInstance,
  GstWebRTCConnectionListener,
  GstWebRTCProducersListener,
} from '../../types/gstwebrtc';

// Fakes mirror the vendored gstwebrtc-api where it matters: `close()` dispatches
// `closed` synchronously, session errors are followed by a `close()`, and
// `streamsChanged` fires before ICE has connected.

class FakePeerConnection extends EventTarget {
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  signalingState: RTCSignalingState = 'stable';

  setState(state: 'connected' | 'failed'): void {
    this.connectionState = state;
    this.iceConnectionState = state;
    this.dispatchEvent(new Event('iceconnectionstatechange'));
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

const fakeStream = {
  getAudioTracks: () => [],
  getVideoTracks: () => [{}],
} as unknown as MediaStream;

class FakeSession extends EventTarget {
  streams: MediaStream[] = [];
  rtcPeerConnection: FakePeerConnection | null = null;
  isClosed = false;

  connect = vi.fn(() => {
    this.rtcPeerConnection = new FakePeerConnection();
    this.dispatchEvent(new Event('rtcPeerConnectionChanged'));
  });

  close = vi.fn(() => {
    if (this.isClosed) return;
    this.isClosed = true;
    this.dispatchEvent(new Event('closed'));
  });

  /** Remote offer applied: `ontrack` fires, ICE has not run yet. */
  receiveTrack(): void {
    this.streams = [fakeStream];
    this.dispatchEvent(new Event('streamsChanged'));
  }

  /** Library-side error, which the library follows with `close()`. */
  raiseError(message: string): void {
    this.dispatchEvent(Object.assign(new Event('error'), { message, error: null }));
    this.close();
  }

  get peer(): FakePeerConnection {
    if (!this.rtcPeerConnection) throw new Error('session not connected');
    return this.rtcPeerConnection;
  }
}

class FakeApi {
  readonly sessions: FakeSession[] = [];
  private producersListeners = new Set<GstWebRTCProducersListener>();
  private connectionListeners = new Set<GstWebRTCConnectionListener>();
  /** Every listener ever registered, to replay events that were already queued. */
  private everRegistered: GstWebRTCProducersListener[] = [];

  _channel = { close: vi.fn() };

  createConsumerSession = vi.fn((_producerId: string) => {
    const session = new FakeSession();
    this.sessions.push(session);
    return session;
  });

  registerProducersListener(listener: GstWebRTCProducersListener): void {
    this.producersListeners.add(listener);
    this.everRegistered.push(listener);
  }
  unregisterProducersListener(listener: GstWebRTCProducersListener): void {
    this.producersListeners.delete(listener);
  }
  registerConnectionListener(listener: GstWebRTCConnectionListener): void {
    this.connectionListeners.add(listener);
  }
  unregisterConnectionListener(listener: GstWebRTCConnectionListener): void {
    this.connectionListeners.delete(listener);
  }

  announce(id = 'camera'): void {
    for (const listener of this.producersListeners) listener.producerAdded({ id });
  }
  removeProducer(id = 'camera'): void {
    for (const listener of this.producersListeners) listener.producerRemoved({ id });
  }
  /** Deliver `producerAdded` even to listeners that were unregistered since. */
  announceToStaleListeners(id = 'camera'): void {
    for (const listener of this.everRegistered) listener.producerAdded({ id });
  }
  dropSignaling(): void {
    for (const listener of this.connectionListeners) listener.disconnected();
  }

  get session(): FakeSession {
    const session = this.sessions.at(-1);
    if (!session) throw new Error('no session');
    return session;
  }
}

function setup() {
  const apis: FakeApi[] = [];
  const states: StreamStateValue[] = [];
  let stream: MediaStream | null = null;
  let error: string | null = null;

  const connection = new WebRTCStreamConnection({
    signalingUrl: 'ws://robot:8443',
    createApi: () => {
      const api = new FakeApi();
      apis.push(api);
      return api as unknown as GstWebRTCAPIInstance;
    },
    onStateChange: s => states.push(s),
    onStreamChange: s => {
      stream = s;
    },
    onError: e => {
      error = e;
    },
  });

  return {
    connection,
    apis,
    api: () => apis[apis.length - 1],
    state: () => states[states.length - 1],
    stream: () => stream,
    error: () => error,
  };
}

/** Producer announced, track received, ICE connected. */
function bringUp(api: FakeApi): void {
  api.announce();
  api.session.receiveTrack();
  api.session.peer.setState('connected');
}

/** Let the stream deadline of the current attempt expire, then the retry delay. */
function timeOutAndRetry(attempt: number): void {
  vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
  vi.advanceTimersByTime(RETRY_DELAYS[attempt]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WebRTCStreamConnection', () => {
  it('reports CONNECTED once media flows, and stays connected', () => {
    const t = setup();
    t.connection.connect();
    expect(t.state()).toBe(StreamState.CONNECTING);

    bringUp(t.api());

    expect(t.state()).toBe(StreamState.CONNECTED);
    expect(t.stream()).toBe(fakeStream);

    vi.advanceTimersByTime(5 * STREAM_CONNECT_TIMEOUT);
    expect(t.state()).toBe(StreamState.CONNECTED);
    expect(t.apis).toHaveLength(1);
  });

  describe('stream never arrives (review item 1)', () => {
    it('retries with growing delays, then stops in ERROR with the reason', () => {
      const t = setup();
      t.connection.connect();
      t.api().announce();

      for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
        expect(t.state()).toBe(StreamState.CONNECTING);
        // No retry before its delay is up.
        vi.advanceTimersByTime(RETRY_DELAYS[attempt] - 1);
        expect(t.apis).toHaveLength(attempt + 1);
        vi.advanceTimersByTime(1);
        expect(t.apis).toHaveLength(attempt + 2);
        t.api().announce();
      }

      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
      expect(t.state()).toBe(StreamState.ERROR);
      expect(t.error()).toContain('Timed out waiting for WebRTC stream from ws://robot:8443');

      vi.advanceTimersByTime(10 * STREAM_CONNECT_TIMEOUT);
      expect(t.apis).toHaveLength(RETRY_DELAYS.length + 1);
    });

    it('closes the stalled session and its API before retrying', () => {
      const t = setup();
      t.connection.connect();
      const first = t.api();
      first.announce();

      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);

      expect(first.session.close).toHaveBeenCalled();
      expect(first._channel.close).toHaveBeenCalled();
    });

    it('starts over with a full retry budget when the user retries', () => {
      const t = setup();
      t.connection.connect();
      for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) timeOutAndRetry(attempt);
      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
      expect(t.state()).toBe(StreamState.ERROR);

      t.connection.connect();
      expect(t.state()).toBe(StreamState.CONNECTING);
      expect(t.error()).toBeNull();

      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
      expect(t.state()).toBe(StreamState.CONNECTING);
    });

    it('refills the retry budget once media has flowed', () => {
      const t = setup();
      t.connection.connect();
      for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) timeOutAndRetry(attempt);

      bringUp(t.api());
      expect(t.state()).toBe(StreamState.CONNECTED);

      t.api().dropSignaling();
      expect(t.state()).toBe(StreamState.CONNECTING);
      vi.advanceTimersByTime(RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(RETRY_DELAYS.length + 2);
    });
  });

  describe('torn down attempts stay quiet (review item 2)', () => {
    it('ignores a producer re-announced on the old API during the retry delay', () => {
      const t = setup();
      t.connection.connect();
      const first = t.api();

      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
      first.announceToStaleListeners();

      expect(first.createConsumerSession).not.toHaveBeenCalled();
      expect(t.state()).toBe(StreamState.CONNECTING);
    });

    it('ignores media arriving on a session that was already given up on', () => {
      const t = setup();
      t.connection.connect();
      const first = t.api();
      first.announce();
      const staleSession = first.session;

      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);
      staleSession.receiveTrack();
      staleSession.peer.setState('connected');

      expect(t.state()).toBe(StreamState.CONNECTING);
      expect(t.stream()).toBeNull();
    });
  });

  describe('one failure, one recovery (review item 3)', () => {
    it('does not report ERROR when the deadline fires after a session error', () => {
      const t = setup();
      t.connection.connect();
      t.api().announce();

      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT - 400);
      t.api().session.raiseError('boom');
      vi.advanceTimersByTime(400);

      expect(t.state()).toBe(StreamState.CONNECTING);
      expect(t.error()).toBeNull();

      vi.advanceTimersByTime(RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(2);
    });

    it('counts a session error and the close that follows it as one failure', () => {
      const t = setup();
      t.connection.connect();

      for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        t.api().announce();
        t.api().session.raiseError('boom');
        expect(t.state()).toBe(StreamState.CONNECTING);
        vi.advanceTimersByTime(RETRY_DELAYS[attempt]);
      }

      t.api().announce();
      t.api().session.raiseError('boom');
      expect(t.state()).toBe(StreamState.ERROR);
      expect(t.error()).toBe('boom');
    });
  });

  describe('no dead ends (review item 4)', () => {
    it('reconnects when the robot closes a running session', () => {
      const t = setup();
      t.connection.connect();
      bringUp(t.api());

      t.api().session.close();

      expect(t.state()).toBe(StreamState.CONNECTING);
      expect(t.stream()).toBeNull();
      vi.advanceTimersByTime(RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(2);
    });

    it('is not CONNECTED until ICE connects, even with a stream', () => {
      const t = setup();
      t.connection.connect();
      t.api().announce();
      t.api().session.receiveTrack();

      expect(t.state()).toBe(StreamState.CONNECTING);
      expect(t.stream()).toBeNull();

      // ICE never connects: the deadline is still armed.
      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT + RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(2);
    });

    it('reconnects when ICE fails after the offer', () => {
      const t = setup();
      t.connection.connect();
      t.api().announce();
      t.api().session.receiveTrack();

      t.api().session.peer.setState('failed');

      expect(t.state()).toBe(StreamState.CONNECTING);
      vi.advanceTimersByTime(RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(2);
    });

    it('reconnects when the peer connection fails while streaming', () => {
      const t = setup();
      t.connection.connect();
      bringUp(t.api());

      t.api().session.peer.setState('failed');

      expect(t.state()).toBe(StreamState.CONNECTING);
      vi.advanceTimersByTime(RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(2);
    });

    it('reconnects when signaling drops', () => {
      const t = setup();
      t.connection.connect();
      bringUp(t.api());

      t.api().dropSignaling();

      expect(t.state()).toBe(StreamState.CONNECTING);
      vi.advanceTimersByTime(RETRY_DELAYS[0]);
      expect(t.apis).toHaveLength(2);
    });
  });

  describe('producer removed', () => {
    it('waits for the producer to come back on the same connection', () => {
      const t = setup();
      t.connection.connect();
      bringUp(t.api());
      const session = t.api().session;

      t.api().removeProducer();

      expect(session.close).toHaveBeenCalled();
      expect(t.state()).toBe(StreamState.CONNECTING);
      expect(t.stream()).toBeNull();

      bringUp(t.api());
      expect(t.state()).toBe(StreamState.CONNECTED);
      expect(t.apis).toHaveLength(1);
    });

    it('retries if the producer does not come back in time', () => {
      const t = setup();
      t.connection.connect();
      bringUp(t.api());

      t.api().removeProducer();
      vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT + RETRY_DELAYS[0]);

      expect(t.apis).toHaveLength(2);
    });

    it('ignores the removal of another producer', () => {
      const t = setup();
      t.connection.connect();
      bringUp(t.api());

      t.api().removeProducer('other');

      expect(t.state()).toBe(StreamState.CONNECTED);
    });
  });

  it('stops everything on disconnect', () => {
    const t = setup();
    t.connection.connect();
    const api = t.api();
    bringUp(api);
    const session = api.session;

    t.connection.disconnect();

    expect(t.state()).toBe(StreamState.DISCONNECTED);
    expect(t.stream()).toBeNull();
    expect(session.close).toHaveBeenCalled();
    expect(api._channel.close).toHaveBeenCalled();

    vi.advanceTimersByTime(10 * STREAM_CONNECT_TIMEOUT);
    expect(t.apis).toHaveLength(1);
    expect(t.state()).toBe(StreamState.DISCONNECTED);
  });

  it('cancels a pending retry on disconnect', () => {
    const t = setup();
    t.connection.connect();
    vi.advanceTimersByTime(STREAM_CONNECT_TIMEOUT);

    t.connection.disconnect();
    vi.advanceTimersByTime(10 * STREAM_CONNECT_TIMEOUT);

    expect(t.apis).toHaveLength(1);
    expect(t.state()).toBe(StreamState.DISCONNECTED);
  });
});
