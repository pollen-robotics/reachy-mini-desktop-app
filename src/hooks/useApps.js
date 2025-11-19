import { useState, useEffect, useCallback, useRef } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../config/daemon';
import { fetchHuggingFaceAppList } from '../views/active-robot/application-store/huggingFaceApi';

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
   * Fetch official apps directly from Hugging Face
   */
  const fetchOfficialApps = useCallback(async () => {
    const OFFICIAL_APP_LIST_URL = 'https://huggingface.co/datasets/pollen-robotics/reachy-mini-official-app-store/raw/main/app-list.json';
    const HF_SPACES_API_URL = 'https://huggingface.co/api/spaces';
    
    try {
      // 1. Fetch the list of official app IDs
      const listResponse = await fetch(OFFICIAL_APP_LIST_URL);
      if (!listResponse.ok) {
        throw new Error(`Failed to fetch official app list: ${listResponse.status}`);
      }
      const authorizedIds = await listResponse.json();
      
      if (!Array.isArray(authorizedIds)) {
        return [];
      }
      
      // 2. Fetch data for each space in parallel
      const spacePromises = authorizedIds.map(async (spaceId) => {
        try {
          const spaceResponse = await fetch(`${HF_SPACES_API_URL}/${spaceId}`);
          if (spaceResponse.ok) {
            return await spaceResponse.json();
          }
          return null;
        } catch (err) {
          console.warn(`⚠️ Failed to fetch space ${spaceId}:`, err.message);
          return null;
        }
      });
      
      const spacesData = await Promise.all(spacePromises);
      
      // 3. Build AppInfo list
      const apps = [];
      for (const item of spacesData) {
        if (!item || !item.id) continue;
        
        apps.push({
          name: item.id.split('/').pop(),
          id: item.id,
          description: item.cardData?.short_description || '',
          url: `https://huggingface.co/spaces/${item.id}`,
          source_kind: 'hf_space',
          extra: item,
        });
      }
      
      return apps;
    } catch (error) {
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
        // Fetch official apps directly from Hugging Face
        console.log(`🔄 Fetching official apps directly from HF`);
        daemonApps = await fetchOfficialApps();
        console.log(`✅ Fetched ${daemonApps.length} official apps`);
        console.log('📦 Raw official apps data:', JSON.stringify(daemonApps, null, 2));
        
        // Log first app structure for debugging
        if (daemonApps.length > 0) {
          console.log('🔍 First official app structure:', {
            name: daemonApps[0].name,
            id: daemonApps[0].id,
            extra: daemonApps[0].extra,
            hasRuntime: !!daemonApps[0].extra?.runtime,
            runtime: daemonApps[0].extra?.runtime,
          });
        }
        
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
            installedAppsFromDaemon = await installedResponse.json();
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
            console.log('📦 Raw apps data from daemon:', JSON.stringify(daemonApps, null, 2));
            
            // Log first app structure for debugging
            if (daemonApps.length > 0) {
              console.log('🔍 First app structure:', {
                name: daemonApps[0].name,
                id: daemonApps[0].id,
                extra: daemonApps[0].extra,
                hasRuntime: !!daemonApps[0].extra?.runtime,
                runtime: daemonApps[0].extra?.runtime,
              });
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
                const spaceResponse = await fetch(`${HF_SPACES_API_URL}/${fullSpaceId}`);
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
      
      // Combine official apps with installed apps if needed
      if (officialParam && installedAppsFromDaemon.length > 0) {
        daemonApps = [...daemonApps, ...installedAppsFromDaemon];
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
        // Find corresponding HF metadata (try multiple matching strategies)
        // Priority: id > normalized id > name > normalized name > variants
        const normalizedDaemonName = daemonApp.name ? daemonApp.name.replace(/[_-]/g, '').toLowerCase() : null;
        const normalizedDaemonId = daemonApp.id ? daemonApp.id.replace(/[_-]/g, '').toLowerCase() : null;
        const daemonNameWithDashes = daemonApp.name ? daemonApp.name.replace(/_/g, '-') : null;
        const daemonNameWithUnderscores = daemonApp.name ? daemonApp.name.replace(/-/g, '_') : null;
        const daemonIdWithDashes = daemonApp.id ? daemonApp.id.replace(/_/g, '-') : null;
        const daemonIdWithUnderscores = daemonApp.id ? daemonApp.id.replace(/-/g, '_') : null;
        
        const hfMetadata = 
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
        
        // Build enriched app
        const enrichedApp = {
          name: daemonApp.name,
          id: hfMetadata?.id || daemonApp.id || daemonApp.name,
          description: daemonApp.description || hfMetadata?.description || '',
          url: daemonApp.url || (hfMetadata?.id 
            ? `https://huggingface.co/spaces/${hfMetadata.id}` 
            : null),
          source_kind: daemonApp.source_kind,
          extra: {
            // Spread daemonApp.extra first (to preserve any existing data)
            ...daemonApp.extra,
            // Preserve cardData from daemon (contains colorFrom, colorTo, etc.) and enrich with emoji
            // Priority: HF metadata > daemon extra.cardData > daemon icon > fallback
            cardData: {
              // Preserve all existing cardData fields (colorFrom, colorTo, title, etc.)
              ...(daemonApp.extra?.cardData || {}),
              // Override emoji only if we have a better source
              emoji: hfMetadata?.icon || 
                     daemonApp.extra?.cardData?.emoji || 
                     daemonApp.icon || 
                     daemonApp.emoji || // Also check for emoji field directly
                     daemonApp.extra?.cardData?.emoji || // Fallback to existing emoji
                     '📦',
            },
            // Add HF metadata if available (but don't override if daemon already has it)
            ...(hfMetadata && {
              likes: hfMetadata.likes || daemonApp.extra?.likes || 0,
              downloads: hfMetadata.downloads || daemonApp.extra?.downloads || 0,
              lastModified: hfMetadata.lastModified || daemonApp.extra?.lastModified || new Date().toISOString(),
            }),
            // Explicitly set runtime from consolidated value (preserves runtime for both official and non-official apps)
            // This must come after the spread to ensure it's not overridden
            runtime: consolidatedRuntime,
          },
          // Daemon data (version, path if installed)
          ...(daemonApp.version && { version: daemonApp.version }),
          ...(daemonApp.path && { path: daemonApp.path }),
        };
        
        return enrichedApp;
      });
      
      // 5. Separate installed and available apps
      const installed = enrichedApps.filter(app => app.source_kind === 'installed');
      const available = enrichedApps.filter(app => app.source_kind !== 'installed');
      
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
        }, 500);
        
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
      
      // If no app running, API probably returns null or empty object
      if (status && status.info) {
        setCurrentApp(status);
      } else {
        setCurrentApp(null);
      }
      
      return status;
    } catch (err) {
      // No error if no app running
      setCurrentApp(null);
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
   */
  useEffect(() => {
    if (!isActive) return;
    
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

