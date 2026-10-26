import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/daemon', () => ({
  DAEMON_CONFIG: { TIMEOUTS: { COMMAND: 10000 } },
  buildApiUrl: (endpoint: string) => `http://robot${endpoint}`,
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../index', () => ({ isTelemetryEnabled: vi.fn() }));

import { fetchWithTimeout } from '../../../config/daemon';
import { isTelemetryEnabled } from '../index';
import { markDaemonHandled, syncOptOutToDaemon } from '../daemonTelemetry';

const fetchMock = vi.mocked(fetchWithTimeout);
const enabledMock = vi.mocked(isTelemetryEnabled);
let hardwareId = 'robot-a';

const puts = (): unknown[] =>
  fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT').map(([, o]) => o?.body);

beforeEach(() => {
  vi.clearAllMocks();
  hardwareId = 'robot-a';
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('/api/daemon/hardware-id')
      ? Response.json({ hardware_id: hardwareId })
      : Response.json({ enabled: false, disabled_by_env: false })
  );
});

describe('syncOptOutToDaemon', () => {
  it('never turns a robot on', async () => {
    enabledMock.mockReturnValue(true);
    await syncOptOutToDaemon();
    expect(puts()).toEqual([]);
  });

  it('pushes an earlier opt-out once per robot', async () => {
    enabledMock.mockReturnValue(false);
    await syncOptOutToDaemon();
    await syncOptOutToDaemon();
    hardwareId = 'robot-b';
    await syncOptOutToDaemon();
    const off = JSON.stringify({ enabled: false });
    expect(puts()).toEqual([off, off]);
  });

  it('leaves alone a robot whose choice the user set from the app', async () => {
    enabledMock.mockReturnValue(false);
    await markDaemonHandled();
    await syncOptOutToDaemon();
    expect(puts()).toEqual([]);
  });
});
