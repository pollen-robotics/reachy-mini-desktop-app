/**
 * NFC reader types and the pure logic around them, kept free of imports so
 * tests can load it without the app (and its browser-only modules).
 */

/** Why the reader is not serving: the daemon's `NfcStatus.error_code`. */
export type NfcStatusError =
  | 'DISABLED'
  | 'NO_BOARD'
  | 'DRIVER_MISSING'
  | 'PORT_CONFLICT'
  | 'LINK_ERROR';

/** Mirrors the daemon's `NfcStatus` (`GET /api/nfc/status`). */
export interface NfcStatus {
  connected: boolean;
  /** Switched on or off from Settings. Absent on daemons without the switch. */
  enabled?: boolean;
  chip_detected: boolean;
  driver_available: boolean;
  port?: string | null;
  /** From the board's USB product string ("Winnie NFC 1.2"). Absent on older daemons. */
  board_version?: string | null;
  chip_version?: string | null;
  /** For people; branch on `error_code`, the wording may change. */
  error?: string | null;
  error_code?: NfcStatusError | null;
  last_seen_at?: string | null;
}

/** One NDEF record. `kind` is "text", "uri" or "other". */
export interface NfcRecord {
  kind: 'text' | 'uri' | 'other' | string;
  value?: string | null;
  type_name?: string | null;
  data_hex?: string | null;
}

/** Mirrors the daemon's `NfcTag` (`GET /api/nfc/tag`). */
export interface NfcTag {
  present: boolean;
  uid?: string | null;
  model?: string | null;
  records?: NfcRecord[];
  content?: string | null;
  blank?: boolean;
  readable?: boolean;
  writable?: boolean;
  capacity?: number | null;
  raw_hex?: string | null;
  error?: string | null;
  last_read_at?: string | null;
}

/** Mirrors the daemon's `NfcWriteResult`, answered by both erase and write. */
export interface NfcTagResult {
  success: boolean;
  error?: string | null;
}

/** What `POST /api/nfc/write` puts on the tag: one text or URI record. */
export type NfcWriteContent = { text: string } | { uri: string };

/** What the reader is doing, as the status button shows it. */
export type NfcState = 'disabled' | 'unavailable' | 'idle' | 'tag';

/** Stable error codes returned by the daemon's erase and write endpoints. */
const TAG_ERROR_MESSAGES: Record<string, string> = {
  NO_TAG: 'No tag on the reader',
  TOO_LONG: 'Too long for this tag',
  LOCKED: 'Tag is locked and can no longer be written',
  UNKNOWN_TAG: 'Unrecognised tag model',
  WRITE_REFUSED: 'Tag refused the write',
  WRITE_ERROR: 'Write failed partway through',
  COLLISION: 'Several tags on the reader, present only one',
  NOT_CONNECTED: 'NFC reader not connected',
  LINK_LOST: 'Lost the link to the NFC reader',
  TIMEOUT: 'Tag was not presented in time',
  UNCERTAIN: 'The write may not have finished: check the tag',
  BUSY: 'The NFC reader is busy, try again',
  DRIVER_MISSING: 'NFC driver not installed on the robot',
  // Not from a write result: the daemon answers 503 while the reader is off.
  DISABLED: 'NFC reader is switched off',
};

/**
 * Turn an erase or write error code into a line for the user. Unknown codes are shown
 * as-is: a code we have never seen is more useful than a generic message.
 */
export function describeTagError(code: string | null | undefined): string {
  if (!code) return 'Unknown error';
  return TAG_ERROR_MESSAGES[code] ?? code;
}

/**
 * Collapse the daemon's status and tag into the states the button shows.
 *
 * "disabled" is the user's choice and wins over everything else.
 * Anything short of a connected reader is "unavailable": no answer from the
 * daemon, an older daemon without the NFC routes, the driver missing, or the
 * board unplugged all look the same from the button.
 */
export function deriveNfcState(status: NfcStatus | null, tag: NfcTag | null): NfcState {
  if (status?.enabled === false) return 'disabled';
  if (!status?.connected) return 'unavailable';
  return tag?.present ? 'tag' : 'idle';
}

/**
 * True when the tag holds a payload that is not NDEF (a bare code written
 * straight into memory), which only a full erase removes.
 */
export function needsFullErase(tag: NfcTag | null): boolean {
  if (!tag?.present) return false;
  return Boolean(tag.raw_hex) && (tag.records?.length ?? 0) === 0;
}
