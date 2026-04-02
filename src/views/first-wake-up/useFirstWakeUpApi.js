/**
 * Hook for Wake Me Up API communication.
 * Talks to the daemon (localhost:8000) for first-wake-up status,
 * and to the Wake Me Up app API for diagnostic features.
 */
import { useCallback, useRef, useState, useEffect } from 'react';
import { fetchWithTimeout, buildApiUrl, DAEMON_CONFIG } from '../../config/daemon';

const WAKE_UP_APP_PORT = 8042;
const WAKE_UP_BASE = `http://localhost:${WAKE_UP_APP_PORT}`;

const SLEEP_POSITION_DEGREES = {
  body_rotation: 5.0,
  stewart_1: -23.0,
  stewart_2: 58.5,
  stewart_3: -11.0,
  stewart_4: 9.5,
  stewart_5: -58.0,
  stewart_6: 23.0,
  right_antenna: -159.5,
  left_antenna: 159.5,
};

const POSITION_ERROR_THRESHOLD = 15.0;
const POSITION_ERROR_THRESHOLD_BASE = 20.0;
const POSITION_ERROR_THRESHOLD_ANTENNAS = 19.5;
const SWAP_DETECTION_THRESHOLD = 15.0;

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function detectMotorSwaps(motorsData) {
  const swaps = [];
  const checked = new Set();
  const names = Object.keys(motorsData);

  for (let i = 0; i < names.length; i++) {
    const a = names[i];
    if (!(a in SLEEP_POSITION_DEGREES)) continue;
    const actualA = motorsData[a];
    const expectedA = SLEEP_POSITION_DEGREES[a];
    if (Math.abs(actualA - expectedA) < SWAP_DETECTION_THRESHOLD) continue;

    for (let j = i + 1; j < names.length; j++) {
      const b = names[j];
      if (!(b in SLEEP_POSITION_DEGREES)) continue;
      const key = [a, b].sort().join(':');
      if (checked.has(key)) continue;

      const actualB = motorsData[b];
      const expectedB = SLEEP_POSITION_DEGREES[b];
      if (Math.abs(actualB - expectedB) < SWAP_DETECTION_THRESHOLD) continue;

      const diffAtoB = Math.abs(actualA - expectedB);
      const diffBtoA = Math.abs(actualB - expectedA);

      if (diffAtoB < SWAP_DETECTION_THRESHOLD && diffBtoA < SWAP_DETECTION_THRESHOLD) {
        const avgDiff = (diffAtoB + diffBtoA) / 2;
        swaps.push({
          motor_a: a,
          motor_b: b,
          confidence: avgDiff < 5 ? 'high' : avgDiff < 10 ? 'medium' : 'low',
        });
        checked.add(key);
      }
    }
  }
  return swaps;
}

