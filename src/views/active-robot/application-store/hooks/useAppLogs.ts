import { useEffect, useRef } from 'react';
import { listen } from '@utils/tauriCompat';
import { useActiveRobotContext } from '../../context';

type UnlistenFn = () => void;

interface SidecarEvent {
  payload: string | { toString: () => string } | null | undefined;
}

export function useAppLogs(currentAppName: string | null | undefined, isAppRunning: boolean): void {
  const { actions } = useActiveRobotContext();
  const { addAppLog, clearAppLogs } = actions;
  const unlistenStdoutRef = useRef<UnlistenFn | null>(null);
  const unlistenStderrRef = useRef<UnlistenFn | null>(null);

  const shouldFilterOut = (logLine: string | null | undefined): boolean => {
    if (!logLine) return true;

    const line = typeof logLine === 'string' ? logLine : String(logLine);

    const systemPatterns: RegExp[] = [
      /^WARNING: All log messages before absl::InitializeLog/i,
      /^INFO:.*127\.0\.0\.1.*GET \/api\//i,
      /^Sidecar (stdout|stderr):/i,
      /GET \/api\/state\/full/i,
      /GET \/api\/daemon\//i,
      /GET \/api\/apps\/current-app-status/i,
      /GET \/api\/apps\/.*\/logs/i,
      /GET \/api\/apps\/logs\//i,
      /GET \/api\/apps\/.*\/output/i,
      /GET \/api\/apps\/.*\/stdout/i,
      /WebSocket.*\/api\/state\/ws/i,
      /connection (open|closed)/i,
      /INFO:.*127\.0\.0\.1.*WebSocket/i,
      /INFO:.*127\.0\.0\.1.*"WebSocket/i,
    ];

    return systemPatterns.some(pattern => pattern.test(line));
  };

  const isAppLog = (logLine: string | null | undefined): boolean => {
    if (!logLine || !currentAppName) return false;

    const line = typeof logLine === 'string' ? logLine : String(logLine);
    const appNameLower = currentAppName.toLowerCase();
    const lineLower = line.toLowerCase();

    if (shouldFilterOut(line)) {
      return false;
    }

    if (lineLower.includes(appNameLower)) {
      const nameIndex = lineLower.indexOf(appNameLower);
      const beforeChar = line[nameIndex - 1];
      const afterChar = line[nameIndex + appNameLower.length];
      const isInPath =
        beforeChar === '/' || afterChar === '/' || beforeChar === '\\' || afterChar === '\\';

      if (!isInPath) {
        return true;
      }
    }

    const appPatterns: RegExp[] = [
      /^\[.*\]/,
      /ERROR:reachy_mini\.apps/i,
      /INFO:reachy_mini\.apps/i,
      /WARNING:reachy_mini\.apps/i,
    ];

    if (appPatterns.some(pattern => pattern.test(line))) {
      return true;
    }

    const systemPatterns: RegExp[] = [
      /^INFO:.*uvicorn/i,
      /^INFO:.*FastAPI/i,
      /^INFO:.*Application startup/i,
      /^INFO:.*Uvicorn running/i,
      /^INFO:.*Started server process/i,
      /^INFO:.*127\.0\.0\.1.*WebSocket/i,
      /^INFO:.*127\.0\.0\.1.*"WebSocket/i,
      /connection (open|closed)/i,
      /WebSocket.*\/api\/state\/ws/i,
    ];

    const isSystemPattern = systemPatterns.some(pattern => pattern.test(line));
    if (!isSystemPattern) {
      return true;
    }

    return false;
  };

  const formatLogLine = (
    logLine: string | null | undefined
  ): { level: 'info' | 'warning' | 'error'; message: string } | null => {
    const line = typeof logLine === 'string' ? logLine : String(logLine);
    const lineLower = line.toLowerCase();

    if (
      lineLower.includes('error:') ||
      lineLower.includes('exception') ||
      lineLower.includes('traceback')
    ) {
      return { level: 'error', message: line };
    }

    if (lineLower.includes('warning:')) {
      if (
        lineLower.includes('old firmware') ||
        lineLower.includes('absl::initializelog') ||
        lineLower.includes('all log messages before')
      ) {
        return null;
      }
      return { level: 'warning', message: line };
    }

    return { level: 'info', message: line };
  };

  useEffect(() => {
    if (!currentAppName || !isAppRunning) {
      if (currentAppName) {
        clearAppLogs(currentAppName);
      }
      return;
    }

    let isMounted = true;

    const setupListeners = async (): Promise<void> => {
      try {
        const unlistenStdout = (await listen('sidecar-stdout', (event: SidecarEvent) => {
          if (!isMounted) return;

          const logLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

          const cleanLine = logLine.replace(/^Sidecar stdout:\s*/, '').trim();

          if (
            !cleanLine ||
            cleanLine.includes('GET /api/') ||
            cleanLine.includes('INFO:     127.0.0.1') ||
            cleanLine.includes('WebSocket') ||
            cleanLine.includes('connection open') ||
            cleanLine.includes('connection closed')
          ) {
            return;
          }

          if (isAppLog(cleanLine)) {
            const formatted = formatLogLine(cleanLine);
            if (formatted) {
              addAppLog(formatted.message, currentAppName, formatted.level);
            }
          }
        })) as UnlistenFn;

        if (isMounted) {
          unlistenStdoutRef.current = unlistenStdout;
        } else {
          unlistenStdout();
          return;
        }

        const unlistenStderr = (await listen('sidecar-stderr', (event: SidecarEvent) => {
          if (!isMounted) return;

          const logLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

          const cleanLine = logLine.replace(/^Sidecar stderr:\s*/, '').trim();

          if (
            !cleanLine ||
            cleanLine.includes('WebSocket') ||
            cleanLine.includes('connection open') ||
            cleanLine.includes('connection closed')
          ) {
            return;
          }

          if (isAppLog(cleanLine)) {
            const formatted = formatLogLine(cleanLine);
            if (formatted) {
              addAppLog(formatted.message, currentAppName, formatted.level);
            }
          }
        })) as UnlistenFn;

        if (isMounted) {
          unlistenStderrRef.current = unlistenStderr;
        } else {
          unlistenStderr();
        }
      } catch (error) {
        console.error('Failed to setup sidecar log listeners:', error);
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
        unlistenStderrRef.current = null;
      }
    };
  }, [currentAppName, isAppRunning, addAppLog, clearAppLogs]);
}
