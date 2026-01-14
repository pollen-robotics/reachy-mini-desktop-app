/**
 * Telemetry Module - Privacy-first analytics for Reachy Mini Control
 *
 * Uses PostHog for anonymous, aggregated analytics.
 * Can be self-hosted for full data ownership.
 *
 * Usage:
 *   import { telemetry } from '@/utils/telemetry';
 *   telemetry.appStarted({ version: '0.9.0' });
 *
 * Or with the React hook:
 *   const { track } = useTelemetry();
 *   track.expressionPlayed({ name: 'loving1', type: 'emotion' });
 */

import { PostHog } from 'tauri-plugin-posthog-api';
import {
  EVENTS,
  validateConnectionMode,
  validateControllerType,
  validateExpressionType,
} from './events';

// Re-export events for convenience
export { EVENTS } from './events';

// ============================================================================
// TELEMETRY SINGLETON
// ============================================================================

/**
 * Session start timestamp (for duration calculations)
 */
let sessionStartTime = null;

/**
 * Robot connection timestamp (for session duration)
 */
let robotConnectedTime = null;

/**
 * Robot awake timestamp (for awake duration)
 */
let robotAwakeTime = null;

/**
 * App start timestamps by app_id
 */
const appStartTimes = new Map();

/**
 * Track an event safely (catches errors to avoid breaking the app)
 * @param {string} event - Event name
 * @param {Object} props - Event properties (strings and numbers only)
 */
const track = async (event, props = {}) => {
  try {
    // Filter out undefined/null values
    const cleanProps = Object.fromEntries(
      Object.entries(props).filter(([_, v]) => v !== undefined && v !== null)
    );

    await PostHog.capture(event, cleanProps);

    // Debug log in development
    if (import.meta.env.DEV) {
      console.log(`[Telemetry] ${event}`, cleanProps);
    }
  } catch (error) {
    // Silently fail - telemetry should never break the app
    if (import.meta.env.DEV) {
      console.warn(`[Telemetry] Failed to track ${event}:`, error);
    }
  }
};

// ============================================================================
// TELEMETRY API
// ============================================================================

