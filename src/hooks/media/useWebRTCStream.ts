/**
 * Hook for managing a WebRTC stream connection to a Reachy WiFi camera.
 * Uses the GStreamer WebRTC API for low-latency video streaming.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Import the GStreamer WebRTC API (loaded as a side-effect, exposes
// `window.GstWebRTCAPI`).
import '../../lib/gstwebrtc-api';
// Side-effect import: registers the `Window.GstWebRTCAPI` global type.
import type {} from '../../types/gstwebrtc';
import type {
  GstWebRTCProducer,
  GstWebRTCConsumerSession,
  GstWebRTCProducersListener,
  GstWebRTCConnectionListener,
  GstWebRTCAPIInstance,
} from '../../types/gstwebrtc';

// ============================================================================

type TimeoutId = ReturnType<typeof setTimeout>;

const SIGNALING_PORT = 8443;
const RECONNECT_DELAY = 5000;

/**
 * Connection states for the WebRTC stream.
 */
export const StreamState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

export type StreamStateValue = (typeof StreamState)[keyof typeof StreamState];

export interface UseWebRTCStreamResult {
  state: StreamStateValue;
  stream: MediaStream | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
}

/**
 * Hook to manage a WebRTC video stream from Reachy over WiFi.
 *
 * @param robotHost The robot's hostname or IP (e.g. `reachy-mini.local` or `192.168.1.100`).
 * @param autoConnect Whether to automatically connect when the hook mounts.
 */
export default function useWebRTCStream(
  robotHost: string | null | undefined,
  autoConnect: boolean = false
): UseWebRTCStreamResult {
  const [state, setState] = useState<StreamStateValue>(StreamState.DISCONNECTED);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiRef = useRef<GstWebRTCAPIInstance | null>(null);
  const sessionRef = useRef<GstWebRTCConsumerSession | null>(null);
  const reconnectTimeoutRef = useRef<TimeoutId | null>(null);
  const mountedRef = useRef<boolean>(true);
  const producersListenerRef = useRef<GstWebRTCProducersListener | null>(null);
  const connectionListenerRef = useRef<GstWebRTCConnectionListener | null>(null);

  /**
   * Clean up session and API.
   */
  const cleanup = useCallback((): void => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // Ignore close errors.
      }
      sessionRef.current = null;
    }

    if (apiRef.current) {
      try {
        if (producersListenerRef.current) {
          apiRef.current.unregisterProducersListener(producersListenerRef.current);
          producersListenerRef.current = null;
        }
        if (connectionListenerRef.current) {
          apiRef.current.unregisterConnectionListener(connectionListenerRef.current);
          connectionListenerRef.current = null;
        }
        // Note: GstWebRTCAPI has no close method; letting it go out of scope
        // is enough to tear down the underlying signaling channel.
      } catch {
        // Ignore unregister errors.
      }
      apiRef.current = null;
    }

    setStream(null);
  }, []);

  const connect = useCallback((): void => {
    if (!robotHost || !mountedRef.current) {
      setError('No robot host specified');
      setState(StreamState.ERROR);
      return;
    }

    // Clean up any existing connection first.
    cleanup();

    setState(StreamState.CONNECTING);
    setError(null);

    const signalingUrl = `ws://${robotHost}:${SIGNALING_PORT}`;

    try {
      const GstWebRTCAPI = window.GstWebRTCAPI;

      if (!GstWebRTCAPI) {
        throw new Error('GstWebRTCAPI not loaded');
      }

      // Create new API instance with auto-reconnect disabled (we handle it ourselves).
      // STUN servers help with NAT traversal on local networks.
      const api = new GstWebRTCAPI({
        signalingServerUrl: signalingUrl,
        reconnectionTimeout: 0,
        meta: { name: 'reachy-desktop-app' },
        webrtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      apiRef.current = api;

      connectionListenerRef.current = {
        connected: (_clientId: string) => {
          if (!mountedRef.current) return;
          // No-op: we wait for a producer before flipping to CONNECTED.
        },
        disconnected: () => {
          if (!mountedRef.current) return;

          setState(StreamState.DISCONNECTED);
          setStream(null);

          // Schedule reconnect.
          if (mountedRef.current && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (mountedRef.current) {
                connect();
              }
            }, RECONNECT_DELAY);
          }
        },
      };

      api.registerConnectionListener(connectionListenerRef.current);

      // Producers listener - connect to the first available producer.
      producersListenerRef.current = {
        producerAdded: (producer: GstWebRTCProducer) => {
          if (!mountedRef.current) return;

          // If we already have a session, don't create another one.
          if (sessionRef.current) {
            return;
          }

          const session = api.createConsumerSession(producer.id);
          if (!session) {
            return;
          }

          sessionRef.current = session;

          session.addEventListener('error', (e: Event) => {
            if (!mountedRef.current) return;
            const maybeError = e as Event & { message?: string };
            setError(maybeError.message ?? 'Stream error');
            setState(StreamState.ERROR);
          });

          session.addEventListener('closed', () => {
            if (!mountedRef.current) return;

            sessionRef.current = null;
            setStream(null);

            // Only flag as disconnected if we were previously connected.
            setState(prev => (prev === StreamState.CONNECTED ? StreamState.DISCONNECTED : prev));
          });

          session.addEventListener('streamsChanged', () => {
            if (!mountedRef.current) return;
            const streams = session.streams;

            if (streams && streams.length > 0) {
              setStream(streams[0]);
              setState(StreamState.CONNECTED);
            }
          });

          session.connect();
        },

        producerRemoved: (_producer: GstWebRTCProducer) => {
          if (!mountedRef.current) return;

          // If our session was with this producer, close it.
          if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
            setStream(null);
            setState(StreamState.DISCONNECTED);
          }
        },
      };

      api.registerProducersListener(producersListenerRef.current);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'WebRTC connect failed';
      setError(message);
      setState(StreamState.ERROR);
    }
  }, [robotHost, cleanup]);

  const disconnect = useCallback((): void => {
    cleanup();
    setState(StreamState.DISCONNECTED);
  }, [cleanup]);

  // Auto-connect on mount if enabled.
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect && robotHost) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
    // connect / cleanup are intentionally excluded - including them would
    // trigger a full teardown on any robotHost change handled elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, robotHost]);

  return {
    state,
    stream,
    error,
    connect,
    disconnect,
    isConnected: state === StreamState.CONNECTED,
    isConnecting: state === StreamState.CONNECTING,
  };
}
