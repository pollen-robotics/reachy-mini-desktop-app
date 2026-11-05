import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// #272: when an app advertised an unparseable web interface URL, the check kept
// retrying until its timeout, and the timeout stops the running app. An invalid
// address must never reach onTimeout.

const { logWarning } = vi.hoisted(() => ({ logWarning: vi.fn() }));

vi.mock('../../config/daemon', () => ({ getDaemonHostname: () => 'robot.local' }));
vi.mock('../../utils/logging', () => ({ logWarning, LOG_CATEGORIES: { APP: 'app' } }));

const { startUrlAccessibilityCheck } = await import('../useUrlAccessibility');

const TIMEOUT_MS = 60000;
const fetchMock = vi.fn();

function start(url: string) {
  const callbacks = { onAccessible: vi.fn(), onTimeout: vi.fn() };
  const cancel = startUrlAccessibilityCheck(url, TIMEOUT_MS, callbacks);
  return { cancel, ...callbacks };
}

describe('startUrlAccessibilityCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    logWarning.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('never times out (so never stops the app) on an invalid URL', async () => {
    const check = start('ElevenLabs Conversational AI Agents integration for Reachy Mini');

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);

    expect(check.cancel).toBeNull();
    expect(check.onTimeout).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('warns once per invalid URL', () => {
    start('javascript:alert(1)');
    start('javascript:alert(1)');
    expect(logWarning).toHaveBeenCalledTimes(1);
  });

  it('times out once when a valid URL never answers', async () => {
    fetchMock.mockRejectedValue(new Error('unreachable'));
    const check = start('http://0.0.0.0:7861/');

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);

    expect(check.onTimeout).toHaveBeenCalledTimes(1);
    expect(check.onAccessible).not.toHaveBeenCalled();
  });

  it('polls the daemon host and reports a reachable app', async () => {
    fetchMock.mockResolvedValue(new Response());
    const check = start('http://0.0.0.0:7861/');

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);

    expect(fetchMock).toHaveBeenCalledWith('http://robot.local:7861/', expect.anything());
    expect(check.onAccessible).toHaveBeenCalledTimes(1);
    expect(check.onTimeout).not.toHaveBeenCalled();
  });
});
