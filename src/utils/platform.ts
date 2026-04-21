/**
 * Platform detection utilities for cross-platform compatibility.
 */

export type Platform = 'macos' | 'windows' | 'linux' | 'unknown';

let cachedPlatform: Platform | null = null;

/**
 * Get the current operating system platform.
 * Detects platform from user agent.
 */
export function getPlatform(): Platform {
  if (cachedPlatform) {
    return cachedPlatform;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) {
    cachedPlatform = 'macos';
  } else if (userAgent.includes('win')) {
    cachedPlatform = 'windows';
  } else if (userAgent.includes('linux')) {
    cachedPlatform = 'linux';
  } else {
    cachedPlatform = 'unknown';
  }

  return cachedPlatform;
}

export function isMacOS(): boolean {
  return getPlatform() === 'macos';
}

export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}
