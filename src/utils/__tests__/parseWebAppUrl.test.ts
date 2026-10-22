import { describe, expect, it } from 'vitest';
import { parseWebAppUrl } from '../parseWebAppUrl';

describe('parseWebAppUrl', () => {
  it.each([
    undefined,
    '',
    'ElevenLabs Conversational AI Agents integration for Reachy Mini',
    '/web-interface',
    'http://',
    'http://[invalid]:7861/',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/app.html',
    'ftp://localhost/app',
  ])('rejects unusable web interface metadata: %s', value => {
    expect(parseWebAppUrl(value)).toBeNull();
  });

  it.each([
    'http://0.0.0.0:7861/',
    'http://localhost:7861/app?mode=chat#conversation',
    'https://reachy-mini.local:8443/',
    'http://[::1]:7861/',
  ])('preserves valid web interface addresses: %s', value => {
    expect(parseWebAppUrl(value)?.toString()).toBe(value);
  });
});
