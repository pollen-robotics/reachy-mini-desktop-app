/**
 * 🤖 Robot SharedArrayBuffer Layout Constants
 * 
 * Single source of truth for buffer memory layout.
 * Used by both Worker and main thread.
 * 
 * ## Memory Layout (Float64Array, 48 elements = 384 bytes)
 * [0]: dataVersion (increments on each update)
 * [1-7]: headJoints [yaw_body, stewart_1..6]
 * [8-28]: passiveJoints [passive_1_x..passive_7_z] (21 values)
 * [29-30]: antennas [left, right]
 * [31-46]: headPose (4x4 matrix, 16 floats)
 * [47]: yawBody (duplicate of headJoints[0] for convenience)
 */

export const BUFFER_LAYOUT = {
  SIZE: 48,
  IDX_VERSION: 0,
  IDX_HEAD_JOINTS_START: 1,
  IDX_PASSIVE_JOINTS_START: 8,
  IDX_ANTENNAS_START: 29,
  IDX_HEAD_POSE_START: 31,
  IDX_YAW_BODY: 47,
  // Lengths for iteration
  HEAD_JOINTS_LENGTH: 7,
  PASSIVE_JOINTS_LENGTH: 21,
  ANTENNAS_LENGTH: 2,
  HEAD_POSE_LENGTH: 16,
};

/**
 * Joint name constants
 * Used by URDFRobot components
 */
export const STEWART_JOINT_NAMES = [
  'stewart_1', 'stewart_2', 'stewart_3', 
  'stewart_4', 'stewart_5', 'stewart_6'
];

export const PASSIVE_JOINT_NAMES = [
  'passive_1_x', 'passive_1_y', 'passive_1_z',
  'passive_2_x', 'passive_2_y', 'passive_2_z',
  'passive_3_x', 'passive_3_y', 'passive_3_z',
  'passive_4_x', 'passive_4_y', 'passive_4_z',
  'passive_5_x', 'passive_5_y', 'passive_5_z',
  'passive_6_x', 'passive_6_y', 'passive_6_z',
  'passive_7_x', 'passive_7_y', 'passive_7_z',
];

/** Tolerance for float comparison (~0.3 degrees) */
export const JOINT_TOLERANCE = 0.005;

