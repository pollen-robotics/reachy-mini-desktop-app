/**
 * Type re-exports for the ActiveRobot module context.
 *
 * The canonical context contract lives in `src/hooks/adapters/activeRobotContextTypes.ts`
 * because the adapter is what produces the value. This file re-exports the
 * relevant types so consumers inside `views/active-robot/` can keep their
 * imports local.
 */

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
} from '../../../hooks/adapters/activeRobotContextTypes';
