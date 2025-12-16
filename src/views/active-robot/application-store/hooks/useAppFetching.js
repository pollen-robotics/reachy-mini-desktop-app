import { useCallback } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, fetchExternal } from '@config/daemon';
import { fetchHuggingFaceAppList } from '@utils/huggingFaceApi';

// Official app list URL - shared across functions
const OFFICIAL_APP_LIST_URL = 'https://huggingface.co/datasets/pollen-robotics/reachy-mini-official-app-store/raw/main/app-list.json';

/**
 * Hook for fetching apps from different sources
 * Handles official apps, all apps, and installed apps
 */
export function useAppFetching() {
  /**
   * Fetch the list of official app IDs from HF dataset
   * @returns {Promise<string[]>} Array of official app IDs
   */
  const fetchOfficialAppIds = useCallback(async () => {
    try {
      const listResponse = await fetchExternal(OFFICIAL_APP_LIST_URL, {}, DAEMON_CONFIG.TIMEOUTS.APPS_LIST, { silent: true });
      if (!listResponse.ok) {
        console.warn(`⚠️ Failed to fetch official app list: ${listResponse.status}`);
        return [];
      }
      const authorizedIds = await listResponse.json();
      return Array.isArray(authorizedIds) ? authorizedIds : [];
    } catch (err) {
      console.warn('⚠️ Failed to fetch official app IDs:', err.message);
      return [];
    }
  }, []);

  /**
   * Fetch official apps using daemon API (which filters by tag "reachy mini")
   * The daemon returns apps with complete metadata from /api/spaces, filtered correctly
   * This is more reliable than fetching /api/spaces directly (which has pagination/limits)
   * ✅ REFACTORED: Uses fetchOfficialAppIds to avoid code duplication
   */
  const fetchOfficialApps = useCallback(async () => {
    try {
      // 1. Fetch the list of official app IDs (reuse shared function)
      const authorizedIds = await fetchOfficialAppIds();
      
      if (authorizedIds.length === 0) {
        return [];
      }
      
      // 2. Fetch apps from daemon with source_kind=hf_space
      // The daemon filters by tag "reachy mini" and returns complete metadata
      let daemonSpaces = [];
      try {
        const daemonUrl = buildApiUrl('/api/apps/list-available/hf_space');
        const daemonResponse = await fetchWithTimeout(
          daemonUrl,
          {},
          DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
          { silent: true }
        );
        
        if (daemonResponse.ok) {
          daemonSpaces = await daemonResponse.json();
          console.log(`✅ Fetched ${daemonSpaces.length} hf_space apps from daemon (with complete metadata)`);
        } else {
          console.warn(`⚠️ Daemon returned ${daemonResponse.status}, falling back to /api/spaces`);
        }
      } catch (daemonErr) {
        console.warn('⚠️ Daemon not available, falling back to /api/spaces:', daemonErr.message);
      }
      
      // 3. Create a map of spaces by ID for fast lookup
      const spacesMap = new Map();
      for (const space of daemonSpaces) {
        if (space && space.id) {
          spacesMap.set(space.id, space);
        }
        // Also index by name (daemon might use name instead of full ID)
        if (space && space.name) {
          const fullId = space.id || `${space.extra?.id || space.name}`;
          if (fullId.includes('/')) {
            spacesMap.set(fullId, space);
          }
        }
      }
      
      // 4. Build AppInfo list - GUARANTEE all official apps are included
      const apps = [];
      for (const officialId of authorizedIds) {
        // Try to find by full ID first
        let space = spacesMap.get(officialId);
        
        // If not found, try to find by name (extract name from ID)
        if (!space) {
          const officialName = officialId.split('/').pop();
          space = daemonSpaces.find(s => 
            s.name === officialName || 
            s.id === officialId ||
            s.extra?.id === officialId
          );
        }
        
        if (space) {
          // App found in daemon response - use full metadata
          // The daemon already has the complete space object from /api/spaces
          // The space object from daemon IS the full /api/spaces response
          const spaceData = space.extra || space;
          
          apps.push({
            name: space.name || officialId.split('/').pop(),
            id: space.id || spaceData.id || officialId,
            description: space.description || spaceData.cardData?.short_description || '',
            url: space.url || `https://huggingface.co/spaces/${space.id || spaceData.id || officialId}`,
            source_kind: 'hf_space',
            extra: spaceData, // Keep full space data from /api/spaces (cardData, likes, lastModified, etc.)
          });
          
          console.log(`✅ Official app ${officialId} found in daemon:`, {
            name: space.name,
            id: space.id || spaceData.id,
            hasCardData: !!spaceData.cardData,
            hasLikes: spaceData.likes !== undefined,
            hasLastModified: !!spaceData.lastModified,
          });
        } else {
          // App not found in daemon - create minimal entry (shouldn't happen)
          console.warn(`⚠️ Official app ${officialId} not found in daemon response`);
          apps.push({
            name: officialId.split('/').pop(),
            id: officialId,
            description: '',
            url: `https://huggingface.co/spaces/${officialId}`,
            source_kind: 'hf_space',
            extra: {
              id: officialId,
              cardData: {},
            },
          });
        }
      }
      
      console.log(`✅ Built ${apps.length} official apps (${spacesMap.size} found in daemon)`);
      
      return apps;
    } catch (error) {
      // Handle network errors gracefully
      if (error.name === 'NetworkError' || error.isOffline || error.message?.includes('No internet connection')) {
        console.warn('⚠️ No internet connection, skipping official apps fetch');
        return [];
      }
      console.error('❌ Failed to fetch official apps:', error);
      return [];
    }
  }, [fetchOfficialAppIds]);
  
  /**
   * Fetch all apps from daemon (non-official mode)
   * Enriches apps with runtime data from Hugging Face API
   * ✅ FIXED: Excludes official apps to show only community/non-official apps
   */
  const fetchAllAppsFromDaemon = useCallback(async () => {
    try {
      const url = buildApiUrl(`/api/apps/list-available?official=false`);
      console.log(`🔄 Fetching all apps from daemon (non-official mode)`);
      const response = await fetchWithTimeout(
        url,
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true }
      );
      
      if (!response.ok) {
        console.warn('⚠️ Failed to fetch apps from daemon:', response.status);
        return [];
      }
      
      let daemonApps = await response.json();
      console.log(`✅ Fetched ${daemonApps.length} apps from daemon (before filtering)`);
      
      // ✅ FIX: Deduplicate apps by name (daemon returns duplicates from multiple sources)
      // Keep first occurrence - hf_space apps come first and have better metadata
      const seenNames = new Set();
      const beforeDedup = daemonApps.length;
      daemonApps = daemonApps.filter(app => {
        const name = app.name?.toLowerCase();
        if (!name || seenNames.has(name)) {
          return false;
        }
        seenNames.add(name);
        return true;
      });
      if (beforeDedup !== daemonApps.length) {
        console.log(`✅ Deduplicated ${beforeDedup - daemonApps.length} duplicate apps from daemon response`);
      }
      
      // ✅ FIX: Exclude apps with source_kind 'installed' - they will be fetched separately
      const beforeInstalledFilter = daemonApps.length;
      daemonApps = daemonApps.filter(app => app.source_kind !== 'installed');
      if (beforeInstalledFilter !== daemonApps.length) {
        console.log(`✅ Filtered out ${beforeInstalledFilter - daemonApps.length} 'installed' apps (fetched separately)`);
      }
      
      // ✅ FIX: Exclude official apps from the list
      // Fetch official app IDs to filter them out
      const officialAppIds = await fetchOfficialAppIds();
      if (officialAppIds.length > 0) {
        // Create a Set for faster lookup (normalize to lowercase)
        const officialIdsSet = new Set(officialAppIds.map(id => id.toLowerCase()));
        const officialNamesSet = new Set(officialAppIds.map(id => id.split('/').pop().toLowerCase()));
        
        const beforeCount = daemonApps.length;
        daemonApps = daemonApps.filter(app => {
          const appId = (app.id || app.extra?.id || '').toLowerCase();
          const appName = (app.name || '').toLowerCase();
          
          // Exclude if app ID matches official ID or if app name matches official app name
          const isOfficial = officialIdsSet.has(appId) || officialNamesSet.has(appName);
          return !isOfficial;
        });
        
        console.log(`✅ Filtered out ${beforeCount - daemonApps.length} official apps, ${daemonApps.length} non-official apps remaining`);
      }
      
      // Enrich non-official apps with runtime data from Hugging Face API
      // (backend doesn't provide runtime for non-official apps)
      const HF_SPACES_API_URL = 'https://huggingface.co/api/spaces';
      const runtimePromises = daemonApps.map(async (app) => {
        // Skip if already has runtime
        if (app.extra?.runtime) {
          return app;
        }
        
        // Get space ID from app.id (root level) or app.extra.id
        const spaceId = app.id || app.extra?.id;
        if (!spaceId) {
          console.warn(`⚠️ No ID found for app ${app.name}, skipping runtime enrichment`);
          return app;
        }
        
        try {
          // Build space ID (might be full path or just name)
          const fullSpaceId = spaceId.includes('/') ? spaceId : `pollen-robotics/${spaceId}`;
          console.log(`🔄 Fetching runtime for ${fullSpaceId}`);
          const spaceResponse = await fetchExternal(`${HF_SPACES_API_URL}/${fullSpaceId}`, {}, DAEMON_CONFIG.TIMEOUTS.APPS_LIST, { silent: true });
          if (spaceResponse.ok) {
            const spaceData = await spaceResponse.json();
            if (spaceData.runtime) {
              // Add runtime to extra
              app.extra = {
                ...app.extra,
                runtime: spaceData.runtime,
              };
              console.log(`✅ Added runtime for ${app.name}:`, spaceData.runtime);
            } else {
              console.log(`⚠️ No runtime data in API response for ${app.name}`);
            }
          } else {
            console.warn(`⚠️ Failed to fetch runtime for ${fullSpaceId}: ${spaceResponse.status}`);
          }
        } catch (err) {
          console.warn(`⚠️ Error fetching runtime for ${app.name}:`, err.message);
        }
        return app;
      });
      
      daemonApps = await Promise.all(runtimePromises);
      const appsWithRuntime = daemonApps.filter(app => app.extra?.runtime).length;
      console.log(`✅ Enriched ${appsWithRuntime}/${daemonApps.length} apps with runtime data`);
      
      return daemonApps;
    } catch (daemonErr) {
      console.warn('⚠️ Daemon not available:', daemonErr.message);
      return [];
    }
  }, [fetchOfficialAppIds]);
  
  /**
   * Fetch installed apps from daemon
   * ✅ IMPROVED: Better error handling, retry with backoff, distinguishes errors from empty list
   */
  const fetchInstalledApps = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 3000]; // Exponential backoff: 1s, 2s, 3s
    
    try {
      const installedUrl = buildApiUrl('/api/apps/list-available/installed');
      const installedResponse = await fetchWithTimeout(
        installedUrl,
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true } // Silent to avoid log spam (this endpoint is called frequently)
      );
      
      if (installedResponse.ok) {
        const rawInstalledApps = await installedResponse.json();
        // Keep source_kind from daemon (or default to 'local' if not set)
        const installedApps = rawInstalledApps.map(app => ({
          ...app,
          source_kind: app.source_kind || 'local',
        }));
        return { apps: installedApps, error: null };
      }
      
      // Non-OK response: distinguish between error and empty list
      if (installedResponse.status >= 500) {
        // Server error - retry if possible
        if (retryCount < MAX_RETRIES) {
          console.log(`⚠️ Server error ${installedResponse.status} fetching installed apps, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
          return fetchInstalledApps(retryCount + 1);
        }
        console.error(`❌ Failed to fetch installed apps after ${MAX_RETRIES} retries: HTTP ${installedResponse.status}`);
        return { apps: [], error: `Server error: ${installedResponse.status}` };
      }
      
      // Client error (4xx) or other - don't retry, but log it
      console.warn(`⚠️ Failed to fetch installed apps: HTTP ${installedResponse.status}`);
      return { apps: [], error: `HTTP ${installedResponse.status}` };
    } catch (err) {
      // Network/timeout/connection error - retry if possible
      // ✅ IMPROVED: Also retry on "Load failed" and connection errors (daemon not ready yet)
      const isRetryableError = 
        err.name === 'TimeoutError' || 
        err.name === 'AbortError' || 
        err.message?.includes('timeout') ||
        err.message?.includes('Load failed') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('ECONNREFUSED');
      
      if (retryCount < MAX_RETRIES && isRetryableError) {
        console.log(`⚠️ Connection error fetching installed apps (daemon may not be ready), retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
        return fetchInstalledApps(retryCount + 1);
      }
      
      // Other errors or max retries reached
      console.error(`❌ Failed to fetch installed apps${retryCount > 0 ? ` after ${retryCount} retries` : ''}:`, err.message);
      return { apps: [], error: err.message };
    }
  }, []);
  
  return {
    fetchOfficialApps,
    fetchAllAppsFromDaemon,
    fetchInstalledApps,
  };
}

