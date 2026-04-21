/**
 * Telemetry Module - Privacy-first analytics for Reachy Mini Control.
 *
 * Uses PostHog for anonymous, aggregated analytics. Can be self-hosted for
 * full data ownership.
 *
 * Usage:
 *
 * ```ts
 * import { telemetry } from '@/utils/telemetry';
 * telemetry.appStarted({ version: '0.9.0' });
 * ```
 */

import { PostHog } from 'tauri-plugin-posthog-api';
import {
  EVENTS,
  validateConnectionMode,
  validateControllerType,
  validateExpressionType,
} from './events';
import {
  generateDiagnosticSnapshot,
  type DiagnosticSnapshot as ExternalDiagnosticSnapshot,
} from '../diagnosticExport';

export { EVENTS } from './events';
export type { ConnectionMode, ControllerType, ExpressionType, EventName } from './events';

type DiagnosticSnapshot = ExternalDiagnosticSnapshot;

// ============================================================================
// TELEMETRY CONSENT MANAGEMENT
// ============================================================================

const TELEMETRY_CONSENT_KEY = 'telemetry_enabled';

/**
 * Check if telemetry is enabled (opt-out approach).
 * Default: enabled (user can disable in settings).
 */
export const isTelemetryEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    return stored === null ? true : (JSON.parse(stored) as boolean);
  } catch {
    return true;
  }
};

export const setTelemetryEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, JSON.stringify(enabled));
    if (import.meta.env.DEV) {
      console.log(`[Telemetry] ${enabled ? 'Enabled' : 'Disabled'}`);
    }
  } catch (error) {
    console.warn('[Telemetry] Failed to save preference:', error);
  }
};

// ============================================================================
// CONTEXT PROPERTIES (sent with every event)
// ============================================================================

interface OSInfo {
  type: string;
  version: string;
  arch: string;
}

const getOSInfo = async (): Promise<OSInfo> => {
  try {
    const { type, version, arch } = await import('@tauri-apps/plugin-os');
    return {
      type: await type(),
      version: await version(),
      arch: await arch(),
    };
  } catch (error) {
    console.warn('[Telemetry] Failed to get OS from Tauri plugin, using fallback:', error);
    const userAgent = navigator.userAgent.toLowerCase();
    let inferredType = 'unknown';
    if (userAgent.includes('mac')) inferredType = 'macos';
    else if (userAgent.includes('win')) inferredType = 'windows';
    else if (userAgent.includes('linux')) inferredType = 'linux';

    return { type: inferredType, version: 'unknown', arch: 'unknown' };
  }
};

interface GlobalContext {
  os_type: string;
  os_version: string;
  os_arch: string;
  app_version: string;
  daemon_version: string;
}

let globalContext: GlobalContext = {
  os_type: 'unknown',
  os_version: 'unknown',
  os_arch: 'unknown',
  app_version: 'unknown',
  daemon_version: 'unknown',
};

interface InitTelemetryContext {
  appVersion?: string;
  daemonVersion?: string;
}

/**
 * Initialize telemetry context with app metadata.
 * Should be called once at app startup.
 */
export const initTelemetry = async (context: InitTelemetryContext): Promise<void> => {
  try {
    const osInfo = await getOSInfo();

    globalContext = {
      os_type: osInfo.type,
      os_version: osInfo.version,
      os_arch: osInfo.arch,
      app_version: context.appVersion ?? 'unknown',
      daemon_version: context.daemonVersion ?? 'unknown',
    };

    // Disable posthog-js autocapture (clicks, pageviews, pageleaves);
    // we only want explicitly tracked custom events.
    try {
      const ph = (await PostHog.getInstance()) as unknown as {
        set_config?: (cfg: Record<string, unknown>) => void;
      };
      if (ph?.set_config) {
        ph.set_config({
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
        });
      }
    } catch {
      // PostHog not ready yet - autocapture will remain on but is non-critical
    }

    if (import.meta.env.DEV) {
      console.log('[Telemetry] Context initialized:', globalContext);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Telemetry] Failed to initialize context:', error);
    }
  }
};

/**
 * Update telemetry context (e.g., when daemon version becomes available).
 */
export const updateTelemetryContext = async (updates: Partial<GlobalContext>): Promise<void> => {
  globalContext = { ...globalContext, ...updates };
  if (import.meta.env.DEV) {
    console.log('[Telemetry] Context updated:', globalContext);
  }
};

// ============================================================================
// TELEMETRY SINGLETON
// ============================================================================

let sessionStartTime: number | null = null;
let robotConnectedTime: number | null = null;
let robotAwakeTime: number | null = null;

const appStartTimes = new Map<string, number>();

type EventProps = Record<string, unknown>;

