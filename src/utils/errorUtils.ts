/**
 * Utility functions for error handling (DRY).
 */

type UnknownError = unknown;

/**
 * Extracts an error message from various error shapes.
 * Handles `Error` instances, strings, plain objects with `.message`, etc.
 */
export function extractErrorMessage(err: UnknownError): string {
  if (!err) return 'Unknown error';

  if (err instanceof Error) return err.message;

  if (typeof err === 'string') return err;

  if (typeof err === 'object' && err !== null) {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') return maybeMessage;

    const maybeToString = (err as { toString?: () => string }).toString;
    if (typeof maybeToString === 'function') {
      const str = maybeToString.call(err);
      if (str !== '[object Object]') return str;
    }
  }

  return String(err) || 'Unknown error';
}

/**
 * Formats error message for user display.
 * Removes technical details and formats for UI.
 */
export function formatUserErrorMessage(errorMessage: string | null | undefined): string {
  if (!errorMessage) return 'An error occurred';

  const cleaned = errorMessage.replace(/`/g, '').trim();

  if (cleaned.includes('404') || cleaned.includes('Not Found')) {
    return 'Update file not found on server. The update may not be available yet.';
  }
  if (cleaned.includes('403') || cleaned.includes('Forbidden')) {
    return 'Access denied. Please check your update server configuration.';
  }
  if (cleaned.includes('500') || cleaned.includes('Internal Server Error')) {
    return 'Server error. Please try again later.';
  }

  return cleaned;
}

/**
 * Generates detailed, context-aware error messages for update checks.
 *
 * @param err - Error object
 * @param retryCount - Current retry attempt (0-based)
 * @param maxRetries - Maximum number of retries
 * @param isTimeout - Whether this is a timeout error
 */
export function getDetailedUpdateErrorMessage(
  err: UnknownError,
  retryCount: number = 0,
  maxRetries: number = 3,
  isTimeout: boolean = false
): string {
  const errorMessage = extractErrorMessage(err);
  const errorString = errorMessage.toLowerCase();
  const isLastAttempt = retryCount >= maxRetries;

  if (isTimeout) {
    if (isLastAttempt) {
      return `Update check timed out after ${maxRetries} attempts. The server did not respond within 30 seconds each time. This usually indicates a network connectivity issue or the server is temporarily unavailable.`;
    }
    return `Update check is taking longer than expected (attempt ${retryCount + 1}/${maxRetries}). Retrying in a moment...`;
  }

  if (
    errorString.includes('network') ||
    errorString.includes('fetch') ||
    errorString.includes('econnrefused') ||
    errorString.includes('connection')
  ) {
    if (isLastAttempt) {
      return `Network error: Unable to reach the update server after ${maxRetries} attempts. Please check your internet connection and firewall settings.`;
    }
    return `Network error (attempt ${retryCount + 1}/${maxRetries}). Retrying...`;
  }

  if (
    errorString.includes('dns') ||
    errorString.includes('enotfound') ||
    errorString.includes('getaddrinfo')
  ) {
    if (isLastAttempt) {
      return `DNS error: Unable to resolve the update server address after ${maxRetries} attempts. Please check your internet connection and DNS settings.`;
    }
    return `DNS resolution failed (attempt ${retryCount + 1}/${maxRetries}). Retrying...`;
  }

  if (
    errorString.includes('certificate') ||
    errorString.includes('ssl') ||
    errorString.includes('tls') ||
    errorString.includes('cert')
  ) {
    return `Security error: Unable to verify the update server certificate. Please check your system date and time, or contact support if the issue persists.`;
  }

  if (errorString.includes('404') || errorString.includes('not found')) {
    return `Update not found: The update file is not available on the server. This is normal if you're already on the latest version or if the update hasn't been published yet.`;
  }

  if (errorString.includes('403') || errorString.includes('forbidden')) {
    return `Access denied: The update server rejected the request. Please check your update server configuration or contact support.`;
  }

  if (errorString.includes('500') || errorString.includes('server error')) {
    if (isLastAttempt) {
      return `Server error: The update server encountered an error after ${maxRetries} attempts. Please try again later.`;
    }
    return `Server error (attempt ${retryCount + 1}/${maxRetries}). Retrying...`;
  }

  if (errorString.includes('429') || errorString.includes('rate limit')) {
    return `Rate limit: Too many update check requests. Please wait a few minutes and try again.`;
  }

  if (isLastAttempt) {
    const formatted = formatUserErrorMessage(errorMessage);
    return `Update check failed after ${maxRetries} attempts: ${formatted}`;
  }

  return formatUserErrorMessage(errorMessage);
}

/**
 * Checks if an error is recoverable (network, timeout, server issues).
 */
export function isRecoverableError(err: UnknownError): boolean {
  if (!err) return false;

  const errorMsg = extractErrorMessage(err).toLowerCase();
  const errorName =
    typeof err === 'object' && err !== null
      ? String((err as { name?: unknown }).name ?? '').toLowerCase()
      : '';
  const errorString =
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { toString?: () => string }).toString === 'function'
      ? (err as { toString: () => string }).toString().toLowerCase()
      : '';

  const recoverablePatterns = [
    'network',
    'timeout',
    'connection',
    'fetch',
    'econnrefused',
    'enotfound',
    'etimedout',
    'could not fetch',
    'release json',
    'remote',
    'failed to fetch',
    'networkerror',
    'err_network',
    'no internet',
    'offline',
  ];

  const allErrorText = `${errorMsg} ${errorName} ${errorString}`;
  return recoverablePatterns.some(pattern => allErrorText.includes(pattern));
}
