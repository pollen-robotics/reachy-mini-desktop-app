import { JOB_STATUS, LOG_SUCCESS_PATTERNS, LOG_ERROR_PATTERNS } from './constants';
import type { JobType } from './constants';

export interface JobInfo {
  appName?: string;
  type?: JobType | string;
  status?: string;
  logs?: string[];
  [key: string]: unknown;
}

export interface InstalledAppLike {
  name?: string;
  id?: string;
  [key: string]: unknown;
}

export interface TimingsLike {
  MIN_DISPLAY_TIME: {
    INSTALL: number;
    REMOVE: number;
  };
  [key: string]: unknown;
}

export function findJobByAppName(
  activeJobs: Map<string, JobInfo> | null | undefined,
  appName: string | null | undefined
): JobInfo | null {
  if (!activeJobs || !appName) return null;

  for (const [, job] of activeJobs.entries()) {
    if (job.appName === appName) {
      return job;
    }
  }

  return null;
}

export function isJobCompleted(job: JobInfo | null | undefined): boolean {
  return job?.status === JOB_STATUS.COMPLETED;
}

export function isJobFailed(job: JobInfo | null | undefined): boolean {
  return job?.status === JOB_STATUS.FAILED;
}

export function wasJobRemoved(
  job: JobInfo | null | undefined,
  installStartTime: number | null,
  jobSeenOnce: boolean
): boolean {
  return !job && installStartTime !== null && jobSeenOnce;
}

export function analyzeLogs(logs: string[] | undefined | null): {
  isSuccess: boolean;
  isError: boolean;
} {
  if (!logs || logs.length === 0) {
    return { isSuccess: false, isError: false };
  }

  const logsText = logs.join(' ').toLowerCase();

  const hasSuccess = LOG_SUCCESS_PATTERNS.some(pattern => logsText.includes(pattern.toLowerCase()));
  const hasError = LOG_ERROR_PATTERNS.some(pattern => logsText.includes(pattern.toLowerCase()));

  return { isSuccess: hasSuccess, isError: hasError };
}

export function determineInstallationResult(job: JobInfo | null | undefined): {
  wasCompleted: boolean;
  wasFailed: boolean;
  confidence: 'high' | 'medium' | 'low';
} {
  if (isJobCompleted(job)) {
    return { wasCompleted: true, wasFailed: false, confidence: 'high' };
  }

  if (isJobFailed(job)) {
    return { wasCompleted: false, wasFailed: true, confidence: 'high' };
  }

  if (job?.logs && job.logs.length > 0) {
    const { isSuccess, isError } = analyzeLogs(job.logs);

    if (isSuccess) {
      return { wasCompleted: true, wasFailed: false, confidence: 'medium' };
    }

    if (isError) {
      return { wasCompleted: false, wasFailed: true, confidence: 'medium' };
    }
  }

  return { wasCompleted: true, wasFailed: false, confidence: 'low' };
}

export function isAppInInstalledList(
  appName: string | null | undefined,
  installedApps: InstalledAppLike[] | null | undefined
): boolean {
  if (!appName || !installedApps || installedApps.length === 0) {
    return false;
  }

  const appNameLower = appName.toLowerCase();

  return installedApps.some(
    app => app.name?.toLowerCase() === appNameLower || app.id?.toLowerCase() === appNameLower
  );
}

export function calculateRemainingDisplayTime(
  jobType: JobType | string,
  installStartTime: number | null,
  timings: TimingsLike
): number {
  const minDisplayTime =
    jobType === 'remove' ? timings.MIN_DISPLAY_TIME.REMOVE : timings.MIN_DISPLAY_TIME.INSTALL;

  if (!installStartTime) {
    return minDisplayTime;
  }

  const elapsedTime = Date.now() - installStartTime;
  return Math.max(0, minDisplayTime - elapsedTime);
}

export function generateJobKey(appName: string, jobType: JobType | string): string {
  return `${appName}_${jobType}`;
}