export const telemetry = {
  // --------------------------------------------------------------------------
  // Session & Connection
  // --------------------------------------------------------------------------

  /**
   * Track app started
   * @param {{ version?: string }} props
   */
  appStarted: (props = {}) => {
    sessionStartTime = Date.now();
    track(EVENTS.APP_STARTED, {
      version: props.version,
    });
  },

  /**
   * Track app closed
   */
  appClosed: () => {
    const sessionDurationSec = sessionStartTime
      ? Math.round((Date.now() - sessionStartTime) / 1000)
      : null;

    track(EVENTS.APP_CLOSED, {
      session_duration_sec: sessionDurationSec,
    });
  },

  /**
   * Track robot connected
   * @param {{ mode: 'usb' | 'wifi' | 'simulation' }} props
   */
  robotConnected: props => {
    robotConnectedTime = Date.now();
    track(EVENTS.ROBOT_CONNECTED, {
      mode: validateConnectionMode(props.mode),
    });
  },

  /**
   * Track robot disconnected
   * @param {{ mode?: string, reason?: string }} props
   */
  robotDisconnected: (props = {}) => {
    const sessionDurationSec = robotConnectedTime
      ? Math.round((Date.now() - robotConnectedTime) / 1000)
      : null;

    track(EVENTS.ROBOT_DISCONNECTED, {
      mode: validateConnectionMode(props.mode),
      session_duration_sec: sessionDurationSec,
      reason: props.reason,
    });

    robotConnectedTime = null;
    robotAwakeTime = null;
  },

  /**
   * Track connection error
   * @param {{ mode?: string, error_type?: string }} props
   */
  connectionError: (props = {}) => {
    track(EVENTS.CONNECTION_ERROR, {
      mode: validateConnectionMode(props.mode),
      error_type: props.error_type,
    });
  },

  // --------------------------------------------------------------------------
  // Robot Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Track robot wake up
   */
  robotWakeUp: () => {
    robotAwakeTime = Date.now();
    track(EVENTS.ROBOT_WAKE_UP);
  },

  /**
   * Track robot go to sleep
   */
  robotGoToSleep: () => {
    const awakeDurationSec = robotAwakeTime
      ? Math.round((Date.now() - robotAwakeTime) / 1000)
      : null;

    track(EVENTS.ROBOT_GO_TO_SLEEP, {
      awake_duration_sec: awakeDurationSec,
    });

    robotAwakeTime = null;
  },

  // --------------------------------------------------------------------------
  // Features Usage
  // --------------------------------------------------------------------------

  /**
   * Track controller used
   * @param {{ control: 'joystick' | 'slider' | 'gamepad' | 'keyboard' }} props
   */
  controllerUsed: props => {
    track(EVENTS.CONTROLLER_USED, {
      control: validateControllerType(props.control),
    });
  },

  /**
   * Track expression played (emotion or dance)
   * @param {{ name: string, type: 'emotion' | 'dance' }} props
   */
  expressionPlayed: props => {
    track(EVENTS.EXPRESSION_PLAYED, {
      name: props.name,
      type: validateExpressionType(props.type),
    });
  },

  // --------------------------------------------------------------------------
  // App Store
  // --------------------------------------------------------------------------

  /**
   * Track HF app installed
   * @param {{ app_id: string, duration_sec?: number, success: boolean }} props
   */
  hfAppInstalled: props => {
    track(EVENTS.HF_APP_INSTALLED, {
      app_id: props.app_id,
      duration_sec: props.duration_sec,
      success: props.success,
    });
  },

  /**
   * Track HF app uninstalled
   * @param {{ app_id: string }} props
   */
  hfAppUninstalled: props => {
    track(EVENTS.HF_APP_UNINSTALLED, {
      app_id: props.app_id,
    });
  },

  /**
   * Track HF app started
   * @param {{ app_id: string }} props
   */
  hfAppStarted: props => {
    appStartTimes.set(props.app_id, Date.now());
    track(EVENTS.HF_APP_STARTED, {
      app_id: props.app_id,
    });
  },

  /**
   * Track HF app stopped
   * @param {{ app_id: string }} props
   */
  hfAppStopped: props => {
    const startTime = appStartTimes.get(props.app_id);
    const durationSec = startTime ? Math.round((Date.now() - startTime) / 1000) : null;

    track(EVENTS.HF_APP_STOPPED, {
      app_id: props.app_id,
      duration_sec: durationSec,
    });

    appStartTimes.delete(props.app_id);
  },

  /**
   * Track discover modal opened
   */
  discoverOpened: () => {
    track(EVENTS.DISCOVER_OPENED);
  },

  // --------------------------------------------------------------------------
  // Settings & UI
  // --------------------------------------------------------------------------

  /**
   * Track camera feed viewed
   */
  cameraFeedViewed: () => {
    track(EVENTS.CAMERA_FEED_VIEWED);
  },

  /**
   * Track settings opened
   */
  settingsOpened: () => {
    track(EVENTS.SETTINGS_OPENED);
  },

  /**
   * Track dark mode toggled
   * @param {{ enabled: boolean }} props
   */
  darkModeToggled: props => {
    track(EVENTS.DARK_MODE_TOGGLED, {
      enabled: props.enabled,
    });
  },

  // --------------------------------------------------------------------------
  // WiFi Setup
  // --------------------------------------------------------------------------

  /**
   * Track WiFi setup started
   */
  wifiSetupStarted: () => {
    track(EVENTS.WIFI_SETUP_STARTED);
  },

  /**
   * Track WiFi setup completed
   * @param {{ success: boolean }} props
   */
  wifiSetupCompleted: props => {
    track(EVENTS.WIFI_SETUP_COMPLETED, {
      success: props.success,
    });
  },
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default telemetry;
