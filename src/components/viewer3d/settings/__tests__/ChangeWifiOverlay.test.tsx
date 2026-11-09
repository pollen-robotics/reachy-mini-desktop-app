import {
  Children,
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Button } from '@mui/material';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeWifiOverlayProps } from '../ChangeWifiOverlay';

vi.mock('@styles', async importOriginal => {
  const styles = await importOriginal<typeof import('@styles')>();
  return {
    ...styles,
    useAppPalette: () => styles.buildAppPalette(false),
  };
});

vi.mock('@components/FullscreenOverlay', () => ({ default: 'fullscreen-overlay' }));
vi.mock('@components/wifi/NetworkSelect', () => ({ default: 'network-select' }));

const { default: ChangeWifiOverlay } = await import('../ChangeWifiOverlay');

interface TestElementProps {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

function findElement(node: ReactNode, type: ElementType): ReactElement<TestElementProps> | null {
  if (!isValidElement<TestElementProps>(node)) return null;
  if (node.type === type) return node;

  for (const child of Children.toArray(node.props.children)) {
    const match = findElement(child, type);
    if (match) return match;
  }

  return null;
}

function getConnectButton(
  overrides: Partial<ChangeWifiOverlayProps> = {}
): ReactElement<TestElementProps> {
  const element = ChangeWifiOverlay({
    open: true,
    onClose: vi.fn(),
    wifiStatus: null,
    availableNetworks: ['Guest WiFi'],
    selectedSSID: 'Guest WiFi',
    wifiPassword: '',
    isConnecting: false,
    wifiError: null,
    onSSIDChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onConnect: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  });

  const button = findElement(element, Button);
  if (!button) throw new Error('Connect button not found');
  return button;
}

describe('ChangeWifiOverlay', () => {
  it('enables Connect for an open network with an empty password', () => {
    expect(getConnectButton().props.disabled).toBe(false);
  });

  it('disables Connect until a network is selected', () => {
    expect(getConnectButton({ selectedSSID: '' }).props.disabled).toBe(true);
  });
});
