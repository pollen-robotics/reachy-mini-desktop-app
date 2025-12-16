/**
 * 🚀 Startup Stages Configuration
 * 
 * Centralized definition of all startup stages with:
 * - Labels and descriptions
 * - Progress percentages
 * - Log patterns to detect each stage automatically
 */

/**
 * Startup stage definitions
 * Order matters: stages are checked in order and first match wins
 */
export const STARTUP_STAGES = {
  // ============================================
  // HARDWARE SCAN (0-50%)
  // ============================================
  SCANNING: {
    id: 'scanning',
    label: 'Scanning Hardware',
    description: 'Checking robot components',
    progressMin: 0,
    progressMax: 50,
    isSimOnly: false,
  },
  
  // ============================================
  // SIMULATION MODE STAGES (50-70%)
  // ============================================
  INSTALLING_MUJOCO: {
    id: 'installing_mujoco',
    label: 'Installing MuJoCo',
    description: 'Setting up physics simulation',
    progressMin: 50,
    progressMax: 60,
    isSimOnly: true,
    // Patterns to detect this stage from sidecar logs
    logPatterns: [
      'Installing MuJoCo',
      'mujoco',
      'pip install',
      'Downloading',
      'Collecting',
    ],
  },
  
  STARTING_SIMULATION: {
    id: 'starting_simulation',
    label: 'Starting Simulation',
    description: 'Launching MuJoCo physics engine',
    progressMin: 60,
    progressMax: 70,
    isSimOnly: true,
    logPatterns: [
      'mjpython',
      'simulation mode',
      'MuJoCo',
      '--sim',
    ],
  },
  
  // ============================================
  // DAEMON STARTUP (50/70 - 100%)
  // ============================================
  CONNECTING: {
    id: 'connecting',
    label: 'Connecting to Daemon',
    description: 'Establishing connection',
    progressMin: 50, // 70 in sim mode
    progressMax: 66,
    isSimOnly: false,
    logPatterns: [
      'Starting daemon',
      'daemon.app.main',
      'Uvicorn running',
      'Application startup',
    ],
  },
  
  INITIALIZING: {
    id: 'initializing',
    label: 'Initializing Control',
    description: 'Setting up robot control',
    progressMin: 66,
    progressMax: 83,
    isSimOnly: false,
    logPatterns: [
      'control_mode',
      'Placo',
      'kinematics',
      'Robot initialized',
    ],
  },
  
  DETECTING_MOVEMENTS: {
    id: 'detecting',
    label: 'Detecting Movements',
    description: 'Verifying robot data stream',
    progressMin: 83,
    progressMax: 100,
    isSimOnly: false,
    logPatterns: [
      'head_joints',
      'antennas',
      'body_yaw',
    ],
  },
  
  // ============================================
  // COMPLETION
  // ============================================
  COMPLETE: {
    id: 'complete',
    label: 'Hardware Scan Complete',
    description: 'All components verified',
    progressMin: 100,
    progressMax: 100,
    isSimOnly: false,
  },
  
  // ============================================
  // ERROR STATE
  // ============================================
  ERROR: {
    id: 'error',
    label: 'Hardware Error',
    description: 'An error was detected',
    progressMin: 0,
    progressMax: 0,
    isSimOnly: false,
  },
};

/**
 * Get the ordered list of stages for a given mode
 * @param {boolean} isSimMode - Whether simulation mode is active
 * @returns {Array} Ordered array of stage objects
 */
export function getStagesForMode(isSimMode) {
  const stages = [
    STARTUP_STAGES.SCANNING,
  ];
  
  if (isSimMode) {
    stages.push(
      STARTUP_STAGES.INSTALLING_MUJOCO,
      STARTUP_STAGES.STARTING_SIMULATION,
    );
  }
  
  stages.push(
    STARTUP_STAGES.CONNECTING,
    STARTUP_STAGES.INITIALIZING,
    STARTUP_STAGES.DETECTING_MOVEMENTS,
    STARTUP_STAGES.COMPLETE,
  );
  
  return stages;
}

/**
 * Detect the current stage based on a log message
 * @param {string} logMessage - The log message to analyze
 * @param {boolean} isSimMode - Whether simulation mode is active
 * @returns {object|null} The detected stage or null
 */
export function detectStageFromLog(logMessage, isSimMode) {
  if (!logMessage || typeof logMessage !== 'string') {
    return null;
  }
  
  const lowerMessage = logMessage.toLowerCase();
  const stages = getStagesForMode(isSimMode);
  
  // Check each stage's patterns
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

/**
 * Calculate progress percentage for a stage
 * @param {object} stage - The current stage
 * @param {number} attemptCount - Current attempt count within the stage
 * @param {number} maxAttempts - Maximum attempts for this stage
 * @returns {number} Progress percentage (0-100)
 */
export function calculateStageProgress(stage, attemptCount = 0, maxAttempts = 60) {
  if (!stage) return 0;
  
  const range = stage.progressMax - stage.progressMin;
  const progress = Math.min(1, attemptCount / maxAttempts);
  
  return stage.progressMin + (range * progress);
}

/**
 * Get display text for a stage
 * @param {object} stage - The stage object
 * @param {object} options - Display options
 * @param {string} options.currentPart - Current scanning part name
 * @returns {object} { title, subtitle, boldText }
 */
export function getStageDisplayText(stage, options = {}) {
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
        subtitle: options.currentPart 
          ? `Scanning ${options.currentPart}`
          : 'Initializing scan...',
        boldText: options.currentPart || 'scan',
      };
      
    case 'installing_mujoco':
      return {
        title: stage.label,
        subtitle: 'Setting up physics simulation...',
        boldText: 'MuJoCo',
      };
      
    case 'starting_simulation':
      return {
        title: stage.label,
        subtitle: 'Launching physics engine...',
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

