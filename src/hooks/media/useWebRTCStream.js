/**
 * Hook for managing WebRTC stream connection to Reachy WiFi camera
 * Uses the GStreamer WebRTC API for low-latency video streaming
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Import the GStreamer WebRTC API (loaded as a side-effect, exposes window.GstWebRTCAPI)
import '../../lib/gstwebrtc-api';

const SIGNALING_PORT = 8443;
const RECONNECT_DELAY = 5000;

/**
 * Connection states for the WebRTC stream
 */
export const StreamState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

/**
 * Hook to manage WebRTC video stream from Reachy WiFi
 * @param {string} robotHost - The robot's hostname or IP (e.g., 'reachy-mini.local' or '192.168.1.100')
 * @param {boolean} autoConnect - Whether to automatically connect when the hook mounts
 * @returns {Object} Stream state and control functions
 */
export default function useWebRTCStream(robotHost, autoConnect = false) {
  const [state, setState] = useState(StreamState.DISCONNECTED);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  
  const apiRef = useRef(null);
  const sessionRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const producersListenerRef = useRef(null);
  const connectionListenerRef = useRef(null);

  /**
   * Clean up session and API
   */
  const cleanup = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close the consumer session
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.warn('[WebRTC] Error closing session:', e);
      }
      sessionRef.current = null;
    }
    
    // Unregister listeners and close API
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
        // Note: GstWebRTCAPI doesn't have a close method, but we can close the internal channel
        // by creating a new API instance or just letting it go out of scope
      } catch (e) {
        console.warn('[WebRTC] Error cleaning up API:', e);
      }
      apiRef.current = null;
    }
    
    setStream(null);
  }, []);

  /**
   * Connect to the WebRTC stream
   */
  const connect = useCallback(() => {
    if (!robotHost || !mountedRef.current) {
      setError('No robot host specified');
      setState(StreamState.ERROR);
      return;
    }

    // Clean up any existing connection first
    cleanup();
    
    setState(StreamState.CONNECTING);
    setError(null);

    const signalingUrl = `ws://${robotHost}:${SIGNALING_PORT}`;
    

    try {
      const GstWebRTCAPI = window.GstWebRTCAPI;
      
      if (!GstWebRTCAPI) {
        throw new Error('GstWebRTCAPI not loaded');
      }

      // Create new API instance with auto-reconnect disabled (we handle it ourselves)
      // Add STUN server for ICE candidate gathering (helps with NAT traversal on local networks)
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
        connected: (clientId) => {
          if (!mountedRef.current) return;
          
        },
        disconnected: () => {
          if (!mountedRef.current) return;
          
          setState(StreamState.DISCONNECTED);
          setStream(null);
          
          // Schedule reconnect
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

      // Producers listener - connect to the first available producer
      producersListenerRef.current = {
        producerAdded: (producer) => {
          if (!mountedRef.current) return;
          
          
          // If we already have a session, don't create another one
          if (sessionRef.current) {
            
            return;
          }
          
          
          
          const session = api.createConsumerSession(producer.id);
          if (!session) {
            console.error('[WebRTC] Failed to create consumer session');
            return;
          }
          
          sessionRef.current = session;
          
          session.addEventListener('error', (e) => {
            if (!mountedRef.current) return;
            console.error('[WebRTC] Session error:', e.message || e);
            setError(e.message || 'Stream error');
            setState(StreamState.ERROR);
          });
          
          session.addEventListener('closed', () => {
            if (!mountedRef.current) return;
            
            sessionRef.current = null;
            setStream(null);
            
            // Only set disconnected if we were connected
            setState((prev) => prev === StreamState.CONNECTED ? StreamState.DISCONNECTED : prev);
          });
          
          session.addEventListener('streamsChanged', () => {
            if (!mountedRef.current) return;
            const streams = session.streams;
            
            
            if (streams && streams.length > 0) {
              setStream(streams[0]);
              setState(StreamState.CONNECTED);
            }
          });
          
          // Start the session
          session.connect();
        },
        
        producerRemoved: (producer) => {
          if (!mountedRef.current) return;
          
          
          // If our session was with this producer, close it
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
      console.error('[WebRTC] Connection error:', e);
      setError(e.message);
      setState(StreamState.ERROR);
    }
  }, [robotHost, cleanup]);

  /**
   * Disconnect from the stream
   */
  const disconnect = useCallback(() => {
    
    cleanup();
    setState(StreamState.DISCONNECTED);
  }, [cleanup]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    mountedRef.current = true;
    
    if (autoConnect && robotHost) {
      connect();
    }
    
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [autoConnect, robotHost]); // eslint-disable-line react-hooks/exhaustive-deps

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
