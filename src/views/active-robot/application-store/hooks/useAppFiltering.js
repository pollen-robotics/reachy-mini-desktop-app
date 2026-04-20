import { useMemo, useRef } from 'react';
import Fuse from 'fuse.js';

const EXCLUDED_TAGS = new Set([
  'reachy_mini',
  'reachy-mini',
  'reachy_mini_python_app',
  'reachy_mini_js_app',
  'static',
  'docker',
  'region:us',
  'region:eu',
]);

// Synthetic category for live (browser-side / no-install) apps.
// Filters to apps explicitly tagged `reachy_mini_js_app` on their HF Space.
// We deliberately do NOT use `isPythonApp === false` as the criterion: the
// website API marks any space lacking `reachy_mini_python_app` as non-Python,
// which sweeps in legacy/untagged spaces (assembly guides, drafts, demos)
// that aren't really live JS apps.
export const LIVE_CATEGORY = 'live';
const LIVE_TAG = 'reachy_mini_js_app';

function isLiveApp(app) {
  const root = app.extra?.tags || [];
  const card = app.extra?.cardData?.tags || [];
  return [...root, ...card].some(t => typeof t === 'string' && t.toLowerCase() === LIVE_TAG);
}

const FUSE_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.4 },
    { name: '_searchId', weight: 0.3 },
    { name: '_searchAuthor', weight: 0.2 },
    { name: '_searchDescription', weight: 0.15 },
    { name: '_searchTags', weight: 0.1 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
};

/**
 * Hook for filtering and categorizing apps.
 * Shows all apps by default; when officialOnly is true, restricts to official apps only.
 * Uses Fuse.js for fuzzy search matching.
 *
 * @param {Array} availableApps - All available apps (with isOfficial flag)
 * @param {string} searchQuery - Search query string
 * @param {string|null} selectedCategory - Selected category filter
 * @param {boolean} officialOnly - If true, show only official apps; if false, show all apps
 * @param {boolean} privateOnly - If true, show only private apps; if false, show all apps
 */
export function useAppFiltering(
  availableApps,
  searchQuery,
  selectedCategory,
  officialOnly = false,
  privateOnly = false
) {
  const fuseRef = useRef(null);
  const fuseInputRef = useRef(null);

  const appsForMode = useMemo(() => {
    let apps = availableApps;
    if (officialOnly) {
      apps = apps.filter(app => {
        if (app.isOfficial !== undefined) return app.isOfficial;
        return app.source_kind === 'hf_space';
      });
    }
    if (privateOnly) {
      apps = apps.filter(app => app.extra?.private === true);
    }
    return apps;
  }, [availableApps, officialOnly, privateOnly]);

  // Build / rebuild Fuse index when the filtered app set changes
  const fuse = useMemo(() => {
    const searchableApps = appsForMode.map(app => ({
      ...app,
      _searchId: app.extra?.id || app.id || '',
      _searchAuthor: app.extra?.author || app.extra?.id?.split('/')?.[0] || '',
      _searchDescription: app.extra?.cardData?.short_description || app.description || '',
      _searchTags: [...(app.extra?.tags || []), ...(app.extra?.cardData?.tags || [])].join(' '),
    }));
    return new Fuse(searchableApps, FUSE_OPTIONS);
  }, [appsForMode]);

  const categories = useMemo(() => {
    const categoryMap = new Map();

    appsForMode.forEach(app => {
      const rootTags = app.extra?.tags || [];
      const cardDataTags = app.extra?.cardData?.tags || [];
      const allTags = [...new Set([...rootTags, ...cardDataTags])];
      const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;

      allTags.forEach(tag => {
        if (
          tag &&
          typeof tag === 'string' &&
          !tag.startsWith('region:') &&
          !EXCLUDED_TAGS.has(tag.toLowerCase())
        ) {
          categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
        }
      });

      if (sdk && typeof sdk === 'string') {
        const sdkLower = sdk.toLowerCase();
        const hasMatchingTag = allTags.some(
          tag => tag && typeof tag === 'string' && tag.toLowerCase() === sdkLower
        );
        if (!hasMatchingTag) {
          const sdkCategory = `sdk:${sdk}`;
          categoryMap.set(sdkCategory, (categoryMap.get(sdkCategory) || 0) + 1);
        }
      }
    });

    const tagCategories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name)))
      .slice(0, 8);

    // Prepend the synthetic "Live" category when at least one live app is
    // present. Lives at the front of the chip row to make it discoverable.
    const liveCount = appsForMode.filter(isLiveApp).length;
    if (liveCount > 0) {
      return [{ name: LIVE_CATEGORY, count: liveCount }, ...tagCategories];
    }
    return tagCategories;
  }, [appsForMode]);

  const filteredApps = useMemo(() => {
    let apps = [...appsForMode];

    // Filter by category
    if (selectedCategory) {
      // Synthetic "Live" category: only spaces explicitly tagged as live JS apps.
      if (selectedCategory === LIVE_CATEGORY) {
        apps = apps.filter(isLiveApp);
      } else {
        apps = apps.filter(app => {
          const rootTags = app.extra?.tags || [];
          const cardDataTags = app.extra?.cardData?.tags || [];
          const allTags = [...new Set([...rootTags, ...cardDataTags])];
          const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;

          if (selectedCategory.startsWith('sdk:')) {
            return sdk === selectedCategory.replace('sdk:', '');
          }
          const tagMatch = allTags.some(
            tag =>
              tag && typeof tag === 'string' && tag.toLowerCase() === selectedCategory.toLowerCase()
          );
          const sdkMatch =
            sdk && typeof sdk === 'string' && sdk.toLowerCase() === selectedCategory.toLowerCase();
          return tagMatch || sdkMatch;
        });
      }
    }

    // Fuzzy search with Fuse.js
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim();
      const fuseResults = fuse.search(query);
      const matchedNames = new Set(fuseResults.map(r => r.item.name));
      apps = apps
        .filter(app => matchedNames.has(app.name))
        .sort((a, b) => {
          const scoreA = fuseResults.find(r => r.item.name === a.name)?.score ?? 1;
          const scoreB = fuseResults.find(r => r.item.name === b.name)?.score ?? 1;
          return scoreA - scoreB;
        });
      return apps;
    }

    // Default sort: by likes descending
    apps.sort((a, b) => (b.extra?.likes || 0) - (a.extra?.likes || 0));

    return apps;
  }, [appsForMode, searchQuery, selectedCategory, fuse]);

  return {
    categories,
    filteredApps,
  };
}
