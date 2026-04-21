/**
 * Simulation Mode Utility.
 *
 * Simulation mode is controlled by the user in the app interface.
 * Uses localStorage to persist the user's choice.
 */

const STORAGE_KEY = 'simMode';

/**
 * Detects if simulation mode is enabled.
 */
export function isSimulationMode(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }
  return false;
}

export function enableSimulationMode(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, 'true');
  }
}

export function disableSimulationMode(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Simulated USB port for simulation mode.
 */
export const SIMULATED_USB_PORT = '/dev/tty.usbserial-SIMULATED' as const;
