/**
 * JS App Launcher — opens HuggingFace-Space-hosted JavaScript apps.
 *
 *   Windows / macOS: embed the HF Space in the right panel iframe.
 *     WebView2 (Chromium) and WKWebView both handle WebRTC well enough
 *     for getUserMedia / RTCPeerConnection.
 *
 *   Linux: open the URL in the user's default browser via the shell.
 *     WebKitGTK has no usable WebRTC and in-process embedding would
 *     silently fail for most live apps. A system-browser tab always
 *     works; the user can reopen it from the card any time.
 */

import { isLinux } from './platform';
import useAppStore from '../store/useAppStore';

/**
 * Resolve the HuggingFace Space URL for a JS app.
 * Falls back to constructing it from the app id when `app.url` is missing.
 */
function resolveSpaceUrl(app) {
  if (app?.url) return app.url;
  const id = app?.extra?.id || app?.name;
  return id ? `https://huggingface.co/spaces/${id}` : null;
}

/**
 * Open a JS app.
 *
 * @param {Object} app — app descriptor from the store API
 * @param {Object} [deps] — { shellApi }: injected so we don't reach into
 *                          the Tauri plugin from a non-React util.
 */
export async function openJsApp(app, deps = {}) {
  const url = resolveSpaceUrl(app);
  if (!url) throw new Error('JS app has no URL');

  const name = app?.name || 'JS App';

  // Mutex: don't fight a daemon-managed Python app for the right panel slot.
  // The user must stop the running app first.
  const state = useAppStore.getState();
  if (state.isAppRunning) {
    state.showToast?.('Stop the running app first to open a new one', 'warning');
    return { mode: 'rejected' };
  }

  // Linux: open in the host browser. Don't try to embed — WebKitGTK
  // lacks WebRTC and most live apps depend on it.
  if (isLinux()) {
    if (!deps.shellApi?.open) {
      throw new Error('shellApi.open not available');
    }
    await deps.shellApi.open(url);
    return { mode: 'system-browser' };
  }

  // Windows / macOS: in-panel iframe.
  useAppStore.getState().openEmbeddedJsApp({ url, name });
  return { mode: 'iframe' };
}
