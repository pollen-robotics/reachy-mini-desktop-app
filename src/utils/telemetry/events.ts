/**
 * Telemetry Events - All trackable events for Reachy Mini Control.
 *
 * Privacy-first analytics:
 * - No cookies, no fingerprinting, no device identifiers
 * - GDPR/CCPA compliant out-of-the-box
 * - Only aggregated, anonymized data
 */

// ============================================================================
// EVENT NAMES - Use these constants to avoid typos
// ============================================================================

export const EVENTS = {
  // Session & Connection
  APP_STARTED: 'app_started',
  APP_CLOSED: 'app_closed',
  ROBOT_CONNECTED: 'robot_connected',
  ROBOT_DISCONNECTED: 'robot_disconnected',
  CONNECTION_ERROR: 'connection_error',

  // Robot Lifecycle
  ROBOT_WAKE_UP: 'robot_wake_up',
  ROBOT_GO_TO_SLEEP: 'robot_go_to_sleep',

  // Features Usage
  CONTROLLER_USED: 'controller_used',
  EXPRESSION_PLAYED: 'expression_played',

  // App Store
  HF_APP_INSTALLED: 'hf_app_installed',
  HF_APP_UNINSTALLED: 'hf_app_uninstalled',
  HF_APP_STARTED: 'hf_app_started',
  HF_APP_STOPPED: 'hf_app_stopped',
  DISCOVER_OPENED: 'discover_opened',

  // Settings & UI
  CAMERA_FEED_VIEWED: 'camera_feed_viewed',
  SETTINGS_OPENED: 'settings_opened',
  DARK_MODE_TOGGLED: 'dark_mode_toggled',

  // WiFi Setup
  WIFI_SETUP_STARTED: 'wifi_setup_started',
  WIFI_SETUP_COMPLETED: 'wifi_setup_completed',

  // Crash Reporting
  APP_CRASH: 'app_crash',
  APP_CRASH_REPORT: 'app_crash_report',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ============================================================================
// PROPERTY VALIDATORS - Ensure clean data
// ============================================================================

export const CONNECTION_MODES = ['usb', 'wifi', 'simulation'] as const;
export type ConnectionMode = (typeof CONNECTION_MODES)[number];

export const CONTROLLER_TYPES = ['joystick', 'slider', 'gamepad', 'keyboard'] as const;
export type ControllerType = (typeof CONTROLLER_TYPES)[number];

export const EXPRESSION_TYPES = ['emotion', 'dance'] as const;
export type ExpressionType = (typeof EXPRESSION_TYPES)[number];

export const validateConnectionMode = (mode: string | null | undefined): ConnectionMode | null => {
  return mode != null && (CONNECTION_MODES as ReadonlyArray<string>).includes(mode)
    ? (mode as ConnectionMode)
    : null;
};

export const validateControllerType = (type: string | null | undefined): ControllerType | null => {
  return type != null && (CONTROLLER_TYPES as ReadonlyArray<string>).includes(type)
    ? (type as ControllerType)
    : null;
};

export const validateExpressionType = (type: string | null | undefined): ExpressionType | null => {
  return type != null && (EXPRESSION_TYPES as ReadonlyArray<string>).includes(type)
    ? (type as ExpressionType)
    : null;
};
