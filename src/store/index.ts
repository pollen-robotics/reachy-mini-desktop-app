/**
 * Store Index - Main export point for state management
 *
 * Architecture: Unified store with slices
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                        useStore                               │
 * │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
 * │  │ robotSlice  │ │  logsSlice  │ │   uiSlice   │ │appsSlice│ │
 * │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
 * │                                                               │
 * │  Cross-slice actions: resetAll()                              │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Usage:
 * ```ts
 * import { useStore } from '@store';
 *
 * // In component:
 * const isActive = useStore((s) => s.isActive);
 * const { resetAll, transitionTo } = useStore();
 * ```
 */

// Main store export
export { useStore, default } from './useStore';

// Slice exports (for advanced usage - e.g. testing)
export { createRobotSlice, createLogsSlice, createUISlice, createAppsSlice } from './slices';

// Selectors - derive state from robotStatus
export { selectIsBusy, selectIsReady } from './slices';
