/**
 * Store Slices - Modular state management
 *
 * Each slice handles a specific domain:
 * - robotSlice: Robot connection, status, state machine
 * - logsSlice: Daemon, frontend, and app logs
 * - uiSlice: Theme, windows, UI state
 * - appsSlice: Application data and installation
 */

export { createRobotSlice } from './robotSlice';
export { createLogsSlice } from './logsSlice';
export { createUISlice, setupSystemPreferenceListener } from './uiSlice';
export { createAppsSlice } from './appsSlice';

// ============================================================================
// SELECTORS - Derive state from robotStatus (single source of truth)
// ============================================================================
export { selectIsBusy, selectIsReady } from './robotSlice';
