/**
 * Static list of robot parts to scan, organized in families with sub-parts.
 * Based on actual STL files and robot structure.
 */

export interface ScanFamily {
  family: string;
  parts: string[];
}

export interface ScanPartLocation {
  family: string;
  part: string;
  index: number;
}

export interface ScanPartProgress {
  family: string;
  part: string;
  progress: number;
}

export interface ScanPartMatch {
  family: string;
  part: string;
}

export const SCAN_PARTS: ScanFamily[] = [
  {
    family: 'Base Unit',
    parts: ['Body Base', 'Body Foot', 'Body Turning Mechanism', 'Yaw Body Joint'],
  },
  {
    family: 'Head Assembly',
    parts: ['Head Front Panel', 'Head Back Panel', 'Head Structure', 'Neck Reference'],
  },
  {
    family: 'Stewart Platform',
    parts: [
      'Stewart Main Plate',
      'Stewart Link Rods',
      'Stewart Link Balls',
      'Stewart Tricap',
      'Stewart Actuators',
    ],
  },
  {
    family: 'Camera Module',
    parts: ['Arducam Housing', 'Main Optical Lens', 'Camera Lens', 'Lens Cap', 'Camera Mount'],
  },
  {
    family: 'Antenna System',
    parts: [
      'Left Antenna',
      'Right Antenna',
      'Antenna Body',
      'Antenna Holders',
      'Antenna Interface',
    ],
  },
  {
    family: 'Audio System',
    parts: ['Speaker Module', 'Microphone Array', 'Audio Interface'],
  },
  {
    family: 'Electronics',
    parts: [
      'Main Control Board',
      'Power Distribution',
      'Sensor Modules',
      'Motor Drivers',
      'Communication Interface',
    ],
  },
  {
    family: 'Mechanical Components',
    parts: ['Bearings', 'Connectors', 'Fasteners', 'Support Structures'],
  },
];

export function getTotalScanParts(): number {
  return SCAN_PARTS.reduce((total, family) => total + family.parts.length, 0);
}

export function getPartByIndex(index: number): ScanPartLocation | null {
  let currentIndex = 0;
  for (const family of SCAN_PARTS) {
    for (const part of family.parts) {
      if (currentIndex === index) {
        return { family: family.family, part, index };
      }
      currentIndex++;
    }
  }
  return null;
}

export function getCurrentScanPart(currentIndex: number, total: number): ScanPartProgress | null {
  if (total === 0) return null;
  const part = getPartByIndex(currentIndex);
  if (!part) return null;

  return {
    family: part.family,
    part: part.part,
    progress: ((currentIndex + 1) / total) * 100,
  };
}

/**
 * Loose mesh-like type to avoid pulling in `three` types directly.
 */
export interface ScanMesh {
  name?: string;
  userData?: {
    isAntenna?: boolean;
    materialName?: string;
    stlFileName?: string;
    [key: string]: unknown;
  } | null;
  material?: { name?: string } | null;
  parent?: ScanMesh | null;
}

/**
 * Map a mesh component group to a scan part. Uses component group detection to
 * match against the static parts list.
 */
