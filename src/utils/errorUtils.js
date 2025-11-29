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

