import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchWithTimeout, buildApiUrl, DAEMON_CONFIG } from '@config/daemon';
import { openUrl } from '@utils/tauriCompat';
import useAppStore from '../../store/useAppStore';

const AUTH_POLL_INTERVAL = 2000;
const AUTH_POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Hugging Face authentication hook.
 * Manages OAuth login via system browser, polling for completion, and logout.
 * Auth state lives on the daemon — this hook mirrors it via /api/hf-auth/*.
 *
 * For WiFi mode: passes the remoteHost as ?host= param so the daemon builds
 * the OAuth callback URL with the correct IP (instead of reachy-mini.local
 * which may not resolve on all networks).
 */
export function useHfAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForAuth, setIsWaitingForAuth] = useState(false);
  const [error, setError] = useState(null);
  const pollIntervalRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
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

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/hf-auth/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );

      if (response.ok) {
        const data = await response.json();
        if (mountedRef.current) {
          setIsAuthenticated(data.is_logged_in);
          setUsername(data.username || null);
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
      // Silent — daemon may not have this endpoint yet
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

  const handleLogin = useCallback(async () => {
    if (isWaitingForAuth || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      // Tell the daemon to use localhost:8000 for the OAuth callback URL.
      // The desktop app's local proxy forwards localhost:8000 to the robot,
      // so the browser's OAuth redirect lands on the proxy regardless of
      // whether reachy-mini.local resolves.
      const { connectionMode } = useAppStore.getState();
      const proxyParam = connectionMode === 'wifi' ? '?use_localhost=true' : '';

      const response = await fetchWithTimeout(
        buildApiUrl(`/api/hf-auth/oauth/start${proxyParam}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'HF OAuth start' }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `OAuth start failed (${response.status})`);
      }

      const data = await response.json();
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
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      setIsWaitingForAuth(false);
    }
  }, [isWaitingForAuth, isLoading, checkAuthStatus, stopPolling]);

  const handleLogout = useCallback(async () => {
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
