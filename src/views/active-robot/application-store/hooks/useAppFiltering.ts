import { useMemo, useRef } from 'react';
import Fuse from 'fuse.js';

const EXCLUDED_TAGS = new Set([
  'reachy_mini',
  'reachy-mini',
  'reachy_mini_python_app',
  'static',
  'docker',
  'region:us',
  'region:eu',
]);

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

type AnyRecord = Record<string, unknown>;

interface AppLike extends AnyRecord {
  name?: string;
  id?: string;
  description?: string;
  source_kind?: string;
  isOfficial?: boolean;
  extra?: AnyRecord & {
    id?: string;
    author?: string;
    tags?: string[];
    sdk?: string;
    likes?: number;
    private?: boolean;
    cardData?: AnyRecord & { tags?: string[]; sdk?: string; short_description?: string };
  };
}

interface Category {
  name: string;
  count: number;
}

interface UseAppFilteringReturn {
  categories: Category[];
  filteredApps: AppLike[];
}

export function useAppFiltering(
  availableApps: AppLike[],
  searchQuery: string,
  selectedCategory: string | null,
  officialOnly: boolean = false,
  privateOnly: boolean = false
): UseAppFilteringReturn {
  const fuseRef = useRef<Fuse<AppLike> | null>(null);
  const fuseInputRef = useRef<AppLike[] | null>(null);
  void fuseRef;
  void fuseInputRef;

  const appsForMode = useMemo<AppLike[]>(() => {
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

  const categories = useMemo<Category[]>(() => {
    const categoryMap = new Map<string, number>();

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

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name)))
      .slice(0, 8);
  }, [appsForMode]);

  const filteredApps = useMemo<AppLike[]>(() => {
    let apps = [...appsForMode];

    if (selectedCategory) {
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

    apps.sort((a, b) => (b.extra?.likes || 0) - (a.extra?.likes || 0));

    return apps;
  }, [appsForMode, searchQuery, selectedCategory, fuse]);

  return {
    categories,
    filteredApps,
  };
}
