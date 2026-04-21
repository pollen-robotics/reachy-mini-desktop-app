/**
 * useAudioAnalyser - Hook for real-time audio level analysis.
 *
 * Takes a MediaStreamTrack (audio) and returns normalized audio levels
 * suitable for visualization (0-1 range).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface UseAudioAnalyserOptions {
  /** FFT size for frequency analysis (default: 256). */
  fftSize?: number;
  /** Smoothing factor (0-1, default: 0.8). */
  smoothingTimeConstant?: number;
  /** Update interval in ms (default: 50). */
  updateInterval?: number;
}

export interface UseAudioAnalyserResult {
  /** Single normalized level (0-1) - average amplitude after log curve. */
  level: number;
  /** Sampled normalized levels (0-1 each) for waveform visualization. */
  levels: number[];
  /** Whether analysis is actively running. */
  isActive: boolean;
}

/**
 * Analyzes an audio track and returns real-time amplitude data.
 */
export default function useAudioAnalyser(
  audioTrack: MediaStreamTrack | null,
  options: UseAudioAnalyserOptions = {}
): UseAudioAnalyserResult {
  const { fftSize = 256, smoothingTimeConstant = 0.8, updateInterval = 50 } = options;

  // Current audio level (0-1 normalized).
  const [level, setLevel] = useState<number>(0);
  // Array of frequency bin levels for waveform visualization.
  const [levels, setLevels] = useState<number[]>([]);
  // Whether audio analysis is active.
  const [isActive, setIsActive] = useState<boolean>(false);

  // Refs for cleanup.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  // Explicitly back the buffer by an `ArrayBuffer` (not `SharedArrayBuffer`)
  // so `getByteFrequencyData` accepts it under TS 5's stricter typings.
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  /**
   * Clean up audio context and nodes.
   */
  const cleanup = useCallback((): void => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
      sourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore close errors.
      }
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;

    setLevel(0);
    setLevels([]);
    setIsActive(false);
  }, []);

  /**
   * Set up audio analysis when the track changes.
   */
  useEffect(() => {
    // Clean up previous analysis.
    cleanup();

    if (!audioTrack) {
      return undefined;
    }

    // Check if track is valid and enabled.
    if (audioTrack.readyState !== 'live' || !audioTrack.enabled) {
      return undefined;
    }

    try {
      const AudioContextClass: typeof AudioContext =
        window.AudioContext || window.webkitAudioContext!;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current = analyser;

      // Create a media stream source from the audio track.
      const mediaStream = new MediaStream([audioTrack]);
      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      // Connect source to analyser only - we don't want playback.
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
      dataArrayRef.current = dataArray;

      setIsActive(true);

      // Animation loop for reading audio levels.
      const analyze = (currentTime: number): void => {
        if (!analyserRef.current || !dataArrayRef.current) {
          return;
        }

        // Throttle updates.
        const elapsed = currentTime - lastUpdateRef.current;
        if (elapsed >= updateInterval) {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);

          // Calculate average level (RMS-like).
          let sum = 0;
          const data = dataArrayRef.current;
          for (let i = 0; i < data.length; i++) {
            sum += data[i];
          }
          const average = sum / data.length;
          const rawLevel = average / 255; // Normalize to 0-1.

          // Apply a logarithmic sensitivity curve (matches human hearing).
          // Formula: log(1 + x * gain) / log(1 + gain) normalizes to 0-1.
          const gain = 40; // Higher = more boost for quiet sounds.
          const logLevel = Math.log(1 + rawLevel * gain) / Math.log(1 + gain);
          const normalizedLevel = Math.min(1, logLevel);

          setLevel(normalizedLevel);

          // Create a normalized levels array for waveform visualization.
          // Sample every Nth bin for performance.
          const sampleRate = Math.max(1, Math.floor(data.length / 32));
          const sampledLevels: number[] = [];
          for (let i = 0; i < data.length; i += sampleRate) {
            sampledLevels.push(data[i] / 255);
          }
          setLevels(sampledLevels);

          lastUpdateRef.current = currentTime;
        }

        animationRef.current = requestAnimationFrame(analyze);
      };

      animationRef.current = requestAnimationFrame(analyze);
    } catch {
      cleanup();
    }

    // Cleanup on unmount or track change.
    return cleanup;
  }, [audioTrack, fftSize, smoothingTimeConstant, updateInterval, cleanup]);

  return {
    level,
    levels,
    isActive,
  };
}
