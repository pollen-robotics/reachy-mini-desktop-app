/**
 * WebRTCStreamContext
 *
 * Provides a shared WebRTC stream connection across multiple components. This
 * avoids multiple `CameraFeed` instances creating duplicate connections.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import useAppStore from '../store/useAppStore';
import { fetchWithTimeout, buildApiUrl } from '../config/daemon';
import { ROBOT_STATUS } from '../constants/robotStatus';
import { isLinux } from '../utils/platform';

// Import the GStreamer WebRTC API for its side effect (registers `window.GstWebRTCAPI`).
import '../lib/gstwebrtc-api';
// Side-effect import: registers the `Window.GstWebRTCAPI` global type.
import type {} from '../types/gstwebrtc';
import type {
  GstWebRTCAPIInstance,
  GstWebRTCConsumerSession,
  GstWebRTCConnectionListener,
  GstWebRTCProducersListener,
  GstWebRTCProducer,
} from '../types/gstwebrtc';

const SIGNALING_PORT = 8443;
const RECONNECT_DELAY = 2000;
const INITIAL_RECONNECT_DELAY = 500;

/** Connection states for the WebRTC stream. */
export const StreamState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

export type StreamStateValue = (typeof StreamState)[keyof typeof StreamState];

// ---------------------------------------------------------------------------
// Public context value
// ---------------------------------------------------------------------------

export interface WebRTCStreamContextValue {
  state: StreamStateValue;
  stream: MediaStream | null;
  audioTrack: MediaStreamTrack | null;
  error: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isWifiMode: boolean;
  isWebRTCAvailable: boolean | null;
  checkFailed: boolean;
  isRobotAwake: boolean;
  shouldConnect: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WebRTCStreamContext = createContext<WebRTCStreamContextValue | null>(null);

export interface WebRTCStreamProviderProps {
  children: ReactNode;
}

/** Provider component that manages the shared WebRTC connection. */
export function WebRTCStreamProvider({ children }: WebRTCStreamProviderProps): React.ReactElement {
  const { connectionMode, remoteHost, robotStatus } = useAppStore();
  const isWifiMode = connectionMode === 'wifi';
  const isRobotAwake = robotStatus === ROBOT_STATUS.READY || robotStatus === ROBOT_STATUS.BUSY;

  const [state, setState] = useState<StreamStateValue>(StreamState.DISCONNECTED);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  // WebRTC availability: `true` if the daemon exposes a WebRTC signaling server.
  // - WiFi + wireless_version: true (Wireless robot over WiFi)
  // - USB (Lite): true (Lite daemon now supports WebRTC locally)
  // - Simulation: true (mockup-sim daemon runs locally with WebRTC signaling)
  const [isWebRTCAvailable, setIsWebRTCAvailable] = useState<boolean | null>(null);
  const [checkFailed, setCheckFailed] = useState<boolean>(false);

  const apiRef = useRef<GstWebRTCAPIInstance | null>(null);
  const sessionRef = useRef<GstWebRTCConsumerSession | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const producersListenerRef = useRef<GstWebRTCProducersListener | null>(null);
  const connectionListenerRef = useRef<GstWebRTCConnectionListener | null>(null);
  const hasConnectedRef = useRef<boolean>(false);

  useEffect(() => {
    if (isLinux()) {
      // WebKit on Linux is not built with WebRTC support, so streaming is unavailable.
      setIsWebRTCAvailable(false);
      return;
    }

    if (
      connectionMode === 'usb' ||
      connectionMode === 'external' ||
      connectionMode === 'simulation'
    ) {
      setIsWebRTCAvailable(true);
      return;
    }

    if (!isWifiMode) {
      setIsWebRTCAvailable(false);
      return;
    }

    const checkWirelessVersion = async (): Promise<void> => {
      try {
        const response = await fetchWithTimeout(buildApiUrl('/api/daemon/status'), {}, 5000, {
          silent: true,
        });
        if (response.ok) {
          const data = (await response.json()) as { wireless_version?: boolean };
          setIsWebRTCAvailable(data.wireless_version === true);
        } else {
          setCheckFailed(true);
        }
      } catch {
        setCheckFailed(true);
      }
    };

    void checkWirelessVersion();
  }, [isWifiMode, connectionMode]);

  const shouldConnect = isWebRTCAvailable === true && isRobotAwake;

  /** Clean up session and API. */
  const cleanup = useCallback((): void => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // Ignore cleanup errors
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
        // GstWebRTCAPI has no public `close()`; close the underlying signaling
        // channel directly to prevent orphaned WebSocket connections.
        if (apiRef.current._channel) {
          apiRef.current._channel.close();
        }
      } catch {
        // Ignore cleanup errors
      }
      apiRef.current = null;
    }

