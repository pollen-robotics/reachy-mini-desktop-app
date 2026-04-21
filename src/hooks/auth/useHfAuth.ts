import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchWithTimeout, buildApiUrl, DAEMON_CONFIG } from '@config/daemon';
import { openUrl } from '@utils/tauriCompat';
import useAppStore from '../../store/useAppStore';

const AUTH_POLL_INTERVAL = 2000;
const AUTH_POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

type TimeoutId = ReturnType<typeof setTimeout>;
type IntervalId = ReturnType<typeof setInterval>;

export interface UseHfAuthResult {
  isAuthenticated: boolean;
  username: string | null;
  avatarUrl: string | null;
  isLoading: boolean;
  isWaitingForAuth: boolean;
  error: string | null;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

/**
 * Shape returned by `GET /api/hf-auth/status`.
 * Fields are best-effort: the daemon may omit `avatar_url` or `username`.
 */
interface HfAuthStatusPayload {
  is_logged_in: boolean;
  username?: string | null;
  avatar_url?: string | null;
}

/**
 * Shape returned by `POST /api/hf-auth/oauth/start`.
 */
interface HfOAuthStartPayload {
  auth_url?: string;
  [key: string]: unknown;
}

/**
 * Hugging Face authentication hook.
 *
 * Manages OAuth login via the system browser, polling for completion, and
 * logout. Auth state lives on the daemon; this hook mirrors it via
 * `/api/hf-auth/*`.
 *
 * For WiFi mode, the daemon is told to use `localhost:8000` for the OAuth
 * callback URL so the browser redirect lands on our local proxy regardless
 * of whether `reachy-mini.local` resolves on the user's network.
 */
export function useHfAuth(): UseHfAuthResult {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isWaitingForAuth, setIsWaitingForAuth] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<IntervalId | null>(null);
  const pollTimeoutRef = useRef<TimeoutId | null>(null);
  const mountedRef = useRef<boolean>(true);

  const stopPolling = useCallback((): void => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setIsWaitingForAuth(false);
  }, []);

  const checkAuthStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/hf-auth/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );

      if (response.ok) {
        const data = (await response.json()) as HfAuthStatusPayload;
        if (mountedRef.current) {
          setIsAuthenticated(data.is_logged_in);
          setUsername(data.username ?? null);
          if (data.avatar_url) {
            setAvatarUrl(data.avatar_url);
          } else if (data.username) {
            setAvatarUrl(`https://huggingface.co/api/users/${data.username}/avatar`);
          } else {
            setAvatarUrl(null);
          }
        }
        return data.is_logged_in;
      }
    } catch {
      // Silent - daemon may not have this endpoint yet.
    }
    return false;
  }, []);

  useEffect(() => {
    checkAuthStatus();
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [checkAuthStatus, stopPolling]);

  const handleLogin = useCallback(async (): Promise<void> => {
    if (isWaitingForAuth || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      // Tell the daemon to use localhost:8000 for the OAuth callback URL.
      // The desktop app's local proxy forwards localhost:8000 to the robot,
      // so the browser's OAuth redirect lands on the proxy regardless of
      // whether `reachy-mini.local` resolves.
      const { connectionMode } = useAppStore.getState();
      const proxyParam = connectionMode === 'wifi' ? '?use_localhost=true' : '';

      const response = await fetchWithTimeout(
        buildApiUrl(`/api/hf-auth/oauth/start${proxyParam}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'HF OAuth start' }
      );

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errData.detail ?? `OAuth start failed (${response.status})`);
      }

      const data = (await response.json()) as HfOAuthStartPayload;
      const { auth_url } = data;

      if (!auth_url) {
        throw new Error('No auth URL returned');
      }

      await openUrl(auth_url);

      setIsLoading(false);
      setIsWaitingForAuth(true);

      pollIntervalRef.current = setInterval(async () => {
        const loggedIn = await checkAuthStatus();
        if (loggedIn) {
          stopPolling();
        }
      }, AUTH_POLL_INTERVAL);

      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
      }, AUTH_POLL_TIMEOUT);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'OAuth start failed';
      setError(message);
      setIsLoading(false);
      setIsWaitingForAuth(false);
    }
  }, [isWaitingForAuth, isLoading, checkAuthStatus, stopPolling]);

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/hf-auth/token'),
        { method: 'DELETE' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'HF logout' }
      );
      setIsAuthenticated(false);
      setUsername(null);
      setAvatarUrl(null);
    } catch {
      await checkAuthStatus();
    }
  }, [checkAuthStatus]);

  return {
    isAuthenticated,
    username,
    avatarUrl,
    isLoading,
    isWaitingForAuth,
    error,
    handleLogin,
    handleLogout,
  };
}

export default useHfAuth;
