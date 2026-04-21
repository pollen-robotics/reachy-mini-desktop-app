import { useCallback, useEffect, useRef } from 'react';
import {
  connect as blecConnect,
  disconnect as blecDisconnect,
  startScan,
  stopScan,
  getAdapterState,
  readString,
  sendString,
  listServices,
} from '@mnlphlp/plugin-blec';
import type { BleDevice, AdapterState } from '@mnlphlp/plugin-blec';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit, listen } from '../../utils/tauriCompat';
import useAppStore from '../../store/useAppStore';
import type { AppState } from '../../types/store';

// ============================================================================
// BLE UUIDs for Reachy Mini (mirrors bluetooth_service.py).
// ============================================================================

// Command service.
const CMD_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const COMMAND_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const RESPONSE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';

// Status service.
const STATUS_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef3';
const NETWORK_STATUS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';

const RESPONSE_READ_DELAY = 500; // ms between write and read.
const SCAN_TIMEOUT = 10000; // ms scan duration.

type TimeoutId = ReturnType<typeof setTimeout>;
type UnlistenFn = () => void;

export interface UseBluetoothResult {
  // State
  bleStatus: AppState['bleStatus'];
  bleDevices: AppState['bleDevices'];
  bleDeviceAddress: AppState['bleDeviceAddress'];

  // Actions
  scan: () => Promise<void>;
  stopScanning: () => Promise<void>;
  connectToDevice: (address: string) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  sendCommand: (pin: string, commandName: string) => Promise<string>;
  sendPing: () => Promise<string>;
  sendStatus: () => Promise<string>;
  readNetworkStatus: () => Promise<string>;
  startJournal: () => Promise<void>;
  stopJournal: () => Promise<void>;
  openJournalWindow: () => Promise<void>;
  checkAdapterState: () => Promise<AdapterState | null>;

  // Store actions (for PIN input).
  setBlePin: AppState['setBlePin'];
}

/**
 * Wraps `@mnlphlp/plugin-blec` for Reachy Mini BLE interactions.
 *
 * Protocol (see bluetooth_service.py):
 *  - "PING"              → "PONG"
 *  - "STATUS"            → "OK: System running"
 *  - "PIN_xxxxx"         → validates PIN (last 5 digits of serial)
 *  - "CMD_scriptname"    → runs commands/scriptname.sh (requires prior PIN auth)
 */
