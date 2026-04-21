/**
 * ScanErrorDisplay - Status-card style error screen.
 *
 * Layout (mirrors the "status card" UX proposal):
 *
 *   [ hardhat icon ]
 *   <title>
 *   <subtitle>
 *   ┌─────────────────────────────────────┐
 *   │ ● <code>         connection: <mode> │  status strip
 *   └─────────────────────────────────────┘
 *   [  ⟳  Try Again  ]                       primary, filled
 *   Switch mode        Troubleshooting ↗     secondary actions
 *
 * The recent log lines are intentionally NOT embedded here: the existing
 * `StartupLogsPanel` mini-console already surfaces them at the bottom of
 * the view, and duplicating that content inline created visual noise.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LaunchIcon from '@mui/icons-material/Launch';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { openUrl } from '../../../utils/tauriCompat';

/**
 * Shape of a single startup log entry as produced by `useDaemonStartupLogs`.
 * Kept local to avoid a cross-layer import just for one type.
 */
export interface ScanErrorLogEntry {
  message: string;
  level?: string;
  timestamp?: number;
}

// Troubleshooting page URL (official Reachy Mini docs on Hugging Face).
const TROUBLESHOOTING_URL = 'https://huggingface.co/docs/reachy_mini/troubleshooting';

// Severity-driven colour tokens for the small status-strip dot. The retry
// button itself uses MUI's primary palette via `color="primary"`, so no
// severity colour is applied to it anymore.
const ERROR_COLOR = '#ef4444';
const TIMEOUT_COLOR = '#d97706';

export interface ScanErrorMessageParts {
  text?: string;
  bold: string;
  suffix?: string;
}

