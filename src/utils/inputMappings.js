/**
 * Centralized input mappings
 * Single source of truth for all axis inversions and coordinate transformations
 * 
 * This file centralizes all mappings between:
 * - Gamepad Input → Robot Coordinate System
 * - Robot Coordinate System → Display Coordinate System
 * - Robot Coordinate System → API Coordinate System
 * 
 * Each mapping documents WHY inversions are needed, making the system maintainable.
 */

/**
 * Gamepad axis configuration
 * Defines raw gamepad axes and their natural orientation
 * 
 * Gamepad API convention:
 * - axes[0] = left stick X: -1 (left) to +1 (right)
 * - axes[1] = left stick Y: -1 (up) to +1 (down) - INVERTED by gamepad API
 * - axes[2] = right stick X: -1 (left) to +1 (right)
 * - axes[3] = right stick Y: -1 (up) to +1 (down) - INVERTED by gamepad API
 */
export const GAMEPAD_AXES = {
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
  RIGHT_STICK_X: 2,
  RIGHT_STICK_Y: 3,
};

/**
 * Input to Robot Mappings
 * Maps gamepad inputs to robot coordinate system
 * 
 * Robot coordinate system (internal):
 * - X: forward (positive) / backward (negative)
 * - Y: right (positive) / left (negative)
 * - Z: up (positive) / down (negative)
 * - Pitch: up (positive) / down (negative)
 * - Yaw: right (positive) / left (negative)
 */
export const INPUT_TO_ROBOT_MAPPINGS = {
  // Left stick → Position X/Y
  positionX: {
    source: 'moveForward',  // Vertical stick movement
    transform: (value) => value,  // No inversion: stick forward = robot forward
    reason: 'Stick forward (up) = robot forward (X positive)',
  },
  positionY: {
    source: 'moveRight',  // Horizontal stick movement
    transform: (value) => value,  // No inversion: stick right = robot right
    reason: 'Stick right = robot right (Y positive)',
  },
  
  // Right stick → Pitch/Yaw
  pitch: {
    source: 'lookVertical',
    transform: (value) => value,  // Already inverted in InputManager (up = +1)
    reason: 'InputManager already inverts: stick up = lookVertical +1 = pitch positive',
  },
  yaw: {
    source: 'lookHorizontal',
    transform: (value) => -value,  // Invert for intuitive mapping
    reason: 'Stick right = yaw right (intuitive): stick right (+1) → yaw positive',
  },
};

/**
 * Robot to Display Mappings
 * Maps robot coordinate system to display coordinate system
 * 
 * Display coordinate system (for UI):
 * - X: left (negative) / right (positive)
 * - Y: up (negative) / down (positive) - INVERTED for screen coordinates
 * 
 * Note: Joystick2D component handles screen coordinate inversion internally
 */
export const ROBOT_TO_DISPLAY_MAPPINGS = {
  positionX: {
    transform: (value) => -value,  // Invert for display (visual only) - joystick Y axis
    reason: 'Robot X forward = Display Y up (visual inversion for joystick Y axis)',
  },
  positionY: {
    transform: (value) => value,  // No inversion - removed previous inversion
    reason: 'Robot Y = Display Y (no transformation needed)',
  },
  pitch: {
    transform: (value) => -value,  // Invert for display (visual only)
    reason: 'Robot pitch up = Display pitch down (visual inversion for UI)',
  },
  yaw: {
    transform: (value) => -value,  // Invert for display
    reason: 'Robot yaw right = Display yaw left (visual inversion for UI)',
  },
};

/**
 * Robot to API Mappings
 * Maps robot coordinate system to API coordinate system
 * 
 * API coordinate system (what the robot expects):
 * - May have different conventions than our internal system
 * - Currently: pitch and yaw need to be inverted for the robot API
 */
export const ROBOT_TO_API_MAPPINGS = {
  positionX: {
    transform: (value) => -value,  // Invert for API (robot movement) - joystick Y axis
    reason: 'Robot X forward = API X backward (invert for robot movement)',
  },
  positionY: {
    transform: (value) => value,  // No inversion - removed previous inversion
    reason: 'Robot Y = API Y (no transformation needed)',
  },
  pitch: {
    transform: (value) => -value,  // Invert for API
    reason: 'Robot pitch up = API pitch down (robot API convention)',
  },
  yaw: {
    transform: (value) => -value,  // Invert for API
    reason: 'Robot yaw right = API yaw left (robot API convention)',
  },
  roll: {
    transform: (value) => value,  // No inversion
    reason: 'Robot roll = API roll (no transformation needed)',
  },
};

/**
 * Helper function to apply mapping transformation
 * @param {number} value - Input value
 * @param {Object} mapping - Mapping object with transform function
 * @returns {number} Transformed value
 */
export function applyMapping(value, mapping) {
  if (!mapping || typeof mapping.transform !== 'function') {
    console.warn('Invalid mapping provided to applyMapping:', mapping);
    return value;
  }
  return mapping.transform(value);
}

/**
 * Helper function to get all mappings for a component
 * @param {string} component - Component name ('positionX', 'positionY', 'pitch', 'yaw', etc.)
 * @returns {Object} Object with inputToRobot, robotToDisplay, and robotToAPI mappings
 */
export function getMappingsForComponent(component) {
  return {
    inputToRobot: INPUT_TO_ROBOT_MAPPINGS[component],
    robotToDisplay: ROBOT_TO_DISPLAY_MAPPINGS[component],
    robotToAPI: ROBOT_TO_API_MAPPINGS[component],
  };
}

/**
 * Apply input to robot mapping
 * @param {number} value - Input value
 * @param {string} component - Component name
 * @returns {number} Value in robot coordinate system
 */
export function mapInputToRobot(value, component) {
  const mapping = INPUT_TO_ROBOT_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No INPUT_TO_ROBOT mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}

/**
 * Apply robot to display mapping
 * @param {number} value - Robot value
 * @param {string} component - Component name
 * @returns {number} Value in display coordinate system
 */
export function mapRobotToDisplay(value, component) {
  const mapping = ROBOT_TO_DISPLAY_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No ROBOT_TO_DISPLAY mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}

/**
 * Apply robot to API mapping
 * @param {number} value - Robot value
 * @param {string} component - Component name
 * @returns {number} Value in API coordinate system
 */
export function mapRobotToAPI(value, component) {
  const mapping = ROBOT_TO_API_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No ROBOT_TO_API mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}

/**
 * Reverse display to robot mapping
 * This is used when user interacts with the display (e.g., dragging joystick)
 * to convert display coordinates back to robot coordinates
 * 
 * For simple transformations (value => value or value => -value), the inverse
 * is the same transformation (both are their own inverse).
 * 
 * @param {number} value - Display value
 * @param {string} component - Component name
 * @returns {number} Value in robot coordinate system
 */
export function mapDisplayToRobot(value, component) {
  const mapping = ROBOT_TO_DISPLAY_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No ROBOT_TO_DISPLAY mapping found for component: ${component}`);
    return value;
  }
  // For our current mappings, the transformations are their own inverse:
  // - (value) => value is its own inverse
  // - (value) => -value is its own inverse (inverting twice gives original)
  // So we can just apply the same transformation
  return applyMapping(value, mapping);
}

