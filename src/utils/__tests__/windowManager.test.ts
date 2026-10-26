import { describe, it, expect, vi, beforeEach } from 'vitest';

// Closing a pop-out window re-embeds the app, but only when the user closed it.
// Closes we trigger ourselves (app error, app stop, daemon shutdown) must not
// bring the embedded view back.

type Listener = () => void;

const created: MockWindow[] = [];

class MockWindow {
  label: string;
  listeners = new Map<string, Listener>();
  constructor(label: string) {
    this.label = label;
    created.push(this);
  }
  once(event: string, cb: Listener): Promise<() => void> {
    this.listeners.set(event, cb);
    return Promise.resolve(() => {});
  }
  // Like Tauri, destroyed lands after close() resolves.
  async close(): Promise<void> {
    setTimeout(() => this.emit('tauri://destroyed'), 0);
  }
  emit(event: string): void {
    this.listeners.get(event)?.();
  }
  static getByLabel = vi.fn(async () => null);
}

const store = {
  currentApp: null as { info?: { name?: string } } | null,
  openEmbeddedApp: vi.fn(),
  addOpenWindow: vi.fn(),
  removeOpenWindow: vi.fn(),
};

vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: MockWindow }));
vi.mock('@tauri-apps/api/window', () => ({ getAllWindows: async () => [] }));
vi.mock('@tauri-apps/api/dpi', () => ({ PhysicalPosition: class {} }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../store/useAppStore', () => ({ default: { getState: () => store } }));

const { openAppWindow, closeAppWindow, closeAllAppWindows } = await import('../windowManager');

const URL = 'http://robot:8042';
const flush = () => new Promise(r => setTimeout(r, 0));

describe('windowManager re-embed on close', () => {
  beforeEach(async () => {
    await closeAllAppWindows();
    await flush();
    created.length = 0;
    vi.clearAllMocks();
    store.currentApp = { info: { name: 'my_app' } };
  });

  it('re-embeds when the user closes the running app window', async () => {
    await openAppWindow('my_app', URL);
    created[0].emit('tauri://destroyed');
    expect(store.openEmbeddedApp).toHaveBeenCalledWith(URL);
  });

  it('does not re-embed when we close the window ourselves', async () => {
    await openAppWindow('my_app', URL);
    await closeAppWindow('my_app');
    await flush();
    expect(store.openEmbeddedApp).not.toHaveBeenCalled();
  });

  it('does not re-embed a window whose app is no longer current', async () => {
    await openAppWindow('my_app', URL);
    store.currentApp = { info: { name: 'other_app' } };
    created[0].emit('tauri://destroyed');
    expect(store.openEmbeddedApp).not.toHaveBeenCalled();
  });

  it('registers the window as open before tauri://created fires', async () => {
    await openAppWindow('my_app', URL);
    expect(store.addOpenWindow).toHaveBeenCalledWith('app-my_app');
  });
});
