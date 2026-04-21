/**
 * Context exports for ActiveRobot module.
 *
 * Usage:
 * ```ts
 * import { useActiveRobotContext } from '../context';
 * const { robotState, actions, api, shellApi } = useActiveRobotContext();
 * ```
 */

export {
  ActiveRobotContext,
  ActiveRobotProvider,
  useActiveRobotContext,
} from './ActiveRobotContext';

export type {
  ActiveRobotContextConfig,
  ActiveRobotContextConfigBase,
  WebActiveRobotContextConfig,
  AdapterRobotState,
  AdapterActions,
  AdapterApiConfig,
  AdapterShellApi,
  TauriWindowManager,
  WebWindowManager,
  WebAppWindowStub,
} from './types';
