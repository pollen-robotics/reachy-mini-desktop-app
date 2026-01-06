/**
 * 🎭 Simulation Mode Utility
 * 
 * Simulation mode is controlled by the user in the app interface.
 * Uses localStorage to persist the user's choice.
 */

/**
 * Detects if simulation mode is enabled
 * @returns {boolean} true if simulation mode is active
 */
export function isSimulationMode() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('simMode') === 'true';
  }
  return false;
}

/**
 * Enables simulation mode
 */
export function enableSimulationMode() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('simMode', 'true');
    
  }
}

/**
 * Disables simulation mode
 */
export function disableSimulationMode() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('simMode');
    
  }
}

/**
 * Simulated USB port for simulation mode
 */
export const SIMULATED_USB_PORT = '/dev/tty.usbserial-SIMULATED';
