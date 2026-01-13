/**
 * Telemetry Events - All trackable events for Reachy Mini Control
 *
 * Privacy-first analytics using Aptabase:
 * - No cookies, no fingerprinting, no device identifiers
 * - GDPR/CCPA compliant out-of-the-box
 * - Only aggregated, anonymized data
 *
 * @see https://aptabase.com
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
};

// ============================================================================
// PROPERTY VALIDATORS - Ensure clean data
// ============================================================================

/**
 * Connection modes
 * @type {Array<string>}
 */
export const CONNECTION_MODES = ['usb', 'wifi', 'simulation'];

/**
 * Controller types
 * @type {Array<string>}
 */
export const CONTROLLER_TYPES = ['joystick', 'slider', 'gamepad', 'keyboard'];

/**
 * Expression types
 * @type {Array<string>}
 */
export const EXPRESSION_TYPES = ['emotion', 'dance'];

/**
 * Validate connection mode
 * @param {string} mode
 * @returns {string|null}
 */
export const validateConnectionMode = mode => {
  return CONNECTION_MODES.includes(mode) ? mode : null;
};

/**
 * Validate controller type
 * @param {string} type
 * @returns {string|null}
 */
export const validateControllerType = type => {
  return CONTROLLER_TYPES.includes(type) ? type : null;
};

/**
 * Validate expression type
 * @param {string} type
 * @returns {string|null}
 */
export const validateExpressionType = type => {
  return EXPRESSION_TYPES.includes(type) ? type : null;
};
