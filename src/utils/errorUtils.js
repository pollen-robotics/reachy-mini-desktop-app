/**
 * Utility functions for error handling (DRY)
 */

/**
 * Extracts error message from various error types
 * Handles Error objects, strings, and unknown types
 * 
 * @param {*} err - Error object, string, or unknown type
 * @returns {string} Extracted error message
 */
export function extractErrorMessage(err) {
  if (!err) return 'Unknown error';
  
  // Handle Error objects
  if (err.message) return err.message;
  
  // Handle string errors
  if (typeof err === 'string') return err;
  
  // Handle toString() method
  if (typeof err.toString === 'function') {
    const str = err.toString();
    if (str !== '[object Object]') return str;
  }
  
  // Fallback
  return String(err) || 'Unknown error';
}

/**
 * Formats error message for user display
 * Removes technical details and formats for UI
 * 
 * @param {string} errorMessage - Raw error message
 * @returns {string} User-friendly error message
 */
export function formatUserErrorMessage(errorMessage) {
  if (!errorMessage) return 'An error occurred';
  
  // Clean up formatting
  let cleaned = errorMessage.replace(/`/g, '').trim();
  
  // Handle HTTP status codes
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
 * Generates detailed, context-aware error messages for update checks
 * Provides specific information based on error type and retry status
 * 
 * @param {*} err - Error object
 * @param {number} retryCount - Current retry attempt (0-based)
 * @param {number} maxRetries - Maximum number of retries
 * @param {boolean} isTimeout - Whether this is a timeout error
 * @returns {string} Detailed, user-friendly error message
 */
export function getDetailedUpdateErrorMessage(err, retryCount = 0, maxRetries = 3, isTimeout = false) {
  const errorMessage = extractErrorMessage(err);
  const errorString = errorMessage.toLowerCase();
  const isLastAttempt = retryCount >= maxRetries;
  
  // Timeout errors - most common issue
  if (isTimeout) {
    if (isLastAttempt) {
      return `Update check timed out after ${maxRetries} attempts. The server did not respond within 30 seconds each time. This usually indicates a network connectivity issue or the server is temporarily unavailable.`;
    }
    return `Update check is taking longer than expected (attempt ${retryCount + 1}/${maxRetries}). Retrying in a moment...`;
  }
  
  // Network errors (fetch, connection refused, etc.)
  if (errorString.includes('network') || 
      errorString.includes('fetch') || 
      errorString.includes('econnrefused') ||
      errorString.includes('connection')) {
    if (isLastAttempt) {
      return `Network error: Unable to reach the update server after ${maxRetries} attempts. Please check your internet connection and firewall settings.`;
    }
    return `Network error (attempt ${retryCount + 1}/${maxRetries}). Retrying...`;
  }
  
  // DNS errors
  if (errorString.includes('dns') || 
      errorString.includes('enotfound') ||
      errorString.includes('getaddrinfo')) {
    if (isLastAttempt) {
      return `DNS error: Unable to resolve the update server address after ${maxRetries} attempts. Please check your internet connection and DNS settings.`;
    }
    return `DNS resolution failed (attempt ${retryCount + 1}/${maxRetries}). Retrying...`;
  }
  
  // SSL/Certificate errors
  if (errorString.includes('certificate') || 
      errorString.includes('ssl') ||
      errorString.includes('tls') ||
      errorString.includes('cert')) {
    return `Security error: Unable to verify the update server certificate. Please check your system date and time, or contact support if the issue persists.`;
  }
  
  // HTTP 404 - Update not found
  if (errorString.includes('404') || errorString.includes('not found')) {
    return `Update not found: The update file is not available on the server. This is normal if you're already on the latest version or if the update hasn't been published yet.`;
  }
  
  // HTTP 403 - Forbidden
  if (errorString.includes('403') || errorString.includes('forbidden')) {
    return `Access denied: The update server rejected the request. Please check your update server configuration or contact support.`;
  }
  
  // HTTP 500 - Server error
  if (errorString.includes('500') || errorString.includes('server error')) {
    if (isLastAttempt) {
      return `Server error: The update server encountered an error after ${maxRetries} attempts. Please try again later.`;
    }
    return `Server error (attempt ${retryCount + 1}/${maxRetries}). Retrying...`;
  }
  
  // HTTP 429 - Rate limit
  if (errorString.includes('429') || errorString.includes('rate limit')) {
    return `Rate limit: Too many update check requests. Please wait a few minutes and try again.`;
  }
  
  // Generic error with context
  if (isLastAttempt) {
    const formatted = formatUserErrorMessage(errorMessage);
    return `Update check failed after ${maxRetries} attempts: ${formatted}`;
  }
  
  // Generic error during retry
  return formatUserErrorMessage(errorMessage);
}

/**
 * Checks if an error is recoverable (network, timeout, server issues)
 * 
 * @param {*} err - Error to check
 * @returns {boolean} True if error is recoverable
 */
export function isRecoverableError(err) {
  if (!err) return false;
  
  const errorMsg = extractErrorMessage(err).toLowerCase();
  const errorName = err.name?.toLowerCase() || '';
  const errorString = err.toString()?.toLowerCase() || '';
  
  // Recoverable errors: network, timeout, connection, server issues
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
    'networkerror',
  ];
  
  // Check all error representations
  const allErrorText = `${errorMsg} ${errorName} ${errorString}`;
  
  return recoverablePatterns.some(pattern => 
    allErrorText.includes(pattern)
  );
}

