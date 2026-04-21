import { useCallback, useRef, useState } from 'react';
import { getTotalScanParts, mapMeshToScanPart } from '../../../utils/scanParts';

export interface ScanPartInfo {
  family: string;
  part: string;
  [key: string]: unknown;
}

export interface ScanProgress {
  current: number;
  total: number;
}

export interface UseScanProgressResult {
  scanProgress: ScanProgress;
  currentPart: ScanPartInfo | null;
  totalScanParts: number;
  /** Wire this to `Viewer3D.onScanMesh`. */
  handleScanMesh: (mesh: object, index: number, total: number) => void;
  /** Manually bump progress to "complete" once the scan animation finishes. */
  markComplete: () => void;
  /** Reset all internal tracking (called on retry). */
  reset: () => void;
}

/**
 * Throttle + de-dup the stream of `onScanMesh` callbacks fired by Viewer3D's
 * X-ray animation and map each mesh to a scan part (family + part name).
 * The output shape is ready to feed `ScanStepsIndicator`.
 */
export function useScanProgress(): UseScanProgressResult {
  const totalScanParts = getTotalScanParts();

  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    current: 0,
    total: totalScanParts,
  });
  const [currentPart, setCurrentPart] = useState<ScanPartInfo | null>(null);

  const scannedPartsRef = useRef<Set<string>>(new Set<string>());
  const lastProgressRef = useRef<ScanProgress>({ current: 0, total: 0 });
  const lastPartRef = useRef<ScanPartInfo | null>(null);
  const meshPartCacheRef = useRef<WeakMap<object, ScanPartInfo>>(new WeakMap());

  const handleScanMesh = useCallback((mesh: object, index: number, total: number) => {
    let partInfo = meshPartCacheRef.current.get(mesh);
    if (!partInfo) {
      partInfo = mapMeshToScanPart(mesh) as ScanPartInfo | undefined;
      if (partInfo) meshPartCacheRef.current.set(mesh, partInfo);
    }

    if (partInfo) {
      const partKey = `${partInfo.family}:${partInfo.part}`;
      if (!scannedPartsRef.current.has(partKey)) {
        scannedPartsRef.current.add(partKey);
      }

      if (
        !lastPartRef.current ||
        lastPartRef.current.family !== partInfo.family ||
        lastPartRef.current.part !== partInfo.part
      ) {
        setCurrentPart(partInfo);
        lastPartRef.current = partInfo;
      }
    }

    const next: ScanProgress = { current: index, total };
    if (
      lastProgressRef.current.current !== next.current ||
      lastProgressRef.current.total !== next.total
    ) {
      setScanProgress(next);
      lastProgressRef.current = next;
    }
  }, []);

  const markComplete = useCallback(() => {
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentPart(null);
  }, []);

  const reset = useCallback(() => {
    scannedPartsRef.current.clear();
    lastProgressRef.current = { current: 0, total: 0 };
    lastPartRef.current = null;
    setScanProgress({ current: 0, total: totalScanParts });
    setCurrentPart(null);
  }, [totalScanParts]);

  return {
    scanProgress,
    currentPart,
    totalScanParts,
    handleScanMesh,
    markComplete,
    reset,
  };
}
