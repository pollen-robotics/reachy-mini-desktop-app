import { useCallback } from 'react';
import { fetchHuggingFaceAppList } from '@utils/huggingFaceApi';
import { buildMetadataMap, findAppInMetadataMap } from '@utils/appMatching';
import {
  isOfficialAppWithSpacesData,
  extractSpacesMetadata,
  buildEnrichedApp,
  enrichInstalledAppsWithAvailableMetadata,
} from './utils/appMetadata';

/**
 * Hook for enriching apps with metadata from Hugging Face
 * Handles matching, consolidation, and enrichment logic
 */
export function useAppEnrichment() {
  /**
   * Enriches daemon apps with Hugging Face metadata
   * @param {Array} daemonApps - Apps from daemon
   * @param {Set} installedAppNames - Set of installed app names (lowercase)
   * @returns {Promise<{enrichedApps: Array, installed: Array, available: Array}>}
   */
  const enrichApps = useCallback(async (daemonApps, installedAppNames) => {
    // 1. Fetch metadata from Hugging Face dataset
    let hfApps = [];
    try {
      hfApps = await fetchHuggingFaceAppList();
    } catch (hfErr) {
      console.warn('⚠️ Failed to fetch Hugging Face metadata:', hfErr.message);
    }
    
    // 2. Build metadata map for fast lookup
    const hfMetadataMap = buildMetadataMap(hfApps);
    
    // 3. Enrich daemon apps with HF metadata
    const enrichedApps = daemonApps.map(daemonApp => {
      // Check if this is an official app with metadata from /api/spaces
      const isOfficialApp = isOfficialAppWithSpacesData(daemonApp);
      const spaceData = isOfficialApp ? daemonApp.extra : null;
      
      let hfMetadata = null;
      
      // For official apps: use metadata directly from /api/spaces (already in daemonApp.extra)
      if (isOfficialApp) {
        hfMetadata = extractSpacesMetadata(spaceData);
        console.log(`✅ Using /api/spaces metadata for official app: ${daemonApp.name}`, {
          id: spaceData.id,
          hasCardData: !!spaceData.cardData,
          hasLastModified: !!spaceData.lastModified,
          likes: spaceData.likes,
        });
      } else {
        // Only search in hfMetadataMap for non-official apps
        hfMetadata = findAppInMetadataMap(daemonApp, hfMetadataMap, hfApps);
      }
      
      // Determine if app is installed
      const isInstalled = installedAppNames.has(daemonApp.name?.toLowerCase());
      
      // Build enriched app
      const enrichedApp = buildEnrichedApp(daemonApp, hfMetadata, spaceData, isInstalled);
      
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
      
      // Debug: log runtime data for troubleshooting
      if (daemonApp.name && (daemonApp.extra?.runtime || hfMetadata?.runtime)) {
        console.log(`🔍 Runtime for "${daemonApp.name}":`, {
          fromDaemon: daemonApp.extra?.runtime,
          fromHF: hfMetadata?.runtime,
          consolidated: enrichedApp.extra.runtime,
        });
      }
      
      return enrichedApp;
    });
    
    // 4. Separate installed and available apps
    const installed = enrichedApps.filter(app => app.isInstalled);
    const available = enrichedApps.filter(app => !app.isInstalled);
    
    // 5. Enrich installed apps with metadata from available apps
    const installedWithEmoji = enrichInstalledAppsWithAvailableMetadata(installed, available);
    
    return {
      enrichedApps,
      installed: installedWithEmoji,
      available,
    };
  }, []);
  
  return {
    enrichApps,
  };
}