export interface ScanErrorLike {
  messageParts?: ScanErrorMessageParts;
  message?: string;
  details?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ScanErrorExtra {
  action?: unknown;
  code?: string;
  [key: string]: unknown;
}

export interface ScanErrorDisplayProps {
  error: ScanErrorLike | string | null | undefined;
  scanError?: ScanErrorExtra | null;
  isRetrying: boolean;
  onRetry: () => void;
  /** "Switch connection mode" - usually resets back to the connection picker. */
  onBack?: () => void;
  darkMode: boolean;
  /** Optional illustration rendered at the top of the card. */
  illustrationSrc?: string;
  /** User's active connection mode, surfaced in the status strip. */
  connectionMode?: string | null;
  /**
   * Most recent error-ish line extracted from the startup logs, surfaced in
   * the status strip so the user immediately sees WHY the daemon crashed
   * without having to open the logs overlay.
   */
  probableCause?: string | null;
  /**
   * Raw startup log stream. Not rendered inline (the card stays clean)
   * but used by the "Copy logs" action so developers can paste the full
   * context into a bug report without reproducing the crash.
   */
  logs?: ScanErrorLogEntry[];
}

/**
 * Serialise a log stream to plain text lines suitable for clipboard.
 *
 * One line per entry, each prefixed with the ISO timestamp and upper-cased
 * level when available, e.g.:
 *   [2026-04-21T10:29:03.042Z] [ERROR] Daemon version: 1.6.4
 *   [2026-04-21T10:29:05.118Z] [INFO]  💥 Process terminated by signal 11 (SIGSEGV)
 */
function formatLogsForClipboard(logs: ScanErrorLogEntry[]): string {
  return logs
    .map(entry => {
      const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : '';
      const level = typeof entry.level === 'string' ? entry.level.toUpperCase() : '';
      const parts: string[] = [];
      if (ts) parts.push(`[${ts}]`);
      if (level) parts.push(`[${level}]`);
      parts.push(entry.message ?? '');
      return parts.join(' ');
    })
    .join('\n');
}

// Detect purely technical suffixes like "(status: process-terminated)" that
// duplicate information already surfaced in the status strip below.
function isTechnicalSuffix(suffix: string): boolean {
  return /^\s*\(?\s*status\s*:/i.test(suffix);
}

// Short, human-first titles for daemon-category errors. The original
// `messageParts` were verbose because they used to be the whole message
// ("Daemon process terminated unexpectedly (status: process-terminated)");
// in a status-card layout we want the h1 to read like a diagnosis, not a
// sentence. The cause / code live in the status strip below.
const DAEMON_TYPE_TITLES: Record<string, string> = {
  daemon_crash: 'Daemon crashed',
  daemon_startup: "Couldn't start daemon",
  daemon_timeout: 'Connection timed out',
  daemon_error: 'Daemon error',
};

function buildTitle(
  error: ScanErrorLike | string | null | undefined,
  scanError: ScanErrorExtra | null | undefined
): string {
  if (error && typeof error === 'object') {
    const obj = error as ScanErrorLike;
    const type = typeof obj.type === 'string' ? obj.type : '';

    if (DAEMON_TYPE_TITLES[type]) {
      return DAEMON_TYPE_TITLES[type];
    }

    // Hardware configs already expose short messageParts
    // (e.g. "Power supply not connected") - keep those verbatim.
    if (obj.messageParts) {
      const { text, bold } = obj.messageParts;
      const joined = [text, bold].filter(Boolean).join(' ').trim();
      if (joined) return joined;
    }
    if (obj.message) {
      return obj.message.replace(/\s*\(status:[^)]*\)\s*$/i, '').trim() || obj.message;
    }
  }
  if (scanError?.action) return 'Camera cable issue';
  if (typeof error === 'string' && error) return error;
  return 'Connection failed';
}

function buildSubtitle(
  error: ScanErrorLike | string | null | undefined,
  isTimeout: boolean
): string {
  if (error && typeof error === 'object') {
    const obj = error as ScanErrorLike;
    if (typeof obj.details === 'string' && obj.details.trim()) return obj.details.trim();
    // Promote a non-technical suffix to subtitle (e.g. "Please check the
    // robot connection." or "press button and plug in power") so the title
    // stays short while the actionable hint still shows below it.
    const suffix = obj.messageParts?.suffix?.trim();
    if (suffix && !isTechnicalSuffix(suffix)) {
      const cleaned = suffix.replace(/^[—\-]\s*/, '').trim();
      if (cleaned) return cleaned;
    }
  }
  if (isTimeout) {
    return "The daemon didn't answer in time. Check your cables and try again.";
  }
  return 'An error occurred during connection. Try again, or switch connection mode.';
}

function buildErrorCode(
  error: ScanErrorLike | string | null | undefined,
  scanError: ScanErrorExtra | null | undefined
): string | null {
  if (scanError?.code) return scanError.code;
  if (error && typeof error === 'object') {
    const { type } = error as ScanErrorLike;
    if (type) return type.toUpperCase();
  }
  return null;
}

function ScanErrorDisplay({
  error,
  scanError,
  isRetrying,
  onRetry,
  onBack,
  darkMode,
  illustrationSrc,
  connectionMode,
  probableCause,
  logs,
}: ScanErrorDisplayProps) {
  const isTimeout =
    typeof error === 'object' && error ? (error as ScanErrorLike).type === 'timeout' : false;

  const accent = isTimeout ? TIMEOUT_COLOR : ERROR_COLOR;

  const title = useMemo(() => buildTitle(error, scanError), [error, scanError]);
  const subtitle = useMemo(() => buildSubtitle(error, isTimeout), [error, isTimeout]);
  const errorCode = useMemo(() => buildErrorCode(error, scanError), [error, scanError]);

  const [copied, setCopied] = useState<boolean>(false);
  const hasLogs = Array.isArray(logs) && logs.length > 0;

  const handleTroubleshootingClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openUrl(TROUBLESHOOTING_URL);
  }, []);

  const handleSwitchModeClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      onBack?.();
    },
    [onBack]
  );

  const handleCopyLogsClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (!hasLogs) return;
      const text = formatLogsForClipboard(logs!);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // clipboard API can fail (permissions / non-secure context): swallow
        // silently, the user can retry and at worst will see no feedback.
      }
    },
    [hasLogs, logs]
  );

  const mutedText = darkMode ? '#8a8a8a' : '#6b7280';
  const strongText = darkMode ? '#f5f5f5' : '#1f2937';
  const borderColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const stripBg = darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)';

  return (
    <Box
      role="alert"
      aria-live="polite"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.25,
        width: '100%',
        maxWidth: 400,
        px: 1,
      }}
    >
      {illustrationSrc && (
        <Box
          component="img"
          src={illustrationSrc}
          alt=""
          sx={{
            width: 128,
            height: 'auto',
            opacity: darkMode ? 0.9 : 1,
            mb: 0.75,
          }}
        />
      )}

      <Typography
        component="h1"
        sx={{
          fontSize: 17,
          fontWeight: 600,
          color: strongText,
          textAlign: 'center',
          lineHeight: 1.3,
          m: 0,
        }}
      >
        {title}
      </Typography>

      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 400,
          color: mutedText,
          textAlign: 'center',
          lineHeight: 1.5,
          maxWidth: 320,
        }}
      >
        {subtitle}
      </Typography>

      {(errorCode || connectionMode || probableCause) && (
        <Box
          sx={{
            mt: 0.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            width: '100%',
            maxWidth: 360,
            px: 1.25,
            py: 0.75,
            borderRadius: '8px',
            border: `1px solid ${borderColor}`,
            bgcolor: stripBg,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            color: mutedText,
          }}
        >
          {(errorCode || connectionMode) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              {errorCode ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: accent,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 600,
                      color: strongText,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {errorCode}
                  </Typography>
                </Box>
              ) : (
                <Box />
              )}
              {connectionMode && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexShrink: 0 }}>
                  <Typography
                    component="span"
                    sx={{ fontFamily: 'inherit', fontSize: 10, color: mutedText }}
                  >
                    connection:
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 600,
                      color: strongText,
                    }}
                  >
                    {connectionMode}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {probableCause && (
            <Box
              sx={{
                pt: 0.75,
                mt: errorCode || connectionMode ? 0 : -0.25,
                borderTop: errorCode || connectionMode ? `1px dashed ${borderColor}` : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontFamily: 'inherit',
                  fontSize: 10,
                  color: mutedText,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                cause
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontFamily: 'inherit',
                  fontSize: 11,
                  color: strongText,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  lineHeight: 1.45,
                }}
                title={probableCause}
              >
                {probableCause}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <Button
        variant="outlined"
        color="primary"
        disableElevation
        startIcon={
          isRetrying ? (
            <CircularProgress size={14} color="inherit" />
          ) : (
            <RefreshIcon sx={{ fontSize: 16 }} />
          )
        }
        onClick={onRetry}
        disabled={isRetrying}
        sx={{
          mt: 0.5,
          minWidth: 160,
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: 0.1,
          px: 2.5,
          py: 0.85,
          borderRadius: '10px',
          textTransform: 'none',
        }}
      >
        {isRetrying ? 'Reconnecting...' : 'Try Again'}
      </Button>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 0.25 }}>
        {onBack && (
          <Typography
            component="a"
            href="#"
            onClick={handleSwitchModeClick}
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: 'primary.main',
              textDecoration: 'none',
              cursor: 'pointer',
              borderBottom: '1px dotted',
              borderBottomColor: 'primary.main',
              '&:hover': {
                color: 'primary.dark',
                borderBottomColor: 'primary.dark',
              },
            }}
          >
            Switch connection mode
          </Typography>
        )}
        <Typography
          component="a"
          href="#"
          onClick={handleTroubleshootingClick}
          sx={{
            fontSize: 11,
            fontWeight: 500,
            color: 'primary.main',
            textDecoration: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.3,
            borderBottom: '1px dotted',
            borderBottomColor: 'primary.main',
            '&:hover': {
              color: 'primary.dark',
              borderBottomColor: 'primary.dark',
            },
          }}
        >
          Troubleshooting
          <LaunchIcon sx={{ fontSize: 11 }} />
        </Typography>

        {hasLogs && (
          <Typography
            component="a"
            href="#"
            onClick={handleCopyLogsClick}
            aria-label={copied ? 'Logs copied to clipboard' : 'Copy raw logs to clipboard'}
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: copied ? 'success.main' : 'primary.main',
              textDecoration: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.3,
              borderBottom: '1px dotted',
              borderBottomColor: copied ? 'success.main' : 'primary.main',
              transition: 'color 120ms ease-out, border-color 120ms ease-out',
              '&:hover': {
                color: copied ? 'success.main' : 'primary.dark',
                borderBottomColor: copied ? 'success.main' : 'primary.dark',
              },
            }}
          >
            {copied ? (
              <>
                Copied
                <CheckIcon sx={{ fontSize: 12 }} />
              </>
            ) : (
              <>
                Copy logs
                <ContentCopyIcon sx={{ fontSize: 11 }} />
              </>
            )}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default React.memo(ScanErrorDisplay);