export function mapMeshToScanPart(mesh: ScanMesh | null | undefined): ScanPartMatch | null {
  if (!mesh) return null;

  const meshName = (mesh.name || '').toLowerCase();
  const materialName = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase();

  if (mesh.userData?.isAntenna) {
    if (meshName.includes('left') || meshName.includes('l_')) {
      return { family: 'Antenna System', part: 'Left Antenna' };
    }
    if (meshName.includes('right') || meshName.includes('r_')) {
      return { family: 'Antenna System', part: 'Right Antenna' };
    }
    if (meshName.includes('body') || meshName.includes('interface')) {
      return { family: 'Antenna System', part: 'Antenna Body' };
    }
    if (meshName.includes('holder')) {
      return { family: 'Antenna System', part: 'Antenna Holders' };
    }
    return { family: 'Antenna System', part: 'Antenna Interface' };
  }

  if (materialName.includes('big_lens') || materialName.includes('lens_d40')) {
    return { family: 'Camera Module', part: 'Main Optical Lens' };
  }
  if (materialName.includes('small_lens') || materialName.includes('lens_d30')) {
    return { family: 'Camera Module', part: 'Camera Lens' };
  }
  if (materialName.includes('lens_cap')) {
    return { family: 'Camera Module', part: 'Lens Cap' };
  }

  let currentParent: ScanMesh | null | undefined = mesh.parent;
  let depth = 0;
  while (currentParent && depth < 5) {
    const pName = (currentParent.name || '').toLowerCase();

    if (
      pName.includes('xl_330') ||
      pName.includes('camera') ||
      pName.includes('arducam') ||
      meshName.includes('xl_330') ||
      meshName.includes('camera') ||
      meshName.includes('arducam')
    ) {
      if (meshName.includes('mount') || pName.includes('mount')) {
        return { family: 'Camera Module', part: 'Camera Mount' };
      }
      return { family: 'Camera Module', part: 'Arducam Housing' };
    }

    if (pName.includes('stewart') || meshName.includes('stewart')) {
      if (meshName.includes('plate') || meshName.includes('main')) {
        return { family: 'Stewart Platform', part: 'Stewart Main Plate' };
      }
      if (meshName.includes('rod') || meshName.includes('link_rod')) {
        return { family: 'Stewart Platform', part: 'Stewart Link Rods' };
      }
      if (meshName.includes('ball') || meshName.includes('link_ball')) {
        return { family: 'Stewart Platform', part: 'Stewart Link Balls' };
      }
      if (meshName.includes('tricap')) {
        return { family: 'Stewart Platform', part: 'Stewart Tricap' };
      }
      if (meshName.includes('arm') || meshName.includes('actuator')) {
        return { family: 'Stewart Platform', part: 'Stewart Actuators' };
      }
      if (pName.includes('head') || meshName.includes('head')) {
        if (meshName.includes('front')) {
          return { family: 'Head Assembly', part: 'Head Front Panel' };
        }
        if (meshName.includes('back')) {
          return { family: 'Head Assembly', part: 'Head Back Panel' };
        }
        if (meshName.includes('mic')) {
          return { family: 'Audio System', part: 'Microphone Array' };
        }
        return { family: 'Head Assembly', part: 'Head Structure' };
      }
    }

    if (pName.includes('head') || meshName.includes('head')) {
      if (meshName.includes('front')) {
        return { family: 'Head Assembly', part: 'Head Front Panel' };
      }
      if (meshName.includes('back')) {
        return { family: 'Head Assembly', part: 'Head Back Panel' };
      }
      if (meshName.includes('mic')) {
        return { family: 'Audio System', part: 'Microphone Array' };
      }
      if (meshName.includes('neck')) {
        return { family: 'Head Assembly', part: 'Neck Reference' };
      }
      return { family: 'Head Assembly', part: 'Head Structure' };
    }

    if (
      pName.includes('base') ||
      pName.includes('body') ||
      pName.includes('yaw_body') ||
      meshName.includes('base') ||
      meshName.includes('body') ||
      meshName.includes('yaw')
    ) {
      if (meshName.includes('foot')) {
        return { family: 'Base Unit', part: 'Body Foot' };
      }
      if (meshName.includes('top')) {
        return { family: 'Base Unit', part: 'Body Base' };
      }
      if (meshName.includes('down') || meshName.includes('bottom')) {
        return { family: 'Base Unit', part: 'Body Base' };
      }
      if (meshName.includes('turning')) {
        return { family: 'Base Unit', part: 'Body Turning Mechanism' };
      }
      if (meshName.includes('yaw')) {
        return { family: 'Base Unit', part: 'Yaw Body Joint' };
      }
      return { family: 'Base Unit', part: 'Body Base' };
    }

    if (pName.includes('speaker') || meshName.includes('speaker') || meshName.includes('mic')) {
      if (meshName.includes('mic')) {
        return { family: 'Audio System', part: 'Microphone Array' };
      }
      return { family: 'Audio System', part: 'Speaker Module' };
    }

    currentParent = currentParent.parent;
    depth++;
  }

  const stlFileName = mesh.userData?.stlFileName || '';
  if (stlFileName) {
    const stlLower = stlFileName.toLowerCase();
    if (stlLower.includes('antenna')) {
      return { family: 'Antenna System', part: 'Antenna Body' };
    }
    if (stlLower.includes('stewart')) {
      return { family: 'Stewart Platform', part: 'Stewart Main Plate' };
    }
    if (stlLower.includes('head')) {
      return { family: 'Head Assembly', part: 'Head Structure' };
    }
    if (stlLower.includes('body')) {
      return { family: 'Base Unit', part: 'Body Base' };
    }
    if (stlLower.includes('lens')) {
      return { family: 'Camera Module', part: 'Camera Lens' };
    }
    if (stlLower.includes('speaker')) {
      return { family: 'Audio System', part: 'Speaker Module' };
    }
  }

  return { family: 'Mechanical Components', part: 'Support Structures' };
}
