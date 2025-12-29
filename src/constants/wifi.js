/**
 * WiFi constants
 */

// Reachy hotspot SSID - unique name, do not change
export const REACHY_HOTSPOT_SSID = 'reachy-mini-ap';

// Check if a SSID is the Reachy hotspot
export const isReachyHotspot = (ssid) => {
  if (!ssid) return false;
  return ssid.toLowerCase() === REACHY_HOTSPOT_SSID.toLowerCase();
};

