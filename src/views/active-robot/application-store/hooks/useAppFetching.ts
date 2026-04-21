import { useCallback } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, fetchExternal } from '@config/daemon';

const WEBSITE_API_URL = 'https://pollen-robotics-reachy-mini.hf.space/api/apps';
const DAEMON_APPS_CATALOG_ENDPOINT = '/api/apps/list-available';

const HF_PYTHON_APP_TAG = 'reachy_mini_python_app';

type AnyRecord = Record<string, unknown>;
type AppLike = AnyRecord & {
  extra?: AnyRecord & { cardData?: AnyRecord; tags?: string[] };
  name?: string;
  id?: string;
  description?: string;
  url?: string | null;
  source_kind?: string;
  isOfficial?: boolean;
  tags?: string[];
  cardData?: AnyRecord;
  private?: boolean;
  isPythonApp?: boolean;
};

function getCatalogAuthor(
  app: AppLike | null | undefined,
  spaceId: string | null = null
): string | null {
  return (
    (app?.extra?.author as string) ||
    (app?.author as string) ||
    (app?.owner as string) ||
    (app?.organization as string) ||
    (app?.org as string) ||
    spaceId?.split('/')?.[0] ||
    null
  );
}

function getCatalogAppId(app: AppLike | null | undefined): string | null {
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
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

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

function getCatalogAppKey(app: AppLike | null | undefined): string | null {
  return getCatalogAppId(app) || app?.name?.toLowerCase() || null;
}

function getCatalogRepoName(app: AppLike | null | undefined): string | null {
  return getCatalogAppId(app)?.split('/').pop() || null;
}

function mergeAppExtra(baseExtra: AnyRecord = {}, nextExtra: AnyRecord = {}): AnyRecord {
  return {
    ...baseExtra,
    ...nextExtra,
    cardData: {
      ...((baseExtra as { cardData?: AnyRecord })?.cardData || {}),
      ...((nextExtra as { cardData?: AnyRecord })?.cardData || {}),
    },
  };
}

function normalizeCatalogApp(app: AppLike): AppLike {
  const spaceId = getCatalogAppId(app);
  const author = getCatalogAuthor(app, spaceId);
  const repoName = getCatalogRepoName(app);
  const existingCardData =
    (app?.extra?.cardData as AnyRecord) || (app?.cardData as AnyRecord) || {};
  const rootTags = (app?.extra?.tags as string[]) || (app?.tags as string[]) || [];
  const cardTags = (existingCardData.tags as string[]) || [];
  const isPrivate = (app?.extra?.private as boolean) ?? (app?.private as boolean) ?? false;
  const isPythonApp =
    (app?.extra?.isPythonApp as boolean) ??
    (app?.isPythonApp as boolean) ??
    [...rootTags, ...cardTags].includes(HF_PYTHON_APP_TAG);
  const shouldUseRepoName = Boolean(repoName) && (isPrivate || (!app?.source_kind && !app?.url));
  const normalizedName = shouldUseRepoName ? repoName : app?.name || repoName || '';

  return {
    ...app,
    id: (spaceId || app?.id || normalizedName) as string,
    name: normalizedName as string,
    description: app?.description || (existingCardData.short_description as string) || '',
    url: app?.url || (spaceId ? `https://huggingface.co/spaces/${spaceId}` : null),
    source_kind: app?.source_kind || 'hf_space',
    isOfficial: app?.isOfficial ?? author === 'pollen-robotics',
    extra: {
      ...app?.extra,
      id: spaceId,
      author,
      likes: (app?.extra?.likes as number) ?? (app?.likes as number) ?? 0,
      downloads: (app?.extra?.downloads as number) ?? (app?.downloads as number) ?? 0,
      createdAt: (app?.extra?.createdAt as string) ?? (app?.createdAt as string) ?? null,
      lastModified: (app?.extra?.lastModified as string) ?? (app?.lastModified as string) ?? null,
      runtime: (app?.extra?.runtime as unknown) ?? (app?.runtime as unknown) ?? null,
      tags: rootTags,
      sdk: (app?.extra?.sdk as string) ?? (app?.sdk as string) ?? (existingCardData.sdk as string),
      private: isPrivate,
      isPythonApp,
      cardData: existingCardData,
    },
  };
}

function normalizeCatalogApps(payload: unknown): AppLike[] {
  const rawApps = Array.isArray(payload)
    ? payload
    : ((payload as { apps?: AppLike[] } | null | undefined)?.apps ?? []);
  return rawApps.map(normalizeCatalogApp);
}

function mergeCatalogApps(websiteApps: AppLike[], daemonApps: AppLike[]): AppLike[] {
  const mergedApps = new Map<string, AppLike>(
    websiteApps
      .map(app => [getCatalogAppKey(app), app] as const)
      .filter(([key]) => Boolean(key)) as Array<[string, AppLike]>
  );

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
    } as AppLike);
  });

  return Array.from(mergedApps.values());
}

