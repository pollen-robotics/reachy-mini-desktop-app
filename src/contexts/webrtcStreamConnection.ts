/**
 * WebRTC camera stream connection, without React.
 *
 * Owns one GstWebRTCAPI at a time and the consumer session on it, and turns
 * every way the stream can fail into the same recovery path: tear the whole
 * attempt down, then retry with a growing delay, and give up with an ERROR
 * once the retry budget is spent. The provider in `WebRTCStreamContext` only
 * mirrors the callbacks into React state.
 *
 * Failure paths, all funneled through `fail()`:
 * - the signaling socket drops;
 * - the consumer session raises an error, or closes on its own;
 * - the peer connection reaches `failed`;
 * - no media is flowing when the connect deadline fires.
 *
 * Each attempt gets an id. Every listener checks it, so events from a torn
 * down attempt (an old API re-announcing a producer, the `closed` event our own
 * `close()` dispatches, an error racing the deadline) are ignored instead of
 * starting a second recovery.
 */

import type {
  GstWebRTCAPIInstance,
  GstWebRTCConnectionListener,
  GstWebRTCConsumerSession,
  GstWebRTCProducer,
  GstWebRTCProducersListener,
} from '../types/gstwebrtc';

/** Connection states for the WebRTC stream. */
export const StreamState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

export type StreamStateValue = (typeof StreamState)[keyof typeof StreamState];

/** Time allowed from opening signaling to media actually flowing. */
export const STREAM_CONNECT_TIMEOUT = 10000;

/**
 * Delay before each automatic retry. Once these are used up the connection
 * stops in ERROR so the user sees why, and can click to retry. The budget is
 * refilled whenever media flows again.
 */
export const RETRY_DELAYS: readonly number[] = [1000, 2000, 4000];

export interface WebRTCStreamConnectionOptions {
  signalingUrl: string;
  /** Creates a fresh API (and signaling socket) for each attempt. */
  createApi: () => GstWebRTCAPIInstance;
  onStateChange: (state: StreamStateValue) => void;
  /** Non-null only while media is flowing. */
  onStreamChange: (stream: MediaStream | null) => void;
  /** Set when the connection gives up, cleared when a new one starts. */
  onError: (message: string | null) => void;
}

function describeSessionError(event: Event): string {
  const errorEvent = event as ErrorEvent;
  const details =
    errorEvent.error instanceof Error
      ? `${errorEvent.error.name}: ${errorEvent.error.message}`
      : errorEvent.error
        ? String(errorEvent.error)
        : null;
  return [errorEvent.message || 'Stream error', details].filter(Boolean).join(' - ');
}

// `ontrack` (and so `streamsChanged`) fires when the remote offer is applied,
// before the answer or any ICE, so a stream alone does not mean media flows.
function isPeerConnected(peerConnection: RTCPeerConnection): boolean {
  return (
    peerConnection.connectionState === 'connected' ||
    peerConnection.iceConnectionState === 'connected' ||
    peerConnection.iceConnectionState === 'completed'
  );
}

function isPeerFailed(peerConnection: RTCPeerConnection): boolean {
  return (
    peerConnection.connectionState === 'failed' || peerConnection.iceConnectionState === 'failed'
  );
}

function describePeer(peerConnection: RTCPeerConnection | null | undefined): object | null {
  return peerConnection
    ? {
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        iceGatheringState: peerConnection.iceGatheringState,
        signalingState: peerConnection.signalingState,
      }
    : null;
}

export class WebRTCStreamConnection {
  private readonly options: WebRTCStreamConnectionOptions;

  private api: GstWebRTCAPIInstance | null = null;
  private producersListener: GstWebRTCProducersListener | null = null;
  private connectionListener: GstWebRTCConnectionListener | null = null;
  private session: GstWebRTCConsumerSession | null = null;
  private sessionProducerId: string | null = null;
  /** Set once the live session has media flowing, so CONNECTED is reported once. */
  private isFlowing = false;

  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;

