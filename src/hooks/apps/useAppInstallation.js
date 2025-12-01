/**
 * App Installation Hook
 * 
 * Main entry point for app installation lifecycle management.
 * This is a thin wrapper around useInstallationLifecycle for backward compatibility.
 * 
 * @deprecated This hook is kept for backward compatibility.
 * The actual implementation is in useInstallationLifecycle.
 * 
 * @param {object} params - Hook parameters
 * @param {Map} params.activeJobs - Map of active installation jobs
 * @param {Array} params.installedApps - List of installed apps
 * @param {Function} params.showToast - Toast notification function
 * @param {Function} params.refreshApps - Function to refresh apps list
 * @param {Function} params.onInstallSuccess - Callback when installation succeeds
 */
export { useInstallationLifecycle as useAppInstallation } from './installation/useInstallationLifecycle';

