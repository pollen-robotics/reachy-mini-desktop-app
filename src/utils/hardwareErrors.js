/**
 * Centralized hardware error configuration
 * 
 * This module provides a DRY, evolutive system for managing hardware errors:
 * - Single source of truth for error definitions
 * - Easy to add new error types
 * - Consistent error handling across the app
 */

/**
 * Helper function to find meshes by component name/pattern
 * @param {Array<THREE.Mesh>} allMeshes - All available meshes
 * @param {string|Array<string>} patterns - Pattern(s) to search for in mesh names
 * @returns {Array<THREE.Mesh>} Matching meshes
 */
export function findMeshesByPattern(allMeshes, patterns) {
  if (!allMeshes || allMeshes.length === 0) return [];
  
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  
  return allMeshes.filter(mesh => {
    const meshName = (mesh.name || '').toLowerCase();
    const materialName = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase();
    
    // Check mesh name and material name
    for (const pattern of patternList) {
      const patternLower = pattern.toLowerCase();
      if (meshName.includes(patternLower) || materialName.includes(patternLower)) {
        return true;
      }
    }
    
    // Check parent hierarchy
    let current = mesh.parent;
    let depth = 0;
    while (current && depth < 10) {
      const parentName = (current.name || '').toLowerCase();
      for (const pattern of patternList) {
        const patternLower = pattern.toLowerCase();
        if (parentName.includes(patternLower)) {
          return true;
        }
      }
      current = current.parent;
      depth++;
    }
    
    return false;
  });
}

/**
 * Helper function to find meshes by URDF link name
 * @param {Object} robotRef - Robot reference with links
 * @param {Array<THREE.Mesh>} allMeshes - All available meshes
 * @param {string} linkName - URDF link name
 * @returns {Array<THREE.Mesh>} Meshes belonging to the link
 */
export function findMeshesByLink(robotRef, allMeshes, linkName) {
  if (!robotRef?.links?.[linkName] || !allMeshes || allMeshes.length === 0) {
    return [];
  }
  
  const link = robotRef.links[linkName];
  const linkMeshes = [];
  
  // Helper to collect all meshes from an object
  const collectMeshes = (obj) => {
    if (obj.isMesh && !obj.userData.isOutline) {
      linkMeshes.push(obj);
    }
    if (obj.children) {
      obj.children.forEach(child => collectMeshes(child));
    }
  };
  
  collectMeshes(link);
  
  // Match meshes by UUID
  const linkMeshUuids = new Set(linkMeshes.map(m => m.uuid));
  return allMeshes.filter(mesh => linkMeshUuids.has(mesh.uuid));
}

/**
 * Hardware error configuration
 * Each error type defines:
 * - type: unique identifier
 * - patterns: strings to match in error messages
 * - message: user-friendly error message
 * - meshPatterns: patterns to find meshes to highlight (optional)
 * - linkName: URDF link name to find meshes (optional, takes precedence over meshPatterns)
 * - cameraPreset: camera preset name for focusing (optional)
 * - code: error code to display (optional)
 */
export const HARDWARE_ERROR_CONFIGS = {
  NO_MOTORS: {
    type: 'no_motors',
    patterns: ['No motors detected', 'RuntimeError: No motors detected'],
    message: {
      text: 'Power supply',
      bold: 'not connected',
      suffix: '— plug in and turn on',
    },
    // No specific mesh to highlight - this is a global power issue
    meshPatterns: null,
    linkName: null,
    cameraPreset: 'scan', // Keep default scan view
    code: 'NO_POWER',
  },
  
  CAMERA_ERROR: {
    type: 'camera',
    patterns: ['camera', 'xl_330', 'Camera communication error'],
    message: {
      text: 'Check',
      bold: 'camera cable',
      suffix: '',
    },
    meshPatterns: ['camera', 'xl_330'],
    linkName: 'camera', // Prefer URDF link if available
    cameraPreset: 'scan',
    code: null,
  },
  
  MOTOR_COMMUNICATION: {
    type: 'motor_communication',
    patterns: ['Motor communication error', 'Failed to read raw bytes'],
    message: {
      text: 'Check',
      bold: 'power supply',
      suffix: '',
    },
    // Could highlight specific motor meshes if we know which one
    meshPatterns: null,
    linkName: null,
    cameraPreset: 'scan',
    code: null,
  },
  
  APP_TRANSLOCATION: {
    type: 'app_translocation',
    patterns: ['AppTranslocation', 'APP_TRANSLOCATION_ERROR', 'Read-only file system'],
    message: {
      text: 'Move the app to',
      bold: 'Applications',
      suffix: 'folder',
    },
    meshPatterns: null,
    linkName: null,
    cameraPreset: 'scan',
    code: 'APP_TRANSLOCATION',
  },
  
  // Add more error types here as needed
  // Example:
  // ANTENNA_ERROR: {
  //   type: 'antenna',
  //   patterns: ['antenna', 'Antenna communication'],
  //   message: {
  //     text: 'Check',
  //     bold: 'antenna',
  //     suffix: 'connection',
  //   },
  //   meshPatterns: ['antenna'],
  //   linkName: null,
  //   cameraPreset: 'scan',
  //   code: null,
  // },
};

/**
 * Find error configuration by matching error message
 * @param {string} errorMessage - The error message to match
 * @returns {Object|null} Error configuration or null if no match
 */
export function findErrorConfig(errorMessage) {
  if (!errorMessage) return null;
  
  const errorLower = errorMessage.toLowerCase();
  
  // Check each error config
  for (const config of Object.values(HARDWARE_ERROR_CONFIGS)) {
    for (const pattern of config.patterns) {
      if (errorLower.includes(pattern.toLowerCase())) {
        return config;
      }
    }
  }
  
  return null;
}

/**
 * Get error meshes for a given error configuration
 * @param {Object} errorConfig - Error configuration
 * @param {Object} robotRef - Robot reference (optional)
 * @param {Array<THREE.Mesh>} allMeshes - All available meshes
 * @returns {Array<THREE.Mesh>} Meshes to highlight, or null if no specific meshes
 */
export function getErrorMeshes(errorConfig, robotRef, allMeshes) {
  if (!errorConfig || !allMeshes || allMeshes.length === 0) {
    return null;
  }
  
  // Prefer URDF link if available
  if (errorConfig.linkName && robotRef) {
    const linkMeshes = findMeshesByLink(robotRef, allMeshes, errorConfig.linkName);
    if (linkMeshes.length > 0) {
      return linkMeshes;
    }
  }
  
  // Fallback to mesh patterns
  if (errorConfig.meshPatterns) {
    const patternMeshes = findMeshesByPattern(allMeshes, errorConfig.meshPatterns);
    if (patternMeshes.length > 0) {
      return patternMeshes;
    }
  }
  
  return null;
}

/**
 * Create error object from configuration
 * @param {Object} errorConfig - Error configuration
 * @param {string} originalMessage - Original error message
 * @returns {Object} Error object for useAppStore
 */
export function createErrorFromConfig(errorConfig, originalMessage) {
  return {
    type: errorConfig.type,
    message: errorConfig.message.text 
      ? `${errorConfig.message.text} ${errorConfig.message.bold} ${errorConfig.message.suffix}`
      : originalMessage,
    messageParts: errorConfig.message, // Keep structured message for UI
    code: errorConfig.code || null,
    cameraPreset: errorConfig.cameraPreset || 'scan',
  };
}

