/**
 * Diagnostic Export Utility
 * 
 * Generates a comprehensive diagnostic report for debugging and support.
 * Includes: system info, app state, daemon logs, frontend logs, app logs.
 */

import useAppStore from '../store/useAppStore';

/**
 * Get system information
 */
const getSystemInfo = async () => {
  const info = {
    timestamp: new Date().toISOString(),
    timestampLocal: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
  };

  // Try to get Tauri app version
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    info.appVersion = await getVersion();
  } catch (e) {
    info.appVersion = 'N/A (web mode or error)';
  }

  // Parse OS info from userAgent
  const ua = navigator.userAgent;
  let osName = 'unknown';
  let osVersion = 'unknown';
  
  if (ua.includes('Mac OS X')) {
    osName = 'macOS';
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (match) osVersion = match[1].replace(/_/g, '.');
  } else if (ua.includes('Windows')) {
    osName = 'Windows';
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    if (match) {
      const ntVersion = match[1];
      // Map NT versions to Windows versions
      const ntMap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
      osVersion = ntMap[ntVersion] || ntVersion;
    }
  } else if (ua.includes('Linux')) {
    osName = 'Linux';
  }
  
  info.os = {
    name: osName,
    version: osVersion,
    platform: navigator.platform,
  };

  return info;
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
    daemonLifecycleLogs: state.logs || [], // Tauri lifecycle messages (start/stop)
    daemonOutputLogs: state.daemonOutputLogs || [], // Real Python daemon stdout/stderr
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
  console.log('📋 Generating diagnostic report...');
  
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
  
  console.log('📋 Diagnostic report generated:', {
    daemonLifecycleLogs: report.logs.daemonLifecycleLogs.length,
    daemonOutputLogs: report.logs.daemonOutputLogs.length,
    frontendLogs: report.logs.frontendLogs.length,
    appLogs: report.logs.appLogs.length,
  });
  
  return report;
};

/**
 * Format report as readable text (for quick viewing)
 */
