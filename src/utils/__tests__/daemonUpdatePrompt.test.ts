import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimUpdateCheck,
  resetUpdateChecks,
  shouldPromptDaemonUpdate,
} from '../daemonUpdatePrompt';

describe('claimUpdateCheck', () => {
  beforeEach(() => resetUpdateChecks());

  it('checks each connection once per session', () => {
    expect(claimUpdateCheck('usb', null)).toBe(true);
    expect(claimUpdateCheck('usb', null)).toBe(false);
    expect(claimUpdateCheck('wifi', 'reachy-mini.local')).toBe(true);
    expect(claimUpdateCheck('wifi', 'reachy-mini.local')).toBe(false);
    expect(claimUpdateCheck('wifi', '192.168.1.20')).toBe(true);
  });

  it('never checks external daemons or a missing mode', () => {
    expect(claimUpdateCheck('external', null)).toBe(false);
    expect(claimUpdateCheck(null, null)).toBe(false);
  });
});

describe('shouldPromptDaemonUpdate', () => {
  const info = { is_available: true, available_version: '1.12.0' };

  it('prompts when an update exists and was not skipped', () => {
    expect(shouldPromptDaemonUpdate(info, null)).toBe(true);
    expect(shouldPromptDaemonUpdate(info, '1.11.0')).toBe(true);
  });

  it('stays quiet for the skipped version, no update, or no answer', () => {
    expect(shouldPromptDaemonUpdate(info, '1.12.0')).toBe(false);
    expect(shouldPromptDaemonUpdate({ ...info, is_available: false }, null)).toBe(false);
    expect(shouldPromptDaemonUpdate(null, null)).toBe(false);
  });
});
