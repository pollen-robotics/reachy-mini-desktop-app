/**
 * WebRTCStreamContext
 *
 * Provides a shared WebRTC stream connection across multiple components. This
 * avoids multiple `CameraFeed` instances creating duplicate connections.
 *
 * The connection itself (retries, failure handling) lives in
 * `WebRTCStreamConnection`; this provider mirrors it into React state.
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
import { invoke } from '../utils/tauriCompat';
import {
  StreamState,
  WebRTCStreamConnection,
  type StreamStateValue,
} from './webrtcStreamConnection';

// Import the GStreamer WebRTC API for its side effect (registers `window.GstWebRTCAPI`).
import '../lib/gstwebrtc-api';
// Side-effect import: registers the `Window.GstWebRTCAPI` global type.
import type {} from '../types/gstwebrtc';

export { StreamState, type StreamStateValue };

const SIGNALING_PORT = 8443;
export const WEBRTC_UNSUPPORTED_MESSAGE = 'WebRTC is not supported by this desktop WebView';

function hasRTCPeerConnection(): boolean {
  const webkitWindow = window as typeof window & {
    webkitRTCPeerConnection?: typeof RTCPeerConnection;
  };

  if (!window.RTCPeerConnection && webkitWindow.webkitRTCPeerConnection) {
    window.RTCPeerConnection = webkitWindow.webkitRTCPeerConnection;
  }

  return typeof window.RTCPeerConnection === 'function';
}

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
  openExternalViewer: () => Promise<void>;
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

  const connectionRef = useRef<WebRTCStreamConnection | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    if (!hasRTCPeerConnection()) {
      console.warn('[WebRTC]', WEBRTC_UNSUPPORTED_MESSAGE);
      setError(WEBRTC_UNSUPPORTED_MESSAGE);
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

  const handleStreamChange = useCallback((mediaStream: MediaStream | null): void => {
    setStream(mediaStream);
    setAudioTrack(mediaStream?.getAudioTracks()[0] ?? null);
  }, []);

  /** Connect to the WebRTC stream, with a fresh retry budget. */
  const connect = useCallback((): void => {
    if (!mountedRef.current) {
      return;
    }

    connectionRef.current?.dispose();
    connectionRef.current = null;

    try {
      if (!hasRTCPeerConnection()) {
        throw new Error(WEBRTC_UNSUPPORTED_MESSAGE);
      }

      const GstWebRTCAPI = window.GstWebRTCAPI;
      if (!GstWebRTCAPI) {
        throw new Error('GstWebRTCAPI not loaded');
      }

      // Use `remoteHost` for WiFi, localhost for USB/Lite (daemon runs locally).
      const host = remoteHost || 'localhost';
      const signalingUrl = `ws://${host}:${SIGNALING_PORT}`;

      const connection = new WebRTCStreamConnection({
        signalingUrl,
        createApi: () =>
          new GstWebRTCAPI({
            signalingServerUrl: signalingUrl,
            reconnectionTimeout: 0,
            meta: { name: 'reachy-desktop-app' },
            webrtcConfig: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
              ],
            },
          }),
        onStateChange: setState,
        onStreamChange: handleStreamChange,
        onError: setError,
      });
      connectionRef.current = connection;
      connection.connect();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[WebRTC] Connection error:', message);
      handleStreamChange(null);
      setError(message);
      setState(StreamState.ERROR);
    }
  }, [remoteHost, handleStreamChange]);

  /** Disconnect from the stream. */
  const disconnect = useCallback((): void => {
    connectionRef.current?.dispose();
    connectionRef.current = null;
    handleStreamChange(null);
    setState(StreamState.DISCONNECTED);
  }, [handleStreamChange]);

  const openExternalViewer = useCallback(async (): Promise<void> => {
    const host = remoteHost || 'localhost';
    try {
      await invoke('open_external_camera_viewer', { host });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[WebRTC] Failed to open external camera viewer:', message);
      setError(message);
      setState(StreamState.ERROR);
    }
  }, [remoteHost]);

  useEffect(() => {
    mountedRef.current = true;

    if (shouldConnect) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      mountedRef.current = false;
      connectionRef.current?.dispose();
      connectionRef.current = null;
    };
    // `connect`/`disconnect` are intentionally omitted to avoid reconnecting on every change.
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
    openExternalViewer,
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
