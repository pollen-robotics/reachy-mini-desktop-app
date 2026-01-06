import { useMemo } from 'react';

/**
 * Hook for filtering and categorizing apps
 * Extracts categories from tags and filters apps by category, search query, and official status
 * @param {Array} availableApps - All available apps (with isOfficial flag)
 * @param {string} searchQuery - Search query string
 * @param {string|null} selectedCategory - Selected category filter
 * @param {boolean} officialOnly - If true, show only official apps; if false, show only community apps
 */
export function useAppFiltering(availableApps, searchQuery, selectedCategory, officialOnly = true) {
  // First filter by official/community mode
  const appsForMode = useMemo(() => {
    return availableApps.filter(app => {
      // If app has isOfficial flag, use it
      if (app.isOfficial !== undefined) {
        return officialOnly ? app.isOfficial : !app.isOfficial;
      }
      // Fallback: treat hf_space as official
      return officialOnly ? app.source_kind === 'hf_space' : app.source_kind !== 'hf_space';
    });
  }, [availableApps, officialOnly]);

  // Extract available categories from apps with counts (based on filtered mode)
  const categories = useMemo(() => {
    const categoryMap = new Map(); // category -> count
    
    appsForMode.forEach(app => {
      // Extract tags from both root level and cardData (HF API has tags in both places)
      const rootTags = app.extra?.tags || [];
      const cardDataTags = app.extra?.cardData?.tags || [];
      const allTags = [...new Set([...rootTags, ...cardDataTags])]; // Merge and deduplicate
      
      // Extract SDK from both root level and cardData
      const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;
      
      allTags.forEach(tag => {
        if (tag && typeof tag === 'string') {
          // Skip region tags (e.g., 'region:us')
          // Skip reachy_mini tag as it's present everywhere and is the condition to be in the list
          // Skip static tag as it's not useful for filtering
          if (!tag.startsWith('region:') && 
              tag.toLowerCase() !== 'reachy_mini' && 
              tag.toLowerCase() !== 'reachy-mini' &&
              tag.toLowerCase() !== 'static') {
            // If tag matches SDK, use tag name instead of sdk: prefix to avoid duplicates
            // Otherwise, add tag as-is
            if (sdk && tag.toLowerCase() === sdk.toLowerCase()) {
              // Tag matches SDK, use tag name (will be counted once)
              categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
            } else {
              categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
            }
          }
        }
      });
      
      // Only add SDK category if SDK doesn't match any existing tag
      if (sdk && typeof sdk === 'string') {
        const sdkLower = sdk.toLowerCase();
        const hasMatchingTag = allTags.some(tag => 
          tag && typeof tag === 'string' && tag.toLowerCase() === sdkLower
        );
        
        // Only add SDK category if no matching tag exists
        if (!hasMatchingTag) {
          const sdkCategory = `sdk:${sdk}`;
          categoryMap.set(sdkCategory, (categoryMap.get(sdkCategory) || 0) + 1);
        }
      }
    });
    
    // Convert to array of objects with name and count, sorted by count (descending) then by name
    // Limit to top 6 categories by count
    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        // First sort by count (descending)
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        // Then by name (ascending)
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6); // Keep only top 6 categories
  }, [appsForMode]);

  // Filter apps based on search and category (already filtered by mode)
  const filteredApps = useMemo(() => {
    // Start with apps filtered by mode
    let apps = [...appsForMode];
    
    // Filter by category FIRST
    if (selectedCategory) {
      const beforeCount = apps.length;
      apps = apps.filter(app => {
        // Get tags from both root level and cardData
        const rootTags = app.extra?.tags || [];
        const cardDataTags = app.extra?.cardData?.tags || [];
        const allTags = [...new Set([...rootTags, ...cardDataTags])];
        
        // Get SDK from both root level and cardData
        const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;
        
        // Check if app matches selected category
        if (selectedCategory.startsWith('sdk:')) {
          const sdkCategory = selectedCategory.replace('sdk:', '');
          return sdk === sdkCategory;
        } else {
          // Check if tag matches (case-insensitive), or if SDK matches the tag (for merged categories)
          const tagMatches = allTags.some(tag => 
            tag && typeof tag === 'string' && tag.toLowerCase() === selectedCategory.toLowerCase()
          );
          const sdkMatches = sdk && typeof sdk === 'string' && sdk.toLowerCase() === selectedCategory.toLowerCase();
          return tagMatches || sdkMatches;
        }
      });
      const afterCount = apps.length;
      
    }
    
    // Filter by search query AFTER category filter
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      apps = apps.filter(app => 
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query))
      );
    }
    
    // Sort by likes (descending) - most liked apps first
    apps = apps.sort((a, b) => {
      const likesA = a.extra?.likes || 0;
      const likesB = b.extra?.likes || 0;
      return likesB - likesA;
    });
    
    return apps;
  }, [appsForMode, searchQuery, selectedCategory]);

  return {
    categories,
    filteredApps,
  };
}

