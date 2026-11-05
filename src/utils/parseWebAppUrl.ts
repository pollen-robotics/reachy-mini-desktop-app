/**
 * Validate an app's advertised web interface address. Returns the normalized
 * http(s) URL, pointed at `hostname` when given, or null if it can't be used.
 */
export function parseWebAppUrl(value: string | undefined, hostname?: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (hostname) url.hostname = hostname;
    return url.toString();
  } catch {
    return null;
  }
}
