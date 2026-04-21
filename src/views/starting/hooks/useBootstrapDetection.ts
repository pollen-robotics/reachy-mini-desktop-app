import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../../../store/useAppStore';

type ConnectionModeLike = 'usb' | 'wifi' | 'simulation' | string | null | undefined;

export interface BootstrapDetection {
  /**
   * `null` while we don't know yet (waiting for the first sidecar message),
   * `true` while the Python env is being set up, `false` once we're sure no
   * bootstrap is needed / it just finished.
   */
  isBootstrapping: boolean | null;
  /** Short human-readable label describing the current bootstrap step. */
  bootstrapMessage: string;
}

/**
 * Parse sidecar stdout/stderr to decide whether the daemon is going through
 * a first-run Python environment setup ("bootstrap") and expose a
 * user-friendly label for the current step. WiFi mode is short-circuited
 * since there is no local sidecar.
 *
 * Also clears any transient `hardwareError` produced during bootstrap:
 * those are false positives, real hardware comms haven't started yet.
 */
export function useBootstrapDetection(isStarting: boolean): BootstrapDetection {
  const [isBootstrapping, setIsBootstrapping] = useState<boolean | null>(null);
  const [bootstrapMessage, setBootstrapMessage] = useState<string>('');
  const decidedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isStarting) return;

    // WiFi mode: no local sidecar, bootstrap doesn't apply.
    const currentConnectionMode = (useAppStore.getState() as { connectionMode: ConnectionModeLike })
      .connectionMode;
    if (currentConnectionMode === 'wifi') {
      setIsBootstrapping(false);
      return;
    }

    let isMounted = true;
    let unlistenStdout: (() => void) | null = null;
    let unlistenStderr: (() => void) | null = null;
    decidedRef.current = false;

    const setup = async () => {
      const handleOutput = (msg: string) => {
        if (!isMounted) return;

        if (msg.includes('[bootstrap]')) {
          if (msg.includes('Setup complete')) {
            setIsBootstrapping(false);
            setBootstrapMessage('');
            // Real hardware comms haven't happened yet during bootstrap, so
            // any error accumulated now is a false positive.
            const currentHwError = (useAppStore.getState() as { hardwareError: unknown })
              .hardwareError;
            if (currentHwError) {
              console.warn(
                '[bootstrap] Clearing hardwareError set during bootstrap:',
                currentHwError
              );
            }
            (
              useAppStore.getState() as unknown as {
                setHardwareError: (err: unknown) => void;
              }
            ).setHardwareError(null);
          } else {
            decidedRef.current = true;
            setIsBootstrapping(true);
            setBootstrapMessage(deriveBootstrapLabel(msg));
          }
        } else if (!decidedRef.current) {
          // First non-bootstrap message means bootstrap was skipped.
          decidedRef.current = true;
          setIsBootstrapping(false);
        }
      };

      unlistenStdout = await listen('sidecar-stdout', event => {
        const msg = coerceToString(event.payload);
        handleOutput(msg);
      });
      unlistenStderr = await listen('sidecar-stderr', event => {
        const msg = coerceToString(event.payload);
        handleOutput(msg);
      });
    };

    setup();

    return () => {
      isMounted = false;
      unlistenStdout?.();
      unlistenStderr?.();
    };
  }, [isStarting]);

  return { isBootstrapping, bootstrapMessage };
}

function coerceToString(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  return (payload as { toString?: () => string })?.toString?.() || '';
}

function deriveBootstrapLabel(msg: string): string {
  if (msg.includes('Downloading uv')) return 'Downloading package manager...';
  if (msg.includes('Installing Python')) return 'Installing Python runtime...';
  if (msg.includes('Creating .venv')) return 'Creating virtual environment...';
  if (msg.includes('Creating apps_venv')) return 'Creating apps environment...';
  if (msg.includes('Signing')) return 'Signing binaries...';
  if (msg.includes('Pre-warming GStreamer')) return 'Initializing GStreamer...';
  if (msg.includes('Pre-warming reachy_mini')) return 'Pre-warming Python imports...';
  if (msg.includes('Installing')) return 'Installing reachy-mini...';
  return 'Setting up Python environment...';
}
