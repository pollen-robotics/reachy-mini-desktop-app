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
  lines.push(`  Daemon Logs: ${report.logs.daemonLogs.length}`);
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

// Expose to window for easy access from DevTools
if (typeof window !== 'undefined') {
  window.reachyDiagnostic = {
    generate: generateDiagnosticReport,
    download: downloadDiagnosticReport,
    downloadText: () => downloadDiagnosticReport('text'),
    downloadJson: () => downloadDiagnosticReport('json'),
    copy: copyDiagnosticToClipboard,
  };
  
  // Secret keyboard shortcut: Ctrl+Shift+D (Cmd+Shift+D on Mac)
  // Downloads diagnostic report as text file
  window.addEventListener('keydown', async (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;
    
    if (modifierKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      
      
      // Show a subtle notification
      const notification = document.createElement('div');
      notification.textContent = '📋 Generating diagnostic report...';
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        z-index: 99999;
        animation: fadeIn 0.3s ease;
      `;
      document.body.appendChild(notification);
      
      const result = await downloadDiagnosticReport('text');
      
      if (result.success) {
        notification.textContent = `✅ Downloaded: ${result.filename}`;
        notification.style.background = 'rgba(34, 197, 94, 0.9)';
      } else {
        notification.textContent = `❌ Failed: ${result.error}`;
        notification.style.background = 'rgba(239, 68, 68, 0.9)';
      }
      
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, 2000);
    }
  });
}

export default {
  generateDiagnosticReport,
  formatReportAsText,
  downloadDiagnosticReport,
  copyDiagnosticToClipboard,
};