export const formatReportAsText = (report) => {
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
  lines.push(`  App Version: ${report.system.appVersion}`);
  lines.push(`  OS: ${report.system.os?.name || 'unknown'} ${report.system.os?.version || ''}`);
  lines.push(`  Platform: ${report.system.os?.platform || 'unknown'}`);
  lines.push(`  Screen: ${report.system.screenResolution}`);
  lines.push(`  Window: ${report.system.windowSize}`);
  lines.push('');
  
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
  lines.push(`  Daemon Lifecycle Logs: ${report.logs.daemonLifecycleLogs.length}`);
  lines.push(`  Daemon Output Logs: ${report.logs.daemonOutputLogs.length} (stdout/stderr)`);
  lines.push(`  Frontend Logs: ${report.logs.frontendLogs.length}`);
  lines.push(`  App Logs: ${report.logs.appLogs.length}`);
  lines.push('');
  
  // All Frontend Logs
  lines.push(`📝 FRONTEND LOGS (${report.logs.frontendLogs.length} entries)`);
  lines.push('───────────────────────────────────────────────────────────────────');
  report.logs.frontendLogs.forEach(log => {
    const levelIcon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : log.level === 'success' ? '✅' : '•';
    lines.push(`  [${log.timestamp}] ${levelIcon} ${log.message}`);
  });
  lines.push('');
  
  // Daemon Lifecycle Logs (Tauri start/stop messages)
  if (report.logs.daemonLifecycleLogs.length > 0) {
    lines.push(`🔧 DAEMON LIFECYCLE LOGS (${report.logs.daemonLifecycleLogs.length} entries)`);
    lines.push('───────────────────────────────────────────────────────────────────');
    report.logs.daemonLifecycleLogs.forEach(log => {
      lines.push(`  ${log}`);
    });
    lines.push('');
  }
  
  // Daemon Output Logs (Python stdout/stderr)
  if (report.logs.daemonOutputLogs.length > 0) {
    lines.push(`🖥️ DAEMON OUTPUT LOGS (${report.logs.daemonOutputLogs.length} entries)`);
    lines.push('───────────────────────────────────────────────────────────────────');
    report.logs.daemonOutputLogs.forEach(log => {
      const streamIcon = log.stream === 'stderr' ? '⚠️' : '•';
      lines.push(`  [${log.timestamp}] ${streamIcon} ${log.message}`);
    });
    lines.push('');
  }
  
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
    
    console.log(`📋 Diagnostic report downloaded: ${filename}`);
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
    console.log('📋 Diagnostic report copied to clipboard');
    return { success: true };
  } catch (error) {
    console.error('📋 Failed to copy diagnostic report:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Auto-download diagnostic report on critical errors
 * Tracks if we already downloaded to avoid spam
 */
let hasAutoDownloaded = false;
let autoDownloadTimeout = null;

const autoDownloadOnCriticalError = async (errorType = 'crash') => {
  // Only auto-download once per session
  if (hasAutoDownloaded) {
    console.log(`📋 Skipping auto-diagnostic (already downloaded this session)`);
    return;
  }
  
  // Debounce: wait 2s to see if more errors come (avoid multiple downloads)
  if (autoDownloadTimeout) {
    clearTimeout(autoDownloadTimeout);
  }
  
  autoDownloadTimeout = setTimeout(async () => {
    console.log(`📋 Critical error detected (${errorType}) - Auto-downloading diagnostic...`);
    hasAutoDownloaded = true;
    
    try {
      const result = await downloadDiagnosticReport('text');
      if (result.success) {
        console.log(`📋 Diagnostic auto-downloaded: ${result.filename}`);
      }
    } catch (error) {
      console.error('📋 Failed to auto-download diagnostic:', error);
    }
  }, 2000);
};

// Expose to window for easy access from DevTools
if (typeof window !== 'undefined') {
  window.reachyDiagnostic = {
    generate: generateDiagnosticReport,
    download: downloadDiagnosticReport,
    downloadText: () => downloadDiagnosticReport('text'),
    downloadJson: () => downloadDiagnosticReport('json'),
    copy: copyDiagnosticToClipboard,
    autoDownload: autoDownloadOnCriticalError, // Exposed for manual testing
  };
  
  // ============================================================================
  // AUTO-DOWNLOAD ON CRITICAL ERRORS
  // ============================================================================
  
  /**
   * Listen to Zustand store for critical errors and auto-download diagnostic
   * This helps with debugging by capturing state right before/during crashes
   */
  
  // Wait for store to be available
  const checkStoreInterval = setInterval(() => {
    try {
      const useAppStore = require('../store/useAppStore').default;
      if (!useAppStore) return;
      
      clearInterval(checkStoreInterval);
      
      let lastCrashState = false;
      let lastHardwareError = null;
      
      // Subscribe to store changes
      useAppStore.subscribe((state) => {
        // Detect daemon crash
        if (state.isDaemonCrashed && !lastCrashState) {
          console.warn('🚨 Daemon crash detected - auto-downloading diagnostic');
          autoDownloadOnCriticalError('daemon_crash');
        }
        lastCrashState = state.isDaemonCrashed;
        
        // Detect new hardware errors (not just state changes)
        if (state.hardwareError && state.hardwareError !== lastHardwareError) {
          console.warn('🚨 Hardware error detected - auto-downloading diagnostic');
          autoDownloadOnCriticalError('hardware_error');
        }
        lastHardwareError = state.hardwareError;
      });
      
      console.log('📋 Diagnostic auto-download enabled (on crashes/hardware errors)');
    } catch (error) {
      // Store not ready yet, will retry
    }
  }, 1000);
  
  // Clean up interval after 10s if store never loads
  setTimeout(() => clearInterval(checkStoreInterval), 10000);
  
  // ============================================================================
  // GLOBAL ERROR HANDLERS
  // ============================================================================
  
  /**
   * Catch unhandled errors and promise rejections
   * These could indicate frontend crashes
   */
  window.addEventListener('error', (event) => {
    // Only auto-download on critical errors (not minor script errors)
    if (event.error && event.error.stack) {
      console.error('🚨 Unhandled error:', event.error);
      // Uncomment if you want to auto-download on ANY JS error:
      // autoDownloadOnCriticalError('unhandled_error');
    }
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled promise rejection:', event.reason);
    // Uncomment if you want to auto-download on promise rejections:
    // autoDownloadOnCriticalError('unhandled_rejection');
  });
  
  // ============================================================================
  // KEYBOARD SHORTCUT
  // ============================================================================
  
  // Secret keyboard shortcut: Ctrl+Shift+D (Cmd+Shift+D on Mac)
  // Downloads diagnostic report as text file
  window.addEventListener('keydown', async (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;
    
    if (modifierKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      console.log('📋 Secret diagnostic shortcut triggered!');
      
      // Detect dark mode from system preference or localStorage
      const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      // Create notification with modern glass-morphism design
      const notification = document.createElement('div');
      
      // Container (for blur and shadow)
      notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100000;
        border-radius: 12px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: ${darkMode 
          ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
          : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)'};
        cursor: pointer;
        overflow: hidden;
      `;
      
      // Inner content
      const content = document.createElement('div');
      content.style.cssText = `
        position: relative;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.01em;
        background: ${darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)'};
        border: 1px solid ${darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.3)'};
        color: ${darkMode ? '#fbbf24' : '#d97706'};
        min-width: 240px;
        max-width: 400px;
        padding: 16px 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      // Progress bar at bottom
      const progressBar = document.createElement('div');
      progressBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        width: 100%;
        background: ${darkMode ? 'rgba(255, 149, 0, 0.8)' : 'rgba(255, 149, 0, 0.7)'};
        border-radius: 0 0 12px 12px;
        transition: width 3.5s linear;
      `;
      
      // Icon
      const icon = document.createElement('span');
      icon.textContent = '📋';
      icon.style.cssText = 'font-size: 18px;';
      
      // Message
      const message = document.createElement('span');
      message.textContent = 'Generating diagnostic report...';
      
      content.appendChild(progressBar);
      content.appendChild(icon);
      content.appendChild(message);
      notification.appendChild(content);
      document.body.appendChild(notification);
      
      // Animate progress bar
      setTimeout(() => {
        progressBar.style.width = '0%';
      }, 10);
      
      // Allow manual close
      notification.onclick = () => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      };
      
      const result = await downloadDiagnosticReport('text');
      
      // Update notification based on result
      if (result.success) {
        icon.textContent = '✓';
        message.textContent = `Downloaded: ${result.filename}`;
        content.style.background = darkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)';
        content.style.borderColor = darkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)';
        content.style.color = darkMode ? '#86efac' : '#16a34a';
        progressBar.style.background = darkMode ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.7)';
        progressBar.style.transition = 'none';
        progressBar.style.width = '100%';
      } else {
        icon.textContent = '✕';
        message.textContent = `Failed: ${result.error}`;
        content.style.background = darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
        content.style.borderColor = darkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)';
        content.style.color = darkMode ? '#fca5a5' : '#dc2626';
        progressBar.style.background = darkMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.7)';
        progressBar.style.transition = 'none';
        progressBar.style.width = '100%';
      }
      
      // Auto-hide after 3.5s
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, 3500);
    }
  });
}

export default {
  generateDiagnosticReport,
  formatReportAsText,
  downloadDiagnosticReport,
  copyDiagnosticToClipboard,
};

