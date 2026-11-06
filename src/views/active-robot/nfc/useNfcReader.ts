import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl, fetchWithTimeout } from '../../../config/daemon';
import { useWindowVisible } from '../../../hooks/system/useWindowVisible';
import { deriveNfcState, isReaderAbsentForGood } from './nfcState';
import type { NfcState, NfcStatus, NfcTag, NfcTagResult, NfcWriteContent } from './nfcState';

const POLL_INTERVAL_MS = 1000;
const READ_TIMEOUT_MS = 3000;
// The daemon waits up to 15s for a tag, and a full erase writes every page.
const ERASE_TIMEOUT_MS = 25000;
// The daemon waits up to 6s for a tag.
const WRITE_TIMEOUT_MS = 12000;
const TOGGLE_TIMEOUT_MS = 8000;

export interface UseNfcReaderResult {
  status: NfcStatus | null;
  tag: NfcTag | null;
  state: NfcState;
  fetchError: string | null;
  // The daemon has no NFC support: the robot needs an update.
  unsupported: boolean;
  isErasing: boolean;
  eraseResult: NfcTagResult | null;
  erase: (full: boolean) => Promise<void>;
  isWriting: boolean;
  writeResult: NfcTagResult | null;
  write: (content: NfcWriteContent) => Promise<void>;
  canToggle: boolean;
  isToggling: boolean;
  toggleError: string | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  clearResults: () => void;
}

function postJson(path: string, body: object, timeoutMs: number, label: string): Promise<Response> {
  return fetchWithTimeout(
    buildApiUrl(path),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs,
    { label }
  );
}

async function postTagOperation(
  path: string,
  body: object,
  timeoutMs: number,
  label: string
): Promise<NfcTagResult> {
  try {
    const res = await postJson(path, body, timeoutMs, label);
    // 503 on these routes: the reader is switched off.
    if (res.status === 503) return { success: false, error: 'DISABLED' };
    if (!res.ok) return { success: false, error: `${label} request failed (${res.status})` };
    return (await res.json()) as NfcTagResult;
  } catch {
    return { success: false, error: 'LINK_LOST' };
  }
}

// `enabled: false` pauses the poll, so the button and the Settings card do not both poll.
// It also stops once the answer cannot change.
export function useNfcReader({ enabled = true }: { enabled?: boolean } = {}): UseNfcReaderResult {
  const [status, setStatus] = useState<NfcStatus | null>(null);
  const [tag, setTag] = useState<NfcTag | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<boolean>(false);
  const [isErasing, setIsErasing] = useState<boolean>(false);
  const [eraseResult, setEraseResult] = useState<NfcTagResult | null>(null);
  const [isWriting, setIsWriting] = useState<boolean>(false);
  const [writeResult, setWriteResult] = useState<NfcTagResult | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const isVisible = useWindowVisible();
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      let final = false;
      try {
        const statusRes = await fetchWithTimeout(
          buildApiUrl('/api/nfc/status'),
          {},
          READ_TIMEOUT_MS,
          { silent: true }
        );
        // No NFC routes: the daemon predates NFC support.
        if (statusRes.status === 404) {
          final = true;
          if (cancelled) return;
          setUnsupported(true);
          setStatus(null);
          setTag(null);
          setFetchError(null);
          return;
        }
        if (!statusRes.ok) throw new Error(`NFC status request failed (${statusRes.status})`);
        const nextStatus = (await statusRes.json()) as NfcStatus;
        final = isReaderAbsentForGood(nextStatus);
        let nextTag: NfcTag | null = null;
        if (nextStatus.connected) {
          const tagRes = await fetchWithTimeout(buildApiUrl('/api/nfc/tag'), {}, READ_TIMEOUT_MS, {
            silent: true,
          });
          if (tagRes.ok) nextTag = (await tagRes.json()) as NfcTag;
        }
        if (cancelled) return;
        setStatus(nextStatus);
        setTag(nextTag);
        setFetchError(null);
      } catch (err) {
        if (cancelled) return;
        setStatus(null);
        setTag(null);
        setFetchError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && !final) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isVisible, enabled]);

  const erase = useCallback(async (full: boolean): Promise<void> => {
    setIsErasing(true);
    setEraseResult(null);
    setWriteResult(null);
    const result = await postTagOperation(
      '/api/nfc/erase',
      { full },
      ERASE_TIMEOUT_MS,
      full ? 'NFC full erase' : 'NFC erase'
    );
    if (!mountedRef.current) return;
    setEraseResult(result);
    setIsErasing(false);
  }, []);

  const write = useCallback(async (content: NfcWriteContent): Promise<void> => {
    setIsWriting(true);
    setEraseResult(null);
    setWriteResult(null);
    const result = await postTagOperation('/api/nfc/write', content, WRITE_TIMEOUT_MS, 'NFC write');
    if (!mountedRef.current) return;
    setWriteResult(result);
    setIsWriting(false);
  }, []);

  const clearResults = useCallback(() => {
    setEraseResult(null);
    setWriteResult(null);
  }, []);

  const setEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    setIsToggling(true);
    setToggleError(null);
    let error: string | null = null;
    let nextStatus: NfcStatus | null = null;
    try {
      const res = await postJson(
        '/api/nfc/enabled',
        { enabled },
        TOGGLE_TIMEOUT_MS,
        enabled ? 'NFC reader on' : 'NFC reader off'
      );
      if (res.ok) nextStatus = (await res.json()) as NfcStatus;
      else error = `Could not switch the reader ${enabled ? 'on' : 'off'} (${res.status})`;
    } catch {
      error = 'Lost the link to the daemon';
    }
    if (!mountedRef.current) return;
    if (nextStatus) {
      setStatus(nextStatus);
      if (!nextStatus.connected) setTag(null);
    }
    setToggleError(error);
    setIsToggling(false);
  }, []);

  return {
    status,
    tag,
    state: deriveNfcState(status, tag),
    fetchError,
    unsupported,
    isErasing,
    eraseResult,
    erase,
    isWriting,
    writeResult,
    write,
    clearResults,
    canToggle: typeof status?.enabled === 'boolean',
    isToggling,
    toggleError,
    setEnabled,
  };
}
