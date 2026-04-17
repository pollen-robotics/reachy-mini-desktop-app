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
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit, listen } from '../../utils/tauriCompat';
import useAppStore from '../../store/useAppStore';

// BLE UUIDs for Reachy Mini (from bluetooth_service.py)
// Command service
const CMD_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const COMMAND_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const RESPONSE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
// Status service
const STATUS_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef3';
const NETWORK_STATUS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';

// Timing
const RESPONSE_READ_DELAY = 500; // ms to wait after write before reading response
const SCAN_TIMEOUT = 10000; // ms scan duration

/**
 * useBluetooth — wraps @mnlphlp/plugin-blec for Reachy Mini BLE interactions.
 *
 * Protocol (from bluetooth_service.py):
 *  - "PING"         → "PONG"
 *  - "STATUS"        → "OK: System running"
 *  - "PIN_xxxxx"     → validates PIN (last 5 digits of serial)
 *  - "CMD_scriptname" → runs commands/scriptname.sh (requires prior PIN auth)
 */
export default function useBluetooth() {
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

  // Adapter state
  const checkAdapterState = useCallback(async () => {
    try {
      return await getAdapterState();
    } catch (e) {
      console.error('[BLE] Failed to get adapter state:', e);
      return null;
    }
  }, []);

  // Scan for ReachyMini devices
  // startScan(handler, timeout) — handler receives an array of devices per callback
  const scan = useCallback(async () => {
    setBleStatus('scanning');
    setBleDevices([]);

    try {
      // Start the scan (on Windows, the promise may resolve before the timeout)
      startScan(devices => {
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
          const prev = useAppStore.getState().bleDevices;
          const merged = [...prev];
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
      }, SCAN_TIMEOUT).catch(e => {
        console.error('[BLE] Scan error:', e);
      });

      // Wait for the full scan duration regardless of when the promise resolves
      await new Promise(r => setTimeout(r, SCAN_TIMEOUT));
    } finally {
      // Only reset to disconnected if still scanning (not if connect was triggered)
      const currentStatus = useAppStore.getState().bleStatus;
      if (currentStatus === 'scanning') {
        setBleStatus('disconnected');
      }
    }
  }, [setBleStatus, setBleDevices]);

  const stopScanning = useCallback(async () => {
    try {
      await stopScan();
    } catch (e) {
      // Ignore — scan may already be stopped
    }
    setBleStatus('disconnected');
  }, [setBleStatus]);

  // Connect to a specific device
  const connectToDevice = useCallback(
    async address => {
      // CoreBluetooth requires scanning to be stopped before connecting
      try {
        await stopScan();
      } catch (e) {
        // Ignore — scan may already be stopped
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

        // Debug: log discovered services and characteristics
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
    [setBleStatus, setBleDeviceAddress]
  );

  // Disconnect — also stops journal and closes its window
  const disconnectDevice = useCallback(async () => {
    // Stop journal polling first (before BLE disconnect)
    journalActiveRef.current = false;
    if (journalPollRef.current) {
      clearTimeout(journalPollRef.current);
      journalPollRef.current = null;
    }
    try {
      await sendString(COMMAND_CHAR_UUID, 'JOURNAL_STOP', 'withoutResponse', CMD_SERVICE_UUID);
    } catch {
      // May fail if already disconnected
    }
    try {
      await blecDisconnect();
    } catch (e) {
      console.error('[BLE] Disconnect error:', e);
    }
    emit('journal:status', 'stopped');
    try {
      const win = WebviewWindow.getByLabel('journal-viewer');
      if (win) await win.close();
    } catch {
      // Window may not exist
    }
    setBleStatus('disconnected');
    setBleDeviceAddress(null);
    setBleDevices([]);
  }, [setBleStatus, setBleDeviceAddress, setBleDevices]);

  // Send a raw string to the command characteristic, then read the response.
  // The Reachy BLE service updates the response characteristic value but does
  // not send a BLE notification, so we poll-read after a short delay.
  const sendRaw = useCallback(
    async message => {
      if (bleStatus !== 'connected') {
        throw new Error('Not connected');
      }

      await sendString(COMMAND_CHAR_UUID, message, 'withoutResponse', CMD_SERVICE_UUID);

      // Give the device time to process and write the response
      await new Promise(r => setTimeout(r, RESPONSE_READ_DELAY));

      // Read the response characteristic directly
      return await readString(RESPONSE_CHAR_UUID, CMD_SERVICE_UUID);
    },
    [bleStatus]
  );

  // Authenticate with PIN, then send a CMD_ command
  const sendCommand = useCallback(
    async (pin, commandName) => {
      // Authenticate first
      const pinResponse = await sendRaw(`PIN_${pin}`);
      if (pinResponse && pinResponse.toLowerCase().includes('error')) {
        throw new Error(pinResponse);
      }

      // Send the command
      return await sendRaw(`CMD_${commandName}`);
    },
    [sendRaw]
  );

  // Send PING (no auth required)
  const sendPing = useCallback(async () => {
    return await sendRaw('PING');
  }, [sendRaw]);

  // Send STATUS (no auth required)
  const sendStatus = useCallback(async () => {
    return await sendRaw('STATUS');
  }, [sendRaw]);

  // Read network status from the status service
  const readNetworkStatus = useCallback(async () => {
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

  const journalActiveRef = useRef(false);
  const journalPollRef = useRef(null);

  // Poll the server for buffered journal data
  const _pollJournal = useCallback(async () => {
    if (!journalActiveRef.current) return;
    try {
      await sendString(COMMAND_CHAR_UUID, 'JOURNAL_READ', 'withoutResponse', CMD_SERVICE_UUID);
      await new Promise(r => setTimeout(r, RESPONSE_READ_DELAY));
      const chunk = await readString(RESPONSE_CHAR_UUID, CMD_SERVICE_UUID);
      console.log('[BLE] Journal poll result:', chunk?.length, 'bytes', chunk?.substring(0, 80));
      if (chunk && chunk.length > 0) {
        emit('journal:data', chunk);
      }
    } catch (e) {
      console.warn('[BLE] Journal poll error:', e);
    }
    // Schedule next poll if still active
    if (journalActiveRef.current) {
      journalPollRef.current = setTimeout(() => _pollJournal(), 300);
    }
  }, []);

  // Start journal streaming — tells server to start, begins polling
  const startJournal = useCallback(async () => {
    if (bleStatus !== 'connected') {
      throw new Error('Not connected');
    }
    await sendString(COMMAND_CHAR_UUID, 'JOURNAL_START', 'withoutResponse', CMD_SERVICE_UUID);
    await new Promise(r => setTimeout(r, RESPONSE_READ_DELAY));
    await readString(RESPONSE_CHAR_UUID, CMD_SERVICE_UUID); // consume the "OK" response
    journalActiveRef.current = true;
    emit('journal:status', 'started');
    // Start polling loop
    _pollJournal();
  }, [bleStatus, _pollJournal]);

  // Close the journal window if open
  const _closeJournalWindow = useCallback(async () => {
    try {
      const win = WebviewWindow.getByLabel('journal-viewer');
      if (win) await win.close();
    } catch {
      // Window may already be gone
    }
  }, []);

  // Stop journal streaming and close the window
  const stopJournal = useCallback(async () => {
    journalActiveRef.current = false;
    if (journalPollRef.current) {
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

  // Open the journal in a separate window
  const openJournalWindow = useCallback(async () => {
    const label = 'journal-viewer';
    // Focus if already open
    const existing = WebviewWindow.getByLabel(label);
    if (existing) {
      try {
        await existing.setFocus();
        return;
      } catch {
        // Window gone, recreate
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

  // Listen for stop requests from the journal window
  useEffect(() => {
    let unlistenStop;
    let unlistenStatus;
    const setup = async () => {
      unlistenStop = await listen('journal:stop', () => {
        stopJournal();
      });
      // Respond to status requests from newly opened journal windows
      unlistenStatus = await listen('journal:request-status', () => {
        emit('journal:status', journalActiveRef.current ? 'started' : 'stopped');
      });
    };
    setup();
    return () => {
      if (unlistenStop) unlistenStop();
      if (unlistenStatus) unlistenStatus();
    };
  }, [stopJournal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop journal polling
      journalActiveRef.current = false;
      if (journalPollRef.current) {
        clearTimeout(journalPollRef.current);
        journalPollRef.current = null;
      }
      // Close journal window
      try {
        const win = WebviewWindow.getByLabel('journal-viewer');
        if (win) win.close();
      } catch {
        // ignore
      }
      if (bleStatus === 'connected') {
        // Send JOURNAL_STOP before disconnecting
        sendString(COMMAND_CHAR_UUID, 'JOURNAL_STOP', 'withoutResponse', CMD_SERVICE_UUID).catch(
          () => {}
        );
        blecDisconnect().catch(() => {});
      }
    };
  }, []);

  return {
    // State
    bleStatus,
    bleDevices,
    bleDeviceAddress,

    // Actions
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

    // Store actions (for PIN)
    setBlePin,
  };
}
