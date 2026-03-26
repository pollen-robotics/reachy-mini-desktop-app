import { useCallback } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, fetchExternal } from '@config/daemon';

// Website API URL - centralized app store with 24h cache
const WEBSITE_API_URL = 'https://pollen-robotics-reachy-mini.hf.space/api/apps';
const DAEMON_APPS_CATALOG_ENDPOINT = '/api/apps/list-available';

const HF_PYTHON_APP_TAG = 'reachy_mini_python_app';

function getCatalogAuthor(app, spaceId = null) {
  return (
    app?.extra?.author ||
    app?.author ||
    app?.owner ||
    app?.organization ||
    app?.org ||
    spaceId?.split('/')?.[0] ||
    null
  );
}

function getCatalogAppId(app) {
  const idCandidates = [
    app?.extra?.id,
    app?.extra?.repo_id,
    app?.extra?.repoId,
    app?.extra?.space_id,
    app?.extra?.spaceId,
    app?.extra?.app_id,
    app?.extra?.appId,
    app?.id,
    app?.repo_id,
    app?.repoId,
    app?.space_id,
    app?.spaceId,
    app?.app_id,
    app?.appId,
    app?.space,
    app?.repo,
  ].filter(value => typeof value === 'string' && value.trim());

  const namespacedId = idCandidates.find(value => value.includes('/'));
  if (namespacedId) {
    return namespacedId;
  }

  const rawId = idCandidates[0];
  if (!rawId) {
    return null;
  }

  const author = getCatalogAuthor(app);
  return author ? `${author}/${rawId}` : rawId;
}

function getCatalogAppKey(app) {
  return getCatalogAppId(app) || app?.name?.toLowerCase() || null;
}

function getCatalogRepoName(app) {
  return getCatalogAppId(app)?.split('/').pop() || null;
}

function mergeAppExtra(baseExtra = {}, nextExtra = {}) {
  return {
    ...baseExtra,
    ...nextExtra,
    cardData: {
      ...baseExtra?.cardData,
      ...nextExtra?.cardData,
    },
  };
}

function normalizeCatalogApp(app) {
  const spaceId = getCatalogAppId(app);
  const author = getCatalogAuthor(app, spaceId);
  const repoName = getCatalogRepoName(app);
  const existingCardData = app?.extra?.cardData || app?.cardData || {};
  const rootTags = app?.extra?.tags || app?.tags || [];
  const cardTags = existingCardData.tags || [];
  const isPrivate = app?.extra?.private ?? app?.private ?? false;
  const isPythonApp =
    app?.extra?.isPythonApp ??
    app?.isPythonApp ??
    [...rootTags, ...cardTags].includes(HF_PYTHON_APP_TAG);
  const shouldUseRepoName = Boolean(repoName) && (isPrivate || (!app?.source_kind && !app?.url));
  const normalizedName = shouldUseRepoName ? repoName : app?.name || repoName || '';

  return {
    ...app,
    id: spaceId || app?.id || normalizedName,
    name: normalizedName,
    description: app?.description || existingCardData.short_description || '',
    url: app?.url || (spaceId ? `https://huggingface.co/spaces/${spaceId}` : null),
    source_kind: app?.source_kind || 'hf_space',
    isOfficial: app?.isOfficial ?? author === 'pollen-robotics',
    extra: {
      ...app?.extra,
      id: spaceId,
      author,
      likes: app?.extra?.likes ?? app?.likes ?? 0,
      downloads: app?.extra?.downloads ?? app?.downloads ?? 0,
      createdAt: app?.extra?.createdAt ?? app?.createdAt ?? null,
      lastModified: app?.extra?.lastModified ?? app?.lastModified ?? null,
      runtime: app?.extra?.runtime ?? app?.runtime ?? null,
      tags: rootTags,
      sdk: app?.extra?.sdk ?? app?.sdk ?? existingCardData.sdk,
      private: isPrivate,
      isPythonApp,
      cardData: existingCardData,
    },
  };
}

function normalizeCatalogApps(payload) {
  const rawApps = Array.isArray(payload) ? payload : payload?.apps || [];
  return rawApps.map(normalizeCatalogApp);
}

function mergeCatalogApps(websiteApps, daemonApps) {
  const mergedApps = new Map(websiteApps.map(app => [getCatalogAppKey(app), app]));

  daemonApps.forEach(app => {
    const key = getCatalogAppKey(app);
    if (!key) return;

    const existingApp = mergedApps.get(key);
    if (!existingApp) {
      mergedApps.set(key, app);
      return;
    }

    mergedApps.set(key, {
      ...existingApp,
      ...app,
      extra: mergeAppExtra(existingApp.extra, app.extra),
    });
  });

  return Array.from(mergedApps.values());
}

/**
 * Merge website catalog apps with daemon-installed apps into a unified list.
 * Pure function, no side effects — used by both useAppsStore and HardwareScanView.
 *
 * @param {Array} websiteApps - Apps from the website API (may be empty if offline)
 * @param {Array} daemonApps - Installed apps from the local daemon
 * @returns {{ enrichedApps: Array, installedApps: Array }}
 */
