/**
 * ActiveRobot Context for dependency injection.
 *
 * This context allows the ActiveRobot module to be completely decoupled from:
 * - Global Zustand stores (`useAppStore`)
 * - Tauri-specific APIs
 * - Direct config imports
 *
 * All dependencies are injected via the adapter hook (`useActiveRobotAdapter`).
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import type { ActiveRobotContextConfig } from './types';

const ActiveRobotContext = createContext<ActiveRobotContextConfig | null>(null);

export interface ActiveRobotProviderProps {
  config: ActiveRobotContextConfig;
  children: ReactNode;
}

export function ActiveRobotProvider({
  config,
  children,
}: ActiveRobotProviderProps): React.ReactElement {
  return <ActiveRobotContext.Provider value={config}>{children}</ActiveRobotContext.Provider>;
}

/**
 * Hook to access the ActiveRobot context. Throws an error if used outside of
 * `ActiveRobotProvider`.
 */
export function useActiveRobotContext(): ActiveRobotContextConfig {
  const context = useContext(ActiveRobotContext);

  if (context === null) {
    throw new Error(
      'useActiveRobotContext must be used within an ActiveRobotProvider. ' +
        'Make sure ActiveRobotModule is properly wrapped with a provider.'
    );
  }

  return context;
}

export { ActiveRobotContext };

export default {
  ActiveRobotContext,
  ActiveRobotProvider,
  useActiveRobotContext,
};