export function mergeAppsData(
  websiteApps: AppLike[],
  daemonApps: AppLike[]
): { enrichedApps: AppLike[]; installedApps: AppLike[] } {
  const websiteAppsMap = new Map<string, AppLike>(
    websiteApps
      .map(app => [getCatalogAppKey(app), app] as const)
      .filter(([key]) => Boolean(key)) as Array<[string, AppLike]>
  );
  const installedAppsMap = new Map<string, AppLike>(
    daemonApps
      .map(app => [getCatalogAppKey(app), app] as const)
      .filter(([key]) => Boolean(key)) as Array<[string, AppLike]>
  );
  const installedAppKeys = new Set(installedAppsMap.keys());

  const localOnlyApps = daemonApps
    .filter(app => !websiteAppsMap.has(getCatalogAppKey(app) as string))
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
      id: catalogApp?.id || app?.id || (mergedExtra.id as string) || app.name,
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
    } as AppLike;
  });

  return { enrichedApps, installedApps };
}

interface FetchResult {
  apps: AppLike[];
  error: string | null;
}

interface UseAppFetchingReturn {
  fetchAppsFromWebsite: () => Promise<AppLike[]>;
  fetchInstalledApps: (retryCount?: number) => Promise<FetchResult>;
}

export function useAppFetching(): UseAppFetchingReturn {
  const fetchAppsFromDaemonCatalog = useCallback(async (): Promise<FetchResult> => {
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
      return { apps: [], error: (error as Error).message };
    }
  }, []);

  const fetchAppsFromWebsite = useCallback(async (): Promise<AppLike[]> => {
    const daemonCatalogResult = await fetchAppsFromDaemonCatalog();

    try {
      const websiteResponse = await fetchExternal(
        WEBSITE_API_URL,
        {
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

      const err = error as Error & { isOffline?: boolean; originalError?: unknown };
      const isNetworkError =
        err.name === 'NetworkError' ||
        err.name === 'AbortError' ||
        err.name === 'TimeoutError' ||
        err.isOffline ||
        err.message?.toLowerCase().includes('network') ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('connection') ||
        err.message?.toLowerCase().includes('fetch');

      if (isNetworkError) {
        const networkError = new Error('No internet connection') as Error & {
          originalError?: unknown;
        };
        networkError.name = 'NetworkError';
        networkError.originalError = err;
        throw networkError;
      }

      console.error('[Apps] Failed to fetch apps from website:', err.message);
      throw err;
    }
  }, [fetchAppsFromDaemonCatalog]);

  const fetchInstalledApps = useCallback(async (retryCount: number = 0): Promise<FetchResult> => {
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
        const rawInstalledApps = (await installedResponse.json()) as AppLike[];
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
      const error = err as Error;
      const isRetryableError =
        error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        error.message?.includes('timeout') ||
        error.message?.includes('Load failed') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('network') ||
        error.message?.includes('ECONNREFUSED');

      if (retryCount < MAX_RETRIES && isRetryableError) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
        return fetchInstalledApps(retryCount + 1);
      }

      return { apps: [], error: error.message };
    }
  }, []);

  return {
    fetchAppsFromWebsite,
    fetchInstalledApps,
  };
}
