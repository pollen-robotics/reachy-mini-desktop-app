import { describe, it, expect } from 'vitest';
import { resolveAllowedUrl } from '../useEmbeddedAppOpenUrl';

// These cases encode the contract documented on `resolveAllowedUrl`: an app
// served by the robot asks the desktop app to open a page, and the desktop app
// decides. Everything here is an attempt to widen that decision, so a change
// that turns one of the `toBeNull` cases green is a hole, not a feature.

describe('resolveAllowedUrl - what an embedded app may ask us to open', () => {
  it('accepts an allowed host over HTTPS', () => {
    expect(resolveAllowedUrl('https://huggingface.co/spaces')?.href).toBe(
      'https://huggingface.co/spaces'
    );
    expect(
      resolveAllowedUrl('https://store.pollen-robotics.com/collections/reachy-mini')?.href
    ).toBe('https://store.pollen-robotics.com/collections/reachy-mini');
  });

  it('refuses plain HTTP, so an opened page cannot be rewritten in flight', () => {
    expect(resolveAllowedUrl('http://huggingface.co/spaces')).toBeNull();
  });

  it('refuses schemes that are not the web', () => {
    expect(resolveAllowedUrl('file:///etc/passwd')).toBeNull();
    expect(resolveAllowedUrl('javascript:alert(1)')).toBeNull();
    expect(resolveAllowedUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('matches hosts in full, not by prefix or suffix', () => {
    expect(resolveAllowedUrl('https://huggingface.co.example.com/login')).toBeNull();
    expect(resolveAllowedUrl('https://not-huggingface.co/login')).toBeNull();
    expect(resolveAllowedUrl('https://huggingface.co.evil')).toBeNull();
  });

  it('refuses a subdomain that was never listed', () => {
    expect(resolveAllowedUrl('https://anything.huggingface.co/')).toBeNull();
  });

  it('is not fooled by credentials or a port standing in for the host', () => {
    expect(resolveAllowedUrl('https://huggingface.co@evil.example.com/')).toBeNull();
  });

  it('refuses the local network, which the user’s browser reaches with their cookies', () => {
    expect(resolveAllowedUrl('https://192.168.1.1/admin')).toBeNull();
    expect(resolveAllowedUrl('https://localhost:8080/')).toBeNull();
  });

  it('refuses anything that is not a URL', () => {
    expect(resolveAllowedUrl(undefined)).toBeNull();
    expect(resolveAllowedUrl(null)).toBeNull();
    expect(resolveAllowedUrl('')).toBeNull();
    expect(resolveAllowedUrl('huggingface.co')).toBeNull();
    expect(resolveAllowedUrl({ href: 'https://huggingface.co/' })).toBeNull();
  });
});
