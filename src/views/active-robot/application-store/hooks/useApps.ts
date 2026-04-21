import { useAppsStore } from './useAppsStore';

export function useApps(
  isActive: boolean,
  _official: boolean = true
): ReturnType<typeof useAppsStore> {
  void _official;
  return useAppsStore(isActive);
}
