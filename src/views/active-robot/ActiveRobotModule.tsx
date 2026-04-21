/**
 * @fileoverview ActiveRobot Module Wrapper
 * Wraps ActiveRobotView with the context provider for dependency injection
 *
 * This is the main entry point for using the ActiveRobot module.
 * It can receive either:
 * - contextConfig prop (from useActiveRobotAdapter) - for integration with main app
 * - Direct config object - for standalone usage or testing
 */

import React from 'react';
import { ActiveRobotProvider } from './context';
import ActiveRobotView from './ActiveRobotView';
import type { ActiveRobotContextConfig } from '../../hooks/adapters/activeRobotContextTypes';

export interface ActiveRobotModuleProps {
  contextConfig: ActiveRobotContextConfig;
  isActive: boolean;
  isStarting: boolean;
  isStopping: boolean;
  stopDaemon: () => Promise<void> | void;
  sendCommand: (...args: unknown[]) => unknown;
  playRecordedMove: (...args: unknown[]) => unknown;
  isCommandRunning: boolean;
  logs: unknown[];
  daemonVersion?: string | null;
  usbPortName?: string | null;
}

/**
 * ActiveRobotModule - Main wrapper component
 */
function ActiveRobotModule({
  contextConfig,
  isActive,
  isStarting,
  isStopping,
  stopDaemon,
  sendCommand,
  playRecordedMove,
  isCommandRunning,
  logs,
  daemonVersion,
  usbPortName,
}: ActiveRobotModuleProps): React.ReactElement {
  // If no contextConfig provided, throw error (should use adapter)
  if (!contextConfig) {
    throw new Error(
      'ActiveRobotModule requires contextConfig prop. ' +
        'Use useActiveRobotAdapter() to create the config.'
    );
  }

  return (
    <ActiveRobotProvider config={contextConfig}>
      <ActiveRobotView
        isActive={isActive}
        isStarting={isStarting}
        isStopping={isStopping}
        stopDaemon={stopDaemon}
        sendCommand={sendCommand}
        playRecordedMove={playRecordedMove}
        isCommandRunning={isCommandRunning}
        logs={logs}
        daemonVersion={daemonVersion}
        usbPortName={usbPortName}
      />
    </ActiveRobotProvider>
  );
}

export default ActiveRobotModule;