  /** Id of the live attempt. Bumped to invalidate every listener of the previous one. */
  private attemptId = 0;
  private stopped = true;

  constructor(options: WebRTCStreamConnectionOptions) {
    this.options = options;
  }

  /** Start connecting with a full retry budget (initial connect, or the user clicking retry). */
  connect(): void {
    this.retryCount = 0;
    this.stopped = false;
    this.open();
  }

  /** Stop for good: no retry, state DISCONNECTED. */
  disconnect(): void {
    this.dispose();
    this.options.onStreamChange(null);
    this.options.onStateChange(StreamState.DISCONNECTED);
  }

  /** Stop for good without reporting anything (unmount). */
  dispose(): void {
    this.stopped = true;
    this.attemptId++;
    this.clearRetryTimer();
    this.teardown();
  }

  private open(): void {
    this.clearRetryTimer();
    this.teardown();

    const attemptId = ++this.attemptId;
    const { signalingUrl } = this.options;

    this.options.onError(null);
    this.options.onStreamChange(null);
    this.options.onStateChange(StreamState.CONNECTING);
    this.armConnectDeadline(attemptId);

    console.info('[WebRTC] Connecting to signaling server:', signalingUrl);

    let api: GstWebRTCAPIInstance;
    try {
      api = this.options.createApi();
    } catch (e) {
      this.fail(attemptId, e instanceof Error ? e.message : String(e));
      return;
    }
    this.api = api;

    this.connectionListener = {
      connected: () => {
        if (!this.isCurrent(attemptId)) return;
        console.info('[WebRTC] Signaling connected:', signalingUrl);
      },
      disconnected: () => {
        this.fail(attemptId, `Signaling connection to ${signalingUrl} lost`);
      },
    };
    api.registerConnectionListener(this.connectionListener);

    this.producersListener = {
      producerAdded: (producer: GstWebRTCProducer) => {
        if (!this.isCurrent(attemptId)) return;
        console.info('[WebRTC] Producer added:', producer.id, producer.meta);

        if (this.session) {
          console.info('[WebRTC] Ignoring producer; session already exists');
          return;
        }
        this.openSession(attemptId, api, producer);
      },
      producerRemoved: (producer: GstWebRTCProducer) => {
        if (!this.isCurrent(attemptId) || producer.id !== this.sessionProducerId) return;
        console.warn('[WebRTC] Producer removed:', producer.id);

        // Wait for the producer to come back on the same signaling connection,
        // within a fresh deadline.
        this.closeSession();
        this.options.onStreamChange(null);
        this.options.onStateChange(StreamState.CONNECTING);
        this.armConnectDeadline(attemptId);
      },
    };
    api.registerProducersListener(this.producersListener);
  }

  private openSession(attemptId: number, api: GstWebRTCAPIInstance, producer: GstWebRTCProducer) {
    const session = api.createConsumerSession(producer.id);
    if (!session) {
      this.fail(attemptId, 'Failed to create consumer session');
      return;
    }

    this.session = session;
    this.sessionProducerId = producer.id;
    const isLive = (): boolean => this.isCurrent(attemptId) && this.session === session;

    session.addEventListener('error', (event: Event) => {
      if (!isLive()) return;
      this.fail(attemptId, describeSessionError(event), event);
    });

    // Our own closes drop the session ref first, so a `closed` on the live
    // session means the robot or the library ended it.
    session.addEventListener('closed', () => {
      if (!isLive()) return;
      console.warn('[WebRTC] Session closed', {
        sessionId: session.sessionId,
        state: session.state,
        peerConnection: describePeer(session.rtcPeerConnection),
      });
      this.fail(attemptId, 'Stream session closed by the robot');
    });

    session.addEventListener('rtcPeerConnectionChanged', () => {
      if (!isLive()) return;
      const peerConnection = session.rtcPeerConnection;
      if (!peerConnection) {
        console.info('[WebRTC] Peer connection cleared');
        return;
      }

      console.info('[WebRTC] Peer connection created:', describePeer(peerConnection));
      const onPeerStateChange = (event: Event): void => {
        if (!isLive() || session.rtcPeerConnection !== peerConnection) return;
        console.info(`[WebRTC] Peer ${event.type}:`, describePeer(peerConnection));

        if (isPeerFailed(peerConnection)) {
          this.fail(attemptId, 'WebRTC peer connection failed (ICE could not connect)');
          return;
        }
        this.markConnectedIfFlowing(attemptId, session);
      };
      peerConnection.addEventListener('connectionstatechange', onPeerStateChange);
      peerConnection.addEventListener('iceconnectionstatechange', onPeerStateChange);
      peerConnection.addEventListener('icegatheringstatechange', onPeerStateChange);
      peerConnection.addEventListener('signalingstatechange', onPeerStateChange);
    });

    session.addEventListener('streamsChanged', () => {
      if (!isLive()) return;
      console.info('[WebRTC] Streams changed:', session.streams?.length ?? 0);
      this.markConnectedIfFlowing(attemptId, session);
    });

    console.info('[WebRTC] Connecting consumer session');
    session.connect();
  }

