/**
 * useAudioAnalyser - Hook for real-time audio level analysis
 * 
 * Takes a MediaStreamTrack (audio) and returns normalized audio levels
 * suitable for visualization (0-1 range).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Analyzes an audio track and returns real-time amplitude data
 * @param {MediaStreamTrack|null} audioTrack - The audio track to analyze
 * @param {Object} options - Configuration options
 * @param {number} options.fftSize - FFT size for frequency analysis (default: 256)
 * @param {number} options.smoothingTimeConstant - Smoothing (0-1, default: 0.8)
 * @param {number} options.updateInterval - Update interval in ms (default: 50)
 * @returns {Object} { level, levels, isActive }
 */
export default function useAudioAnalyser(audioTrack, options = {}) {
  const {
    fftSize = 256,
    smoothingTimeConstant = 0.8,
    updateInterval = 50,
  } = options;

  // Current audio level (0-1 normalized)
  const [level, setLevel] = useState(0);
  // Array of frequency bin levels for waveform visualization
  const [levels, setLevels] = useState([]);
  // Whether audio analysis is active
  const [isActive, setIsActive] = useState(false);

  // Refs for cleanup
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const dataArrayRef = useRef(null);

  /**
   * Clean up audio context and nodes
   */
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      sourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.warn('[useAudioAnalyser] Error closing AudioContext:', e);
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
   * Set up audio analysis when track changes
   */
  useEffect(() => {
    // Clean up previous analysis
    cleanup();

    // No track, nothing to do
    if (!audioTrack) {
      return;
    }

    // Check if track is valid and enabled
    if (audioTrack.readyState !== 'live' || !audioTrack.enabled) {
      console.warn('[useAudioAnalyser] Audio track not live or disabled');
      return;
    }

    try {
      // Create AudioContext
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      // Create analyser node
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current = analyser;

      // Create media stream source from the audio track
      const mediaStream = new MediaStream([audioTrack]);
      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      // Connect source to analyser (don't connect to destination - we don't want to play it)
      source.connect(analyser);

      // Create data array for frequency data
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;

      setIsActive(true);
      

      // Animation loop for reading audio levels
      const analyze = (currentTime) => {
        if (!analyserRef.current || !dataArrayRef.current) {
          return;
        }

        // Throttle updates
        const elapsed = currentTime - lastUpdateRef.current;
        if (elapsed >= updateInterval) {
          // Get frequency data
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);

          // Calculate average level (RMS-like)
          let sum = 0;
          const data = dataArrayRef.current;
          for (let i = 0; i < data.length; i++) {
            sum += data[i];
          }
          const average = sum / data.length;
          const rawLevel = average / 255; // Normalize to 0-1
          
          // Apply logarithmic sensitivity curve (matches human hearing perception)
          // Formula: log(1 + x * gain) / log(1 + gain) normalizes output to 0-1
          const gain = 40; // Higher = more boost for quiet sounds
          const logLevel = Math.log(1 + rawLevel * gain) / Math.log(1 + gain);
          const normalizedLevel = Math.min(1, logLevel);

          setLevel(normalizedLevel);

          // Create normalized levels array for waveform visualization
          // Sample every Nth bin for performance
          const sampleRate = Math.max(1, Math.floor(data.length / 32));
          const sampledLevels = [];
          for (let i = 0; i < data.length; i += sampleRate) {
            sampledLevels.push(data[i] / 255);
          }
          setLevels(sampledLevels);

          lastUpdateRef.current = currentTime;
        }

        animationRef.current = requestAnimationFrame(analyze);
      };

      animationRef.current = requestAnimationFrame(analyze);

    } catch (e) {
      console.error('[useAudioAnalyser] Error setting up audio analysis:', e);
      cleanup();
    }

    // Cleanup on unmount or track change
    return cleanup;
  }, [audioTrack, fftSize, smoothingTimeConstant, updateInterval, cleanup]);

  return {
    level,    // Single normalized level (0-1) - average amplitude
    levels,   // Array of normalized levels for visualization
    isActive, // Whether analysis is running
  };
}

