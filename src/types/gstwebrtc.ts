/**
 * Minimal ambient typings for the vendored GStreamer WebRTC API
 * (`src/lib/gstwebrtc-api.js`). The lib has no `.d.ts`; we describe just the
 * surface area the desktop app actually uses. Additional methods exist on the
 * real API but are out of scope here.
 */

export interface GstWebRTCProducer {
  id: string;
}

export interface GstWebRTCConsumerSession extends EventTarget {
  streams: readonly MediaStream[];
  connect: () => void;
  close: () => void;
}

export interface GstWebRTCProducersListener {
  producerAdded: (producer: GstWebRTCProducer) => void;
  producerRemoved: (producer: GstWebRTCProducer) => void;
}

export interface GstWebRTCConnectionListener {
  connected: (clientId: string) => void;
  disconnected: () => void;
}

export interface GstWebRTCAPIInstance {
  createConsumerSession: (producerId: string) => GstWebRTCConsumerSession | null;
  registerProducersListener: (listener: GstWebRTCProducersListener) => void;
  unregisterProducersListener: (listener: GstWebRTCProducersListener) => void;
  registerConnectionListener: (listener: GstWebRTCConnectionListener) => void;
  unregisterConnectionListener: (listener: GstWebRTCConnectionListener) => void;
  /** Internal channel handle exposed by the library; closing it tears down the WS. */
  _channel?: { close: () => void };
}

export interface GstWebRTCAPIOptions {
  signalingServerUrl: string;
  reconnectionTimeout?: number;
  meta?: Record<string, unknown>;
  webrtcConfig?: RTCConfiguration;
}

export type GstWebRTCAPIConstructor = new (options: GstWebRTCAPIOptions) => GstWebRTCAPIInstance;

declare global {
  interface Window {
    GstWebRTCAPI?: GstWebRTCAPIConstructor;
  }
}
