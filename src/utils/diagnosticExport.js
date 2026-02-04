/**
 * Diagnostic Export Utility
 *
 * Generates a comprehensive diagnostic report for debugging and support.
 * Includes: system info, app state, daemon logs, frontend logs, app logs.
 */

import useAppStore from '../store/useAppStore';

/**
 * Get system information using Tauri OS plugin for reliable data
 */
const getSystemInfo = async () => {
  const info = {
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
    doNotTrack: navigator.doNotTrack,
  };

  // Hardware information (best effort via browser APIs)
  info.hardware = {
    cpuCores: navigator.hardwareConcurrency || 'N/A',
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };

  // Memory information (if available - Chrome/Edge only)
  if ('memory' in performance && performance.memory) {
    info.memory = {
      jsHeapSizeLimit: `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
      totalJSHeapSize: `${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      usedJSHeapSize: `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  // Connection information (if available)
  if ('connection' in navigator && navigator.connection) {
    info.network = {
      effectiveType: navigator.connection.effectiveType || 'unknown',
      downlink: navigator.connection.downlink ? `${navigator.connection.downlink} Mbps` : 'unknown',
      rtt: navigator.connection.rtt ? `${navigator.connection.rtt} ms` : 'unknown',
      saveData: navigator.connection.saveData || false,
    };
  }

  // Get Tauri app version and name
  try {
    const { getVersion, getName } = await import('@tauri-apps/api/app');
    info.appVersion = await getVersion();
    info.appName = await getName();
  } catch {
    info.appVersion = 'N/A (web mode or error)';
    info.appName = 'N/A';
  }

  // App runtime info
  info.runtime = {
    isTauri: typeof window !== 'undefined' && '__TAURI__' in window,
    nodeEnv: import.meta.env?.MODE || 'unknown',
    dev: import.meta.env?.DEV || false,
    sessionDuration: `${(performance.now() / 1000 / 60).toFixed(2)} minutes`,
  };

  // Get OS information from Tauri OS plugin (reliable, not spoofed by browser)
  try {
    const { type, version, arch, platform, locale, hostname, family, eol, exeExtension } =
      await import('@tauri-apps/plugin-os');

    info.os = {
      type: await type(), // 'macos' | 'windows' | 'linux' | 'ios' | 'android'
      version: await version(), // OS version (e.g., "14.1.0" for macOS Sonoma)
      arch: await arch(), // CPU architecture (e.g., "aarch64", "x86_64")
      platform: await platform(), // Platform info
      family: await family(), // 'unix' | 'windows'
      locale: await locale(), // System locale (e.g., "fr-FR")
      eol: await eol(), // End-of-line marker (\n or \r\n)
      exeExtension: await exeExtension(), // Executable extension ('' or 'exe')
    };

    // Try to get hostname (may fail on some systems)
    try {
      info.os.hostname = await hostname();
    } catch {
      info.os.hostname = 'N/A';
    }

    // Keep userAgent and platform for legacy/debugging purposes
    info.browser = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
  } catch (e) {
    // Fallback to browser info if Tauri OS plugin fails (web mode)
    console.warn('⚠️ Tauri OS plugin not available, falling back to browser info:', e);
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
 * Generate a compact diagnostic snapshot for telemetry
 * This is a lightweight version of the full diagnostic report
 * designed to be sent with error events to PostHog
 *
 * @returns {Object} Compact diagnostic snapshot
 */
export const generateDiagnosticSnapshot = () => {
  const state = useAppStore.getState();

  // Get recent error logs (last 20 errors/warnings only)
  const frontendLogs = state.frontendLogs || [];
  const recentErrors = frontendLogs
    .filter(log => log.level === 'error' || log.level === 'warning')
    .slice(-20)
    .map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`);

  // Get recent daemon logs (last 10 lines)
  const daemonLogs = state.logs || [];
  const recentDaemonLogs = daemonLogs.slice(-10);

  // Get installed app IDs only (compact)
  const installedAppIds = (state.apps || []).filter(app => app.installed).map(app => app.id);

  return {
    // Robot state (essential info only)
    robot: {
      status: state.robotStatus,
      connection_mode: state.connectionMode,
      is_usb_connected: state.isUsbConnected,
      usb_port: state.usbPortName || null,
      remote_host: state.remoteHost || null,
      daemon_version: state.daemonVersion || 'unknown',
      is_crashed: state.isDaemonCrashed,
      consecutive_timeouts: state.consecutiveTimeouts,
      hardware_error: state.hardwareError
        ? {
            type: state.hardwareError.type,
            message: state.hardwareError.message,
            code: state.hardwareError.code,
          }
        : null,
      startup_error: state.startupError || null,
      is_app_running: state.isAppRunning,
      current_app: state.currentAppName || null,
    },
    // Logs (compact)
    logs: {
      recent_errors: recentErrors,
      recent_daemon: recentDaemonLogs,
    },
    // Apps (IDs only)
    installed_apps: installedAppIds,
    // Session info
    session: {
      duration_minutes: Math.round(performance.now() / 1000 / 60),
      timestamp: new Date().toISOString(),
    },
  };
};

/**
 * Get robot/daemon state from the store
 */
const getRobotState = () => {
  const state = useAppStore.getState();

  return {
    // Connection
    connectionMode: state.connectionMode,
    remoteHost: state.remoteHost,
    isUsbConnected: state.isUsbConnected,
    usbPortName: state.usbPortName,

    // Status
    robotStatus: state.robotStatus,
    busyReason: state.busyReason,
    isActive: state.isActive,
    isStarting: state.isStarting,
    isStopping: state.isStopping,

    // Daemon
    daemonVersion: state.daemonVersion,
    isDaemonCrashed: state.isDaemonCrashed,
    consecutiveTimeouts: state.consecutiveTimeouts,

    // Errors
    startupError: state.startupError,
    hardwareError: state.hardwareError,

    // App
    isAppRunning: state.isAppRunning,
    currentAppName: state.currentAppName,
    isInstalling: state.isInstalling,
    isCommandRunning: state.isCommandRunning,

    // Active moves
    activeMoves: state.activeMoves,
  };
};

/**
 * Get logs from the store
 */
const getLogs = () => {
  const state = useAppStore.getState();

  return {
    daemonLogs: state.logs || [],
    frontendLogs: state.frontendLogs || [],
    appLogs: state.appLogs || [],
  };
};

/**
 * Get apps state
 */
const getAppsState = () => {
  const state = useAppStore.getState();

  return {
    installedApps: (state.apps || [])
      .filter(app => app.installed)
      .map(app => ({
        id: app.id,
        name: app.name,
        version: app.version,
        source: app.source,
      })),
    totalApps: (state.apps || []).length,
    runningApp: state.currentAppName,
  };
};

/**
 * Generate the full diagnostic report
 */
export const generateDiagnosticReport = async () => {
  const report = {
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

/**
 * Format report as readable text (for quick viewing)
 */
export const formatReportAsText = report => {
  const lines = [];

  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('               REACHY MINI DIAGNOSTIC REPORT');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('');

  // System Info
  lines.push('📍 SYSTEM INFO');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  Generated: ${report.system.timestampLocal}`);
  lines.push(`  Timezone: ${report.system.timezone}`);
  lines.push('');

  // Application Info
  lines.push('  📦 Application:');
  lines.push(`     Name: ${report.system.appName || 'N/A'}`);
  lines.push(`     Version: ${report.system.appVersion}`);
  if (report.system.runtime) {
    lines.push(`     Runtime: ${report.system.runtime.isTauri ? 'Tauri' : 'Web Browser'}`);
    lines.push(`     Mode: ${report.system.runtime.nodeEnv}`);
    lines.push(`     Development: ${report.system.runtime.dev ? 'Yes' : 'No'}`);
    lines.push(`     Session Duration: ${report.system.runtime.sessionDuration}`);
  }
  lines.push('');

  // Operating System
  lines.push('  💻 Operating System:');
  lines.push(`     Type: ${report.system.os?.type || 'unknown'}`);
  lines.push(`     Version: ${report.system.os?.version || 'unknown'}`);
  lines.push(`     Family: ${report.system.os?.family || 'unknown'}`);

  // Architecture with friendly name
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

  // Localization
  lines.push('  🌍 Localization:');
  lines.push(`     System Locale: ${report.system.os?.locale || 'unknown'}`);
  lines.push(`     Browser Language: ${report.system.language || 'unknown'}`);
  if (report.system.languages && report.system.languages.length > 0) {
    lines.push(`     Languages: ${report.system.languages.join(', ')}`);
  }
  lines.push('');

  // Hardware
  if (report.system.hardware) {
    lines.push('  ⚙️ Hardware:');
    lines.push(`     CPU Cores: ${report.system.hardware.cpuCores}`);
    if (report.system.hardware.maxTouchPoints > 0) {
      lines.push(`     Touch Points: ${report.system.hardware.maxTouchPoints}`);
    }
    lines.push('');
  }

  // Memory (if available)
  if (report.system.memory) {
    lines.push('  💾 Memory (JavaScript Heap):');
    lines.push(`     Limit: ${report.system.memory.jsHeapSizeLimit}`);
    lines.push(`     Total: ${report.system.memory.totalJSHeapSize}`);
    lines.push(`     Used: ${report.system.memory.usedJSHeapSize}`);
    lines.push('');
  }

  // Display
  lines.push('  🖥️ Display:');
  lines.push(`     Screen: ${report.system.screenResolution}`);
  lines.push(`     Color Depth: ${report.system.screenColorDepth}-bit`);
  lines.push(`     Window: ${report.system.windowSize}`);
  lines.push(`     Pixel Ratio: ${report.system.devicePixelRatio}x`);
  lines.push('');

  // Network
  lines.push('  🌐 Network:');
  lines.push(`     Online: ${report.system.online ? 'Yes' : 'No'}`);
  if (report.system.network) {
    lines.push(`     Type: ${report.system.network.effectiveType}`);
    lines.push(`     Downlink: ${report.system.network.downlink}`);
    lines.push(`     RTT: ${report.system.network.rtt}`);
    lines.push(`     Save Data: ${report.system.network.saveData ? 'Yes' : 'No'}`);
  }
  lines.push('');

  // Privacy & Security
  lines.push('  🔒 Privacy & Security:');
  lines.push(`     Cookies Enabled: ${report.system.cookiesEnabled ? 'Yes' : 'No'}`);
  lines.push(`     Do Not Track: ${report.system.doNotTrack || 'Not set'}`);
  lines.push('');

  // Technical Details
  if (report.system.browser || report.system.os?.eol || report.system.os?.exeExtension) {
    lines.push('  🔧 Technical Details:');
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

  // Robot State
  lines.push('🤖 ROBOT STATE');
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
    lines.push(`  ⚠️ Hardware Error: ${JSON.stringify(report.robot.hardwareError)}`);
  }
  if (report.robot.startupError) {
    lines.push(`  ⚠️ Startup Error: ${report.robot.startupError}`);
  }
  lines.push('');

  // Apps
  lines.push('📱 APPS');
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

  // Logs Summary
  lines.push('📜 LOGS SUMMARY');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  Daemon Logs: ${report.logs.daemonLogs.length}`);
  lines.push(`  Frontend Logs: ${report.logs.frontendLogs.length}`);
  lines.push(`  App Logs: ${report.logs.appLogs.length}`);
  lines.push('');

  // All Frontend Logs
  lines.push(`📝 FRONTEND LOGS (${report.logs.frontendLogs.length} entries)`);
  lines.push('───────────────────────────────────────────────────────────────────');
  report.logs.frontendLogs.forEach(log => {
    const levelIcon =
      log.level === 'error'
        ? '❌'
        : log.level === 'warning'
          ? '⚠️'
          : log.level === 'success'
            ? '✅'
            : '•';
    lines.push(`  [${log.timestamp}] ${levelIcon} ${log.message}`);
  });
  lines.push('');

  // All Daemon Logs
  lines.push(`🖥️ DAEMON LOGS (${report.logs.daemonLogs.length} entries)`);
  lines.push('───────────────────────────────────────────────────────────────────');
  report.logs.daemonLogs.forEach(log => {
    lines.push(`  ${log}`);
  });
  lines.push('');

  // All App Logs
  if (report.logs.appLogs.length > 0) {
    lines.push(`📱 APP LOGS (${report.logs.appLogs.length} entries)`);
    lines.push('───────────────────────────────────────────────────────────────────');
    report.logs.appLogs.forEach(log => {
      const levelIcon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : '•';
      lines.push(`  [${log.timestamp}] ${levelIcon} [${log.appName || 'unknown'}] ${log.message}`);
    });
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('                         END OF REPORT');
  lines.push('═══════════════════════════════════════════════════════════════════');

  return lines.join('\n');
};

/**
 * Download the diagnostic report as a file
 */
export const downloadDiagnosticReport = async (format = 'json') => {
  try {
    const report = await generateDiagnosticReport();

    let content;
    let mimeType;
    let extension;

    if (format === 'text') {
      content = formatReportAsText(report);
      mimeType = 'text/plain';
      extension = 'txt';
    } else {
      content = JSON.stringify(report, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `reachy-mini-diagnostic-${timestamp}.${extension}`;

    // Create blob and download
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
    console.error('📋 Failed to generate diagnostic report:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Copy diagnostic report to clipboard (JSON format)
 */
export const copyDiagnosticToClipboard = async () => {
  try {
    const report = await generateDiagnosticReport();
    const content = JSON.stringify(report, null, 2);

    await navigator.clipboard.writeText(content);

    return { success: true };
  } catch (error) {
    console.error('📋 Failed to copy diagnostic report:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Setup keyboard shortcut for diagnostic report download
 * Uses the global toast system for notifications
 */
export const setupDiagnosticShortcut = () => {
  if (typeof window === 'undefined') return;

  // Expose to window for easy access from DevTools
  window.reachyDiagnostic = {
    generate: generateDiagnosticReport,
    download: downloadDiagnosticReport,
    downloadText: () => downloadDiagnosticReport('text'),
    downloadJson: () => downloadDiagnosticReport('json'),
    copy: copyDiagnosticToClipboard,
  };

  // Secret keyboard shortcut: Ctrl+Shift+D (Cmd+Shift+D on Mac)
  // Downloads diagnostic report as text file
  const handleKeyDown = async e => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    if (modifierKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();

      // Get toast from store
      const store = useAppStore.getState();
      const showToast = store.showToast;

      showToast('📋 Generating diagnostic report...', 'info');

      const result = await downloadDiagnosticReport('text');

      if (result.success) {
        showToast(`✅ Downloaded: ${result.filename}`, 'success');
      } else {
        showToast(`❌ Failed: ${result.error}`, 'error');
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => window.removeEventListener('keydown', handleKeyDown);
};

// Auto-setup on import
if (typeof window !== 'undefined') {
  setupDiagnosticShortcut();
}

export default {
  generateDiagnosticReport,
  formatReportAsText,
  downloadDiagnosticReport,
  copyDiagnosticToClipboard,
  setupDiagnosticShortcut,
};