    setStream(null);
    setAudioTrack(null);
  }, []);

  /** Connect to the WebRTC stream. */
  const connect = useCallback((): void => {
    if (!mountedRef.current) {
      return;
    }

    cleanup();
    setState(StreamState.CONNECTING);
    setError(null);

    // Use `remoteHost` for WiFi, localhost for USB/Lite (daemon runs locally).
    const host = remoteHost || 'localhost';
    const signalingUrl = `ws://${host}:${SIGNALING_PORT}`;

    try {
      const GstWebRTCAPI = window.GstWebRTCAPI;
      if (!GstWebRTCAPI) {
        throw new Error('GstWebRTCAPI not loaded');
      }

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
        connected: () => {
          if (!mountedRef.current) return;
          hasConnectedRef.current = true;
        },
        disconnected: () => {
          if (!mountedRef.current) return;
          setState(StreamState.DISCONNECTED);
          setStream(null);
          setAudioTrack(null);

          if (mountedRef.current && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(
              () => {
                reconnectTimeoutRef.current = null;
                if (mountedRef.current) {
                  connect();
                }
              },
              hasConnectedRef.current ? RECONNECT_DELAY : INITIAL_RECONNECT_DELAY
            );
            setState(StreamState.CONNECTING);
          } else {
            setState(StreamState.DISCONNECTED);
          }
        },
      };

      api.registerConnectionListener(connectionListenerRef.current);

      producersListenerRef.current = {
        producerAdded: (producer: GstWebRTCProducer) => {
          if (!mountedRef.current) return;

          if (sessionRef.current) {
            return;
          }

          const session = api.createConsumerSession(producer.id);
          if (!session) {
            console.error('[WebRTC] Failed to create consumer session');
            return;
          }

          sessionRef.current = session;

          session.addEventListener('error', (event: Event) => {
            if (!mountedRef.current) return;
            const message = (event as Event & { message?: string }).message || 'Stream error';
            console.error('[WebRTC] Session error:', message);
            setError(message);

            if (mountedRef.current && !reconnectTimeoutRef.current) {
              reconnectTimeoutRef.current = setTimeout(
                () => {
                  reconnectTimeoutRef.current = null;
                  if (mountedRef.current) {
                    connect();
                  }
                },
                hasConnectedRef.current ? RECONNECT_DELAY : INITIAL_RECONNECT_DELAY
              );
              setState(StreamState.CONNECTING);
            } else {
              setState(StreamState.ERROR);
            }
          });

          session.addEventListener('closed', () => {
            if (!mountedRef.current) return;
            sessionRef.current = null;
            setStream(null);
            setAudioTrack(null);
            setState(prev => (prev === StreamState.CONNECTED ? StreamState.DISCONNECTED : prev));
          });

          session.addEventListener('streamsChanged', () => {
            if (!mountedRef.current) return;
            const streams = session.streams;

            if (streams && streams.length > 0) {
              const mediaStream = streams[0];
              setStream(mediaStream);
              setState(StreamState.CONNECTED);

              const audioTracks = mediaStream.getAudioTracks();
              if (audioTracks.length > 0) {
                setAudioTrack(audioTracks[0]);
              } else {
                setAudioTrack(null);
              }
            }
          });

          session.connect();
        },

        producerRemoved: () => {
          if (!mountedRef.current) return;

          if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
            setStream(null);
            setAudioTrack(null);
            setState(StreamState.DISCONNECTED);
          }
        },
      };

      api.registerProducersListener(producersListenerRef.current);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[WebRTC] Connection error:', message);
      setError(message);
      setState(StreamState.ERROR);
    }
  }, [remoteHost, cleanup]);

  /** Disconnect from the stream. */
  const disconnect = useCallback((): void => {
    cleanup();
    setState(StreamState.DISCONNECTED);
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;

    if (shouldConnect) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
    // `connect`/`disconnect`/`cleanup` are intentionally omitted to avoid reconnecting on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldConnect]);

  const value: WebRTCStreamContextValue = {
    state,
    stream,
    audioTrack,
    error,
    isConnected: state === StreamState.CONNECTED,
    isConnecting: state === StreamState.CONNECTING,

    isWifiMode,
    isWebRTCAvailable,
    checkFailed,
    isRobotAwake,
    shouldConnect,

    connect,
    disconnect,
  };

  return <WebRTCStreamContext.Provider value={value}>{children}</WebRTCStreamContext.Provider>;
}

/** Hook to consume the WebRTC stream context. */
export function useWebRTCStreamContext(): WebRTCStreamContextValue {
  const context = useContext(WebRTCStreamContext);
  if (!context) {
    throw new Error('useWebRTCStreamContext must be used within a WebRTCStreamProvider');
  }
  return context;
}

export default WebRTCStreamContext;
