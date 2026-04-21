/**
 * Robot domain types.
 *
 * Source of truth for anything related to the robot state machine, the
 * realtime data streamed over the `/api/state/ws/full` WebSocket, and the
 * connection mode. These types are consumed by the store, hooks and UI
 * components as they get migrated to TypeScript.
 *
 * The values match the JS constants defined in
 * [src/constants/robotStatus.js](../constants/robotStatus.js) and the
 * runtime shapes built in
 * [src/store/slices/robotSlice.js](../store/slices/robotSlice.js) and
 * [src/hooks/robot/useRobotStateWebSocket.js](../hooks/robot/useRobotStateWebSocket.js).
 */

// ============================================================================
// STATE MACHINE
// ============================================================================

export type RobotStatus =
  | 'disconnected'
  | 'ready-to-start'
  | 'starting'
  | 'sleeping'
  | 'ready'
  | 'busy'
  | 'stopping'
  | 'crashed';

export type BusyReason = 'moving' | 'command' | 'app-running' | 'installing';

// ============================================================================
// CONNECTION
// ============================================================================

export type ConnectionMode = 'usb' | 'wifi' | 'simulation' | 'external';

export interface StartConnectionOptions {
  portName?: string | null;
  remoteHost?: string | null;
}

// ============================================================================
// REALTIME ROBOT STATE (WebSocket at 20Hz)
// ============================================================================

/**
 * 4x4 homogeneous transformation matrix, flattened row-major.
 * Used for `head_pose`. The daemon sometimes wraps it in `{ m: number[] }`;
 * the hook normalizes to a plain array of length 16.
 */
export type HeadPoseMatrix = number[];

/** 7 joint values: `[body_yaw, stewart_1 ... stewart_6]`. */
export type HeadJoints = [number, number, number, number, number, number, number];

/** 21 passive joint values computed client-side via kinematics WASM. */
export type PassiveJoints = number[];

/** `[left, right]` antenna positions in radians. */
export type Antennas = [number, number];

export type ControlMode = 'position' | 'compliant' | 'torque' | string;

export interface DoA {
  /** Angle in degrees, relative to the front of the robot. */
  angle: number;
  /** Whether the microphone array currently detects speech. */
  speech_detected: boolean;
}

/**
 * Normalized robot state as stored in `robotStateFull.data`.
 * Field names match the JS code (snake_case) to avoid churn during migration.
 */
export interface RobotStateData {
  control_mode: ControlMode | null;
  head_pose: HeadPoseMatrix | null;
  head_joints: HeadJoints | null;
  body_yaw: number | null;
  antennas_position: Antennas | null;
  /** Never sent by the daemon, always preserved from WASM-side computation. */
  passive_joints: PassiveJoints | null;
  doa: DoA | null;
  timestamp: number | null;
  /** Monotonically increasing counter, bumped on each WS message. */
  dataVersion: number;
}

export interface RobotStateFull {
  data: RobotStateData | null;
  lastUpdate: number | null;
  error: string | null;
}

// ============================================================================
// HARDWARE / STARTUP ERRORS (free-form for now - refined in later phases)
// ============================================================================

export type HardwareError = unknown;
export type StartupError = unknown;
