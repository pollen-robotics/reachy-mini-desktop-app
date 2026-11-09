import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Button, TextField } from '@mui/material';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useState: vi.fn(),
  useEffect: vi.fn(),
  useCallback: vi.fn((callback: unknown) => callback),
  useMemo: vi.fn((factory: () => unknown) => factory()),
  fetchWithTimeout: vi.fn(),
  wifiSetupStarted: vi.fn(),
  wifiSetupCompleted: vi.fn(),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: mocks.useState,
    useEffect: mocks.useEffect,
    useCallback: mocks.useCallback,
    useMemo: mocks.useMemo,
  };
});

vi.mock('../../../config/daemon', () => ({
  buildApiUrl: (path: string) => `http://daemon${path}`,
  fetchWithTimeout: mocks.fetchWithTimeout,
  DAEMON_CONFIG: { TIMEOUTS: { COMMAND: 5000 } },
}));

vi.mock('../../../utils/telemetry', () => ({
  telemetry: {
    wifiSetupStarted: mocks.wifiSetupStarted,
    wifiSetupCompleted: mocks.wifiSetupCompleted,
  },
}));

vi.mock('@components/wifi/NetworkSelect', () => ({ default: 'network-select' }));

vi.mock('@styles', async importOriginal => {
  const styles = await importOriginal<typeof import('@styles')>();
  return {
    ...styles,
    useAppPalette: () => styles.buildAppPalette(false),
  };
});

const { default: WiFiConfiguration } = await import('../WiFiConfiguration');

const HOTSPOT_BASE_URL = 'http://hotspot.test:8000';

interface TestElementProps {
  children?: ReactNode;
  disabled?: boolean;
  label?: string;
  onChange?: (value: string) => void;
  onClick?: () => void | Promise<void>;
  onKeyPress?: (event: { key: string }) => void;
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

    return WiFiConfiguration({ customBaseUrl: HOTSPOT_BASE_URL });
  };
}

function getElement(
  element: ReactElement,
  type: ReactElement['type']
): ReactElement<TestElementProps> {
  const match = findElement(element, type);
  if (!match) throw new Error(`Element not found: ${String(type)}`);
  return match;
}

function renderConfiguration(selectedSSID = 'Guest WiFi'): ReactElement {
  const render = createRenderer();
  let element = render();

  if (selectedSSID) {
    getElement(element, 'network-select').props.onChange?.(selectedSSID);
    element = render();
  }

  return element;
}

describe('WiFiConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ detail: 'Stop after the initial request' }),
    });
  });

  it('connects to an open network with an empty password', async () => {
    const button = getElement(renderConfiguration(), Button);

    expect(button.props.disabled).toBe(false);
    await button.props.onClick?.();

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      `${HOTSPOT_BASE_URL}/wifi/connect?ssid=Guest%20WiFi&password=`,
      { method: 'POST' },
      5000,
      { label: 'WiFi connect' }
    );
  });

  it('keeps Connect disabled until a network is selected', () => {
    const button = getElement(renderConfiguration(''), Button);

    expect(button.props.disabled).toBe(true);
  });

  it('submits an open network when Enter is pressed in the password field', () => {
    const passwordField = getElement(renderConfiguration(), TextField);

    passwordField.props.onKeyPress?.({ key: 'Enter' });

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      `${HOTSPOT_BASE_URL}/wifi/connect?ssid=Guest%20WiFi&password=`,
      { method: 'POST' },
      5000,
      { label: 'WiFi connect' }
    );
  });
});
