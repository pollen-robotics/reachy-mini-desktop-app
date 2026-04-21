import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveRobotContext } from '../../context';

type TimeoutId = ReturnType<typeof setTimeout>;

interface VolumeApiResponse {
  volume?: number;
  device?: string | null;
  platform?: string | null;
}

export interface UseAudioControlsResult {
  volume: number;
  microphoneVolume: number;
  speakerDevice: string | null;
  microphoneDevice: string | null;
  speakerPlatform: string | null;
  microphonePlatform: string | null;
  handleVolumeChange: (newVolume: number) => void;
  handleMicrophoneChange: (enabled: boolean) => void;
  handleMicrophoneVolumeChange: (newVolume: number) => void;
  handleSpeakerMute: () => void;
  handleMicrophoneMute: () => void;
}

/**
 * Hook to manage audio controls (speaker and microphone)
 * Handles volume state, device info, and API calls
 *
 * Uses API config from ActiveRobotContext for decoupling
 */
export function useAudioControls(isActive: boolean): UseAudioControlsResult {
  const { api } = useActiveRobotContext();
  const { buildApiUrl, fetchWithTimeout, config } = api;
  const DAEMON_CONFIG = config as { TIMEOUTS: { VERSION: number } };

  const [volume, setVolume] = useState<number>(50);
  const [microphoneVolume, setMicrophoneVolume] = useState<number>(50);

  const [speakerDevice, setSpeakerDevice] = useState<string | null>(null);
  const [microphoneDevice, setMicrophoneDevice] = useState<string | null>(null);
  const [speakerPlatform, setSpeakerPlatform] = useState<string | null>(null);
  const [microphonePlatform, setMicrophonePlatform] = useState<string | null>(null);

  const volumeDebounceTimeoutRef = useRef<TimeoutId | null>(null);
  const microphoneDebounceTimeoutRef = useRef<TimeoutId | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const fetchVolumeValue = async (
      endpoint: string,
      setter: (value: number) => void,
      deviceSetter: ((value: string) => void) | null,
      platformSetter: ((value: string) => void) | null,
      label: string
    ): Promise<void> => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(endpoint),
          {},
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: true }
        );
        if (response.ok) {
          const data = (await response.json()) as VolumeApiResponse;
          if (data.volume !== undefined) {
            setter(data.volume);
          }
          if (deviceSetter && data.device) {
            deviceSetter(data.device);
          }
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
  }, [isActive]);

  const updateVolumeInApi = useCallback(async (newVolume: number): Promise<void> => {
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
        const data = (await response.json()) as VolumeApiResponse;
        if (data.volume !== undefined) {
          setVolume(data.volume);
        }
      } else {
        try {
          const currentData = await fetchWithTimeout(
            buildApiUrl('/api/volume/current'),
            {},
            DAEMON_CONFIG.TIMEOUTS.VERSION,
            { silent: true }
          );
          if (currentData.ok) {
            const currentVolume = (await currentData.json()) as VolumeApiResponse;
            if (currentVolume.volume !== undefined) {
              setVolume(currentVolume.volume);
            }
          }
        } catch (fetchErr) {
          console.warn('Failed to revert volume after error:', fetchErr);
        }
        console.warn('Failed to set volume:', response.status);
      }
    } catch (err) {
      try {
        const currentData = await fetchWithTimeout(
          buildApiUrl('/api/volume/current'),
          {},
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: true }
        );
        if (currentData.ok) {
          const currentVolume = (await currentData.json()) as VolumeApiResponse;
          if (currentVolume.volume !== undefined) {
            setVolume(currentVolume.volume);
          }
        }
      } catch (fetchErr) {
        console.warn('Failed to revert volume after error:', fetchErr);
      }
      console.warn('Failed to set volume:', err);
    }
  }, []);

  const handleVolumeChange = useCallback(
    (newVolume: number): void => {
      setVolume(newVolume);

      if (volumeDebounceTimeoutRef.current) {
        clearTimeout(volumeDebounceTimeoutRef.current);
      }

      volumeDebounceTimeoutRef.current = setTimeout(() => {
        updateVolumeInApi(newVolume);
        volumeDebounceTimeoutRef.current = null;
      }, 500);
    },
    [updateVolumeInApi]
  );

  const updateMicrophoneVolumeInApi = useCallback(async (newVolume: number): Promise<void> => {
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
        const data = (await response.json()) as VolumeApiResponse;
        if (data.volume !== undefined) {
          setMicrophoneVolume(data.volume);
        }
      } else {
        try {
          const currentData = await fetchWithTimeout(
            buildApiUrl('/api/volume/microphone/current'),
            {},
            DAEMON_CONFIG.TIMEOUTS.VERSION,
            { silent: true }
          );
          if (currentData.ok) {
            const currentVolume = (await currentData.json()) as VolumeApiResponse;
            if (currentVolume.volume !== undefined) {
              setMicrophoneVolume(currentVolume.volume);
            }
          }
        } catch (fetchErr) {
          console.warn('Failed to revert microphone volume after error:', fetchErr);
        }
        console.warn('Failed to set microphone volume:', response.status);
      }
    } catch (err) {
      try {
        const currentData = await fetchWithTimeout(
          buildApiUrl('/api/volume/microphone/current'),
          {},
          DAEMON_CONFIG.TIMEOUTS.VERSION,
          { silent: true }
        );
        if (currentData.ok) {
          const currentVolume = (await currentData.json()) as VolumeApiResponse;
          if (currentVolume.volume !== undefined) {
            setMicrophoneVolume(currentVolume.volume);
          }
        }
      } catch (fetchErr) {
        console.warn('Failed to revert microphone volume after error:', fetchErr);
      }
      console.warn('Failed to set microphone volume:', err);
    }
  }, []);

  const handleMicrophoneVolumeChange = useCallback(
    (newVolume: number): void => {
      setMicrophoneVolume(newVolume);

      if (microphoneDebounceTimeoutRef.current) {
        clearTimeout(microphoneDebounceTimeoutRef.current);
      }

      microphoneDebounceTimeoutRef.current = setTimeout(() => {
        updateMicrophoneVolumeInApi(newVolume);
        microphoneDebounceTimeoutRef.current = null;
      }, 500);
    },
    [updateMicrophoneVolumeInApi]
  );

  const handleMicrophoneChange = useCallback(
    (enabled: boolean): void => {
      handleMicrophoneVolumeChange(enabled ? 50 : 0);
    },
    [handleMicrophoneVolumeChange]
  );

  const handleSpeakerMute = useCallback((): void => {
    const newVolume = volume > 0 ? 0 : 50;

    if (volumeDebounceTimeoutRef.current) {
      clearTimeout(volumeDebounceTimeoutRef.current);
      volumeDebounceTimeoutRef.current = null;
    }

    setVolume(newVolume);

    updateVolumeInApi(newVolume);
  }, [volume, updateVolumeInApi]);

  const handleMicrophoneMute = useCallback((): void => {
    const newVolume = microphoneVolume > 0 ? 0 : 50;

    if (microphoneDebounceTimeoutRef.current) {
      clearTimeout(microphoneDebounceTimeoutRef.current);
      microphoneDebounceTimeoutRef.current = null;
    }

    setMicrophoneVolume(newVolume);

    updateMicrophoneVolumeInApi(newVolume);
  }, [microphoneVolume, updateMicrophoneVolumeInApi]);

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
  };
}
