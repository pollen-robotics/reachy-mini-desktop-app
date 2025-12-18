/**
 * Main barrel export for global hooks
 * Hooks specific to components/views are now located near their usage
 * 
 * Global hooks (used across multiple areas):
 * - useConnection: 🔌 Unified connection interface (USB/WiFi/Simulation)
 * - daemon: App lifecycle management
 * - robot: Core robot commands and state (used globally)
 * - system: System-level utilities (logs, updater, USB, window resize)
 */

// 🔌 Connection (unified interface for USB/WiFi/Simulation)
export { useConnection, ConnectionMode } from './useConnection';

// Daemon (internal - prefer useConnection for new code)
export { useDaemon } from './daemon';

// Robot (core - used globally)
export { useRobotCommands, useRobotState } from './robot';

// System (global utilities)
export { useLogs, useUpdater, useUsbDetection, useWindowResize } from './system';

