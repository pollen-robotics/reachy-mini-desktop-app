import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the two external deps used by config/daemon.js so the function under
// test can run in isolation. The loggers are no-ops; the store is a plain
// object mutated per-test to set up connectionMode / remoteHost.
vi.mock('../../utils/logging', () => ({
  logApiCall: vi.fn(),
  logPermission: vi.fn(),
  logTimeout: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
}));

const mockState = { connectionMode: null, remoteHost: null };

vi.mock('../../store', () => ({
  useStore: {
    getState: () => mockState,
  },
}));

// Import AFTER mocks are registered.
import { getDaemonHostname } from '../daemon';

// These test cases encode the documented contract from the JSDoc of
// `getDaemonHostname`:
//
//   "Default: localhost"
//   "Hostname like 'localhost', 'reachy-mini.home', or '192.168.1.18'"
//
// The JSDoc commits to: (a) localhost default, (b) raw hostname output with
// no protocol or trailing port, (c) the three example forms above.

describe('getDaemonHostname - documented contract', () => {
  beforeEach(() => {
    mockState.connectionMode = null;
    mockState.remoteHost = null;
  });

  describe('defaults to localhost', () => {
    it('returns "localhost" when no connection mode is set', () => {
      expect(getDaemonHostname()).toBe('localhost');
    });

    it('returns "localhost" in USB mode', () => {
      mockState.connectionMode = 'usb';
      mockState.remoteHost = 'ignored-for-usb';
      expect(getDaemonHostname()).toBe('localhost');
    });

    it('returns "localhost" in wifi mode when remoteHost is missing', () => {
      mockState.connectionMode = 'wifi';
      mockState.remoteHost = null;
      expect(getDaemonHostname()).toBe('localhost');
    });

    it('returns "localhost" in wifi mode when remoteHost is an empty string', () => {
      mockState.connectionMode = 'wifi';
      mockState.remoteHost = '';
      expect(getDaemonHostname()).toBe('localhost');
    });
  });

  describe('wifi mode: remoteHost hostname extraction', () => {
    beforeEach(() => {
      mockState.connectionMode = 'wifi';
    });

    it('returns a bare hostname as-is', () => {
      mockState.remoteHost = 'reachy-mini.home';
      expect(getDaemonHostname()).toBe('reachy-mini.home');
    });

    it('returns a bare IP as-is', () => {
      mockState.remoteHost = '192.168.1.18';
      expect(getDaemonHostname()).toBe('192.168.1.18');
    });

    it('strips http:// protocol', () => {
      mockState.remoteHost = 'http://192.168.1.18';
      expect(getDaemonHostname()).toBe('192.168.1.18');
    });

    it('strips https:// protocol', () => {
      mockState.remoteHost = 'https://reachy-mini.home';
      expect(getDaemonHostname()).toBe('reachy-mini.home');
    });

    it('strips :8000 default port suffix', () => {
      mockState.remoteHost = '192.168.1.18:8000';
      expect(getDaemonHostname()).toBe('192.168.1.18');
    });

    it('strips both protocol and :8000 together', () => {
      mockState.remoteHost = 'http://192.168.1.18:8000';
      expect(getDaemonHostname()).toBe('192.168.1.18');
    });

    it('output never contains a protocol prefix', () => {
      for (const input of ['http://a', 'https://a', 'http://a:8000', 'https://a.b.c:8000']) {
        mockState.remoteHost = input;
        const out = getDaemonHostname();
        expect(out.includes('://')).toBe(false);
      }
    });
  });

  // Observable behaviours not explicitly documented in the JSDoc - captured
  // here as regression pins. If any of these assertions need to change in
  // the future, review the JSDoc first so the contract stays honest.
  describe('observable behaviours (non-JSDoc - regression pins)', () => {
    it('does NOT strip non-8000 ports (port ":8000$" only)', () => {
      mockState.connectionMode = 'wifi';
      mockState.remoteHost = 'http://192.168.1.18:9000';
      expect(getDaemonHostname()).toBe('192.168.1.18:9000');
    });

    it('treats unknown connection modes as localhost (only "wifi" is special)', () => {
      mockState.connectionMode = 'external';
      mockState.remoteHost = 'http://external.example.com:8000';
      expect(getDaemonHostname()).toBe('localhost');
    });
  });
});
