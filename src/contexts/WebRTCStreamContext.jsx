/**
 * WebRTCStreamContext
 * Provides a shared WebRTC stream connection across multiple components.
 * This avoids multiple CameraFeed instances creating duplicate connections.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import useAppStore from '../store/useAppStore';
import { fetchWithTimeout, buildApiUrl } from '../config/daemon';
import { ROBOT_STATUS } from '../constants/robotStatus';
import { isLinux } from '../utils/platform';

// Import the GStreamer WebRTC API
import '../lib/gstwebrtc-api';

const SIGNALING_PORT = 8443;
const RECONNECT_DELAY = 2000;
const INITIAL_RECONNECT_DELAY = 500;

/**
 * Connection states for the WebRTC stream
 */
export const StreamState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

// Context
const WebRTCStreamContext = createContext(null);

/**
 * Provider component that manages the shared WebRTC connection
 */
export function WebRTCStreamProvider({ children }) {
  const { connectionMode, remoteHost, robotStatus } = useAppStore();
  const isWifiMode = connectionMode === 'wifi';
  const isRobotAwake = robotStatus === ROBOT_STATUS.READY || robotStatus === ROBOT_STATUS.BUSY;

  // Stream state
  const [state, setState] = useState(StreamState.DISCONNECTED);
  const [stream, setStream] = useState(null);
  const [audioTrack, setAudioTrack] = useState(null);
  const [error, setError] = useState(null);

  // WebRTC availability: true if the daemon exposes a WebRTC signaling server
  // - WiFi + wireless_version: true (Wireless robot over WiFi)
  // - USB (Lite): true (Lite daemon now supports WebRTC locally)
  // - Simulation: depends on daemon capabilities
  const [isWebRTCAvailable, setIsWebRTCAvailable] = useState(null);
  const [checkFailed, setCheckFailed] = useState(false);

  // Refs for cleanup
  const apiRef = useRef(null);
  const sessionRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const producersListenerRef = useRef(null);
  const connectionListenerRef = useRef(null);
  const hasConnectedRef = useRef(false);

  // Check WebRTC availability on mount
  // - WiFi mode: check if daemon reports wireless_version (remote WebRTC on RPi)
  // - USB / external mode (Lite): WebRTC is always available (daemon runs locally with signaling on :8443)
  useEffect(() => {
    // WebKit on Linux is not built with WebRTC support, so streaming is unavailable
    if (isLinux()) {
      setIsWebRTCAvailable(false);
      return;
    }

    if (connectionMode === 'usb' || connectionMode === 'external') {
      // Local daemon always exposes WebRTC signaling server on localhost
      setIsWebRTCAvailable(true);
      return;
    }

    if (!isWifiMode) {
      setIsWebRTCAvailable(false);
      return;
    }

    const checkWirelessVersion = async () => {
      try {
        const response = await fetchWithTimeout(buildApiUrl('/api/daemon/status'), {}, 5000, {
          silent: true,
        });
        if (response.ok) {
          const data = await response.json();
          setIsWebRTCAvailable(data.wireless_version === true);
        } else {
          setCheckFailed(true);
        }
      } catch (e) {
        setCheckFailed(true);
      }
    };

    checkWirelessVersion();
  }, [isWifiMode, connectionMode]);

  // Should we connect?
  const shouldConnect = isWebRTCAvailable === true && isRobotAwake;

  /**
   * Clean up session and API
   */
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
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
      } catch (e) {
        // Ignore cleanup errors
      }
      apiRef.current = null;
    }

    setStream(null);
    setAudioTrack(null);
  }, []);

  /**
   * Connect to the WebRTC stream
   */
  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    cleanup();
    setState(StreamState.CONNECTING);
    setError(null);

    // Use remoteHost for WiFi, localhost for USB/Lite (daemon runs locally)
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

      // Connection listener
      connectionListenerRef.current = {
        connected: clientId => {
          if (!mountedRef.current) return;
          hasConnectedRef.current = true;
        },
        disconnected: () => {
          if (!mountedRef.current) return;
          setStream(null);

          // Schedule reconnect if still should connect
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
            // Keep showing "Connecting..." while retrying
            setState(StreamState.CONNECTING);
          } else {
            setState(StreamState.DISCONNECTED);
          }
        },
      };

      api.registerConnectionListener(connectionListenerRef.current);

      // Producers listener
      producersListenerRef.current = {
        producerAdded: producer => {
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

          session.addEventListener('error', e => {
            if (!mountedRef.current) return;
            console.error('[WebRTC] Session error:', e.message);
            setError(e.message || 'Stream error');

            // Schedule reconnect on error (e.g. signaling server not ready yet)
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
              // Keep showing "Connecting..." while retrying
              setState(StreamState.CONNECTING);
            } else {
              setState(StreamState.ERROR);
            }
          });

          session.addEventListener('closed', () => {
            if (!mountedRef.current) return;
            sessionRef.current = null;
            setStream(null);
            setState(prev => (prev === StreamState.CONNECTED ? StreamState.DISCONNECTED : prev));
          });

          session.addEventListener('streamsChanged', () => {
            if (!mountedRef.current) return;
            const streams = session.streams;

            if (streams && streams.length > 0) {
              const mediaStream = streams[0];
              setStream(mediaStream);
              setState(StreamState.CONNECTED);

              // Extract audio track from stream (robot microphone)
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

        producerRemoved: producer => {
          if (!mountedRef.current) return;

          if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
            setStream(null);
            setState(StreamState.DISCONNECTED);
          }
        },
      };

      api.registerProducersListener(producersListenerRef.current);
    } catch (e) {
      console.error('[WebRTC] Connection error:', e.message);
      setError(e.message);
      setState(StreamState.ERROR);
    }
  }, [remoteHost, cleanup]);

  /**
   * Disconnect from the stream
   */
  const disconnect = useCallback(() => {
    cleanup();
    setState(StreamState.DISCONNECTED);
  }, [cleanup]);

  // Auto-connect when conditions are met
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
  }, [shouldConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    // State
    state,
    stream,
    audioTrack,
    error,
    isConnected: state === StreamState.CONNECTED,
    isConnecting: state === StreamState.CONNECTING,

    // Derived state
    isWifiMode,
    isWebRTCAvailable,
    checkFailed,
    isRobotAwake,
    shouldConnect,

    // Actions
    connect,
    disconnect,
  };

  return <WebRTCStreamContext.Provider value={value}>{children}</WebRTCStreamContext.Provider>;
}

/**
 * Hook to consume the WebRTC stream context
 */
export function useWebRTCStreamContext() {
  const context = useContext(WebRTCStreamContext);
  if (!context) {
    throw new Error('useWebRTCStreamContext must be used within a WebRTCStreamProvider');
  }
  return context;
}

export default WebRTCStreamContext;
