import { useEffect, useRef, useState } from 'react';
import { getDaemonHostname } from '../config/daemon';
import { parseWebAppUrl } from '../utils/parseWebAppUrl';
import { logWarning, LOG_CATEGORIES } from '../utils/logging';

export interface UrlAccessibilityResult {
  isAccessible: boolean;
  isChecking: boolean;
}

interface UrlAccessibilityCallbacks {
  onAccessible: () => void;
  onTimeout: () => void;
}

// Warn once per address, not on every render/poll cycle.
const warnedInvalidUrls = new Set<string>();

/**
 * Poll an app's web interface until it answers or `timeoutMs` elapses.
 * Returns a cancel function, or null without polling (and without ever calling
 * `onTimeout`) when the address isn't a usable http(s) URL: a bad address must
 * not get the running app stopped.
 */
export function startUrlAccessibilityCheck(
  url: string,
  timeoutMs: number,
  { onAccessible, onTimeout }: UrlAccessibilityCallbacks
): (() => void) | null {
  const targetUrl = parseWebAppUrl(url, getDaemonHostname());
  if (!targetUrl) {
    if (!warnedInvalidUrls.has(url)) {
      warnedInvalidUrls.add(url);
      logWarning(
        `Ignoring invalid web interface URL "${url}" (expected http:// or https://)`,
        LOG_CATEGORIES.APP
      );
    }
    return null;
  }

  let done = false;
  let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let globalTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const startTime = Date.now();

  const finish = (callback: () => void): void => {
    if (done) return;
    done = true;
    if (pollTimeoutId) clearTimeout(pollTimeoutId);
    if (globalTimeoutId) clearTimeout(globalTimeoutId);
    callback();
  };

  const checkUrl = async (): Promise<void> => {
    if (Date.now() - startTime > timeoutMs) {
      finish(onTimeout);
      return;
    }

    try {
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 5000);

      await fetch(targetUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(requestTimeout);

      finish(onAccessible);
    } catch {
      if (!done) {
        pollTimeoutId = setTimeout(checkUrl, 2000);
      }
    }
  };

  pollTimeoutId = setTimeout(checkUrl, 1000);
  globalTimeoutId = setTimeout(() => finish(onTimeout), timeoutMs + 1000);

  return () => finish(() => {});
}

export function useUrlAccessibility(
  url: string | null | undefined,
  enabled: boolean = false,
  onTimeout: (() => void) | null = null,
  timeoutMs: number = 30000
): UrlAccessibilityResult {
  const [isAccessible, setIsAccessible] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const onTimeoutRef = useRef<(() => void) | null>(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    setIsAccessible(false);
    const cancel =
      enabled && url
        ? startUrlAccessibilityCheck(url, timeoutMs, {
            onAccessible: () => {
              setIsAccessible(true);
              setIsChecking(false);
            },
            onTimeout: () => {
              setIsChecking(false);
              onTimeoutRef.current?.();
            },
          })
        : null;
    setIsChecking(cancel !== null);
    return cancel ?? undefined;
  }, [url, enabled, timeoutMs]);

  return { isAccessible, isChecking };
}
