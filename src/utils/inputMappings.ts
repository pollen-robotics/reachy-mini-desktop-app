/**
 * Centralized input mappings.
 * Single source of truth for all axis inversions and coordinate transformations.
 *
 * This file centralizes all mappings between:
 * - Gamepad Input → Robot Coordinate System
 * - Robot Coordinate System → Display Coordinate System
 * - Robot Coordinate System → API Coordinate System
 *
 * Each mapping documents WHY inversions are needed, making the system maintainable.
 */

export type ComponentName = 'positionX' | 'positionY' | 'pitch' | 'yaw' | 'roll';

export interface MappingConfig {
  /** Source field on the raw input object (only relevant for INPUT_TO_ROBOT). */
  source?: string;
  /** Pure function applied to the value. */
  transform: (value: number) => number;
  /** Human-readable explanation of why this transformation exists. */
  reason: string;
}

/**
 * Gamepad axis configuration.
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
} as const;

/**
 * Input to Robot Mappings.
 * Maps gamepad inputs to the robot coordinate system.
 */
export const INPUT_TO_ROBOT_MAPPINGS: Partial<Record<ComponentName, MappingConfig>> = {
  positionX: {
    source: 'moveForward',
    transform: value => value,
    reason: 'Stick forward (up) = robot forward (X positive)',
  },
  positionY: {
    source: 'moveRight',
    transform: value => value,
    reason: 'Stick right = robot right (Y positive)',
  },
  pitch: {
    source: 'lookVertical',
    transform: value => value,
    reason: 'InputManager already inverts: stick up = lookVertical +1 = pitch positive',
  },
  yaw: {
    source: 'lookHorizontal',
    transform: value => -value,
    reason: 'Stick right = yaw right (intuitive): stick right (+1) → yaw positive',
  },
};

/**
 * Robot to Display Mappings.
 * Maps robot coordinate system to display coordinate system.
 */
export const ROBOT_TO_DISPLAY_MAPPINGS: Partial<Record<ComponentName, MappingConfig>> = {
  positionX: {
    transform: value => -value,
    reason: 'Robot X forward = Display Y up (visual inversion for joystick Y axis)',
  },
  positionY: {
    transform: value => value,
    reason: 'Robot Y = Display Y (no transformation needed)',
  },
  pitch: {
    transform: value => -value,
    reason: 'Robot pitch up = Display pitch down (visual inversion for UI)',
  },
  yaw: {
    transform: value => -value,
    reason: 'Robot yaw right = Display yaw left (visual inversion for UI)',
  },
};

/**
 * Robot to API Mappings.
 * Maps robot coordinate system to the API coordinate system the daemon expects.
 */
export const ROBOT_TO_API_MAPPINGS: Partial<Record<ComponentName, MappingConfig>> = {
  positionX: {
    transform: value => -value,
    reason: 'Robot X forward = API X backward (invert for robot movement)',
  },
  positionY: {
    transform: value => value,
    reason: 'Robot Y = API Y (no transformation needed)',
  },
  pitch: {
    transform: value => -value,
    reason: 'Robot pitch up = API pitch down (robot API convention)',
  },
  yaw: {
    transform: value => -value,
    reason: 'Robot yaw right = API yaw left (robot API convention)',
  },
  roll: {
    transform: value => value,
    reason: 'Robot roll = API roll (no transformation needed)',
  },
};

export function applyMapping(value: number, mapping: MappingConfig | undefined | null): number {
  if (!mapping || typeof mapping.transform !== 'function') {
    console.warn('Invalid mapping provided to applyMapping:', mapping);
    return value;
  }
  return mapping.transform(value);
}

export interface ComponentMappings {
  inputToRobot?: MappingConfig;
  robotToDisplay?: MappingConfig;
  robotToAPI?: MappingConfig;
}

export function getMappingsForComponent(component: ComponentName): ComponentMappings {
  return {
    inputToRobot: INPUT_TO_ROBOT_MAPPINGS[component],
    robotToDisplay: ROBOT_TO_DISPLAY_MAPPINGS[component],
    robotToAPI: ROBOT_TO_API_MAPPINGS[component],
  };
}

export function mapInputToRobot(value: number, component: ComponentName): number {
  const mapping = INPUT_TO_ROBOT_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No INPUT_TO_ROBOT mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}

export function mapRobotToDisplay(value: number, component: ComponentName): number {
  const mapping = ROBOT_TO_DISPLAY_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No ROBOT_TO_DISPLAY mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}

export function mapRobotToAPI(value: number, component: ComponentName): number {
  const mapping = ROBOT_TO_API_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No ROBOT_TO_API mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}

/**
 * Reverse display to robot mapping.
 *
 * For our current mappings, the transformations are their own inverse:
 * - `value => value` is its own inverse
 * - `value => -value` is its own inverse (inverting twice gives original)
 *
 * So we can just apply the same transformation.
 */
export function mapDisplayToRobot(value: number, component: ComponentName): number {
  const mapping = ROBOT_TO_DISPLAY_MAPPINGS[component];
  if (!mapping) {
    console.warn(`No ROBOT_TO_DISPLAY mapping found for component: ${component}`);
    return value;
  }
  return applyMapping(value, mapping);
}
