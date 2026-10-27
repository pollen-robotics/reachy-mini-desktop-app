import { useEffect, useMemo } from 'react';
import { openUrl } from '@utils/tauriCompat';

/**
 * Hosts an embedded app may ask us to open, matched exactly.
 *
 * Exact hostnames, never suffixes: `huggingface.co.example.com` and
 * `not-huggingface.co` both end or start with an entry we trust, and both are
 * somebody else's server.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'huggingface.co',
  'pollen-robotics.com',
  'store.pollen-robotics.com',
  'docs.pollen-robotics.com',
]);

/** Floor between two openings, so a loop in an app cannot bury the desktop in tabs. */
const MIN_INTERVAL_MS = 2000;

const APP_SOURCE = 'reachy-mini-app';
const HOST_SOURCE = 'reachy-mini-host';
const REQUEST_TYPE = 'open-url';
const RESULT_TYPE = 'open-url:result';

interface OpenUrlRequest {
  source?: string;
  type?: string;
  id?: string;
  url?: string;
}

/** Parse without throwing; a request that is not a URL at all is simply refused. */
function parseUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * The URL an embedded app asked for, if we are willing to open it, else null.
 *
 * HTTPS only, and only the hosts in `ALLOWED_HOSTS`, matched in full. An app is
 * trusted enough to have been installed, not enough to name any address: an
 * arbitrary URL here is a phishing page wearing a button the user just clicked,
 * or a request to a device on the user's LAN carrying their browser's cookies.
 *
 * @param value The `url` field of an app's request, unvalidated.
 */
export function resolveAllowedUrl(value: unknown): URL | null {
  const target = parseUrl(value);
  if (!target) return null;
  if (target.protocol !== 'https:') return null;
  return ALLOWED_HOSTS.has(target.hostname) ? target : null;
}

/**
 * Let the embedded app raise a browser on this machine.
 *
 * Apps are served from the robot, so their iframe cannot reach Tauri's IPC and
 * `window.open` is dropped by the webview: asking the desktop app is their only
 * way out. What we agree to open is held to `resolveAllowedUrl`, and to one
 * opening every `MIN_INTERVAL_MS`.
 *
 * Apps hear back either way, on the `open-url:result` message: a refusal is
 * what tells them to fall back to showing the address on their own page.
 *
 * @param embeddedAppUrl The app's base URL, or null when no app is embedded.
 */
export function useEmbeddedAppOpenUrl(embeddedAppUrl: string | null): void {
  // The app's own origin, not the iframe src: the src carries theme and
  // cache-busting parameters that change often, and rebuilding the listener
  // on a theme toggle would clear the rate limit with it.
  const appOrigin = useMemo(() => parseUrl(embeddedAppUrl)?.origin ?? null, [embeddedAppUrl]);

  useEffect(() => {
    if (!appOrigin) return;
    let lastOpenedAt = 0;

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== appOrigin) return;
      const request = event.data as OpenUrlRequest | null;
      if (request?.source !== APP_SOURCE || request.type !== REQUEST_TYPE) return;

      const target = resolveAllowedUrl(request.url);
      const now = Date.now();
      const opened = target !== null && now - lastOpenedAt >= MIN_INTERVAL_MS;

      if (opened && target) {
        lastOpenedAt = now;
        void openUrl(target.href);
      }

      const app = event.source as Window | null;
      app?.postMessage(
        { source: HOST_SOURCE, type: RESULT_TYPE, id: request.id, opened },
        appOrigin
      );
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [appOrigin]);
}

export default useEmbeddedAppOpenUrl;
