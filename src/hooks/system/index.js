/**
 * Barrel export for system-related hooks
 */
// Global system hooks
export { useLogs } from './useLogs';
export { useUpdater } from './useUpdater';
export { useUpdateViewState } from './useUpdateViewState';
export { useUsbDetection } from './useUsbDetection';
export { useWindowResize } from './useWindowResize';

// Note: useWindowSync, useWindowFocus moved to views/windows/hooks
// Note: useAudioControls moved to views/active-robot/audio/hooks
// Note: useAppLogs moved to views/active-robot/application-store/hooks
// Note: useInternetHealthcheck moved to views/update/hooks
export { useNetworkStatus } from './useNetworkStatus';

