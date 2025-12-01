/**
 * Installation Helpers
 * Pure functions for installation logic
 */

import { JOB_STATUS, LOG_SUCCESS_PATTERNS, LOG_ERROR_PATTERNS } from './constants';

/**
 * Find job in activeJobs by app name
 * @param {Map} activeJobs - Map of active jobs
 * @param {string} appName - Name of the app
 * @returns {object|null} - Job object or null if not found
 */
export function findJobByAppName(activeJobs, appName) {
  if (!activeJobs || !appName) return null;
  
  for (const [, job] of activeJobs.entries()) {
    if (job.appName === appName) {
      return job;
    }
  }
  
  return null;
}

/**
 * Check if job is completed (explicit status)
 * @param {object|null} job - Job object
 * @returns {boolean} - True if job has completed status
 */
export function isJobCompleted(job) {
  return job?.status === JOB_STATUS.COMPLETED;
}

/**
 * Check if job has failed (explicit status)
 * @param {object|null} job - Job object
 * @returns {boolean} - True if job has failed status
 */
export function isJobFailed(job) {
  return job?.status === JOB_STATUS.FAILED;
}

/**
 * Check if job was removed from activeJobs (completed but no longer tracked)
 * @param {object|null} job - Job object
 * @param {number|null} installStartTime - Timestamp when installation started
 * @param {boolean} jobSeenOnce - Whether job was seen at least once
 * @returns {boolean} - True if job was removed
 */
export function wasJobRemoved(job, installStartTime, jobSeenOnce) {
  // Only consider job "removed" if:
  // 1. Job is not found in activeJobs
  // 2. Installation was started (we have a timestamp)
  // 3. We've seen the job at least once (to avoid false positives on startup)
  return !job && installStartTime !== null && jobSeenOnce;
}

/**
 * Analyze logs to detect success or failure
 * @param {string[]} logs - Array of log messages
 * @returns {{isSuccess: boolean, isError: boolean}} - Detection result
 */
export function analyzeLogs(logs) {
  if (!logs || logs.length === 0) {
    return { isSuccess: false, isError: false };
  }
  
  const logsText = logs.join(' ').toLowerCase();
  
  // Check for success patterns
  const hasSuccess = LOG_SUCCESS_PATTERNS.some(pattern => 
    logsText.includes(pattern.toLowerCase())
  );
  
  // Check for error patterns
  const hasError = LOG_ERROR_PATTERNS.some(pattern => 
    logsText.includes(pattern.toLowerCase())
  );
  
  return { isSuccess: hasSuccess, isError: hasError };
}

/**
 * Determine installation result from job status and logs
 * Priority: explicit status > logs analysis > default assumption
 * 
 * @param {object|null} job - Job object
 * @returns {{wasCompleted: boolean, wasFailed: boolean, confidence: 'high'|'medium'|'low'}}
 */
export function determineInstallationResult(job) {
  // Priority 1: Explicit status (highest confidence)
  if (isJobCompleted(job)) {
    return { wasCompleted: true, wasFailed: false, confidence: 'high' };
  }
  
  if (isJobFailed(job)) {
    return { wasCompleted: false, wasFailed: true, confidence: 'high' };
  }
  
  // Priority 2: Analyze logs (medium confidence)
  if (job?.logs && job.logs.length > 0) {
    const { isSuccess, isError } = analyzeLogs(job.logs);
    
    if (isSuccess) {
      return { wasCompleted: true, wasFailed: false, confidence: 'medium' };
    }
    
    if (isError) {
      return { wasCompleted: false, wasFailed: true, confidence: 'medium' };
    }
  }
  
  // Priority 3: Default assumption (low confidence)
  // If job disappeared cleanly without errors, assume success
  // This is a fallback and should be logged as a warning
  return { wasCompleted: true, wasFailed: false, confidence: 'low' };
}

/**
 * Check if app is in installed apps list (case-insensitive)
 * @param {string} appName - Name of the app
 * @param {Array} installedApps - Array of installed app objects
 * @returns {boolean} - True if app is in the list
 */
export function isAppInInstalledList(appName, installedApps) {
  if (!appName || !installedApps || installedApps.length === 0) {
    return false;
  }
  
  const appNameLower = appName.toLowerCase();
  
  return installedApps.some(app => 
    app.name?.toLowerCase() === appNameLower ||
    app.id?.toLowerCase() === appNameLower
  );
}

/**
 * Calculate remaining minimum display time
 * @param {string} jobType - 'install' or 'remove'
 * @param {number|null} installStartTime - Timestamp when installation started
 * @param {object} timings - Timing configuration
 * @returns {number} - Remaining time in milliseconds
 */
export function calculateRemainingDisplayTime(jobType, installStartTime, timings) {
  const minDisplayTime = jobType === 'remove' 
    ? timings.MIN_DISPLAY_TIME.REMOVE 
    : timings.MIN_DISPLAY_TIME.INSTALL;
  
  if (!installStartTime) {
    return minDisplayTime;
  }
  
  const elapsedTime = Date.now() - installStartTime;
  return Math.max(0, minDisplayTime - elapsedTime);
}

/**
 * Generate job key for tracking processed jobs
 * @param {string} appName - Name of the app
 * @param {string} jobType - 'install' or 'remove'
 * @returns {string} - Job key
 */
export function generateJobKey(appName, jobType) {
  return `${appName}_${jobType}`;
}

