import { describe, it, expect } from 'vitest';
import {
  deriveNfcState,
  describeTagError,
  isRawPreviewTruncated,
  ndefMessageBytes,
  needsFullErase,
} from '../nfcState';
import type { NfcStatus, NfcTag } from '../nfcState';

const connected: NfcStatus = { connected: true, chip_detected: true, driver_available: true };

describe('deriveNfcState', () => {
  it('is unavailable until the daemon has answered', () => {
    expect(deriveNfcState(null, null)).toBe('unavailable');
  });

  it('is unavailable when the driver or the board is missing', () => {
    expect(
      deriveNfcState({ connected: false, chip_detected: false, driver_available: false }, null)
    ).toBe('unavailable');
    expect(
      deriveNfcState({ connected: false, chip_detected: false, driver_available: true }, null)
    ).toBe('unavailable');
  });

  it('ignores a stale tag once the reader is gone', () => {
    const tag: NfcTag = { present: true, uid: '04A1B2C3' };
    expect(deriveNfcState({ ...connected, connected: false }, tag)).toBe('unavailable');
  });

  it('is disabled when switched off, whatever the reader reports', () => {
    expect(deriveNfcState({ ...connected, enabled: false }, { present: true })).toBe('disabled');
    expect(
      deriveNfcState(
        { connected: false, enabled: false, chip_detected: false, driver_available: true },
        null
      )
    ).toBe('disabled');
  });

  // No `enabled` field counts as on.
  it('is idle on a connected reader with no tag', () => {
    expect(deriveNfcState(connected, null)).toBe('idle');
    expect(deriveNfcState(connected, { present: false })).toBe('idle');
  });

  it('reports a tag on the antenna, blank or not', () => {
    expect(deriveNfcState(connected, { present: true, blank: true })).toBe('tag');
    expect(deriveNfcState(connected, { present: true, content: 'badge42' })).toBe('tag');
  });
});

describe('needsFullErase', () => {
  it('is false without a tag, or for an NDEF tag', () => {
    expect(needsFullErase(null)).toBe(false);
    expect(needsFullErase({ present: false })).toBe(false);
    expect(
      needsFullErase({ present: true, records: [{ kind: 'text', value: 'hi' }], raw_hex: null })
    ).toBe(false);
  });

  it('is true for a bare code written outside NDEF', () => {
    expect(needsFullErase({ present: true, records: [], raw_hex: '42414447' })).toBe(true);
  });
});

describe('describeTagError', () => {
  it('explains known codes and passes unknown ones through', () => {
    expect(describeTagError('LOCKED')).toMatch(/locked/i);
    expect(describeTagError('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(describeTagError(null)).toBe('Unknown error');
  });

  it('explains the codes the daemon added: refusal while off, uncertain write, busy', () => {
    expect(describeTagError('DISABLED')).toMatch(/switched off/i);
    expect(describeTagError('UNCERTAIN')).toMatch(/check the tag/i);
    expect(describeTagError('BUSY')).toMatch(/busy/i);
  });
});

// Expected sizes: len(winnie_nfc.ndef.build_text / build_uri(...)).
describe('ndefMessageBytes', () => {
  it('matches the driver for text, across both length formats', () => {
    expect(ndefMessageBytes({ text: '' })).toBe(10);
    expect(ndefMessageBytes({ text: 'hi' })).toBe(12);
    expect(ndefMessageBytes({ text: 'a'.repeat(250) })).toBe(262);
    expect(ndefMessageBytes({ text: 'a'.repeat(251) })).toBe(263);
    expect(ndefMessageBytes({ text: 'a'.repeat(252) })).toBe(264);
    expect(ndefMessageBytes({ text: 'a'.repeat(300) })).toBe(315);
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(ndefMessageBytes({ text: 'é'.repeat(10) })).toBe(30);
    expect(ndefMessageBytes({ text: '🎩'.repeat(100) })).toBe(415);
  });

  it('abbreviates the longest URI prefix, like the driver', () => {
    expect(ndefMessageBytes({ uri: 'https://www.pollen-robotics.com' })).toBe(27);
    expect(ndefMessageBytes({ uri: 'https://x.io' })).toBe(12);
    expect(ndefMessageBytes({ uri: 'foo:bar' })).toBe(15);
    expect(ndefMessageBytes({ uri: 'urn:epc:id:abc' })).toBe(11);
    expect(ndefMessageBytes({ uri: 'https://' + 'a'.repeat(300) })).toBe(313);
  });
});

describe('isRawPreviewTruncated', () => {
  it('is true only for a full 32-byte preview', () => {
    expect(isRawPreviewTruncated('42'.repeat(32))).toBe(true);
    expect(isRawPreviewTruncated('42414447')).toBe(false);
  });
});
