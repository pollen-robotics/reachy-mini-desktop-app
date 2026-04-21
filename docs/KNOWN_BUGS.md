# Known Bugs - Hooks Layer

Living document tracking bugs identified during the JS → TS migration of `src/hooks/`.
Focus: defects that are **observable** but not yet (or no longer) fixed in the codebase.

> Status legend
>
> - `OPEN` - reproducible, not fixed
> - `FIXED` - landed on `main`
> - `REVERTED` - was fixed in a commit that had to be rolled back (see notes)
> - `WONTFIX` - intentional behavior, kept here so we don't re-discover it
> - `BLOCKED` - needs Pollen sign-off before touching

> Severity
>
> - 🔥 hot path / user-visible regression
> - 🟠 subtle bug, can bite under specific conditions (HMR, mode switch, slow daemon)
> - 🟢 cosmetic / hygiene (silent error, stale type, unused parameter, etc.)

---

## Performance regression introduced by the original "orange" fix batch

### bug-perf-1 - 🔥 100× spam of `GET /api/daemon/status` after applying the ex-`fix(hooks): moderate-risk` commit

- **Status**: REVERTED (the offending commit `81ceac0a6` is no longer in history; HEAD is `b2b93b04b`).
- **Symptom**: ~1-3 calls/sec → ~100 calls/sec sustained, daemon saturated, frontend at ~15 FPS.
- **Evidence**: `tail` of daemon log showed thousands of `127.0.0.1:<port> - "GET /api/daemon/status HTTP/1.1" 200` per second, all sharing only a handful of source ports (HTTP keep-alive → tight async loop, not interval leak).
- **Root cause**: not formally identified yet. Strongly suspected to be the combination of these changes inside `useRobotStateWebSocket`:
  - `isConnected` promoted from a per-render computation to `useState` flipped from `onopen` / `onclose`.
  - `connectionMode` added to the main effect's deps.
  - `setIsConnected(false)` added inside the cleanup function.
  Cascading store updates from these, combined with `useDaemonHealthCheck` doing `useAppStore()` without a selector (line 65-66 of `useDaemonHealthCheck.ts`), is the leading hypothesis.
- **Next step**: re-introduce the fixes one file at a time, measuring `GET /api/daemon/status` rate on each step.

---

## Daemon / health

### bug-1 - 🟢 `useDaemon.fetchDaemonVersion` swallows non-`SkippedError` failures

- **Status**: OPEN
- **File**: `src/hooks/daemon/useDaemon.ts`
- **Detail**: the `catch` early-returns for `SkippedError` (expected during install) but then silently drops every other error. We never log a daemon version failure.
- **Suggested fix**: log via `logger.warning(`Failed to fetch daemon version: ${msg}`)`.
- **Risk to apply**: trivial. Pure addition.

### bug-2 - 🟠 `useRobotCommands.sendCommand` lists `isCommandRunning` as a dep but reads it from `useAppStore.getState()`

- **Status**: OPEN
- **File**: `src/hooks/robot/useRobotCommands.ts`
- **Detail**: the `useCallback` dep array contains `isCommandRunning`, but the value used at call time comes from `useAppStore.getState()`. The dep is effectively dead (will not re-create the callback when the value changes), and the eslint-disable comment masks the issue.
- **Suggested fix**: drop `isCommandRunning` from the dep array (it is read fresh anyway).
- **Risk to apply**: trivial.

### bug-3 - WONTFIX - USB vs WiFi `resetAll()` asymmetry in `startDaemon`

- **Status**: WONTFIX (working as intended, confirmed during analysis)
- **File**: `src/hooks/daemon/useDaemon.ts`
- **Detail**: USB starts skip the `resetAll()` because the bond between connection mode and stored state is more aggressive there. WiFi reuses cached identity, so `resetAll()` would be destructive.
- **Note**: kept here to avoid re-opening this discussion.

### bug-11 - 🟢 `useLogs.logCommand` ignores the `type` parameter

- **Status**: OPEN
- **File**: `src/hooks/system/useLogs.ts`
- **Detail**: signature accepts `'info' | 'warning' | 'error'` but unconditionally forwards to `logger.info`.
- **Suggested fix**: route to `logger.warning` / `logger.error` accordingly.
- **Risk to apply**: trivial. No external caller relies on the bug.

---

## Robot WebSocket / state

### bug-13 - 🟠 `useRobotStateWebSocket` does not include `connectionMode` in its main effect deps

- **Status**: OPEN
- **File**: `src/hooks/robot/useRobotStateWebSocket.ts`
- **Detail**: the WebSocket lifecycle effect depends on `isActive` and `isDaemonCrashed`, but not on `connectionMode`. In practice every observed mode switch (USB ↔ WiFi) also flips `isActive`, so this is currently latent. If a future flow ever swaps mode without an `isActive` toggle, the WS will keep talking to the wrong host.
- **Suggested fix**: defensive - add `connectionMode` to the dep array.
- **Risk to apply**: ⚠️ this exact change is suspected of contributing to `bug-perf-1`. Re-introduce in isolation and measure before / after.