export function useFirstWakeUpApi() {
  const [wakeUpAppReady, setWakeUpAppReady] = useState(false);
  const audioPollingRef = useRef(null);

  // Check if first wake-up is completed (daemon endpoint)
  const checkFirstWakeUpStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        buildApiUrl('/api/first-wake-up/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
      if (!res.ok) return { is_completed: false };
      const data = await res.json();
      return { is_completed: data.is_completed ?? false };
    } catch {
      return { is_completed: false };
    }
  }, []);

  // Mark first wake-up as completed (daemon endpoint)
  const setFirstWakeUpCompleted = useCallback(async () => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/first-wake-up/set?is_completed=true'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Mark first wake-up completed' }
      );
    } catch (err) {
      console.error('[FirstWakeUp] Failed to mark completed:', err);
    }
  }, []);

  // Check sleep position using daemon's state endpoint
  const checkSleepPosition = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        buildApiUrl(
          '/api/state/full?with_head_joints=true&with_antenna_positions=true&with_body_yaw=true'
        ),
        {},
        DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
        { silent: true }
      );
      if (!res.ok) return null;
      const state = await res.json();

      if (!state.head_joints || !state.antennas_position) return null;

      const motorsData = {
        body_rotation: radToDeg(state.head_joints[0]),
        stewart_1: radToDeg(state.head_joints[1]),
        stewart_2: radToDeg(state.head_joints[2]),
        stewart_3: radToDeg(state.head_joints[3]),
        stewart_4: radToDeg(state.head_joints[4]),
        stewart_5: radToDeg(state.head_joints[5]),
        stewart_6: radToDeg(state.head_joints[6]),
        right_antenna: radToDeg(state.antennas_position[0]),
        left_antenna: radToDeg(state.antennas_position[1]),
      };

      const results = [];
      let allOk = true;

      for (const [name, actual] of Object.entries(motorsData)) {
        if (!(name in SLEEP_POSITION_DEGREES)) continue;
        const expected = SLEEP_POSITION_DEGREES[name];
        const diff = Math.abs(actual - expected);

        let threshold = POSITION_ERROR_THRESHOLD;
        if (name === 'body_rotation') threshold = POSITION_ERROR_THRESHOLD_BASE;
        if (name.includes('antenna')) threshold = POSITION_ERROR_THRESHOLD_ANTENNAS;

        const status = diff > threshold ? 'error' : 'ok';
        if (status === 'error') allOk = false;

        results.push({
          name,
          actual: Math.round(actual * 10) / 10,
          expected,
          diff: Math.round(diff * 10) / 10,
          status,
          threshold,
        });
      }

      const swaps = allOk ? [] : detectMotorSwaps(motorsData);

      return {
        motors: results,
        all_ok: allOk,
        has_errors: !allOk,
        detected_swaps: swaps,
        has_swaps: swaps.length > 0,
      };
    } catch (err) {
      console.error('[FirstWakeUp] Sleep position check failed:', err);
      return null;
    }
  }, []);

  // Motor control
  const enableMotors = useCallback(async () => {
    await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/enabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { silent: true }
    );
  }, []);

  const disableMotors = useCallback(async () => {
    await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/disabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { silent: true }
    );
  }, []);

  // Play a recorded move via daemon
  const playMove = useCallback(async moveName => {
    try {
      const res = await fetchWithTimeout(
        buildApiUrl(`/api/move/play/${moveName}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  // Play goto sleep
  const gotoSleep = useCallback(async () => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/move/play/sleep'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
    } catch (err) {
      console.error('[FirstWakeUp] goto sleep failed:', err);
    }
  }, []);

  // Volume control
  const getVolume = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.VOLUME_CURRENT),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
      if (!res.ok) return 0.5;
      const data = await res.json();
      return data.volume ?? 0.5;
    } catch {
      return 0.5;
    }
  }, []);

  const setVolume = useCallback(async volume => {
    try {
      await fetchWithTimeout(
        buildApiUrl(`${DAEMON_CONFIG.ENDPOINTS.VOLUME_SET}?volume=${volume}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
    } catch {
      // Ignore
    }
  }, []);

  // Play a sound through the daemon
  const playTestSound = useCallback(async () => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/move/play/wake_up'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
    } catch {
      // Ignore
    }
  }, []);

  // Camera feed URL
  const getCameraFeedUrl = useCallback(() => {
    return buildApiUrl('/api/camera/feed');
  }, []);

  // Audio level polling (uses daemon's microphone endpoint or Wake Me Up app)
  const startAudioPolling = useCallback(onLevel => {
    if (audioPollingRef.current) return;

    const poll = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/volume/microphone/current'), {
          cache: 'no-store',
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          const data = await res.json();
          onLevel(data.volume ?? data.level ?? 0);
        }
      } catch {
        // Ignore polling errors
      }
    };

    poll();
    audioPollingRef.current = setInterval(poll, 100);
  }, []);

  const stopAudioPolling = useCallback(() => {
    if (audioPollingRef.current) {
      clearInterval(audioPollingRef.current);
      audioPollingRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioPollingRef.current) {
        clearInterval(audioPollingRef.current);
      }
    };
  }, []);

  return {
    wakeUpAppReady,
    checkFirstWakeUpStatus,
    setFirstWakeUpCompleted,
    checkSleepPosition,
    enableMotors,
    disableMotors,
    playMove,
    gotoSleep,
    getVolume,
    setVolume,
    playTestSound,
    getCameraFeedUrl,
    startAudioPolling,
    stopAudioPolling,
  };
}
