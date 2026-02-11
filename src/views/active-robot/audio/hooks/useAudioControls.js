import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveRobotContext } from '../../context';

/**
 * Hook to manage audio controls (speaker and microphone)
 * Handles volume state, device info, and API calls
 *
 * Uses API config from ActiveRobotContext for decoupling
 */
export function useAudioControls(isActive) {
  // Get API from context
  const { api } = useActiveRobotContext();
  const { buildApiUrl, fetchWithTimeout, config: DAEMON_CONFIG } = api;
  // Volume states
  const [volume, setVolume] = useState(50);
  const [microphoneVolume, setMicrophoneVolume] = useState(50);

  // Device info from API
  const [speakerDevice, setSpeakerDevice] = useState(null);
  const [microphoneDevice, setMicrophoneDevice] = useState(null);
  const [speakerPlatform, setSpeakerPlatform] = useState(null);
  const [microphonePlatform, setMicrophonePlatform] = useState(null);

  // Device selection support (optional daemon capability)
  const [deviceSelectionSupported, setDeviceSelectionSupported] = useState(false);
  const [availableSpeakers, setAvailableSpeakers] = useState([]);
  const [availableMicrophones, setAvailableMicrophones] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Debounce timeouts refs (to cancel previous API calls when slider moves)
  const volumeDebounceTimeoutRef = useRef(null);
  const microphoneDebounceTimeoutRef = useRef(null);

  // Load volume from API on mount and when isActive changes
  useEffect(() => {
    if (!isActive) return;

    // Helper function to fetch volume value
    const fetchVolumeValue = async (endpoint, setter, deviceSetter, platformSetter, label) => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(endpoint),
          {},
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: true } // GET requests are silent (polling)
        );
        if (response.ok) {
          const data = await response.json();
          if (data.volume !== undefined) {
            setter(data.volume);
          }
          // Store device info if available
          if (deviceSetter && data.device) {
            deviceSetter(data.device);
          }
          // Store platform info if available
          if (platformSetter && data.platform) {
            platformSetter(data.platform);
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch ${label}:`, err);
      }
    };

    fetchVolumeValue(
      '/api/volume/current',
      setVolume,
      setSpeakerDevice,
      setSpeakerPlatform,
      'volume'
    );
    fetchVolumeValue(
      '/api/volume/microphone/current',
      setMicrophoneVolume,
      setMicrophoneDevice,
      setMicrophonePlatform,
      'microphone volume'
    );

    // Check if daemon supports device selection (optional endpoint)
    fetchAudioDevices();
  }, [isActive]);

  // Fetch available audio devices from daemon (optional capability)
  const fetchAudioDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.AUDIO_DEVICES),
        {},
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: true }
      );
      if (response.ok) {
        const data = await response.json();
        setDeviceSelectionSupported(true);
        setAvailableSpeakers(data.speakers || []);
        setAvailableMicrophones(data.microphones || []);
      } else {
        // 404 or other non-ok → daemon doesn't support device selection
        setDeviceSelectionSupported(false);
      }
    } catch (_err) {
      // Network error or timeout → not supported
      setDeviceSelectionSupported(false);
    } finally {
      setDevicesLoading(false);
    }
  }, [buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]);

  // Change speaker device
  const handleSpeakerDeviceChange = useCallback(
    async deviceId => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.AUDIO_SPEAKER_SET_DEVICE),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId }),
          },
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: false, label: 'Set speaker device' }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.device) setSpeakerDevice(data.device);
        }
      } catch (err) {
        console.warn('Failed to set speaker device:', err);
      }
    },
    [buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]
  );

  // Change microphone device
  const handleMicrophoneDeviceChange = useCallback(
    async deviceId => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.AUDIO_MICROPHONE_SET_DEVICE),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId }),
          },
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: false, label: 'Set microphone device' }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.device) setMicrophoneDevice(data.device);
        }
      } catch (err) {
        console.warn('Failed to set microphone device:', err);
      }
    },
    [buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]
  );

  // Actual API call for volume (extracted for debouncing)
  const updateVolumeInApi = useCallback(async newVolume => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/volume/set'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: newVolume }),
        },
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: false, label: `Set volume to ${newVolume}%` }
      );

      if (response.ok) {
        const data = await response.json();
        // Update with actual value from API (in case it was clamped)
        if (data.volume !== undefined) {
          setVolume(data.volume);
        }
      } else {
        // Revert on error
        try {
          const currentData = await fetchWithTimeout(
            buildApiUrl('/api/volume/current'),
            {},
            DAEMON_CONFIG.TIMEOUTS.VERSION,
            { silent: true }
          );
          if (currentData.ok) {
            const currentVolume = await currentData.json();
            if (currentVolume.volume !== undefined) {
              setVolume(currentVolume.volume);
            }
          }
        } catch (fetchErr) {
          // If we can't fetch, keep the optimistic update
          console.warn('Failed to revert volume after error:', fetchErr);
        }
        console.warn('Failed to set volume:', response.status);
      }
    } catch (err) {
      // Revert on error - try to fetch current value
      try {
        const currentData = await fetchWithTimeout(
          buildApiUrl('/api/volume/current'),
          {},
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: true }
        );
        if (currentData.ok) {
          const currentVolume = await currentData.json();
          if (currentVolume.volume !== undefined) {
            setVolume(currentVolume.volume);
          }
        }
      } catch (fetchErr) {
        // If we can't fetch, keep the optimistic update
        console.warn('Failed to revert volume after error:', fetchErr);
      }
      console.warn('Failed to set volume:', err);
    }
  }, []);

  // Update volume via API with debounce (500ms)
  const handleVolumeChange = useCallback(
    newVolume => {
      // Immediate optimistic update for UI responsiveness
      setVolume(newVolume);

      // Clear previous timeout
      if (volumeDebounceTimeoutRef.current) {
        clearTimeout(volumeDebounceTimeoutRef.current);
      }

      // Set new timeout to call API after 500ms of inactivity
      volumeDebounceTimeoutRef.current = setTimeout(() => {
        updateVolumeInApi(newVolume);
        volumeDebounceTimeoutRef.current = null;
      }, 500);
    },
    [updateVolumeInApi]
  );

  // Actual API call for microphone volume (extracted for debouncing)
  const updateMicrophoneVolumeInApi = useCallback(async newVolume => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/volume/microphone/set'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: newVolume }),
        },
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: false, label: `Set microphone volume to ${newVolume}%` }
      );

      if (response.ok) {
        const data = await response.json();
        // Update with actual value from API (in case it was clamped)
        if (data.volume !== undefined) {
          setMicrophoneVolume(data.volume);
        }
      } else {
        // Revert on error
        try {
          const currentData = await fetchWithTimeout(
            buildApiUrl('/api/volume/microphone/current'),
            {},
            DAEMON_CONFIG.TIMEOUTS.VERSION,
            { silent: true }
          );
          if (currentData.ok) {
            const currentVolume = await currentData.json();
            if (currentVolume.volume !== undefined) {
              setMicrophoneVolume(currentVolume.volume);
            }
          }
        } catch (fetchErr) {
          // If we can't fetch, keep the optimistic update
          console.warn('Failed to revert microphone volume after error:', fetchErr);
        }
        console.warn('Failed to set microphone volume:', response.status);
      }
    } catch (err) {
      // Revert on error - try to fetch current value
      try {
        const currentData = await fetchWithTimeout(
          buildApiUrl('/api/volume/microphone/current'),
          {},
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: true }
        );
        if (currentData.ok) {
          const currentVolume = await currentData.json();
          if (currentVolume.volume !== undefined) {
            setMicrophoneVolume(currentVolume.volume);
          }
        }
      } catch (fetchErr) {
        // If we can't fetch, keep the optimistic update
        console.warn('Failed to revert microphone volume after error:', fetchErr);
      }
      console.warn('Failed to set microphone volume:', err);
    }
  }, []);

  // Update microphone volume via API with debounce (500ms)
  const handleMicrophoneVolumeChange = useCallback(
    newVolume => {
      // Immediate optimistic update for UI responsiveness
      setMicrophoneVolume(newVolume);

      // Clear previous timeout
      if (microphoneDebounceTimeoutRef.current) {
        clearTimeout(microphoneDebounceTimeoutRef.current);
      }

      // Set new timeout to call API after 500ms of inactivity
      microphoneDebounceTimeoutRef.current = setTimeout(() => {
        updateMicrophoneVolumeInApi(newVolume);
        microphoneDebounceTimeoutRef.current = null;
      }, 500);
    },
    [updateMicrophoneVolumeInApi]
  );

  // Update microphone via API (toggle) - for backward compatibility
  const handleMicrophoneChange = useCallback(
    enabled => {
      handleMicrophoneVolumeChange(enabled ? 50 : 0);
    },
    [handleMicrophoneVolumeChange]
  );

  // Quick mute/unmute handlers (immediate, no debounce)
  const handleSpeakerMute = useCallback(() => {
    const newVolume = volume > 0 ? 0 : 50;

    // Cancel any pending debounced call
    if (volumeDebounceTimeoutRef.current) {
      clearTimeout(volumeDebounceTimeoutRef.current);
      volumeDebounceTimeoutRef.current = null;
    }

    // Immediate update (optimistic)
    setVolume(newVolume);

    // Immediate API call (no debounce for mute/unmute)
    updateVolumeInApi(newVolume);
  }, [volume, updateVolumeInApi]);

  const handleMicrophoneMute = useCallback(() => {
    const newVolume = microphoneVolume > 0 ? 0 : 50;

    // Cancel any pending debounced call
    if (microphoneDebounceTimeoutRef.current) {
      clearTimeout(microphoneDebounceTimeoutRef.current);
      microphoneDebounceTimeoutRef.current = null;
    }

    // Immediate update (optimistic)
    setMicrophoneVolume(newVolume);

    // Immediate API call (no debounce for mute/unmute)
    updateMicrophoneVolumeInApi(newVolume);
  }, [microphoneVolume, updateMicrophoneVolumeInApi]);

  // Cleanup debounce timeouts on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceTimeoutRef.current) {
        clearTimeout(volumeDebounceTimeoutRef.current);
      }
      if (microphoneDebounceTimeoutRef.current) {
        clearTimeout(microphoneDebounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    volume,
    microphoneVolume,
    speakerDevice,
    microphoneDevice,
    speakerPlatform,
    microphonePlatform,
    handleVolumeChange,
    handleMicrophoneChange,
    handleMicrophoneVolumeChange,
    handleSpeakerMute,
    handleMicrophoneMute,
    deviceSelectionSupported,
    availableSpeakers,
    availableMicrophones,
    devicesLoading,
    fetchAudioDevices,
    handleSpeakerDeviceChange,
    handleMicrophoneDeviceChange,
  };
}
