/**
 * Diagnostic Export Utility.
 *
 * Generates a comprehensive diagnostic report for debugging and support.
 * Includes: system info, app state, daemon logs, frontend logs, app logs.
 */

import useAppStore from '../store/useAppStore';
import type { LogEntry } from '../types/store';

// Tauri's `getName()` and `getVersion()` are typed loosely (string).
// Browser-only APIs (`performance.memory`, `navigator.connection`) are
// represented through small structural interfaces below.

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface NavigatorConnection {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface SystemInfo {
  timestamp: string;
  timestampLocal: string;
  timezone: string;
  language: string;
  languages: ReadonlyArray<string>;
  screenResolution: string;
  screenColorDepth: number;
  windowSize: string;
  devicePixelRatio: number;
  online: boolean;
  cookiesEnabled: boolean;
  doNotTrack: string | null;
  hardware?: {
    cpuCores: number | string;
    maxTouchPoints: number;
  };
  memory?: {
    jsHeapSizeLimit: string;
    totalJSHeapSize: string;
    usedJSHeapSize: string;
  };
  network?: {
    effectiveType: string;
    downlink: string;
    rtt: string;
    saveData: boolean;
  };
  appVersion?: string;
  appName?: string;
  runtime?: {
    isTauri: boolean;
    nodeEnv: string;
    dev: boolean;
    sessionDuration: string;
  };
  os?: {
    type: string;
    version: string;
    arch: string;
    platform: string;
    family?: string;
    locale?: string;
    eol?: string;
    exeExtension?: string;
    hostname?: string;
  };
  browser?: {
    userAgent: string;
    platform: string;
  };
}

export type FrontendLog = LogEntry;
export type AppLog = LogEntry;
export type DaemonLog = LogEntry;

export interface DiagnosticSnapshot {
  robot: {
    status: string;
    connection_mode: string | null;
    is_usb_connected: boolean;
    usb_port: string | null;
    remote_host: string | null;
    daemon_version: string;
    is_crashed: boolean;
    consecutive_timeouts: number;
    hardware_error: { type?: string; message?: string; code?: string | null } | null;
    startup_error: string | null;
    is_app_running: boolean;
    current_app: string | null;
  };
  logs: {
    recent_errors: string[];
    recent_daemon: LogEntry[];
  };
  installed_apps: string[];
  session: {
    duration_minutes: number;
    timestamp: string;
  };
}

export interface DiagnosticReport {
  _meta: {
    version: string;
    generatedAt: string;
    purpose: string;
  };
  system: SystemInfo;
  robot: ReturnType<typeof getRobotState>;
  apps: ReturnType<typeof getAppsState>;
  logs: {
    daemonLogs: ReadonlyArray<DaemonLog>;
    frontendLogs: ReadonlyArray<FrontendLog>;
    appLogs: ReadonlyArray<AppLog>;
  };
}

/**
 * Get system information using the Tauri OS plugin for reliable data when
 * available, falling back to browser APIs.
 */
const getSystemInfo = async (): Promise<SystemInfo> => {
  const info: SystemInfo = {
    timestamp: new Date().toISOString(),
    timestampLocal: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    languages: navigator.languages || [navigator.language],
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    screenColorDepth: window.screen.colorDepth,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack ?? null,
  };

  info.hardware = {
    cpuCores: navigator.hardwareConcurrency || 'N/A',
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };

  const perfWithMemory = performance as Performance & { memory?: PerformanceMemory };
  if (perfWithMemory.memory) {
    info.memory = {
      jsHeapSizeLimit: `${(perfWithMemory.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
      totalJSHeapSize: `${(perfWithMemory.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      usedJSHeapSize: `${(perfWithMemory.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  const navWithConnection = navigator as Navigator & { connection?: NavigatorConnection };
  if (navWithConnection.connection) {
    info.network = {
      effectiveType: navWithConnection.connection.effectiveType ?? 'unknown',
      downlink: navWithConnection.connection.downlink
        ? `${navWithConnection.connection.downlink} Mbps`
        : 'unknown',
      rtt: navWithConnection.connection.rtt ? `${navWithConnection.connection.rtt} ms` : 'unknown',
      saveData: navWithConnection.connection.saveData ?? false,
    };
  }

  try {
    const { getVersion, getName } = await import('@tauri-apps/api/app');
    info.appVersion = await getVersion();
    info.appName = await getName();
  } catch {
    info.appVersion = 'N/A (web mode or error)';
    info.appName = 'N/A';
  }

  info.runtime = {
    isTauri: typeof window !== 'undefined' && '__TAURI__' in window,
    nodeEnv: import.meta.env?.MODE || 'unknown',
    dev: import.meta.env?.DEV || false,
    sessionDuration: `${(performance.now() / 1000 / 60).toFixed(2)} minutes`,
  };

  try {
    const { type, version, arch, platform, locale, hostname, family, eol, exeExtension } =
      await import('@tauri-apps/plugin-os');

    info.os = {
      type: await type(),
      version: await version(),
      arch: await arch(),
      platform: await platform(),
      family: await family(),
      locale: (await locale()) ?? undefined,
      eol: await eol(),
      exeExtension: await exeExtension(),
    };

    try {
      info.os.hostname = (await hostname()) ?? 'N/A';
    } catch {
      info.os.hostname = 'N/A';
    }

    info.browser = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
  } catch (e) {
    console.warn('Tauri OS plugin not available, falling back to browser info:', e);
    info.os = {
      type: 'unknown',
      version: 'N/A',
      arch: 'N/A',
      platform: navigator.platform,
      locale: navigator.language,
    };
    info.browser = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
  }

  return info;
};

/**
 * Generate a compact diagnostic snapshot for telemetry. Lightweight version of
 * the full report, designed to be sent with error events to PostHog.
 */
export const generateDiagnosticSnapshot = (): DiagnosticSnapshot => {
  const state = useAppStore.getState();

  const frontendLogs = (state.frontendLogs || []) as LogEntry[];
  const recentErrors = frontendLogs
    .filter(log => log.level === 'error' || log.level === 'warning')
    .slice(-20)
    .map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`);

  const daemonLogs = (state.logs || []) as LogEntry[];
  const recentDaemonLogs = daemonLogs.slice(-10);

  // `state.apps` is a legacy field; some slices expose `installedApps` instead.
  const installedAppsRaw = ((state as unknown as { installedApps?: Array<{ id: string }> })
    .installedApps ?? []) as Array<{
    id: string;
  }>;
  const installedAppIds = installedAppsRaw.map(app => app.id);

  const hardwareError = state.hardwareError as {
    type?: string;
    message?: string;
    code?: string | null;
  } | null;

  return {
    robot: {
      status: state.robotStatus,
      connection_mode: state.connectionMode ?? null,
      is_usb_connected: Boolean(state.isUsbConnected),
      usb_port: state.usbPortName || null,
      remote_host: state.remoteHost || null,
      daemon_version: state.daemonVersion || 'unknown',
      is_crashed: Boolean(state.isDaemonCrashed),
      consecutive_timeouts: state.consecutiveTimeouts ?? 0,
      hardware_error: hardwareError
        ? {
            type: hardwareError.type,
            message: hardwareError.message,
            code: hardwareError.code ?? null,
          }
        : null,
      startup_error: typeof state.startupError === 'string' ? state.startupError : null,
      is_app_running: Boolean(state.isAppRunning),
      current_app: state.currentAppName || null,
    },
    logs: {
      recent_errors: recentErrors,
      recent_daemon: recentDaemonLogs,
    },
    installed_apps: installedAppIds,
    session: {
      duration_minutes: Math.round(performance.now() / 1000 / 60),
      timestamp: new Date().toISOString(),
    },
  };
};

const getRobotState = () => {
  const state = useAppStore.getState();

  return {
    connectionMode: state.connectionMode,
    remoteHost: state.remoteHost,
    isUsbConnected: state.isUsbConnected,
    usbPortName: state.usbPortName,

    robotStatus: state.robotStatus,
    busyReason: state.busyReason,
    isActive: state.isActive,
    isStarting: state.isStarting,
    isStopping: state.isStopping,

    daemonVersion: state.daemonVersion,
    isDaemonCrashed: state.isDaemonCrashed,
    consecutiveTimeouts: state.consecutiveTimeouts,

    startupError: state.startupError,
    hardwareError: state.hardwareError,

    isAppRunning: state.isAppRunning,
    currentAppName: state.currentAppName,
    isInstalling: state.isInstalling,
    isCommandRunning: state.isCommandRunning,

    activeMoves: state.activeMoves,
  };
};

const getLogs = () => {
  const state = useAppStore.getState();

  return {
    daemonLogs: (state.logs || []) as ReadonlyArray<DaemonLog>,
    frontendLogs: (state.frontendLogs || []) as ReadonlyArray<FrontendLog>,
    appLogs: (state.appLogs || []) as ReadonlyArray<AppLog>,
  };
};

const getAppsState = () => {
  const state = useAppStore.getState();
  type AppRecord = {
    id: string;
    name: string;
    version?: string;
    source?: string;
    installed?: boolean;
  };

  const installedApps = ((state as unknown as { installedApps?: AppRecord[] }).installedApps ??
    []) as AppRecord[];
  const availableApps = ((state as unknown as { availableApps?: AppRecord[] }).availableApps ??
    []) as AppRecord[];

  return {
    installedApps: installedApps.map(app => ({
      id: app.id,
      name: app.name,
      version: app.version,
      source: app.source,
    })),
    totalApps: availableApps.length || installedApps.length,
    runningApp: state.currentAppName,
  };
};

export const generateDiagnosticReport = async (): Promise<DiagnosticReport> => {
  const report: DiagnosticReport = {
    _meta: {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      purpose: 'Reachy Mini Desktop App Diagnostic Report',
    },
    system: await getSystemInfo(),
    robot: getRobotState(),
    apps: getAppsState(),
    logs: getLogs(),
  };

  return report;
};

/** Format report as readable text (for quick viewing). */
export const formatReportAsText = (report: DiagnosticReport): string => {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('               REACHY MINI DIAGNOSTIC REPORT');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('');

  lines.push('SYSTEM INFO');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  Generated: ${report.system.timestampLocal}`);
  lines.push(`  Timezone: ${report.system.timezone}`);
  lines.push('');

  lines.push('  Application:');
  lines.push(`     Name: ${report.system.appName || 'N/A'}`);
  lines.push(`     Version: ${report.system.appVersion}`);
  if (report.system.runtime) {
    lines.push(`     Runtime: ${report.system.runtime.isTauri ? 'Tauri' : 'Web Browser'}`);
    lines.push(`     Mode: ${report.system.runtime.nodeEnv}`);
    lines.push(`     Development: ${report.system.runtime.dev ? 'Yes' : 'No'}`);
    lines.push(`     Session Duration: ${report.system.runtime.sessionDuration}`);
  }
  lines.push('');

  lines.push('  Operating System:');
  lines.push(`     Type: ${report.system.os?.type || 'unknown'}`);
  lines.push(`     Version: ${report.system.os?.version || 'unknown'}`);
  lines.push(`     Family: ${report.system.os?.family || 'unknown'}`);

  const arch = report.system.os?.arch || 'unknown';
  let archDisplay = arch;
  if (arch === 'aarch64' || arch === 'arm64') {
    archDisplay = `${arch} (Apple Silicon)`;
  } else if (arch === 'x86_64' || arch === 'x86' || arch === 'amd64') {
    archDisplay = `${arch} (Intel)`;
  }
  lines.push(`     Architecture: ${archDisplay}`);

  lines.push(`     Platform: ${report.system.os?.platform || 'unknown'}`);
  if (report.system.os?.hostname && report.system.os.hostname !== 'N/A') {
    lines.push(`     Hostname: ${report.system.os.hostname}`);
  }
  lines.push('');

  lines.push('  Localization:');
  lines.push(`     System Locale: ${report.system.os?.locale || 'unknown'}`);
  lines.push(`     Browser Language: ${report.system.language || 'unknown'}`);
  if (report.system.languages && report.system.languages.length > 0) {
    lines.push(`     Languages: ${report.system.languages.join(', ')}`);
  }
  lines.push('');

  if (report.system.hardware) {
    lines.push('  Hardware:');
    lines.push(`     CPU Cores: ${report.system.hardware.cpuCores}`);
    if (report.system.hardware.maxTouchPoints > 0) {
      lines.push(`     Touch Points: ${report.system.hardware.maxTouchPoints}`);
    }
    lines.push('');
  }

  if (report.system.memory) {
    lines.push('  Memory (JavaScript Heap):');
    lines.push(`     Limit: ${report.system.memory.jsHeapSizeLimit}`);
    lines.push(`     Total: ${report.system.memory.totalJSHeapSize}`);
    lines.push(`     Used: ${report.system.memory.usedJSHeapSize}`);
    lines.push('');
  }

  lines.push('  Display:');
  lines.push(`     Screen: ${report.system.screenResolution}`);
  lines.push(`     Color Depth: ${report.system.screenColorDepth}-bit`);
  lines.push(`     Window: ${report.system.windowSize}`);
  lines.push(`     Pixel Ratio: ${report.system.devicePixelRatio}x`);
  lines.push('');

  lines.push('  Network:');
  lines.push(`     Online: ${report.system.online ? 'Yes' : 'No'}`);
  if (report.system.network) {
    lines.push(`     Type: ${report.system.network.effectiveType}`);
    lines.push(`     Downlink: ${report.system.network.downlink}`);
    lines.push(`     RTT: ${report.system.network.rtt}`);
    lines.push(`     Save Data: ${report.system.network.saveData ? 'Yes' : 'No'}`);
  }
  lines.push('');

  lines.push('  Privacy & Security:');
  lines.push(`     Cookies Enabled: ${report.system.cookiesEnabled ? 'Yes' : 'No'}`);
  lines.push(`     Do Not Track: ${report.system.doNotTrack || 'Not set'}`);
  lines.push('');

  if (report.system.browser || report.system.os?.eol || report.system.os?.exeExtension) {
    lines.push('  Technical Details:');
    if (report.system.os?.eol) {
      const eolDisplay =
        report.system.os.eol === '\n'
          ? '\\n (Unix)'
          : report.system.os.eol === '\r\n'
            ? '\\r\\n (Windows)'
            : report.system.os.eol;
      lines.push(`     EOL Marker: ${eolDisplay}`);
    }
    if (report.system.os?.exeExtension !== undefined) {
      lines.push(`     Exe Extension: ${report.system.os.exeExtension || '(none)'}`);
    }
    if (report.system.browser) {
      lines.push(`     User Agent: ${report.system.browser.userAgent}`);
    }
    lines.push('');
  }

  lines.push('ROBOT STATE');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  Connection: ${report.robot.connectionMode || 'disconnected'}`);
  if (report.robot.remoteHost) lines.push(`  Remote Host: ${report.robot.remoteHost}`);
  if (report.robot.usbPortName) lines.push(`  USB Port: ${report.robot.usbPortName}`);
  lines.push(`  Status: ${report.robot.robotStatus}`);
  if (report.robot.busyReason) lines.push(`  Busy Reason: ${report.robot.busyReason}`);
  lines.push(`  Daemon Version: ${report.robot.daemonVersion || 'unknown'}`);
  lines.push(`  Is Active: ${report.robot.isActive}`);
  lines.push(`  Is Crashed: ${report.robot.isDaemonCrashed}`);
  if (report.robot.hardwareError) {
    lines.push(`  Hardware Error: ${JSON.stringify(report.robot.hardwareError)}`);
  }
  if (report.robot.startupError) {
    lines.push(`  Startup Error: ${report.robot.startupError}`);
  }
  lines.push('');

  lines.push('APPS');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  Total Apps: ${report.apps.totalApps}`);
  lines.push(`  Installed: ${report.apps.installedApps.length}`);
  lines.push(`  Running: ${report.apps.runningApp || 'none'}`);
  if (report.apps.installedApps.length > 0) {
    lines.push('  Installed Apps:');
    report.apps.installedApps.forEach(app => {
      lines.push(`    - ${app.name} (${app.id})`);
    });
  }
  lines.push('');

  lines.push('LOGS SUMMARY');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  Daemon Logs: ${report.logs.daemonLogs.length}`);
  lines.push(`  Frontend Logs: ${report.logs.frontendLogs.length}`);
  lines.push(`  App Logs: ${report.logs.appLogs.length}`);
  lines.push('');

  lines.push(`FRONTEND LOGS (${report.logs.frontendLogs.length} entries)`);
  lines.push('───────────────────────────────────────────────────────────────────');
  report.logs.frontendLogs.forEach(log => {
    const levelTag =
      log.level === 'error'
        ? '[ERROR]'
        : log.level === 'warning'
          ? '[WARN]'
          : log.level === 'success'
            ? '[OK]'
            : '[INFO]';
    lines.push(`  [${log.timestamp}] ${levelTag} ${log.message}`);
  });
  lines.push('');

  lines.push(`DAEMON LOGS (${report.logs.daemonLogs.length} entries)`);
  lines.push('───────────────────────────────────────────────────────────────────');
  report.logs.daemonLogs.forEach(log => {
    lines.push(`  [${log.timestamp}] ${log.message}`);
  });
  lines.push('');

  if (report.logs.appLogs.length > 0) {
    lines.push(`APP LOGS (${report.logs.appLogs.length} entries)`);
    lines.push('───────────────────────────────────────────────────────────────────');
    report.logs.appLogs.forEach(log => {
      const levelTag =
        log.level === 'error' ? '[ERROR]' : log.level === 'warning' ? '[WARN]' : '[INFO]';
      lines.push(`  [${log.timestamp}] ${levelTag} [${log.appName || 'unknown'}] ${log.message}`);
    });
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('                         END OF REPORT');
  lines.push('═══════════════════════════════════════════════════════════════════');

  return lines.join('\n');
};

export type DiagnosticFormat = 'json' | 'text';

export interface DownloadResult {
  success: boolean;
  filename?: string;
  error?: string;
}

/** Download the diagnostic report as a file. */
export const downloadDiagnosticReport = async (
  format: DiagnosticFormat = 'json'
): Promise<DownloadResult> => {
  try {
    const report = await generateDiagnosticReport();

    let content: string;
    let mimeType: string;
    let extension: string;

    if (format === 'text') {
      content = formatReportAsText(report);
      mimeType = 'text/plain';
      extension = 'txt';
    } else {
      content = JSON.stringify(report, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `reachy-mini-diagnostic-${timestamp}.${extension}`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, filename };
  } catch (error) {
    console.error('Failed to generate diagnostic report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Copy diagnostic report to clipboard (JSON format). */
export const copyDiagnosticToClipboard = async (): Promise<DownloadResult> => {
  try {
    const report = await generateDiagnosticReport();
    const content = JSON.stringify(report, null, 2);

    await navigator.clipboard.writeText(content);

    return { success: true };
  } catch (error) {
    console.error('Failed to copy diagnostic report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

declare global {
  interface Window {
    reachyDiagnostic?: {
      generate: typeof generateDiagnosticReport;
      download: typeof downloadDiagnosticReport;
      downloadText: () => Promise<DownloadResult>;
      downloadJson: () => Promise<DownloadResult>;
      copy: typeof copyDiagnosticToClipboard;
    };
  }
}

/**
 * Setup keyboard shortcut for diagnostic report download.
 * Uses the global toast system for notifications.
 */
export const setupDiagnosticShortcut = (): (() => void) | undefined => {
  if (typeof window === 'undefined') return undefined;

  window.reachyDiagnostic = {
    generate: generateDiagnosticReport,
    download: downloadDiagnosticReport,
    downloadText: () => downloadDiagnosticReport('text'),
    downloadJson: () => downloadDiagnosticReport('json'),
    copy: copyDiagnosticToClipboard,
  };

  // Secret keyboard shortcut: Ctrl+Shift+D (Cmd+Shift+D on Mac)
  const handleKeyDown = (e: KeyboardEvent): void => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    if (modifierKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();

      const store = useAppStore.getState();
      const showToast = store.showToast;

      showToast?.('Generating diagnostic report...', 'info');

      void downloadDiagnosticReport('text').then(result => {
        if (result.success) {
          showToast?.(`Downloaded: ${result.filename}`, 'success');
        } else {
          showToast?.(`Failed: ${result.error ?? 'unknown error'}`, 'error');
        }
      });
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => window.removeEventListener('keydown', handleKeyDown);
};

// Auto-setup on import (with HMR cleanup to prevent listener stacking)
const _cleanupDiagnosticShortcut: (() => void) | undefined =
  typeof window !== 'undefined' ? setupDiagnosticShortcut() : undefined;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _cleanupDiagnosticShortcut?.();
  });
  import.meta.hot.accept();
}

export default {
  generateDiagnosticReport,
  formatReportAsText,
  downloadDiagnosticReport,
  copyDiagnosticToClipboard,
  setupDiagnosticShortcut,
};
