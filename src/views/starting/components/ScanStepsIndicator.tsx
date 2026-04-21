/**
 * ScanStepsIndicator - Scan-specific wrapper around StepsProgressIndicator
 *
 * Uses `daemonStep` (a single monotonically-advancing enum) as the sole source
 * of truth for step progression, plus a high-watermark ref to guarantee steps
 * never visually regress - even if React renders an intermediate state between
 * two async state updates.
 */

import React, { useRef } from 'react';
import StepsProgressIndicator from '../../../components/ui/StepsProgressIndicator';

export type DaemonStep =
  | 'connecting'
  | 'initializing'
  | 'detecting'
  | 'syncing'
  | 'loading_apps'
  | (string & {});

const SCAN_STEPS = [
  { id: 'start', label: 'Start' },
  { id: 'connect', label: 'Connect' },
  { id: 'healthcheck', label: 'Healthcheck' },
  { id: 'apps', label: 'Apps' },
];

interface DaemonStepMapping {
  step: number;
  progress: number;
}

// Mapping from daemonStep enum -> visual step index & progress %
// daemonStep transitions: connecting -> detecting -> syncing -> loading_apps
const DAEMON_STEP_MAP: Record<string, DaemonStepMapping> = {
  connecting: { step: 1, progress: 33 },
  initializing: { step: 1, progress: 33 },
  detecting: { step: 2, progress: 66 },
  syncing: { step: 2, progress: 66 },
  loading_apps: { step: 3, progress: 100 },
};

export interface ScanStepsIndicatorProps {
  scanComplete: boolean;
  daemonStep: DaemonStep;
  darkMode: boolean;
  // Unused legacy props kept for call-site compat
  waitingForDaemon?: boolean;
  waitingForMovements?: boolean;
  waitingForWebSocket?: boolean;
  waitingForApps?: boolean;
  scanProgress?: number;
  daemonAttempts?: number;
  movementAttempts?: number;
}

function ScanStepsIndicator({
  scanComplete,
  daemonStep,
  darkMode,
  // Unused legacy props kept for call-site compat
  waitingForDaemon,
  waitingForMovements,
  waitingForWebSocket,
  waitingForApps,
  scanProgress,
  daemonAttempts,
  movementAttempts,
}: ScanStepsIndicatorProps) {
  const highWaterRef = useRef<DaemonStepMapping>({ step: 0, progress: 0 });

  // Reset watermark when scan restarts (e.g. retry)
  if (!scanComplete) {
    highWaterRef.current = { step: 0, progress: 0 };
  }

  // Derive raw values from single source of truth
  const mapping = scanComplete
    ? (DAEMON_STEP_MAP[daemonStep] ?? { step: 1, progress: 33 })
    : { step: 0, progress: 0 };

  // Monotonic: never go backward
  const currentStep = Math.max(mapping.step, highWaterRef.current.step);
  const progress = Math.max(mapping.progress, highWaterRef.current.progress);
  highWaterRef.current = { step: currentStep, progress };

  return (
    <StepsProgressIndicator
      steps={SCAN_STEPS}
      currentStep={currentStep}
      progress={progress}
      darkMode={darkMode}
    />
  );
}

export default React.memo(ScanStepsIndicator);
