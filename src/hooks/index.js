/**
 * Main barrel export for global hooks
 * Hooks specific to components/views are now located near their usage
 * 
 * Global hooks (used across multiple areas):
 * - daemon: App lifecycle management
 * - robot: Core robot commands and state (used globally)
 * - system: System-level utilities (logs, updater, USB, window resize)
 */

// Daemon
export { useDaemon, useDaemonHealthCheck } from './daemon';

// Robot (core - used globally)
export { useRobotCommands, useRobotState } from './robot';

// System (global utilities)
export { useLogs, useUpdater, useUsbDetection, useWindowResize } from './system';

