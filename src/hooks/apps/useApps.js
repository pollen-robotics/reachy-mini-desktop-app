import { useState, useEffect, useCallback, useRef } from 'react';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, fetchExternal } from '../../config/daemon';
import { fetchHuggingFaceAppList } from '../../utils/huggingFaceApi';

/**
 * Hook to manage applications (list, installation, launch)
 * Integrated with the FastAPI daemon API
 */
export function useApps(isActive, official = true) {
  const appStore = useAppStore();
  const { addFrontendLog } = appStore; // ⚡ Destructure for compatibility
  const [availableApps, setAvailableApps] = useState([]);
  const [installedApps, setInstalledApps] = useState([]);
  const [currentApp, setCurrentApp] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // ✅ Initialize to true to show spinner at start
  const [error, setError] = useState(null);
  
  // Active jobs (installations/uninstallations)
  const [activeJobs, setActiveJobs] = useState(new Map()); // job_id -> { type: 'install'/'remove', appName, status, logs }
  const jobPollingIntervals = useRef(new Map());
  
  /**
   * ✅ OPTIMIZED: Fetch official apps using daemon API (which filters by tag "reachy mini")
   * The daemon returns apps with complete metadata from /api/spaces, filtered correctly
   * This is more reliable than fetching /api/spaces directly (which has pagination/limits)
   */
  const fetchOfficialApps = useCallback(async () => {
    const OFFICIAL_APP_LIST_URL = 'https://huggingface.co/datasets/pollen-robotics/reachy-mini-official-app-store/raw/main/app-list.json';
    
    try {
      // 1. Fetch the list of official app IDs (authorized list)
      const listResponse = await fetchExternal(OFFICIAL_APP_LIST_URL, {}, DAEMON_CONFIG.TIMEOUTS.APPS_LIST, { silent: true });
      if (!listResponse.ok) {
        throw new Error(`Failed to fetch official app list: ${listResponse.status}`);
      }
      const authorizedIds = await listResponse.json();
      
      if (!Array.isArray(authorizedIds) || authorizedIds.length === 0) {
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
          // ✅ App found in daemon response - use full metadata
          // The daemon already has the complete space object from /api/spaces
          // The space object from daemon IS the full /api/spaces response
          const spaceData = space.extra || space;
          
          apps.push({
            name: space.name || officialId.split('/').pop(),
            id: space.id || spaceData.id || officialId,
            description: space.description || spaceData.cardData?.short_description || '',
            url: space.url || `https://huggingface.co/spaces/${space.id || spaceData.id || officialId}`,
            source_kind: 'hf_space',
            extra: spaceData, // ✅ Keep full space data from /api/spaces (cardData, likes, lastModified, etc.)
          });
          
          console.log(`✅ Official app ${officialId} found in daemon:`, {
            name: space.name,
            id: space.id || spaceData.id,
            hasCardData: !!spaceData.cardData,
            hasLikes: spaceData.likes !== undefined,
            hasLastModified: !!spaceData.lastModified,
          });
        } else {
          // ⚠️ App not found in daemon - create minimal entry (shouldn't happen)
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
  }, []);
  
  /**
   * Fetch all available apps
   * Combines apps from Hugging Face dataset with installed apps from daemon
   * @param {boolean} official - If true, fetch only official apps directly from HF. If false, fetch all apps from daemon.
   */
  const fetchAvailableApps = useCallback(async (officialParam = official) => {
    try {
      setIsLoading(true);
      
      let daemonApps = [];
      let installedAppsFromDaemon = [];
      
      if (officialParam) {
        // ✅ Fetch official apps from HF official app store JSON
        // Source de vérité : https://huggingface.co/datasets/pollen-robotics/reachy-mini-official-app-store/raw/main/app-list.json
        console.log(`🔄 Fetching official apps from HF app store`);
        daemonApps = await fetchOfficialApps();
        console.log(`✅ Fetched ${daemonApps.length} official apps from HF app store`);
        
        // Also fetch installed apps from daemon
        try {
          const installedUrl = buildApiUrl('/api/apps/list-available/installed');
          const installedResponse = await fetchWithTimeout(
            installedUrl,
            {},
            DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
            { silent: true }
          );
          if (installedResponse.ok) {
            const rawInstalledApps = await installedResponse.json();
            // ✅ Keep source_kind from daemon (or default to 'local' if not set)
            installedAppsFromDaemon = rawInstalledApps.map(app => ({
              ...app,
              source_kind: app.source_kind || 'local',
            }));
            console.log(`✅ Fetched ${installedAppsFromDaemon.length} installed apps from daemon`);
          }
        } catch (err) {
          console.warn('⚠️ Failed to fetch installed apps:', err.message);
        }
      } else {
        // Fetch all apps from daemon
        try {
          const url = buildApiUrl(`/api/apps/list-available?official=false`);
          console.log(`🔄 Fetching all apps from daemon`);
        const response = await fetchWithTimeout(
            url,
          {},
          DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
          { silent: true } // ⚡ Silent polling
        );
        
        if (response.ok) {
          daemonApps = await response.json();
            console.log(`✅ Fetched ${daemonApps.length} apps from daemon`);
            
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
        } else {
          console.warn('⚠️ Failed to fetch apps from daemon:', response.status);
        }
      } catch (daemonErr) {
        console.warn('⚠️ Daemon not available:', daemonErr.message);
        }
      }
      
      // ✅ REFACTORED: Create a set of installed app names for fast lookup
      // This is used to set the isInstalled flag on apps
      const installedAppNames = new Set(
        installedAppsFromDaemon.map(app => app.name?.toLowerCase()).filter(Boolean)
      );
      
      // ✅ For official mode: Only add installed apps that are NOT official
      // Official apps are ALWAYS in the list (from fetchOfficialApps)
      // We just mark them as installed if they're in installedAppsFromDaemon
      if (officialParam && installedAppsFromDaemon.length > 0) {
        const daemonAppNames = new Set(daemonApps.map(app => app.name?.toLowerCase()));
        const uniqueInstalledApps = installedAppsFromDaemon
          .filter(installedApp => !daemonAppNames.has(installedApp.name?.toLowerCase()))
          .map(installedApp => ({
            ...installedApp,
            source_kind: installedApp.source_kind || 'local',
          }));
        
        // Only add non-official installed apps
        daemonApps = [...daemonApps, ...uniqueInstalledApps];
      }
      
      // 2. Fetch metadata from Hugging Face dataset (to enrich with likes, downloads, etc.)
      let hfApps = [];
      try {
        hfApps = await fetchHuggingFaceAppList();
      } catch (hfErr) {
        console.warn('⚠️ Failed to fetch Hugging Face metadata:', hfErr.message);
      }
      
      // 3. Create a map of HF metadata for fast lookup
      const hfMetadataMap = new Map();
      hfApps.forEach(hfApp => {
        // Index by id FIRST (primary identifier in Hugging Face)
        if (hfApp.id) {
          hfMetadataMap.set(hfApp.id, hfApp);
          hfMetadataMap.set(hfApp.id.toLowerCase(), hfApp);
          // Also index normalized versions (replace underscores/dashes)
          const normalizedId = hfApp.id.replace(/[_-]/g, '').toLowerCase();
          if (normalizedId !== hfApp.id.toLowerCase()) {
            hfMetadataMap.set(normalizedId, hfApp);
          }
          // Index with underscores replaced by dashes and vice versa
          const idWithDashes = hfApp.id.replace(/_/g, '-');
          const idWithUnderscores = hfApp.id.replace(/-/g, '_');
          if (idWithDashes !== hfApp.id) {
            hfMetadataMap.set(idWithDashes, hfApp);
            hfMetadataMap.set(idWithDashes.toLowerCase(), hfApp);
          }
          if (idWithUnderscores !== hfApp.id) {
            hfMetadataMap.set(idWithUnderscores, hfApp);
            hfMetadataMap.set(idWithUnderscores.toLowerCase(), hfApp);
          }
        }
        // Also index by name (secondary)
        if (hfApp.name) {
          hfMetadataMap.set(hfApp.name, hfApp);
          hfMetadataMap.set(hfApp.name.toLowerCase(), hfApp);
          // Also index normalized versions (replace underscores/dashes)
          const normalizedName = hfApp.name.replace(/[_-]/g, '').toLowerCase();
          if (normalizedName !== hfApp.name.toLowerCase()) {
            hfMetadataMap.set(normalizedName, hfApp);
          }
          // Index with underscores replaced by dashes and vice versa
          const nameWithDashes = hfApp.name.replace(/_/g, '-');
          const nameWithUnderscores = hfApp.name.replace(/-/g, '_');
          if (nameWithDashes !== hfApp.name) {
            hfMetadataMap.set(nameWithDashes, hfApp);
            hfMetadataMap.set(nameWithDashes.toLowerCase(), hfApp);
          }
          if (nameWithUnderscores !== hfApp.name) {
            hfMetadataMap.set(nameWithUnderscores, hfApp);
            hfMetadataMap.set(nameWithUnderscores.toLowerCase(), hfApp);
          }
        }
      });
      
      // 4. Enrich daemon apps with HF metadata
      const enrichedApps = daemonApps.map(daemonApp => {
        // ✅ PRIORITY: For official apps, metadata already comes from /api/spaces in daemonApp.extra
        // Check if this is an official app with metadata from /api/spaces
        // Official apps from fetchOfficialApps have: 
        // - source_kind: 'hf_space'
        // - extra.id (full space ID like "pollen-robotics/app-name")
        // - extra.cardData (from /api/spaces)
        // - extra.likes, extra.lastModified, etc.
        const isOfficialAppWithSpacesData = daemonApp.source_kind === 'hf_space' &&
          daemonApp.extra && 
          daemonApp.extra.id && 
          daemonApp.extra.id.includes('/'); // Full ID format: "pollen-robotics/app-name"
        
        let hfMetadata = null;
        
        // ✅ For official apps: use metadata directly from /api/spaces (already in daemonApp.extra)
        if (isOfficialAppWithSpacesData) {
          // Extract metadata from the space object structure (from /api/spaces)
          // daemonApp.extra IS the full space object from /api/spaces
          const spaceData = daemonApp.extra;
          hfMetadata = {
            id: spaceData.id,
            name: spaceData.id?.split('/').pop(),
            description: spaceData.cardData?.short_description,
            icon: spaceData.cardData?.emoji,
            likes: spaceData.likes,
            lastModified: spaceData.lastModified,
            runtime: spaceData.runtime,
            // Keep full space data for reference
            _spaceData: spaceData,
          };
          console.log(`✅ Using /api/spaces metadata for official app: ${daemonApp.name}`, {
            id: spaceData.id,
            hasCardData: !!spaceData.cardData,
            hasLastModified: !!spaceData.lastModified,
            likes: spaceData.likes,
            cardData: spaceData.cardData,
            fullSpaceData: spaceData, // Debug: show full structure
          });
        } else {
          // Only search in hfMetadataMap for non-official apps
          // Find corresponding HF metadata (try multiple matching strategies)
          // Priority: id > normalized id > name > normalized name > variants
          const normalizedDaemonName = daemonApp.name ? daemonApp.name.replace(/[_-]/g, '').toLowerCase() : null;
          const normalizedDaemonId = daemonApp.id ? daemonApp.id.replace(/[_-]/g, '').toLowerCase() : null;
          const daemonNameWithDashes = daemonApp.name ? daemonApp.name.replace(/_/g, '-') : null;
          const daemonNameWithUnderscores = daemonApp.name ? daemonApp.name.replace(/-/g, '_') : null;
          const daemonIdWithDashes = daemonApp.id ? daemonApp.id.replace(/_/g, '-') : null;
          const daemonIdWithUnderscores = daemonApp.id ? daemonApp.id.replace(/-/g, '_') : null;
          
          hfMetadata = 
            // Try by id first (most reliable)
            hfMetadataMap.get(daemonApp.id) ||
            hfMetadataMap.get(daemonApp.id?.toLowerCase()) ||
            hfMetadataMap.get(normalizedDaemonId) ||
            hfMetadataMap.get(daemonIdWithDashes) ||
            hfMetadataMap.get(daemonIdWithDashes?.toLowerCase()) ||
            hfMetadataMap.get(daemonIdWithUnderscores) ||
            hfMetadataMap.get(daemonIdWithUnderscores?.toLowerCase()) ||
            // Then try by name
            hfMetadataMap.get(daemonApp.name) ||
            hfMetadataMap.get(daemonApp.name?.toLowerCase()) ||
            hfMetadataMap.get(normalizedDaemonName) ||
            hfMetadataMap.get(daemonNameWithDashes) ||
            hfMetadataMap.get(daemonNameWithDashes?.toLowerCase()) ||
            hfMetadataMap.get(daemonNameWithUnderscores) ||
            hfMetadataMap.get(daemonNameWithUnderscores?.toLowerCase()) ||
            // Fallback: try to find by partial match (contains)
            (daemonApp.name ? hfApps.find(hfApp => 
              (hfApp.id && (hfApp.id.toLowerCase().includes(daemonApp.name.toLowerCase()) || 
                            daemonApp.name.toLowerCase().includes(hfApp.id.toLowerCase()))) ||
              (hfApp.name && (hfApp.name.toLowerCase().includes(daemonApp.name.toLowerCase()) || 
                              daemonApp.name.toLowerCase().includes(hfApp.name.toLowerCase())))
            ) : null);
        }
        
        
        // Consolidate runtime: priority is daemonApp.extra.runtime (from backend or fetchOfficialApps)
        // This ensures runtime is preserved for both official and non-official apps
        const consolidatedRuntime = daemonApp.extra?.runtime || hfMetadata?.runtime || null;
        
        // Debug: log runtime data for troubleshooting
        if (daemonApp.name && (daemonApp.extra?.runtime || hfMetadata?.runtime)) {
          console.log(`🔍 Runtime for "${daemonApp.name}":`, {
            fromDaemon: daemonApp.extra?.runtime,
            fromHF: hfMetadata?.runtime,
            consolidated: consolidatedRuntime,
          });
        }
        
        // ✅ REFACTORED: Determine if app is installed (check by name)
        const isInstalled = installedAppNames.has(daemonApp.name?.toLowerCase());
        
        // Build enriched app
        // ✅ For official apps: metadata comes from /api/spaces (in daemonApp.extra)
        // ✅ For non-official apps: metadata comes from hfMetadata (from fetchHuggingFaceAppList)
        
        // ✅ For official apps: daemonApp.extra IS the full space object from /api/spaces
        // It contains: id, cardData, likes, lastModified, tags, etc.
        const isOfficialApp = isOfficialAppWithSpacesData;
        const spaceData = isOfficialApp ? daemonApp.extra : null;
        
        const enrichedApp = {
          name: daemonApp.name,
          id: hfMetadata?.id || daemonApp.id || daemonApp.name,
          description: daemonApp.description || 
                      hfMetadata?.description || 
                      spaceData?.cardData?.short_description || 
                      '',
          url: daemonApp.url || 
               (hfMetadata?.id ? `https://huggingface.co/spaces/${hfMetadata.id}` : null) ||
               (spaceData?.id ? `https://huggingface.co/spaces/${spaceData.id}` : null),
          // ✅ source_kind: source uniquement ('hf_space', 'local', etc.)
          source_kind: daemonApp.source_kind || 'local',
          // ✅ isInstalled: état d'installation séparé
          isInstalled,
          extra: {
            // ✅ Spread daemonApp.extra first (contains full /api/spaces data for official apps)
            ...daemonApp.extra,
            // ✅ For official apps: preserve ALL metadata from /api/spaces
            // cardData contains: emoji, colorFrom, colorTo, short_description, tags, etc.
            cardData: {
              // ✅ Spread existing cardData (from /api/spaces for official apps)
              ...(spaceData?.cardData || daemonApp.extra?.cardData || {}),
              // Only override if missing
              emoji: spaceData?.cardData?.emoji || 
                     daemonApp.extra?.cardData?.emoji || 
                     hfMetadata?.icon || 
                     daemonApp.icon || 
                     daemonApp.emoji || 
                     '📦',
              short_description: spaceData?.cardData?.short_description || 
                                daemonApp.extra?.cardData?.short_description || 
                                hfMetadata?.description || 
                                daemonApp.description || 
                                '',
            },
            // ✅ Metadata: priority is /api/spaces (for official apps) > hfMetadata (for others)
            // Use nullish coalescing to preserve 0 values
            likes: spaceData?.likes ?? daemonApp.extra?.likes ?? hfMetadata?.likes ?? 0,
            downloads: spaceData?.downloads ?? daemonApp.extra?.downloads ?? hfMetadata?.downloads ?? 0,
            lastModified: spaceData?.lastModified ?? daemonApp.extra?.lastModified ?? hfMetadata?.lastModified ?? new Date().toISOString(),
            // Preserve tags from /api/spaces
            tags: spaceData?.tags ?? daemonApp.extra?.tags ?? [],
            // Explicitly set runtime from consolidated value
            runtime: consolidatedRuntime,
          },
          // Daemon data (version, path if installed)
          ...(daemonApp.version && { version: daemonApp.version }),
          ...(daemonApp.path && { path: daemonApp.path }),
        };
        
        // Debug: log final metadata for official apps
        if (isOfficialApp) {
          console.log(`📊 Final metadata for official app ${daemonApp.name}:`, {
            likes: enrichedApp.extra.likes,
            lastModified: enrichedApp.extra.lastModified,
            hasCardData: !!enrichedApp.extra.cardData,
            emoji: enrichedApp.extra.cardData?.emoji,
            description: enrichedApp.description,
          });
        }
        
        return enrichedApp;
      });
      
      // ✅ REFACTORED: Separate installed and available apps using isInstalled flag
      const installed = enrichedApps.filter(app => app.isInstalled);
      const available = enrichedApps.filter(app => !app.isInstalled);
      
      // 6. For installed apps that don't have emoji or lastModified, try to find it from available apps
      // (available apps have the correct Hugging Face metadata)
      const installedWithEmoji = installed.map(installedApp => {
        // Check if we need to enrich with metadata from available apps
        const needsEmoji = !installedApp.extra?.cardData?.emoji || installedApp.extra.cardData.emoji === '📦';
        const needsLastModified = !installedApp.extra?.lastModified;
        
        // If already has everything, keep it
        if (!needsEmoji && !needsLastModified) {
          return installedApp;
        }
        
        // Try to find matching available app by name/id
        const matchingAvailable = available.find(availApp => 
          availApp.name === installedApp.name ||
          availApp.id === installedApp.name ||
          availApp.name?.toLowerCase() === installedApp.name?.toLowerCase() ||
          availApp.id?.toLowerCase() === installedApp.name?.toLowerCase()
        );
        
        if (matchingAvailable) {
          const enrichedExtra = {
            ...installedApp.extra,
          };
          
          // Preserve and enrich cardData if needed (preserve colorFrom, colorTo, etc.)
          if (matchingAvailable.extra?.cardData) {
            enrichedExtra.cardData = {
              // Preserve existing cardData fields
              ...(enrichedExtra.cardData || {}),
              // Merge with available app's cardData (to get colorFrom, colorTo, etc.)
              ...matchingAvailable.extra.cardData,
              // Override emoji only if needed
              ...(needsEmoji && matchingAvailable.extra.cardData.emoji ? {
                emoji: matchingAvailable.extra.cardData.emoji
              } : {}),
            };
          } else if (needsEmoji && matchingAvailable.extra?.cardData?.emoji) {
            // Fallback: only add emoji if cardData doesn't exist
            enrichedExtra.cardData = {
              ...(enrichedExtra.cardData || {}),
              emoji: matchingAvailable.extra.cardData.emoji,
            };
          }
          
          // Add lastModified if needed
          if (needsLastModified && matchingAvailable.extra?.lastModified) {
            enrichedExtra.lastModified = matchingAvailable.extra.lastModified;
          }
          
          // Preserve likes and other metadata from available app
          if (matchingAvailable.extra?.likes !== undefined) {
            enrichedExtra.likes = matchingAvailable.extra.likes;
          }
          
          return {
            ...installedApp,
            extra: enrichedExtra,
          };
        }
        
        return installedApp;
      });
      
      setAvailableApps(enrichedApps);
      setInstalledApps(installedWithEmoji);
      setIsLoading(false);
      return enrichedApps;
    } catch (err) {
      console.error('❌ Failed to fetch apps:', err);
      setError(err.message);
      setIsLoading(false);
      return [];
    }
  }, [official, fetchOfficialApps]);
  
  /**
   * Fetch job status (install/remove)
   */
  const fetchJobStatus = useCallback(async (jobId) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/job-status/${encodeURIComponent(jobId)}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.JOB_STATUS,
        { silent: true } // ⚡ Silent job status polling
      );
      
      if (!response.ok) {
        // Don't throw for permission errors during polling
        // Continue polling, job can resume after acceptance
        if (response.status === 403 || response.status === 401) {
          console.warn(`⚠️ Permission issue while polling job ${jobId}, continuing...`);
          return null; // Return null to continue polling
        }
        throw new Error(`Failed to fetch job status: ${response.status}`);
      }
      
      const jobStatus = await response.json();
      return jobStatus;
    } catch (err) {
      // Gracefully handle system popup timeouts during polling
      if (err.name === 'SystemPopupTimeoutError' || err.name === 'PermissionDeniedError') {
        console.warn(`⚠️ System popup detected while polling job ${jobId}, continuing...`);
        return null; // Continue polling, popup can be accepted later
      }
      
      console.error('❌ Failed to fetch job status:', err);
      return null;
    }
  }, []);
  
  /**
   * Stop job polling
   */
  const stopJobPolling = useCallback((jobId) => {
    const interval = jobPollingIntervals.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      jobPollingIntervals.current.delete(jobId);
    }
  }, []);
  
  /**
   * Start job polling
   */
  const startJobPolling = useCallback((jobId) => {
    // Avoid duplicates
    if (jobPollingIntervals.current.has(jobId)) {
      return;
    }
    
    const pollJob = async () => {
      // Check if polling is still active (may have been stopped)
      if (!jobPollingIntervals.current.has(jobId)) {
        return; // Polling stopped, don't continue
      }
      
      const jobStatus = await fetchJobStatus(jobId);
      
      if (!jobStatus) {
        // Job not found: increment failure counter
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const failCount = (job.fetchFailCount || 0) + 1;
          
          // Stop only after N failed attempts
          if (failCount > DAEMON_CONFIG.CRASH_DETECTION.JOB_MAX_FAILS) {
            console.warn(`⚠️ Job ${jobId} polling failed after ${failCount} attempts (network timeout), marking as failed`);
            stopJobPolling(jobId);
            
            // ⚡ Log to LogConsole
            if (job.appName) {
              addFrontendLog(`❌ ${job.type === 'install' ? 'Install' : 'Uninstall'} ${job.appName} TIMEOUT - Daemon non responsive`);
            }
            
            // Mark job as failed instead of deleting it
            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              status: 'failed',
              logs: [...(job.logs || []), '❌ Installation timed out - Network error or daemon overloaded'],
              fetchFailCount: failCount,
            });
            
            // Cleanup after delay so user can see the error
            setTimeout(() => {
              setActiveJobs(prevJobs => {
                const clean = new Map(prevJobs);
                clean.delete(jobId);
                return clean;
              });
            }, DAEMON_CONFIG.CRASH_DETECTION.JOB_CLEANUP_DELAY);
            
            return updated;
          }
          
          // Otherwise, keep job and increment counter
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            fetchFailCount: failCount,
          });
          return updated;
        });
        return;
      }
      
      // If job finished, stop IMMEDIATELY before updating state
      // Also detect completion via logs if API doesn't return status:"completed"
      const logsText = (jobStatus.logs || []).join('\n').toLowerCase();
      const isSuccessInLogs = logsText.includes('completed successfully') || 
                              logsText.includes("job 'install' completed") || 
                              logsText.includes("job 'remove' completed");
      const isFinished = jobStatus.status === 'completed' || jobStatus.status === 'failed' || isSuccessInLogs;
      
      if (isFinished) {
        stopJobPolling(jobId);
        const finalStatus = jobStatus.status === 'failed' ? 'failed' : 'completed';
        
        // ⚡ Log to visible LogConsole
        const jobInfo = activeJobs.get(jobId);
        if (jobInfo) {
          if (finalStatus === 'failed') {
            console.error('❌ Job failed with logs:', jobStatus.logs);
            const errorSummary = jobStatus.logs?.slice(-2).join(' | ') || 'Unknown error';
            addFrontendLog(`❌ ${jobInfo.type === 'install' ? 'Install' : 'Uninstall'} ${jobInfo.appName} FAILED: ${errorSummary}`);
          } else {
            addFrontendLog(`✓ ${jobInfo.type === 'install' ? 'Installed' : 'Uninstalled'} ${jobInfo.appName}`);
          }
        }
        
        // Force status to "completed" if detected in logs
        jobStatus.status = finalStatus;
      }
      
      // Update job in activeJobs
      setActiveJobs(prev => {
        const job = prev.get(jobId);
        if (!job) return prev;
        
        const updated = new Map(prev);
        const newLogs = jobStatus.logs || [];
        const oldLogs = job.logs || [];
        
        
        updated.set(jobId, {
          ...job,
          status: jobStatus.status,
          logs: newLogs,
          fetchFailCount: 0,
        });
        return updated;
      });
      
      // If finished, mark as finished IMMEDIATELY then cleanup
      if (isFinished) {
        // Mark job as finished (changes status)
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            status: jobStatus.status, // "completed" or "failed"
          });
          return updated;
        });
        
        // Refresh list after short delay (let daemon update its DB)
        setTimeout(() => {
          fetchAvailableApps();
        }, DAEMON_CONFIG.APP_INSTALLATION.REFRESH_DELAY);
        
        // Remove job: very fast if success, 8s if failure (to see error)
        const delay = jobStatus.status === 'failed' ? 8000 : 100;
        setTimeout(() => {
          setActiveJobs(prev => {
            const updated = new Map(prev);
            updated.delete(jobId);
            return updated;
          });
        }, delay);
      }
    };
    
    // Job polling
    const interval = setInterval(pollJob, DAEMON_CONFIG.INTERVALS.JOB_POLLING);
    jobPollingIntervals.current.set(jobId, interval);
    
    // First poll immediately
    pollJob();
  }, [fetchJobStatus, fetchAvailableApps, stopJobPolling]);
  
  /**
   * Install an app (returns job_id)
   */
  const installApp = useCallback(async (appInfo) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/install'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appInfo),
        },
        DAEMON_CONFIG.TIMEOUTS.APP_INSTALL,
        { label: `Install ${appInfo.name}` } // ⚡ Automatic log
      );
      
      if (!response.ok) {
        // Check if it's a permission error
        if (response.status === 403 || response.status === 401) {
          const permissionError = new Error('Permission denied: System may have blocked the installation');
          permissionError.name = 'PermissionDeniedError';
          throw permissionError;
        }
        throw new Error(`Installation failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Result can be {"job_id": "xxx"} or {"uuid": ...}
      const jobId = result.job_id || Object.keys(result)[0];
      
      if (!jobId) {
        throw new Error('No job_id returned from API');
      }
      
      // Add job to tracking
      setActiveJobs(prev => new Map(prev).set(jobId, {
        type: 'install',
        appName: appInfo.name,
        appInfo,
        status: 'running', // Start directly in "running" for UI
        logs: [],
      }));
      
      // Start job polling
      startJobPolling(jobId);
      
      return jobId;
    } catch (err) {
      console.error('❌ Installation error:', err);
      
      // Specific handling of permission errors
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const userMessage = err.name === 'PermissionDeniedError'
          ? `Permission denied: Please accept system permissions to install ${appInfo.name}`
          : `System permission popup detected: Please accept permissions to continue installing ${appInfo.name}`;
        
        addFrontendLog(`🔒 ${userMessage}`);
        setError(userMessage);
        
        // Create error with clear user message
        const userFriendlyError = new Error(userMessage);
        userFriendlyError.name = err.name;
        userFriendlyError.userFriendly = true;
        throw userFriendlyError;
      }
      
      // Standard error
      addFrontendLog(`❌ Failed to start install ${appInfo.name}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [startJobPolling, addFrontendLog]);
  
  /**
   * Uninstall an app (returns job_id)
   */
  const removeApp = useCallback(async (appName) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/remove/${encodeURIComponent(appName)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_REMOVE,
        { label: `Uninstall ${appName}` } // ⚡ Automatic log
      );
      
      if (!response.ok) {
        // Check if it's a permission error
        if (response.status === 403 || response.status === 401) {
          const permissionError = new Error('Permission denied: System may have blocked the removal');
          permissionError.name = 'PermissionDeniedError';
          throw permissionError;
        }
        throw new Error(`Removal failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Result can be {"job_id": "xxx"} or {"uuid": ...}
      const jobId = result.job_id || Object.keys(result)[0];
      
      if (!jobId) {
        throw new Error('No job_id returned from API');
      }
      
      // Add job to tracking
      setActiveJobs(prev => new Map(prev).set(jobId, {
        type: 'remove',
        appName,
        status: 'running', // Start directly in "running" for UI
        logs: [],
      }));
      
      // Start job polling
      startJobPolling(jobId);
      
      return jobId;
    } catch (err) {
      console.error('❌ Removal error:', err);
      
      // Specific handling of permission errors
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const userMessage = err.name === 'PermissionDeniedError'
          ? `Permission denied: Please accept system permissions to remove ${appName}`
          : `System permission popup detected: Please accept permissions to continue removing ${appName}`;
        
        addFrontendLog(`🔒 ${userMessage}`);
        setError(userMessage);
        
        // Create error with clear user message
        const userFriendlyError = new Error(userMessage);
        userFriendlyError.name = err.name;
        userFriendlyError.userFriendly = true;
        throw userFriendlyError;
      }
      addFrontendLog(`❌ Failed to start uninstall ${appName}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [startJobPolling, addFrontendLog]);
  
  /**
   * Fetch current app status
   * ✅ Automatically synchronizes with store to detect crashes and clean up state
   */
  const fetchCurrentAppStatus = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/current-app-status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true } // ⚡ Silent polling
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch current app: ${response.status}`);
      }
      
      const status = await response.json();
      const store = useAppStore.getState();
      
      // ✅ API returns (object | null) - null when no app running
      // AppStatus structure: { info: { name, ... }, state: AppState, error?: string }
      // AppState enum: "starting" | "running" | "done" | "stopping" | "error"
      
      if (status && status.info && status.state) {
        setCurrentApp(status);
        
        const appState = status.state;
        const appName = status.info.name;
        const hasError = !!status.error;
        
        // ✅ Production-grade state handling based on API schema
        // AppState enum: "starting" | "running" | "done" | "stopping" | "error"
        // Active states: "starting", "running" (robot should be locked)
        // Finished states: "done", "stopping", "error" (robot should be unlocked)
        const isAppActive = appState === 'running' || appState === 'starting';
        const isAppFinished = appState === 'done' || appState === 'stopping' || appState === 'error';
        
        if (isAppActive && !hasError) {
          // ✅ App is active (starting or running): ensure store is locked
          if (!store.isAppRunning || store.currentAppName !== appName) {
            store.lockForApp(appName);
          }
        } else if (isAppFinished || hasError) {
          // ✅ App is finished/crashed/stopping: unlock if locked
          // Note: "stopping" means app is shutting down, we should unlock to allow new actions
          if (store.isAppRunning) {
            let logMessage;
            if (hasError) {
              logMessage = `❌ ${appName} crashed: ${status.error}`;
            } else if (appState === 'error') {
              logMessage = `❌ ${appName} error state`;
            } else if (appState === 'done') {
              logMessage = `✓ ${appName} completed`;
            } else if (appState === 'stopping') {
              logMessage = `⏹️ ${appName} stopping`;
      } else {
              logMessage = `⚠️ ${appName} stopped (${appState})`;
            }
            
            console.warn(`⚠️ App ${appName} state changed to ${appState}${hasError ? ` with error: ${status.error}` : ''}`);
            store.addFrontendLog(logMessage);
            store.unlockApp();
          }
        }
      } else {
        // ✅ No app running (status is null or incomplete): unlock if locked (crash detection)
        setCurrentApp(null);
        
        if (store.isAppRunning && store.busyReason === 'app-running') {
          const lastAppName = store.currentAppName || 'unknown';
          console.warn(`⚠️ App crash detected: currentApp is null but store thinks "${lastAppName}" is running`);
          store.addFrontendLog(`⚠️ App ${lastAppName} stopped unexpectedly`);
          store.unlockApp();
        }
      }
      
      return status;
    } catch (err) {
      // No error if no app running
      setCurrentApp(null);
      
      // ✅ On error, also check if we need to unlock (daemon might be down)
      const store = useAppStore.getState();
      if (store.isAppRunning && store.busyReason === 'app-running') {
        // Don't unlock on network errors, only if we're sure no app is running
        // This prevents unlocking when daemon is temporarily unavailable
      }
      
      return null;
    }
  }, []);
  
  /**
   * Launch an app
   */
  const startApp = useCallback(async (appName) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/start-app/${encodeURIComponent(appName)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_START,
        { label: `Start ${appName}` } // ⚡ Automatic log
      );
      
      if (!response.ok) {
        throw new Error(`Failed to start app: ${response.status}`);
      }
      
      const status = await response.json();
      
      // Refresh current app status
      fetchCurrentAppStatus();
      
      return status;
    } catch (err) {
      console.error('❌ Failed to start app:', err);
      addFrontendLog(`❌ Failed to start ${appName}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog]);
  
  /**
   * Stop current app
   */
  const stopCurrentApp = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/stop-current-app'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_STOP,
        { label: 'Stop current app' } // ⚡ Automatic log
      );
      
      if (!response.ok) {
        throw new Error(`Failed to stop app: ${response.status}`);
      }
      
      const message = await response.json();
      
      // Reset state immediately
      setCurrentApp(null);
      
      // ✅ Unlock robot to allow quick actions
      useAppStore.getState().unlockApp();
      
      // Refresh to verify
      setTimeout(() => fetchCurrentAppStatus(), DAEMON_CONFIG.INTERVALS.CURRENT_APP_REFRESH);
      
      return message;
    } catch (err) {
      console.error('❌ Failed to stop app:', err);
      addFrontendLog(`❌ Failed to stop app: ${err.message}`);
      setError(err.message);
      // ✅ Ensure unlock even on error
      useAppStore.getState().unlockApp();
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog]);
  
  /**
   * Cleanup: stop all pollings on unmount
   */
  useEffect(() => {
    return () => {
      jobPollingIntervals.current.forEach((interval) => clearInterval(interval));
      jobPollingIntervals.current.clear();
    };
  }, []);
  
  /**
   * Initial fetch + polling of current app status
   * Refetches when official changes
   * ✅ Cleans up currentApp when daemon becomes inactive
   */
  useEffect(() => {
    if (!isActive) {
      // ✅ Cleanup: If daemon becomes inactive, clear currentApp state
      setCurrentApp(null);
      return;
    }
    
    // Fetch apps (will refetch when official changes)
    fetchAvailableApps(official);
    fetchCurrentAppStatus();
    
    // Polling current app status
    const interval = setInterval(fetchCurrentAppStatus, DAEMON_CONFIG.INTERVALS.APP_STATUS);
    
    return () => clearInterval(interval);
  }, [isActive, official, fetchAvailableApps, fetchCurrentAppStatus]);
  
  return {
    // Data
    availableApps,
    installedApps,
    currentApp,
    activeJobs, // Map of job_id -> job info
    isLoading,
    error,
    
    // Actions
    fetchAvailableApps,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchCurrentAppStatus,
  };
}

