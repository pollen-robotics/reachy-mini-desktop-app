import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl, fetchWithTimeout } from '../../../config/daemon';
import { useWindowVisible } from '../../../hooks/system/useWindowVisible';
import { deriveNfcState } from './nfcState';
import type { NfcState, NfcStatus, NfcTag, NfcTagResult, NfcWriteContent } from './nfcState';

const POLL_INTERVAL_MS = 1000;
const READ_TIMEOUT_MS = 3000;
// The daemon waits up to 15s for a tag before answering an erase, and a full
// erase writes every page; leave room on top of that.
const ERASE_TIMEOUT_MS = 25000;
// The daemon waits up to 6s for a tag before answering a write.
const WRITE_TIMEOUT_MS = 12000;
// Switching off joins the daemon's reader thread, which answers within a poll.
const TOGGLE_TIMEOUT_MS = 8000;

export interface UseNfcReaderResult {
  status: NfcStatus | null;
  tag: NfcTag | null;
  state: NfcState;
  /** Set when the daemon could not be asked at all (older daemon, network). */
  fetchError: string | null;
  isErasing: boolean;
  eraseResult: NfcTagResult | null;
  erase: (full: boolean) => Promise<void>;
  isWriting: boolean;
  writeResult: NfcTagResult | null;
  write: (content: NfcWriteContent) => Promise<void>;
  /** False on a daemon too old to switch the reader, or not answering. */
  canToggle: boolean;
  isToggling: boolean;
  toggleError: string | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  /** Forget the last erase and write outcomes. */
  clearResults: () => void;
}

/**
 * POST one tag-modifying operation and fold every way it can fail into a
 * result, so the caller only has one shape to show.
 */
async function postTagOperation(
  path: string,
  body: object,
  timeoutMs: number,
  label: string
): Promise<NfcTagResult> {
  try {
    const res = await fetchWithTimeout(
      buildApiUrl(path),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs,
      { label }
    );
    // The daemon's only 503 on these routes: the reader is switched off.
    if (res.status === 503) return { success: false, error: 'DISABLED' };
    if (!res.ok) return { success: false, error: `${label} request failed (${res.status})` };
    return (await res.json()) as NfcTagResult;
  } catch {
    return { success: false, error: 'LINK_LOST' };
  }
}

/**
 * Poll the daemon's NFC reader once a second while the window is visible.
 *
 * The tag is only asked for when the reader is connected: the daemon answers
 * "no tag" otherwise, so the request would tell us nothing.
 *
 * `enabled: false` pauses the poll, so two readers on screen at once (the
 * status button behind Settings, and the Settings card) do not both ask.
 */
export function useNfcReader({ enabled = true }: { enabled?: boolean } = {}): UseNfcReaderResult {
  const [status, setStatus] = useState<NfcStatus | null>(null);
  const [tag, setTag] = useState<NfcTag | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
      try {
        const statusRes = await fetchWithTimeout(
          buildApiUrl('/api/nfc/status'),
          {},
          READ_TIMEOUT_MS,
          { silent: true }
        );
        if (!statusRes.ok) {
          throw new Error(
            statusRes.status === 404
              ? 'This daemon version has no NFC support'
              : `NFC status request failed (${statusRes.status})`
          );
        }
        const nextStatus = (await statusRes.json()) as NfcStatus;
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
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
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
      const res = await fetchWithTimeout(
        buildApiUrl('/api/nfc/enabled'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        },
        TOGGLE_TIMEOUT_MS,
        { label: enabled ? 'NFC reader on' : 'NFC reader off' }
      );
      if (res.ok) nextStatus = (await res.json()) as NfcStatus;
      else error = `Could not switch the reader ${enabled ? 'on' : 'off'} (${res.status})`;
    } catch {
      error = 'Lost the link to the daemon';
    }
    if (!mountedRef.current) return;
    // Show the switch's new position now rather than at the next poll.
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

export default useNfcReader;
