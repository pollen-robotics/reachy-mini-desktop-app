/**
 * App Matching Utilities
 * 
 * Handles normalization and matching of app IDs and names
 * for finding corresponding metadata in Hugging Face datasets
 */

/**
 * Normalizes an app ID or name by removing underscores and dashes
 * @param {string} id - App ID or name to normalize
 * @returns {string} Normalized ID (lowercase, no underscores/dashes)
 */
export function normalizeAppId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[_-]/g, '').toLowerCase();
}

/**
 * Creates all possible variants of an app ID/name for matching
 * @param {string} id - App ID or name
 * @returns {string[]} Array of variant strings (original, lowercase, normalized, with dashes, with underscores)
 */
export function createAppIdVariants(id) {
  if (!id || typeof id !== 'string') return [];
  
  const variants = new Set();
  
  // Original
  variants.add(id);
  variants.add(id.toLowerCase());
  
  // Normalized (no underscores/dashes)
  const normalized = normalizeAppId(id);
  if (normalized && normalized !== id.toLowerCase()) {
    variants.add(normalized);
  }
  
  // With dashes
  const withDashes = id.replace(/_/g, '-');
  if (withDashes !== id) {
    variants.add(withDashes);
    variants.add(withDashes.toLowerCase());
  }
  
  // With underscores
  const withUnderscores = id.replace(/-/g, '_');
  if (withUnderscores !== id) {
    variants.add(withUnderscores);
    variants.add(withUnderscores.toLowerCase());
  }
  
  return Array.from(variants);
}

/**
 * Builds a metadata map from Hugging Face apps for fast lookup
 * Indexes apps by all possible variants of their ID and name
 * @param {Array} hfApps - Array of Hugging Face app objects
 * @returns {Map} Map of variant -> app object
 */
export function buildMetadataMap(hfApps) {
  const metadataMap = new Map();
  
  hfApps.forEach(hfApp => {
    // Index by ID (primary identifier)
    if (hfApp.id) {
      const idVariants = createAppIdVariants(hfApp.id);
      idVariants.forEach(variant => {
        metadataMap.set(variant, hfApp);
      });
    }
    
    // Index by name (secondary identifier)
    if (hfApp.name) {
      const nameVariants = createAppIdVariants(hfApp.name);
      nameVariants.forEach(variant => {
        // Only add if not already indexed by ID
        if (!metadataMap.has(variant)) {
          metadataMap.set(variant, hfApp);
        }
      });
    }
  });
  
  return metadataMap;
}

/**
 * Finds matching Hugging Face metadata for a daemon app
 * Tries multiple matching strategies in order of priority
 * @param {Object} daemonApp - App object from daemon
 * @param {Map} metadataMap - Pre-built metadata map
 * @param {Array} hfApps - Fallback: full array of HF apps for partial matching
 * @returns {Object|null} Matching HF app metadata or null
 */
export function findAppInMetadataMap(daemonApp, metadataMap, hfApps = []) {
  if (!daemonApp) return null;
  
  // Try all variants of daemon app ID
  if (daemonApp.id) {
    const idVariants = createAppIdVariants(daemonApp.id);
    for (const variant of idVariants) {
      const match = metadataMap.get(variant);
      if (match) return match;
    }
  }
  
  // Try all variants of daemon app name
  if (daemonApp.name) {
    const nameVariants = createAppIdVariants(daemonApp.name);
    for (const variant of nameVariants) {
      const match = metadataMap.get(variant);
      if (match) return match;
    }
  }
  
  // Fallback: partial match (contains)
  if (daemonApp.name && hfApps.length > 0) {
    const daemonNameLower = daemonApp.name.toLowerCase();
    return hfApps.find(hfApp => {
      const hfIdLower = hfApp.id?.toLowerCase() || '';
      const hfNameLower = hfApp.name?.toLowerCase() || '';
      
      return (
        (hfIdLower && (hfIdLower.includes(daemonNameLower) || daemonNameLower.includes(hfIdLower))) ||
        (hfNameLower && (hfNameLower.includes(daemonNameLower) || daemonNameLower.includes(hfNameLower)))
      );
    }) || null;
  }
  
  return null;
}