  /** CONNECTED needs both a remote stream and a connected peer. */
  private markConnectedIfFlowing(attemptId: number, session: GstWebRTCConsumerSession): void {
    const mediaStream = session.streams?.[0];
    const peerConnection = session.rtcPeerConnection;
    if (this.isFlowing || !mediaStream || !peerConnection || !isPeerConnected(peerConnection)) {
      return;
    }
    this.isFlowing = true;

    this.clearConnectTimer();
    this.retryCount = 0;

    console.info('[WebRTC] Stream connected:', {
      audioTracks: mediaStream.getAudioTracks().length,
      videoTracks: mediaStream.getVideoTracks().length,
    });
    this.options.onStreamChange(mediaStream);
    this.options.onStateChange(StreamState.CONNECTED);
  }

  /** Single exit for every failure of an attempt: tear it down, then retry or give up. */
  private fail(attemptId: number, message: string, cause?: unknown): void {
    if (!this.isCurrent(attemptId)) return;
    // Invalidate the attempt first, so the events our teardown dispatches are ignored.
    this.attemptId++;

    console.error('[WebRTC]', message, ...(cause === undefined ? [] : [cause]));
    this.teardown();
    this.options.onStreamChange(null);

    const delay = RETRY_DELAYS[this.retryCount];
    if (delay === undefined) {
      console.error('[WebRTC] Giving up after', RETRY_DELAYS.length, 'retries');
      this.stopped = true;
      this.options.onError(message);
      this.options.onStateChange(StreamState.ERROR);
      return;
    }

    this.retryCount++;
    console.info(`[WebRTC] Retry ${this.retryCount}/${RETRY_DELAYS.length} in ${delay}ms`);
    this.options.onStateChange(StreamState.CONNECTING);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private armConnectDeadline(attemptId: number): void {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      this.fail(attemptId, `Timed out waiting for WebRTC stream from ${this.options.signalingUrl}`);
    }, STREAM_CONNECT_TIMEOUT);
  }

  private isCurrent(attemptId: number): boolean {
    return !this.stopped && attemptId === this.attemptId;
  }

  /** Close the session and the API of the current attempt. Leaves the retry timer alone. */
  private teardown(): void {
    this.clearConnectTimer();
    this.closeSession();

    const api = this.api;
    if (!api) return;
    this.api = null;

    try {
      if (this.producersListener) api.unregisterProducersListener(this.producersListener);
      if (this.connectionListener) api.unregisterConnectionListener(this.connectionListener);
      // GstWebRTCAPI has no public `close()`; close the underlying signaling
      // channel directly to prevent orphaned WebSocket connections.
      api._channel?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.producersListener = null;
    this.connectionListener = null;
  }

  private closeSession(): void {
    const session = this.session;
    this.session = null;
    this.sessionProducerId = null;
    this.isFlowing = false;
    if (!session) return;

    try {
      session.close();
    } catch {
      // Best effort: the session may already be gone on the daemon side.
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
