/**
 * useAppStore - Proxy to useStore for backwards compatibility
 *
 * This file exports useStore directly, maintaining the same API
 * that ~50 files in the codebase expect.
 *
 * The architecture uses a single store with slices:
 * - robotSlice: Robot connection, status, state machine
 * - logsSlice: Daemon, frontend, app logs
 * - uiSlice: Theme, windows, UI state
 * - appsSlice: Application data, installation
 *
 * For new code, prefer: `import { useStore } from '@store'`
 */

import { useStore } from './useStore';

// Re-export useStore as default for backwards compatibility
// All existing imports like `import useAppStore from '@store/useAppStore'` will work
export default useStore;

// Also export as named export for flexibility
export { useStore as useAppStore };
