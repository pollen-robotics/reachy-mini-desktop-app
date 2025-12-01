/**
 * App Metadata Utilities
 * 
 * Helpers for consolidating and enriching app metadata
 * from different sources (daemon, /api/spaces, Hugging Face dataset)
 */

/**
 * Checks if an app is an official app with metadata from /api/spaces
 * @param {Object} daemonApp - App object from daemon
 * @returns {boolean} True if official app with spaces data
 */
export function isOfficialAppWithSpacesData(daemonApp) {
  return (
    daemonApp.source_kind === 'hf_space' &&
    daemonApp.extra &&
    daemonApp.extra.id &&
    daemonApp.extra.id.includes('/') // Full ID format: "pollen-robotics/app-name"
  );
}

/**
 * Extracts metadata from /api/spaces response for official apps
 * @param {Object} spaceData - Space data from /api/spaces (in daemonApp.extra)
 * @returns {Object} Extracted metadata object
 */
export function extractSpacesMetadata(spaceData) {
  if (!spaceData) return null;
  
  return {
    id: spaceData.id,
    name: spaceData.id?.split('/').pop(),
    description: spaceData.cardData?.short_description,
    icon: spaceData.cardData?.emoji,
    likes: spaceData.likes,
    lastModified: spaceData.lastModified,
    runtime: spaceData.runtime,
    downloads: spaceData.downloads,
    tags: spaceData.tags,
    cardData: spaceData.cardData,
    // Keep full space data for reference
    _spaceData: spaceData,
  };
}

/**
 * Consolidates runtime from different sources
 * Priority: daemonApp.extra.runtime > hfMetadata.runtime
 * @param {Object} daemonApp - App from daemon
 * @param {Object} hfMetadata - Metadata from Hugging Face
 * @returns {string|null} Consolidated runtime or null
 */
export function consolidateRuntime(daemonApp, hfMetadata) {
  return daemonApp?.extra?.runtime || hfMetadata?.runtime || null;
}

/**
 * Builds enriched app object with metadata from all sources
 * @param {Object} daemonApp - App from daemon
 * @param {Object} hfMetadata - Metadata from Hugging Face (or null)
 * @param {Object} spaceData - Space data from /api/spaces (or null)
 * @param {boolean} isInstalled - Whether app is installed
 * @returns {Object} Enriched app object
 */
export function buildEnrichedApp(daemonApp, hfMetadata, spaceData, isInstalled) {
  const isOfficialApp = !!spaceData;
  const consolidatedRuntime = consolidateRuntime(daemonApp, hfMetadata);
  
  return {
    name: daemonApp.name,
    id: hfMetadata?.id || daemonApp.id || daemonApp.name,
    description: daemonApp.description || 
                hfMetadata?.description || 
                spaceData?.cardData?.short_description || 
                '',
    url: daemonApp.url || 
         (hfMetadata?.id ? `https://huggingface.co/spaces/${hfMetadata.id}` : null) ||
         (spaceData?.id ? `https://huggingface.co/spaces/${spaceData.id}` : null),
    source_kind: daemonApp.source_kind || 'local',
    isInstalled,
    extra: {
      // Spread daemonApp.extra first (contains full /api/spaces data for official apps)
      ...daemonApp.extra,
      // For official apps: preserve ALL metadata from /api/spaces
      cardData: {
        // Spread existing cardData (from /api/spaces for official apps)
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
      // Metadata: priority is /api/spaces (for official apps) > hfMetadata (for others)
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
}

/**
 * Enriches installed apps with metadata from available apps
 * Used when installed apps don't have complete metadata
 * @param {Array} installedApps - Array of installed apps
 * @param {Array} availableApps - Array of available apps (with full metadata)
 * @returns {Array} Enriched installed apps
 */
export function enrichInstalledAppsWithAvailableMetadata(installedApps, availableApps) {
  return installedApps.map(installedApp => {
    // Check if we need to enrich with metadata from available apps
    const needsEmoji = !installedApp.extra?.cardData?.emoji || installedApp.extra.cardData.emoji === '📦';
    const needsLastModified = !installedApp.extra?.lastModified;
    
    // If already has everything, keep it
    if (!needsEmoji && !needsLastModified) {
      return installedApp;
    }
    
    // Try to find matching available app by name/id
    const matchingAvailable = availableApps.find(availApp => 
      availApp.name === installedApp.name ||
      availApp.id === installedApp.name ||
      availApp.name?.toLowerCase() === installedApp.name?.toLowerCase() ||
      availApp.id?.toLowerCase() === installedApp.name?.toLowerCase()
    );
    
    if (!matchingAvailable) {
      return installedApp;
    }
    
    const enrichedExtra = {
      ...installedApp.extra,
    };
    
    // Preserve and enrich cardData if needed
    if (matchingAvailable.extra?.cardData) {
      enrichedExtra.cardData = {
        // Preserve existing cardData fields
        ...(enrichedExtra.cardData || {}),
        // Merge with available app's cardData
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
  });
}