### bug-20 - 🟠 `useRobotStateWebSocket` exposes a stale `isConnected`

- **Status**: OPEN
- **File**: `src/hooks/robot/useRobotStateWebSocket.ts`
- **Detail**: `return { isConnected: wsRef.current?.readyState === WebSocket.OPEN }` is computed once per render. Consumers that rely on it never re-render when the WS opens or closes; they only see what the value happened to be at the latest render.
- **Suggested fix**: `useState<boolean>(false)`, set from `onopen` / `onclose`.
- **Risk to apply**: ⚠️ this exact change is suspected of contributing to `bug-perf-1`. Re-introduce in isolation and measure.

### bug-16 - 🟠 `useActiveMoves` keeps a stale reconnect counter across effect runs

- **Status**: OPEN
- **File**: `src/hooks/robot/useActiveMoves.ts`
- **Detail**: `reconnectAttemptsRef.current` is incremented on each failed reconnect. After 5 failures the loop stops. Toggling `isActive` off/on (or recovering from a daemon crash) does **not** reset the counter, so the second session is born already at the failure cap.
- **Suggested fix**: `reconnectAttemptsRef.current = 0` at the top of the main `useEffect` body.
- **Risk to apply**: low.

---

## Robot discovery

### bug-22 - 🟠 `useRobotDiscovery.performScan` is rebuilt every time `isFirstCheck` flips

- **Status**: OPEN
- **File**: `src/hooks/system/useRobotDiscovery.ts`
- **Detail**: `performScan` lists `isFirstCheck` as a dep. Right after the very first scan, `isFirstCheck` flips to `false`, which re-creates `performScan`, which re-runs the `startScanning` effect, which `clearInterval` + new `setInterval`. That's a full scan-cycle reset that was not intended.
- **Suggested fix**: mirror `isFirstCheck` into a ref, drop it from the `useCallback` deps.
- **Risk to apply**: low. Worth verifying against `bug-perf-1` since this also touches re-render cascades.

---

## Audio / DoA

### bug-15 - 🟠 `getDoADirection(π)` returns `'left'` instead of `'right'`

- **Status**: OPEN
- **File**: `src/hooks/audio/useDoA.ts`
- **Detail**: implementation does `Math.abs(angleRad % Math.PI)`. For `angleRad === Math.PI` the modulo collapses to `0`, which falls in the `'left'` bucket. The JSDoc explicitly states `π → right`.
- **Suggested fix**: clamp into `[0, π]` (`Math.min(Math.max(0, |angleRad|), π)`) before bucketing.
- **Risk to apply**: trivial; covered by JSDoc.

### bug-19 - 🟠 `useDoA` re-renders consumers at the WS frame rate (~20 Hz) even when the angle is unchanged

- **Status**: OPEN
- **File**: `src/hooks/audio/useDoA.ts`
- **Detail**: the selector returns `state.robotStateFull?.data?.doa` (an object). Every WS message produces a new object identity, so Zustand's default `Object.is` comparison always reports a change.
- **Suggested fix**: split into two primitive selectors (`angle`, `speech_detected`) and quantize the angle to suppress sub-perceptible jitter.
- **Risk to apply**: ⚠️ packaged with the orange commit; re-introduce in isolation.

---

## Audio capture

### bug-9 - 🟢 `useAudioAnalyser` doesn't await the promise returned by `audioContext.close()`

- **Status**: OPEN
- **File**: `src/hooks/media/useAudioAnalyser.ts`
- **Detail**: `audioContextRef.current.close()` returns a promise; it is dropped, which produces an unhandled rejection on rapid track changes.
- **Suggested fix**: `void audioContextRef.current.close().catch(() => {});`
- **Risk to apply**: trivial.

### bug-10 - 🟢 `useAudioAnalyser` uses a non-null assertion on `window.webkitAudioContext`

- **Status**: OPEN
- **File**: `src/hooks/media/useAudioAnalyser.ts`
- **Detail**: `window.AudioContext || window.webkitAudioContext!` will throw a confusing `undefined is not a constructor` if neither variant exists.
- **Suggested fix**: runtime guard, throw a clear `Error('AudioContext API is not available in this browser')`.
- **Risk to apply**: trivial.

---

## WebRTC

### bug-21 - 🟠 `useWebRTCStream` reconnects on a fixed 5-second interval

- **Status**: OPEN
- **File**: `src/hooks/media/useWebRTCStream.ts`
- **Detail**: the auto-reconnect loop fires every 5 s indefinitely, regardless of how badly the previous attempts have failed. Network-level back-off would be safer.
- **Suggested fix**: capped exponential backoff (5s, 10s, 20s, ..., max 60s, max 10 attempts), reset on `streamsChanged`.
- **Risk to apply**: low (only WiFi mode).