export default function useBluetooth(): UseBluetoothResult {
  const {
    bleStatus,
    setBleStatus,
    bleDevices,
    setBleDevices,
    bleDeviceAddress,
    setBleDeviceAddress,
    setBlePin,
    loadBlePinForDevice,
  } = useAppStore();

  // ==========================================================================
  // Adapter state
  // ==========================================================================

  const checkAdapterState = useCallback(async (): Promise<AdapterState | null> => {
    try {
      return await getAdapterState();
    } catch (e) {
      console.error('[BLE] Failed to get adapter state:', e);
      return null;
    }
  }, []);

  // ==========================================================================
  // Scan
  //
  // startScan(handler, timeout) - the handler receives devices per callback.
  // ==========================================================================

  const scan = useCallback(async (): Promise<void> => {
    setBleStatus('scanning');
    setBleDevices([]);

    try {
      // Start the scan (on Windows the promise may resolve before the timeout).
      startScan((devices: BleDevice[]) => {
        const named = devices.filter(d => d.name);
        if (named.length > 0) {
          console.log(
            '[BLE] Devices found:',
            named.map(d => `${d.name} (${d.address})`).join(', ')
          );
        }
        const reachyDevices = devices.filter(
          d => d.name && d.name.toLowerCase().replace(/-/g, '').includes('reachymini')
        );
        if (reachyDevices.length > 0) {
          const prev = useAppStore.getState().bleDevices as BleDevice[];
          const merged: BleDevice[] = [...prev];
          for (const device of reachyDevices) {
            const idx = merged.findIndex(d => d.address === device.address);
            if (idx >= 0) {
              merged[idx] = device;
            } else {
              merged.push(device);
            }
          }
          setBleDevices(merged);
        }
      }, SCAN_TIMEOUT).catch((e: unknown) => {
        console.error('[BLE] Scan error:', e);
      });

      // Wait the full scan duration regardless of when the promise resolves.
      await new Promise<void>(r => setTimeout(r, SCAN_TIMEOUT));
    } finally {
      // Only reset to disconnected if still scanning (don't clobber connect).
      const currentStatus = useAppStore.getState().bleStatus;
      if (currentStatus === 'scanning') {
        setBleStatus('disconnected');
      }
    }
  }, [setBleStatus, setBleDevices]);

  const stopScanning = useCallback(async (): Promise<void> => {
    try {
      await stopScan();
    } catch {
      // Scan may already be stopped.
    }
    setBleStatus('disconnected');
  }, [setBleStatus]);

  // ==========================================================================
  // Connect / disconnect
  // ==========================================================================

  const connectToDevice = useCallback(
    async (address: string): Promise<void> => {
      // CoreBluetooth requires scanning to be stopped before connecting.
      try {
        await stopScan();
      } catch {
        // Scan may already be stopped.
      }

      setBleStatus('connecting');
      try {
        await blecConnect(address, () => {
          console.warn('[BLE] Device disconnected');
          setBleStatus('disconnected');
          setBleDeviceAddress(null);
        });

        setBleDeviceAddress(address);
        loadBlePinForDevice(address);
        setBleStatus('connected');

        // Debug: log discovered services and characteristics.
        try {
          const services = await listServices(address);
          console.log('[BLE] Discovered services:', JSON.stringify(services, null, 2));
        } catch (e) {
          console.warn('[BLE] Could not list services:', e);
        }
      } catch (e) {
        console.error('[BLE] Connect error:', e);
        setBleStatus('disconnected');
        throw e;
      }
    },
    [setBleStatus, setBleDeviceAddress, loadBlePinForDevice]
  );

  // Disconnect - also stops the journal and closes its window.
  const disconnectDevice = useCallback(async (): Promise<void> => {
    // Stop journal polling first (before BLE disconnect).
    journalActiveRef.current = false;
    if (journalPollRef.current !== null) {
      clearTimeout(journalPollRef.current);
      journalPollRef.current = null;
    }
    try {
      await sendString(COMMAND_CHAR_UUID, 'JOURNAL_STOP', 'withoutResponse', CMD_SERVICE_UUID);
    } catch {
      // May fail if already disconnected.
    }
    try {
      await blecDisconnect();
    } catch (e) {
      console.error('[BLE] Disconnect error:', e);
    }
    emit('journal:status', 'stopped');
    try {
      const win = await WebviewWindow.getByLabel('journal-viewer');
      if (win) await win.close();
    } catch {
      // Window may not exist.
    }
    setBleStatus('disconnected');
    setBleDeviceAddress(null);
    setBleDevices([]);
  }, [setBleStatus, setBleDeviceAddress, setBleDevices]);

  // ==========================================================================
  // Raw command I/O
  //
  // Send a string to the command characteristic then read the response.
  // The Reachy BLE service updates the response characteristic value but
  // does NOT send a BLE notification, so we poll-read after a short delay.
  // ==========================================================================

  const sendRaw = useCallback(
    async (message: string): Promise<string> => {
      if (bleStatus !== 'connected') {
        throw new Error('Not connected');
      }

      await sendString(COMMAND_CHAR_UUID, message, 'withoutResponse', CMD_SERVICE_UUID);

      // Give the device time to process and write the response.
      await new Promise<void>(r => setTimeout(r, RESPONSE_READ_DELAY));

      return await readString(RESPONSE_CHAR_UUID, CMD_SERVICE_UUID);
    },
    [bleStatus]
  );

  // Authenticate with PIN then send a CMD_ command.
  const sendCommand = useCallback(
    async (pin: string, commandName: string): Promise<string> => {
      const pinResponse = await sendRaw(`PIN_${pin}`);
      if (pinResponse && pinResponse.toLowerCase().includes('error')) {
        throw new Error(pinResponse);
      }

      return await sendRaw(`CMD_${commandName}`);
    },
    [sendRaw]
  );

  const sendPing = useCallback(async (): Promise<string> => {
    return await sendRaw('PING');
  }, [sendRaw]);

  const sendStatus = useCallback(async (): Promise<string> => {
    return await sendRaw('STATUS');
  }, [sendRaw]);

  // Read network status from the status service.
  const readNetworkStatus = useCallback(async (): Promise<string> => {
    if (bleStatus !== 'connected') {
      throw new Error('Not connected');
    }
    console.log(
      '[BLE] Reading network status from',
      NETWORK_STATUS_CHAR_UUID,
      'service',
      STATUS_SERVICE_UUID
    );
    const result = await readString(NETWORK_STATUS_CHAR_UUID, STATUS_SERVICE_UUID);
    console.log('[BLE] Network status result:', result);
    return result;
  }, [bleStatus]);

  // ==========================================================================
  // Journal streaming
  // ==========================================================================

  const journalActiveRef = useRef<boolean>(false);
  const journalPollRef = useRef<TimeoutId | null>(null);

  // Poll the server for buffered journal data.
  const _pollJournal = useCallback(async (): Promise<void> => {
    if (!journalActiveRef.current) return;
    try {
      await sendString(COMMAND_CHAR_UUID, 'JOURNAL_READ', 'withoutResponse', CMD_SERVICE_UUID);
      await new Promise<void>(r => setTimeout(r, RESPONSE_READ_DELAY));
      const chunk = await readString(RESPONSE_CHAR_UUID, CMD_SERVICE_UUID);
      console.log('[BLE] Journal poll result:', chunk?.length, 'bytes', chunk?.substring(0, 80));
      if (chunk && chunk.length > 0) {
        emit('journal:data', chunk);
      }
    } catch (e) {
      console.warn('[BLE] Journal poll error:', e);
    }
    if (journalActiveRef.current) {
      journalPollRef.current = setTimeout(() => {
        void _pollJournal();
      }, 300);
    }
  }, []);

  // Start journal streaming - tells the server to start, then begins polling.
  const startJournal = useCallback(async (): Promise<void> => {
    if (bleStatus !== 'connected') {
      throw new Error('Not connected');
    }
    await sendString(COMMAND_CHAR_UUID, 'JOURNAL_START', 'withoutResponse', CMD_SERVICE_UUID);
    await new Promise<void>(r => setTimeout(r, RESPONSE_READ_DELAY));
    await readString(RESPONSE_CHAR_UUID, CMD_SERVICE_UUID); // Consume the "OK" response.
    journalActiveRef.current = true;
    emit('journal:status', 'started');
    void _pollJournal();
  }, [bleStatus, _pollJournal]);

  const _closeJournalWindow = useCallback(async (): Promise<void> => {
    try {
      const win = await WebviewWindow.getByLabel('journal-viewer');
      if (win) await win.close();
    } catch {
      // Window may already be gone.
    }
  }, []);

  const stopJournal = useCallback(async (): Promise<void> => {
    journalActiveRef.current = false;
    if (journalPollRef.current !== null) {
      clearTimeout(journalPollRef.current);
      journalPollRef.current = null;
    }
    try {
      await sendString(COMMAND_CHAR_UUID, 'JOURNAL_STOP', 'withoutResponse', CMD_SERVICE_UUID);
    } catch (e) {
      console.warn('[BLE] Error sending JOURNAL_STOP:', e);
    }
    emit('journal:status', 'stopped');
    await _closeJournalWindow();
  }, [_closeJournalWindow]);

  // Open the journal in a separate window.
  const openJournalWindow = useCallback(async (): Promise<void> => {
    const label = 'journal-viewer';
    // Focus if already open.
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      try {
        await existing.setFocus();
        return;
      } catch {
        // Window gone, recreate.
      }
    }
    new WebviewWindow(label, {
      url: '/#journal',
      title: 'Reachy Journal',
      width: 700,
      height: 500,
      center: true,
      resizable: true,
      decorations: true,
      focus: true,
    });
  }, []);

  // Listen for stop requests from the journal window.
  useEffect(() => {
    let unlistenStop: UnlistenFn | undefined;
    let unlistenStatus: UnlistenFn | undefined;
    const setup = async (): Promise<void> => {
      unlistenStop = (await listen('journal:stop', () => {
        void stopJournal();
      })) as UnlistenFn;
      // Respond to status requests from newly opened journal windows.
      unlistenStatus = (await listen('journal:request-status', () => {
        emit('journal:status', journalActiveRef.current ? 'started' : 'stopped');
      })) as UnlistenFn;
    };
    void setup();
    return () => {
      if (unlistenStop) unlistenStop();
      if (unlistenStatus) unlistenStatus();
    };
  }, [stopJournal]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      journalActiveRef.current = false;
      if (journalPollRef.current !== null) {
        clearTimeout(journalPollRef.current);
        journalPollRef.current = null;
      }
      void (async () => {
        try {
          const win = await WebviewWindow.getByLabel('journal-viewer');
          if (win) await win.close();
        } catch {
          // Ignore.
        }
      })();
      if (bleStatus === 'connected') {
        // Best-effort JOURNAL_STOP before disconnecting.
        sendString(COMMAND_CHAR_UUID, 'JOURNAL_STOP', 'withoutResponse', CMD_SERVICE_UUID).catch(
          () => {}
        );
        blecDisconnect().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    bleStatus,
    bleDevices,
    bleDeviceAddress,

    scan,
    stopScanning,
    connectToDevice,
    disconnectDevice,
    sendCommand,
    sendPing,
    sendStatus,
    readNetworkStatus,
    startJournal,
    stopJournal,
    openJournalWindow,
    checkAdapterState,

    setBlePin,
  };
}
