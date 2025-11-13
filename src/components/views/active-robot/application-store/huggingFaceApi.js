// Hugging Face dataset URL for app list
export const HUGGINGFACE_APP_LIST_URL = 'https://huggingface.co/datasets/pollen-robotics/reachy-mini-application-store/raw/main/app-list.json';

/**
 * Parse JavaScript-like object notation to JSON
 * Handles single quotes, unquoted keys, and trailing commas
 * Uses eval in a safe way (only for trusted Hugging Face dataset)
 */
function parseJavaScriptLike(text) {
  try {
    // Use Function constructor as a safer alternative to eval
    // This is safe because we're only parsing data from Hugging Face (trusted source)
    const func = new Function('return ' + text);
    return func();
  } catch (e) {
    console.error('Failed to parse JavaScript-like format:', e);
    // Fallback: try manual parsing
    try {
      // Replace single quotes with double quotes (simple approach)
      let jsonText = text.replace(/'/g, '"');
      // Add quotes around unquoted keys
      jsonText = jsonText.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
      // Remove trailing commas
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(jsonText);
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);
      throw e;
    }
  }
}

/**
 * Fetch likes for a single Hugging Face Space
 * Tries multiple methods: API endpoint, then HTML scraping
 * @param {string} spaceId - The space ID (e.g., 'hand-tracker' or 'pollen-robotics/hand-tracker')
 * @returns {Promise<number>} Number of likes
 */
async function fetchSpaceLikes(spaceId) {
  try {
    // Build the full path: if spaceId doesn't include '/', assume it's under pollen-robotics
    const fullPath = spaceId.includes('/') ? spaceId : `pollen-robotics/${spaceId}`;
    
    // Method 1: Try the API endpoint (may require auth, but worth trying)
    try {
      const apiUrl = `https://huggingface.co/api/spaces/${fullPath}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.likes !== undefined) {
          return data.likes || 0;
        }
      }
    } catch (apiError) {
      // API failed, try HTML scraping
    }
    
    // Method 2: Try scraping from the HTML page
    try {
      const pageUrl = `https://huggingface.co/spaces/${fullPath}`;
      const response = await fetch(pageUrl, {
        headers: {
          'Accept': 'text/html',
        },
      });
      
      if (response.ok) {
        const html = await response.text();
        // Look for likes in the HTML (various possible formats)
        // Try to find JSON data embedded in the page
        const jsonMatch = html.match(/"likes"\s*:\s*(\d+)/);
        if (jsonMatch) {
          return parseInt(jsonMatch[1], 10);
        }
        
        // Try to find in script tags with JSON data
        const scriptMatches = html.match(/<script[^>]*>[\s\S]*?"likes"\s*:\s*(\d+)[\s\S]*?<\/script>/);
        if (scriptMatches) {
          return parseInt(scriptMatches[1], 10);
        }
      }
    } catch (htmlError) {
      // HTML scraping failed
    }
    
    // If all methods fail, return 0
    return 0;
  } catch (error) {
    console.warn(`⚠️ Error fetching likes for ${spaceId}:`, error.message);
    return 0;
  }
}

/**
 * Fetch likes for multiple Hugging Face Spaces
 * Uses Promise.all to fetch all spaces in parallel
 * @param {Array<string>} spaceIds - Array of space IDs (e.g., ['hand-tracker', 'dance-mini'])
 * @returns {Promise<Map<string, number>>} Map of space ID to likes count
 */
async function fetchSpacesLikes(spaceIds) {
  const likesMap = new Map();
  
  if (spaceIds.length === 0) {
    return likesMap;
  }
  
  try {
    console.log(`⭐ Fetching likes for ${spaceIds.length} spaces...`);
    
    // Fetch all spaces in parallel
    const likesPromises = spaceIds.map(async (spaceId) => {
      const likes = await fetchSpaceLikes(spaceId);
      return { spaceId, likes };
    });
    
    const results = await Promise.all(likesPromises);
    
    // Build the map
    results.forEach(({ spaceId, likes }) => {
      likesMap.set(spaceId, likes);
    });
    
    const totalLikes = Array.from(likesMap.values()).reduce((sum, likes) => sum + likes, 0);
    console.log(`⭐ Found likes for ${likesMap.size}/${spaceIds.length} spaces (total: ${totalLikes} likes)`);
  } catch (error) {
    console.warn(`⚠️ Error fetching spaces likes:`, error.message);
  }
  
  return likesMap;
}

/**
 * Fetch app list from Hugging Face dataset and enrich with real likes
 * @returns {Promise<Array>} Array of apps from the dataset with real likes
 */
export async function fetchHuggingFaceAppList() {
  try {
    console.log('🌐 Fetching app list from:', HUGGINGFACE_APP_LIST_URL);
    const response = await fetch(HUGGINGFACE_APP_LIST_URL, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch app list: ${response.status} ${response.statusText}`);
    }
    
    // Get text first to handle JavaScript-like format
    const text = await response.text();
    console.log('📦 Raw text length:', text.length, 'chars');
    
    let data;
    try {
      // Try parsing as JSON first
      data = JSON.parse(text);
    } catch (jsonError) {
      // If JSON parsing fails, try parsing as JavaScript-like format
      console.log('⚠️ JSON parse failed, trying JavaScript-like format...');
      data = parseJavaScriptLike(text);
    }
    
    console.log('📦 Parsed data type:', typeof data, Array.isArray(data) ? `array of ${data.length}` : 'object');
    
    // Handle both array and object formats
    let apps = [];
    if (Array.isArray(data)) {
      apps = data;
    } else if (data && typeof data === 'object') {
      // If it's an object, try to extract an array from common keys
      apps = data.apps || data.items || data.list || Object.values(data).find(v => Array.isArray(v)) || [];
    }
    
    console.log('📦 Fetched', apps.length, 'apps from dataset');
    
    // Try to enrich with real likes from Hugging Face API
    // If API fails, use downloads as fallback
    console.log('⭐ Attempting to fetch real likes from Hugging Face API...');
    const spaceIds = apps.filter(app => app.id).map(app => app.id);
    let likesMap = new Map();
    
    if (spaceIds.length > 0) {
      try {
        likesMap = await fetchSpacesLikes(spaceIds);
      } catch (error) {
        console.warn('⚠️ Failed to fetch likes from API, using downloads as fallback');
      }
    }
    
    const enrichedApps = apps.map((app) => {
      // Get real likes if we have a space ID and API returned data
      if (app.id) {
        const realLikes = likesMap.get(app.id);
        // Use real likes if available and > 0, otherwise use downloads
        const displayLikes = (realLikes !== undefined && realLikes > 0) 
          ? realLikes 
          : (app.downloads || 0);
        
        return {
          ...app,
          likes: displayLikes,
          // Keep downloads as a separate field
          downloads: app.downloads || 0,
        };
      }
      // If no ID, use downloads as likes
      return {
        ...app,
        likes: app.downloads || 0,
        downloads: app.downloads || 0,
      };
    });
    
    console.log('📦 Final apps count:', enrichedApps.length);
    if (enrichedApps.length > 0) {
      console.log('📦 First app with likes:', enrichedApps[0]);
    }
    return enrichedApps || [];
  } catch (error) {
    console.error('❌ Failed to fetch Hugging Face app list:', error);
    console.error('❌ Error details:', error.message);
    // Return empty array on error to prevent breaking the app
    return [];
  }
}