### bug-7 - 🟢 `useWebRTCStream` types the WS error as `Event & { message?: string }`

- **Status**: OPEN
- **File**: `src/hooks/media/useWebRTCStream.ts`
- **Detail**: the actual event is `ErrorEvent`. Cosmetic but worth tightening.
- **Risk to apply**: trivial.

---

## Logs streaming

### bug-23 - 🟠 `useDaemonLogStream` can leak orphan reconnect timers under WS-flap

- **Status**: OPEN
- **File**: `src/hooks/useDaemonLogStream.ts`
- **Detail**: in both the `onclose` and `catch` paths, `reconnectTimer = setTimeout(connect, 3000)` is reassigned without first clearing the previous handle.
- **Suggested fix**: `if (reconnectTimer) clearTimeout(reconnectTimer);` before reassignment.
- **Risk to apply**: low.

### bug-23b - 🟢 `useDaemonLogStream.filteredLogs` recomputes when callers pass a fresh `enabledCategories` array

- **Status**: OPEN
- **File**: `src/hooks/useDaemonLogStream.ts`
- **Detail**: `useMemo` depends on the array identity. A non-memoized caller forces the filter to recompute every render.
- **Suggested fix**: derive a sorted `categoriesKey` (`[...enabledCategories].sort().join('|')`) and depend on the string. Use a `Set` for the filter while we're at it.
- **Risk to apply**: low.

---

## Auth / OAuth

### bug-18 - 🟠 `useHfAuth` leaks state through `mountedRef` after StrictMode / HMR remount

- **Status**: OPEN
- **File**: `src/hooks/auth/useHfAuth.ts`
- **Detail**:
  1. `mountedRef.current = true` is initialized once on construction. After a StrictMode double-invoke or HMR-driven remount, it can stay stuck at `false`.
  2. `checkAuthStatus()` can be invoked twice concurrently if the daemon is slow.
  3. `handleLogin` / `handleLogout` issue `setState` after async work without checking `mountedRef`.
- **Suggested fix**:
  - Re-arm `mountedRef.current = true` at the start of the main `useEffect`.
  - Add `isCheckingRef` overlap guard in `checkAuthStatus`.
  - Guard every post-await `setState` in `handleLogin` / `handleLogout` with `mountedRef.current`.
- **Risk to apply**: low.

---

## System / lifecycle

### bug-3-bis - 🟢 `useLocalWifiScan` doesn't reset `intervalRef.current` after `clearInterval`

- **Status**: OPEN
- **File**: `src/hooks/system/useLocalWifiScan.ts`
- **Detail**: cleanup paths call `clearInterval(intervalRef.current)` but never reset the ref to `null`, so subsequent guards (`if (intervalRef.current)`) lie.
- **Suggested fix**: `intervalRef.current = null` after clearing.
- **Risk to apply**: trivial.

### bug-4 - 🟢 `useWindowResize` accepts `string` for `view` and casts it internally

- **Status**: OPEN
- **File**: `src/hooks/system/useWindowResize.ts`
- **Detail**: `ViewName | string | undefined` paired with `sizes[view as ViewName]` allows callers to pass `'random'` and silently get `undefined`.
- **Suggested fix**: tighten to `ViewName | null | undefined`, drop the cast, export `ViewName`.
- **Risk to apply**: trivial.

### bug-5 - 🟢 `usePermissions` runs E2E detection on every render

- **Status**: OPEN
- **File**: `src/hooks/system/usePermissions.ts`
- **Detail**: the `isE2EMode` function does a chain of checks (navigator.webdriver, env, localStorage, window flag) and `console.log`s the result. Because it lives inside the component body, both the work and the logs run on every render.
- **Suggested fix**: hoist to a module-scoped `IS_E2E_MODE = detectE2EMode()`.
- **Risk to apply**: trivial.

### bug-17 - 🟠 `useDeepLink` leaks the `onOpenUrl` listener if the hook unmounts during await

- **Status**: OPEN
- **File**: `src/hooks/system/useDeepLink.ts`
- **Detail**: the cleanup runs while `setupListener()` is still awaiting the `onOpenUrl(...)` registration. When the await resolves we register a listener that nobody will ever tear down.
- **Suggested fix**: a `cancelled` flag flipped in the cleanup; if `cancelled === true` after the await, immediately call the freshly-registered unlisten.
- **Risk to apply**: low.

---

## How to use this file

When picking a bug to fix:

1. Check `Status` (skip `WONTFIX` and `BLOCKED`).
2. Read `Risk to apply` and decide whether the fix can ship in a batch or needs its own commit.
3. **Anything labelled with the ⚠️ "suspected of contributing to bug-perf-1" warning must be re-introduced in isolation and benchmarked** with `grep "GET /api/daemon/status" <terminal>.txt | uniq -c` for at least 30 s.
4. Update the `Status` field in the same commit that fixes it.