export function mergeAppsData(websiteApps, daemonApps) {
  const websiteAppsMap = new Map(
    websiteApps.map(app => [getCatalogAppKey(app), app]).filter(([key]) => Boolean(key))
  );
  const installedAppsMap = new Map(
    daemonApps.map(app => [getCatalogAppKey(app), app]).filter(([key]) => Boolean(key))
  );
  const installedAppKeys = new Set(installedAppsMap.keys());

  // Apps installed locally but not in the website catalog
  const localOnlyApps = daemonApps
    .filter(app => !websiteAppsMap.has(getCatalogAppKey(app)))
    .map(app => ({
      ...app,
      source_kind: app.source_kind || 'local',
      isOfficial: false,
    }));

  const allApps = [...websiteApps, ...localOnlyApps];

  const enrichedApps = allApps.map(app => {
    const appKey = getCatalogAppKey(app);
    const isInstalled = appKey ? installedAppKeys.has(appKey) : false;
    const installedAppData = appKey ? installedAppsMap.get(appKey) : null;

    return {
      ...app,
      isInstalled,
      // custom_app_url is only known by the daemon (local runtime info)
      ...(isInstalled && {
        extra: mergeAppExtra(app.extra, installedAppData?.extra),
      }),
    };
  });

  const installedApps = daemonApps.map(app => {
    const appKey = getCatalogAppKey(app);
    const catalogApp = appKey ? websiteAppsMap.get(appKey) : null;
    const mergedExtra = mergeAppExtra(catalogApp?.extra, app.extra);
    const catalogRepoName = getCatalogRepoName(catalogApp);
    const daemonRepoName = getCatalogRepoName(app);

    return {
      ...(catalogApp || {}),
      ...app,
      id: catalogApp?.id || app?.id || mergedExtra.id || app.name,
      displayName: catalogApp?.name || catalogRepoName || daemonRepoName || app.name,
      description: catalogApp?.description || app.description || '',
      url:
        catalogApp?.url ||
        app.url ||
        (mergedExtra.id ? `https://huggingface.co/spaces/${mergedExtra.id}` : null),
      source_kind: app.source_kind || catalogApp?.source_kind || 'local',
      isOfficial: catalogApp?.isOfficial ?? app.isOfficial ?? false,
      isInstalled: true,
      extra: mergedExtra,
    };
  });

  return { enrichedApps, installedApps };
}

/**
 * Hook for fetching apps from different sources
 * Uses the daemon catalog first when available (supports private spaces),
 * and merges it with the public website API catalog.
 * Falls back to daemon for installed apps only
 */
export function useAppFetching() {
  const fetchAppsFromDaemonCatalog = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(DAEMON_APPS_CATALOG_ENDPOINT),
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true }
      );

      if (!response.ok) {
        return { apps: [], error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { apps: normalizeCatalogApps(data), error: null };
    } catch (error) {
      return { apps: [], error: error.message };
    }
  }, []);

  /**
   * Fetch all available apps from the catalog sources
   * The daemon catalog is preferred when available because it can include
   * private spaces accessible through the user's HF login on the daemon.
   * The public website API remains the fallback/public source and is merged in.
   *
   * Returns desktop-compatible apps with:
   * - Official/community flags
   * - Likes, downloads, runtime
   * - Full cardData (emoji, description, sdk, tags)
   *
   * @returns {Promise<Array>} Array of apps in desktop-compatible format
   */
  const fetchAppsFromWebsite = useCallback(async () => {
    const daemonCatalogResult = await fetchAppsFromDaemonCatalog();

    try {
      const websiteResponse = await fetchExternal(
        WEBSITE_API_URL,
        {
          // Include browser credentials when available for environments where the
          // website catalog can rely on a direct HF session.
          credentials: 'include',
        },
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        {
          silent: true,
        }
      );

      if (!websiteResponse.ok) {
        const error = new Error(`Website API returned ${websiteResponse.status}`);
        error.name = 'NetworkError';
        throw error;
      }

      const websiteData = await websiteResponse.json();
      const websiteApps = normalizeCatalogApps(websiteData);
      const mergedApps = mergeCatalogApps(websiteApps, daemonCatalogResult.apps);

      console.log(
        `[Apps] Fetched ${mergedApps.length} apps from catalog (website=${websiteApps.length}, daemon=${daemonCatalogResult.apps.length}, cache age: ${websiteData.cacheAge}s)`
      );

      return mergedApps;
    } catch (error) {
      if (daemonCatalogResult.apps.length > 0) {
        console.log(
          `[Apps] Falling back to daemon catalog only (${daemonCatalogResult.apps.length} apps)`
        );
        return daemonCatalogResult.apps;
      }

      const isNetworkError =
        error.name === 'NetworkError' ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        error.isOffline ||
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('timeout') ||
        error.message?.toLowerCase().includes('connection') ||
        error.message?.toLowerCase().includes('fetch');

      if (isNetworkError) {
        const networkError = new Error('No internet connection');
        networkError.name = 'NetworkError';
        networkError.originalError = error;
        throw networkError;
      }

      console.error('[Apps] Failed to fetch apps from website:', error.message);
      throw error;
    }
  }, [fetchAppsFromDaemonCatalog]);

  /**
   * Fetch installed apps from daemon
   */
  const fetchInstalledApps = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 3000];

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
        const installedApps = rawInstalledApps.map(app => ({
          ...app,
          source_kind: app.source_kind || 'local',
        }));
        return { apps: installedApps, error: null };
      }

      if (installedResponse.status >= 500) {
        if (retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
          return fetchInstalledApps(retryCount + 1);
        }
        return { apps: [], error: `Server error: ${installedResponse.status}` };
      }

      return { apps: [], error: `HTTP ${installedResponse.status}` };
    } catch (err) {
      const isRetryableError =
        err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        err.message?.includes('timeout') ||
        err.message?.includes('Load failed') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('ECONNREFUSED');

      if (retryCount < MAX_RETRIES && isRetryableError) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
        return fetchInstalledApps(retryCount + 1);
      }

      return { apps: [], error: err.message };
    }
  }, []);

  return {
    fetchAppsFromWebsite,
    fetchInstalledApps,
  };
}
