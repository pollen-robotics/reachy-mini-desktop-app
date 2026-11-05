// No imports: tests load this without the app.

export type NfcStatusError =
  | 'DISABLED'
  | 'NO_BOARD'
  | 'DRIVER_MISSING'
  | 'PORT_CONFLICT'
  | 'LINK_ERROR';

export interface NfcStatus {
  connected: boolean;
  enabled?: boolean;
  chip_detected: boolean;
  driver_available: boolean;
  port?: string | null;
  board_version?: string | null;
  chip_version?: string | null;
  error?: string | null;
  error_code?: NfcStatusError | null;
  last_seen_at?: string | null;
}

export interface NfcRecord {
  kind: 'text' | 'uri' | 'other' | string;
  value?: string | null;
  type_name?: string | null;
  data_hex?: string | null;
}

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

export interface NfcTagResult {
  success: boolean;
  error?: string | null;
}

export type NfcWriteContent = { text: string } | { uri: string };

export type NfcState = 'disabled' | 'unavailable' | 'idle' | 'tag';

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
  // Answered as a 503 while the reader is off.
  DISABLED: 'NFC reader is switched off',
};

// Unknown codes are shown as-is.
export function describeTagError(code: string | null | undefined): string {
  if (!code) return 'Unknown error';
  return TAG_ERROR_MESSAGES[code] ?? code;
}

// None of these change while the app runs.
const ABSENT_FOR_GOOD: ReadonlyArray<NfcStatusError> = [
  'NO_BOARD',
  'DRIVER_MISSING',
  'PORT_CONFLICT',
];

export function isReaderAbsentForGood(status: NfcStatus): boolean {
  return status.error_code != null && ABSENT_FOR_GOOD.includes(status.error_code);
}

export function deriveNfcState(status: NfcStatus | null, tag: NfcTag | null): NfcState {
  if (status?.enabled === false) return 'disabled';
  if (!status?.connected) return 'unavailable';
  return tag?.present ? 'tag' : 'idle';
}

// A non-NDEF payload only goes away with a full erase.
export function needsFullErase(tag: NfcTag | null): boolean {
  if (!tag?.present) return false;
  return Boolean(tag.raw_hex) && (tag.records?.length ?? 0) === 0;
}

// The daemon's RAW_PREVIEW_BYTES.
const RAW_PREVIEW_BYTES = 32;

export function isRawPreviewTruncated(rawHex: string): boolean {
  return rawHex.length >= RAW_PREVIEW_BYTES * 2;
}

// Driver order: the index of the longest matching prefix is written on the tag.
// prettier-ignore
const URI_PREFIXES = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:',
  'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://',
  'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://', 'news:',
  'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:', 'sips:',
  'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://',
  'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:',
  'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

const TEXT_LANG = 'en';

// Size of the NDEF message the driver writes (winnie_nfc ndef.build_text / build_uri).
export function ndefMessageBytes(content: NfcWriteContent): number {
  const utf8 = (s: string): number => new TextEncoder().encode(s).length;
  let payload: number;
  if ('uri' in content) {
    const prefix = URI_PREFIXES.reduce(
      (best, p) => (p && content.uri.startsWith(p) && p.length > best.length ? p : best),
      ''
    );
    payload = 1 + utf8(content.uri.slice(prefix.length));
  } else {
    payload = 1 + TEXT_LANG.length + utf8(content.text);
  }
  // Record: header, type length, payload length (1 byte up to 255, else 4), type "T"/"U".
  const record = 2 + (payload <= 0xff ? 1 : 4) + 1 + payload;
  // TLV: tag, length (1 byte up to 254, else 3), message, terminator.
  return 1 + (record <= 0xfe ? 1 : 3) + record + 1;
}
