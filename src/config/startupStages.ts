/**
 * Startup Stages Configuration.
 *
 * Centralized definition of all startup stages with labels, progress
 * percentages and log patterns used to detect each stage automatically.
 */

export interface StartupStage {
  id: string;
  label: string;
  description: string;
  progressMin: number;
  progressMax: number;
  isSimOnly: boolean;
  logPatterns?: ReadonlyArray<string>;
}

/** Order matters: stages are checked in order and first match wins. */
export const STARTUP_STAGES = {
  // HARDWARE SCAN (0-50%)
  SCANNING: {
    id: 'scanning',
    label: 'Scanning Hardware',
    description: 'Checking robot components',
    progressMin: 0,
    progressMax: 50,
    isSimOnly: false,
  },

  // SIMULATION MODE STAGES (50-70%)
  STARTING_SIMULATION: {
    id: 'starting_simulation',
    label: 'Starting Simulation',
    description: 'Launching mockup-sim backend',
    progressMin: 50,
    progressMax: 70,
    isSimOnly: true,
    logPatterns: ['simulation mode', 'mockup-sim', '--mockup-sim'],
  },

  // DAEMON STARTUP (50/70 - 100%)
  CONNECTING: {
    id: 'connecting',
    label: 'Connecting to Daemon',
    description: 'Establishing connection',
    progressMin: 50,
    progressMax: 66,
    isSimOnly: false,
    logPatterns: ['Starting daemon', 'daemon.app.main', 'Uvicorn running', 'Application startup'],
  },

  INITIALIZING: {
    id: 'initializing',
    label: 'Initializing Control',
    description: 'Setting up robot control',
    progressMin: 66,
    progressMax: 83,
    isSimOnly: false,
    logPatterns: ['control_mode', 'Placo', 'kinematics', 'Robot initialized'],
  },

  DETECTING_MOVEMENTS: {
    id: 'detecting',
    label: 'Detecting Movements',
    description: 'Verifying robot data stream',
    progressMin: 83,
    progressMax: 100,
    isSimOnly: false,
    logPatterns: ['head_joints', 'antennas', 'body_yaw'],
  },

  COMPLETE: {
    id: 'complete',
    label: 'Hardware Scan Complete',
    description: 'All components verified',
    progressMin: 100,
    progressMax: 100,
    isSimOnly: false,
  },

  ERROR: {
    id: 'error',
    label: 'Hardware Error',
    description: 'An error was detected',
    progressMin: 0,
    progressMax: 0,
    isSimOnly: false,
  },
} as const satisfies Record<string, StartupStage>;

export type StartupStageKey = keyof typeof STARTUP_STAGES;

/** Get the ordered list of stages for a given mode. */
export function getStagesForMode(isSimMode: boolean): StartupStage[] {
  const stages: StartupStage[] = [STARTUP_STAGES.SCANNING];

  if (isSimMode) {
    stages.push(STARTUP_STAGES.STARTING_SIMULATION);
  }

  stages.push(
    STARTUP_STAGES.CONNECTING,
    STARTUP_STAGES.INITIALIZING,
    STARTUP_STAGES.DETECTING_MOVEMENTS,
    STARTUP_STAGES.COMPLETE
  );

  return stages;
}

/** Detect the current stage based on a log message. */
export function detectStageFromLog(
  logMessage: string | null | undefined,
  isSimMode: boolean
): StartupStage | null {
  if (!logMessage || typeof logMessage !== 'string') {
    return null;
  }

  const lowerMessage = logMessage.toLowerCase();
  const stages = getStagesForMode(isSimMode);

  for (const stage of stages) {
    if (!stage.logPatterns) continue;

    for (const pattern of stage.logPatterns) {
      if (lowerMessage.includes(pattern.toLowerCase())) {
        return stage;
      }
    }
  }

  return null;
}

/** Calculate progress percentage for a stage. */
export function calculateStageProgress(
  stage: StartupStage | null | undefined,
  attemptCount = 0,
  maxAttempts = 60
): number {
  if (!stage) return 0;

  const range = stage.progressMax - stage.progressMin;
  const progress = Math.min(1, attemptCount / maxAttempts);

  return stage.progressMin + range * progress;
}

export interface StageDisplayOptions {
  currentPart?: string | null;
  errorMessage?: string | null;
}

export interface StageDisplayText {
  title: string;
  subtitle: string;
  boldText: string;
}

/** Get display text for a stage. */
export function getStageDisplayText(
  stage: StartupStage | null | undefined,
  options: StageDisplayOptions = {}
): StageDisplayText {
  if (!stage) {
    return {
      title: 'Initializing',
      subtitle: 'Please wait...',
      boldText: 'Initializing',
    };
  }

  switch (stage.id) {
    case 'scanning':
      return {
        title: stage.label,
        subtitle: options.currentPart ? `Scanning ${options.currentPart}` : 'Initializing scan...',
        boldText: options.currentPart || 'scan',
      };

    case 'starting_simulation':
      return {
        title: stage.label,
        subtitle: 'Starting simulation mode...',
        boldText: 'simulation',
      };

    case 'connecting':
      return {
        title: stage.label,
        subtitle: 'Connecting to daemon',
        boldText: 'Connecting',
      };

    case 'initializing':
      return {
        title: stage.label,
        subtitle: 'Initializing robot control',
        boldText: 'Initializing',
      };

    case 'detecting':
      return {
        title: stage.label,
        subtitle: 'Detecting robot movements',
        boldText: 'Detecting',
      };

    case 'complete':
      return {
        title: stage.label,
        subtitle: 'All components verified',
        boldText: 'verified',
      };

    case 'error':
      return {
        title: stage.label,
        subtitle: options.errorMessage || 'An error was detected',
        boldText: 'Error',
      };

    default:
      return {
        title: stage.label,
        subtitle: stage.description,
        boldText: stage.label,
      };
  }
}
