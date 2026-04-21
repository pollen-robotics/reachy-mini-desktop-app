/**
 * Centralized hardware error configuration.
 *
 * This module provides a DRY, evolutive system for managing hardware errors:
 * - Single source of truth for error definitions
 * - Easy to add new error types
 * - Consistent error handling across the app
 *
 * The Three.js types are kept loose (`MeshLike`) so that this module never
 * imports `three` directly - it stays in the "utils" layer.
 */

// ============================================================================
// LOOSE THREE.JS-ADJACENT TYPES
// ============================================================================

/** Minimal Three.js mesh shape this module needs. */
export interface MeshLike {
  uuid: string;
  name?: string;
  parent?: MeshLike | null;
  children?: MeshLike[];
  isMesh?: boolean;
  userData?: { isOutline?: boolean; materialName?: string; [key: string]: unknown };
  material?: { name?: string };
}

/** Object containing a `links` map (URDF robot ref). */
export interface RobotRefLike {
  links?: Record<string, MeshLike>;
}

// ============================================================================
// ERROR CONFIG
// ============================================================================

export interface HardwareErrorMessageParts {
  text: string;
  bold: string;
  suffix: string;
}

export interface HardwareErrorConfig {
  type: string;
  patterns: ReadonlyArray<string>;
  message: HardwareErrorMessageParts;
  meshPatterns: ReadonlyArray<string> | null;
  linkName: string | null;
  cameraPreset: 'scan' | string;
  code: string | null;
}

export interface HardwareErrorObject {
  type: string;
  message: string;
  messageParts: HardwareErrorMessageParts;
  code: string | null;
  cameraPreset: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Find meshes whose name (or material name, or any ancestor name) contains one
 * of the given patterns.
 */
export function findMeshesByPattern(
  allMeshes: MeshLike[] | null | undefined,
  patterns: string | ReadonlyArray<string>
): MeshLike[] {
  if (!allMeshes || allMeshes.length === 0) return [];

  const patternList = Array.isArray(patterns) ? patterns : [patterns as string];

  return allMeshes.filter(mesh => {
    const meshName = (mesh.name ?? '').toLowerCase();
    const materialName = (mesh.userData?.materialName ?? mesh.material?.name ?? '').toLowerCase();

    for (const pattern of patternList) {
      const patternLower = pattern.toLowerCase();
      if (meshName.includes(patternLower) || materialName.includes(patternLower)) {
        return true;
      }
    }

    let current: MeshLike | null | undefined = mesh.parent ?? null;
    let depth = 0;
    while (current && depth < 10) {
      const parentName = (current.name ?? '').toLowerCase();
      for (const pattern of patternList) {
        if (parentName.includes(pattern.toLowerCase())) {
          return true;
        }
      }
      current = current.parent ?? null;
      depth++;
    }

    return false;
  });
}

/**
 * Find every mesh attached (directly or transitively) to a given URDF link.
 */
export function findMeshesByLink(
  robotRef: RobotRefLike | null | undefined,
  allMeshes: MeshLike[] | null | undefined,
  linkName: string
): MeshLike[] {
  const link = robotRef?.links?.[linkName];
  if (!link || !allMeshes || allMeshes.length === 0) {
    return [];
  }

  const linkMeshes: MeshLike[] = [];

  const collectMeshes = (obj: MeshLike): void => {
    if (obj.isMesh && !obj.userData?.isOutline) {
      linkMeshes.push(obj);
    }
    obj.children?.forEach(child => collectMeshes(child));
  };

  collectMeshes(link);

  const linkMeshUuids = new Set(linkMeshes.map(m => m.uuid));
  return allMeshes.filter(mesh => linkMeshUuids.has(mesh.uuid));
}

// ============================================================================
// CONFIG
// ============================================================================

export const HARDWARE_ERROR_CONFIGS = {
  NO_MOTORS: {
    type: 'no_motors',
    patterns: [
      'No motors detected',
      'RuntimeError: No motors detected',
      'No motor found on port',
      'RuntimeError: No motor found on port',
    ],
    message: {
      text: 'Power supply',
      bold: 'not connected',
      suffix: '— press button and plug in power',
    },
    meshPatterns: null,
    linkName: null,
    cameraPreset: 'scan',
    code: 'NO_POWER',
  },

  CAMERA_ERROR: {
    type: 'camera',
    patterns: ['xl_330', 'Camera communication error'],
    message: {
      text: 'Check',
      bold: 'camera cable',
      suffix: '',
    },
    meshPatterns: ['camera', 'xl_330'],
    linkName: 'camera',
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
} as const satisfies Record<string, HardwareErrorConfig>;

export type HardwareErrorKey = keyof typeof HARDWARE_ERROR_CONFIGS;

/**
 * Find error configuration by matching error message.
 */
export function findErrorConfig(
  errorMessage: string | null | undefined
): HardwareErrorConfig | null {
  if (!errorMessage) return null;

  const errorLower = errorMessage.toLowerCase();

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
 * Get error meshes for a given error configuration.
 */
export function getErrorMeshes(
  errorConfig: HardwareErrorConfig | null | undefined,
  robotRef: RobotRefLike | null | undefined,
  allMeshes: MeshLike[] | null | undefined
): MeshLike[] | null {
  if (!errorConfig || !allMeshes || allMeshes.length === 0) {
    return null;
  }

  if (errorConfig.linkName && robotRef) {
    const linkMeshes = findMeshesByLink(robotRef, allMeshes, errorConfig.linkName);
    if (linkMeshes.length > 0) {
      return linkMeshes;
    }
  }

  if (errorConfig.meshPatterns) {
    const patternMeshes = findMeshesByPattern(allMeshes, errorConfig.meshPatterns);
    if (patternMeshes.length > 0) {
      return patternMeshes;
    }
  }

  return null;
}

/**
 * Create error object from configuration.
 */
export function createErrorFromConfig(
  errorConfig: HardwareErrorConfig,
  originalMessage: string
): HardwareErrorObject {
  return {
    type: errorConfig.type,
    message: errorConfig.message.text
      ? `${errorConfig.message.text} ${errorConfig.message.bold} ${errorConfig.message.suffix}`
      : originalMessage,
    messageParts: errorConfig.message,
    code: errorConfig.code ?? null,
    cameraPreset: errorConfig.cameraPreset ?? 'scan',
  };
}
