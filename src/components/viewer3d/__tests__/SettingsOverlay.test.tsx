import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useState: vi.fn(),
  useEffect: vi.fn(),
  useCallback: vi.fn((callback: unknown) => callback),
  useRef: vi.fn((initialValue: unknown) => ({ current: initialValue })),
  fetchWithTimeout: vi.fn(),
  resetAll: vi.fn(),
  clearApps: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: mocks.useState,
    useEffect: mocks.useEffect,
    useCallback: mocks.useCallback,
    useRef: mocks.useRef,
  };
});

vi.mock('@config/daemon', () => ({
  buildApiUrl: (path: string) => `http://robot${path}`,
  fetchWithTimeout: mocks.fetchWithTimeout,
  DAEMON_CONFIG: { TIMEOUTS: { COMMAND: 5000 } },
  getWsBaseUrl: () => 'ws://robot',
}));

vi.mock('@store/useAppStore', () => ({
  default: () => ({
    connectionMode: 'wifi',
    remoteHost: 'robot.local',
    resetAll: mocks.resetAll,
    clearApps: mocks.clearApps,
  }),
}));

vi.mock('@hooks/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('@utils/logging', () => ({ logSuccess: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

vi.mock('@components/FullscreenOverlay', () => ({ default: 'fullscreen-overlay' }));
vi.mock('@components/PulseButton', () => ({ default: 'pulse-button' }));
vi.mock('../settings', () => ({
  SettingsUpdateCard: 'settings-update-card',
  SettingsWifiCard: 'settings-wifi-card',
  SettingsPreferencesCard: 'settings-preferences-card',
  SettingsCacheCard: 'settings-cache-card',
  SettingsDaemonCard: 'settings-daemon-card',
  ChangeWifiOverlay: 'change-wifi-overlay',
  WifiConnectingOverlay: 'wifi-connecting-overlay',
}));

vi.mock('@styles', async importOriginal => {
  const styles = await importOriginal<typeof import('@styles')>();
  return {
    ...styles,
    useAppPalette: () => styles.buildAppPalette(false),
  };
});

const { default: SettingsOverlay } = await import('../SettingsOverlay');

interface TestElementProps {
  children?: ReactNode;
  onConnect?: () => void;
  onSSIDChange?: (ssid: string) => void;
}

function findElement(
  node: ReactNode,
  type: ReactElement['type']
): ReactElement<TestElementProps> | null {
  if (!isValidElement<TestElementProps>(node)) return null;
  if (node.type === type) return node;

  for (const child of Children.toArray(node.props.children)) {
    const match = findElement(child, type);
    if (match) return match;
  }

  return null;
}

function createRenderer(): () => ReactElement {
  const state: unknown[] = [];

  return () => {
    let stateIndex = 0;
    mocks.useState.mockImplementation(initialValue => {
      const currentIndex = stateIndex++;
      if (!(currentIndex in state)) {
        state[currentIndex] = typeof initialValue === 'function' ? initialValue() : initialValue;
      }

      return [
        state[currentIndex],
        (nextValue: unknown) => {
          state[currentIndex] =
            typeof nextValue === 'function' ? nextValue(state[currentIndex]) : nextValue;
        },
      ];
    });

    return SettingsOverlay({ open: true, onClose: vi.fn() });
  };
}

function getChangeWifiOverlay(selectedSSID: string): ReactElement<TestElementProps> {
  const render = createRenderer();
  let element = render();
  let overlay = findElement(element, 'change-wifi-overlay');
  if (!overlay) throw new Error('ChangeWifiOverlay not found');

  if (selectedSSID) {
    overlay.props.onSSIDChange?.(selectedSSID);
    element = render();
    overlay = findElement(element, 'change-wifi-overlay');
    if (!overlay) throw new Error('ChangeWifiOverlay not found after selecting a network');
  }

  return overlay;
}

describe('SettingsOverlay WiFi connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { onLine: true });
    mocks.fetchWithTimeout.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to a selected open network with an empty password', () => {
    const overlay = getChangeWifiOverlay('Guest WiFi');

    overlay.props.onConnect?.();

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'http://robot/wifi/connect?ssid=Guest%20WiFi&password=',
      { method: 'POST' },
      5000,
      { label: 'WiFi connect', silent: true }
    );
  });

  it('does not submit without a selected network', () => {
    const overlay = getChangeWifiOverlay('');

    overlay.props.onConnect?.();

    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });
});
