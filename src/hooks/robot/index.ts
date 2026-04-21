/**
 * Barrel export for core robot hooks (used globally)
 *
 * Note: Specific hooks have been moved closer to their usage:
 * - useRobotPowerState, useRobotMovementStatus → views/active-robot/hooks
 * - useRobotWebSocket → components/viewer3d/hooks (reads from store)
 */
export { useRobotCommands } from './useRobotCommands';
export { useRobotStateWebSocket } from './useRobotStateWebSocket';
export { useActiveMoves } from './useActiveMoves';