/**
 * Track an event safely (catches errors to avoid breaking the app).
 * Respects user's telemetry consent preference.
 */
const track = async (event: string, props: EventProps = {}): Promise<void> => {
  if (!isTelemetryEnabled()) {
    if (import.meta.env.DEV) {
      console.log(`[Telemetry] Skipped (disabled): ${event}`);
    }
    return;
  }

  try {
    const propsWithContext: EventProps = { ...globalContext, ...props };

    const cleanProps = Object.fromEntries(
      Object.entries(propsWithContext).filter(([, v]) => v !== undefined && v !== null)
    );

    await PostHog.capture(event, cleanProps);

    if (import.meta.env.DEV) {
      console.log(`[Telemetry] ${event}`, cleanProps);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[Telemetry] Failed to track ${event}:`, error);
    }
  }
};

// ============================================================================
// TELEMETRY API
// ============================================================================

interface AppStartedProps {
  version?: string;
}

interface RobotConnectedProps {
  mode: string;
}

interface RobotDisconnectedProps {
  mode?: string;
  reason?: string;
}

interface ConnectionErrorProps {
  mode?: string;
  error_type?: string;
  error_message?: string;
}

interface ControllerUsedProps {
  control: string;
}

interface ExpressionPlayedProps {
  name: string;
  type: string;
}

interface HfAppInstalledProps {
  app_id: string;
  duration_sec?: number;
  success: boolean;
}

interface HfAppIdProps {
  app_id: string;
}

interface DarkModeToggledProps {
  enabled: boolean;
}

interface WifiSetupCompletedProps {
  success: boolean;
}

interface AppCrashProps {
  error_type: string;
  error_message?: string;
  filename?: string;
  line?: number;
  col?: number;
  stack?: string;
}

interface AppCrashReportProps {
  panic_info?: string;
  log_tail?: string;
}

export const telemetry = {
  // --------------------------------------------------------------------------
  // Session & Connection
  // --------------------------------------------------------------------------

  appStarted: async (props: AppStartedProps = {}) => {
    sessionStartTime = Date.now();
    if (props.version) {
      await updateTelemetryContext({ app_version: props.version });
    }
    void track(EVENTS.APP_STARTED, { version: props.version });
  },

  appClosed: () => {
    const sessionDurationSec = sessionStartTime
      ? Math.round((Date.now() - sessionStartTime) / 1000)
      : null;
    void track(EVENTS.APP_CLOSED, { session_duration_sec: sessionDurationSec });
  },

  robotConnected: (props: RobotConnectedProps) => {
    robotConnectedTime = Date.now();
    void track(EVENTS.ROBOT_CONNECTED, { mode: validateConnectionMode(props.mode) });
  },

  robotDisconnected: (props: RobotDisconnectedProps = {}) => {
    const sessionDurationSec = robotConnectedTime
      ? Math.round((Date.now() - robotConnectedTime) / 1000)
      : null;

    void track(EVENTS.ROBOT_DISCONNECTED, {
      mode: validateConnectionMode(props.mode),
      session_duration_sec: sessionDurationSec,
      reason: props.reason,
    });

    robotConnectedTime = null;
    robotAwakeTime = null;
  },

  /**
   * Track connection error with diagnostic snapshot.
   * Automatically includes robot state, recent error logs, and session info
   * for better debugging in PostHog.
   */
  connectionError: (props: ConnectionErrorProps = {}) => {
    let diagnostic: DiagnosticSnapshot | null = null;
    try {
      diagnostic = generateDiagnosticSnapshot();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[Telemetry] Failed to generate diagnostic snapshot:', error);
      }
    }

    void track(EVENTS.CONNECTION_ERROR, {
      mode: validateConnectionMode(props.mode),
      error_type: props.error_type,
      error_message: props.error_message,
      diagnostic_robot: diagnostic?.robot ?? null,
      diagnostic_logs: diagnostic?.logs ?? null,
      diagnostic_installed_apps: diagnostic?.installed_apps ?? null,
      diagnostic_session: diagnostic?.session ?? null,
    });
  },

  // --------------------------------------------------------------------------
  // Robot Lifecycle
  // --------------------------------------------------------------------------

  robotWakeUp: () => {
    robotAwakeTime = Date.now();
    void track(EVENTS.ROBOT_WAKE_UP);
  },

  robotGoToSleep: () => {
    const awakeDurationSec = robotAwakeTime
      ? Math.round((Date.now() - robotAwakeTime) / 1000)
      : null;
    void track(EVENTS.ROBOT_GO_TO_SLEEP, { awake_duration_sec: awakeDurationSec });
    robotAwakeTime = null;
  },

  // --------------------------------------------------------------------------
  // Features Usage
  // --------------------------------------------------------------------------

  controllerUsed: (props: ControllerUsedProps) => {
    void track(EVENTS.CONTROLLER_USED, { control: validateControllerType(props.control) });
  },

  expressionPlayed: (props: ExpressionPlayedProps) => {
    void track(EVENTS.EXPRESSION_PLAYED, {
      name: props.name,
      type: validateExpressionType(props.type),
    });
  },

  // --------------------------------------------------------------------------
  // App Store
  // --------------------------------------------------------------------------

  hfAppInstalled: (props: HfAppInstalledProps) => {
    void track(EVENTS.HF_APP_INSTALLED, {
      app_id: props.app_id,
      duration_sec: props.duration_sec,
      success: props.success,
    });
  },

  hfAppUninstalled: (props: HfAppIdProps) => {
    void track(EVENTS.HF_APP_UNINSTALLED, { app_id: props.app_id });
  },

  hfAppStarted: (props: HfAppIdProps) => {
    appStartTimes.set(props.app_id, Date.now());
    void track(EVENTS.HF_APP_STARTED, { app_id: props.app_id });
  },

  hfAppStopped: (props: HfAppIdProps) => {
    const startTime = appStartTimes.get(props.app_id);
    const durationSec = startTime ? Math.round((Date.now() - startTime) / 1000) : null;
    void track(EVENTS.HF_APP_STOPPED, {
      app_id: props.app_id,
      duration_sec: durationSec,
    });
    appStartTimes.delete(props.app_id);
  },

  discoverOpened: () => {
    void track(EVENTS.DISCOVER_OPENED);
  },

  // --------------------------------------------------------------------------
  // Settings & UI
  // --------------------------------------------------------------------------

  cameraFeedViewed: () => {
    void track(EVENTS.CAMERA_FEED_VIEWED);
  },

  settingsOpened: () => {
    void track(EVENTS.SETTINGS_OPENED);
  },

  darkModeToggled: (props: DarkModeToggledProps) => {
    void track(EVENTS.DARK_MODE_TOGGLED, { enabled: props.enabled });
  },

  // --------------------------------------------------------------------------
  // WiFi Setup
  // --------------------------------------------------------------------------

  wifiSetupStarted: () => {
    void track(EVENTS.WIFI_SETUP_STARTED);
  },

  wifiSetupCompleted: (props: WifiSetupCompletedProps) => {
    void track(EVENTS.WIFI_SETUP_COMPLETED, { success: props.success });
  },

  // --------------------------------------------------------------------------
  // Crash Reporting
  // --------------------------------------------------------------------------

  appCrash: (props: AppCrashProps) => {
    void track(EVENTS.APP_CRASH, {
      error_type: props.error_type,
      error_message: props.error_message?.slice(0, 500),
      filename: props.filename,
      line: props.line,
      col: props.col,
      stack: props.stack?.slice(0, 1000),
    });
  },

  appCrashReport: (props: AppCrashReportProps = {}) => {
    void track(EVENTS.APP_CRASH_REPORT, {
      panic_info: props.panic_info?.slice(0, 1000),
      log_tail: props.log_tail?.slice(0, 2000),
    });
  },
} as const;

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

let globalErrorHandlersInstalled = false;

/**
 * Install global error handlers to catch uncaught JS errors and unhandled
 * promise rejections, then send them to telemetry.
 * Safe to call multiple times (idempotent).
 */
export const setupGlobalErrorHandlers = (): void => {
  if (globalErrorHandlersInstalled) return;
  globalErrorHandlersInstalled = true;

  window.addEventListener('error', event => {
    telemetry.appCrash({
      error_type: 'uncaught_error',
      error_message: event.message,
      filename: event.filename,
      line: event.lineno,
      col: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason as { stack?: string } | undefined;
    telemetry.appCrash({
      error_type: 'unhandled_rejection',
      error_message: String(event.reason),
      stack: reason?.stack,
    });
  });
};

// ============================================================================
// STARTUP CRASH DETECTION
// ============================================================================

interface CrashMarker {
  panic_info?: string;
  log_tail?: string;
}

/**
 * Check for a previous Rust-side crash (.crash_marker) and send it to telemetry.
 * The marker is written by the custom panic hook in `lib.rs`.
 * Should be called once at app startup.
 */
export const checkPreviousCrash = async (): Promise<void> => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<CrashMarker | null>('check_crash_marker');
    if (result) {
      telemetry.appCrashReport({
        panic_info: result.panic_info,
        log_tail: result.log_tail,
      });
    }
  } catch {
    // Not critical - silently ignore if the command doesn't exist or fails.
  }
};

export default telemetry;
