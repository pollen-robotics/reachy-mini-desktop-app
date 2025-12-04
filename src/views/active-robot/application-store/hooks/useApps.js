/**
 * ✅ REFACTORED: Simplified hook that uses centralized store
 * 
 * This hook is now a thin wrapper around useAppsStore which manages
 * all app state in the global store. This ensures:
 * - Single source of truth
 * - Shared cache across all components
 * - No duplicate fetches
 * - Better performance
 * 
 * @deprecated For new code, consider using useAppsStore directly
 * This hook is kept for backward compatibility
 */
import { useAppsStore } from './useAppsStore';

export function useApps(isActive, official = true) {
  // Delegate to centralized store hook
  return useAppsStore(isActive, official);
}

