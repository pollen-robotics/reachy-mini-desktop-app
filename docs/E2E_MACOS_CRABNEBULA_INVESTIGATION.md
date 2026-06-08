# macOS E2E CrabNebula Panic - Investigation

Living investigation report for the deterministic macOS E2E failure that
blocks the cross-platform release workflow (`Release Cross-Platform`,
`.github/workflows/release-unified.yml`).

> **Status**: OPEN (root cause identified as external/CI-environment;
> no end-user impact). Awaiting a decision on the release-gating mitigation.

---

## TL;DR

- The macOS E2E job (`Run E2E tests (macOS only)`, spec `e2e/specs/app-launch.spec.js`)
  fails because the app **panics at launch** while serving the WebDriver
  `getWindowHandle` command. Windows and Linux E2E stay green.
- The panic is **not** caused by any of our code: a control build of the
  **already-released `v0.9.31`** tag reproduces the identical panic today,
  even though that exact build passed E2E on 2026-05-18.
- The only thing that changed between the passing and failing runs is the
  **GitHub `macos-15-arm64` runner image** (`20260427.0018.1` -> `20260527.0100.1`).
- **End-user impact: none.** The panicking code path is the WebDriver
  automation server, which only runs under E2E. The shipped app never
  activates it.

---

## Symptom

`app-launch.spec.js` never gets a WebDriver session. The app process prints:

```
[automation] Server started on port 16161
... webdriver COMMAND getWindowHandle()
[reachy_mini_control_lib][ERROR] PANIC: panicked at
  /rustc/<hash>/library/alloc/src/collections/btree/navigate.rs:600:48:
called `Option::unwrap()` on a `None` value
thread '<unnamed>' panicked at .../btree/navigate.rs:600:48:
called `Option::unwrap()` on a `None` value
```

After the panic the automation thread is dead, so every subsequent
WebDriver call gets `Connection refused (os error 61)` on
`http://localhost:16161/window/handle`, WebdriverIO retries 3x, then:

```
✖ Failed to create a session
Spec Files: 0 passed, 1 failed
```

The panic location (`alloc/.../btree/navigate.rs`) is a `BTreeMap` navigation
`unwrap()` - consistent with the automation server enumerating webview
windows from a map that is momentarily **empty** when `getWindowHandle`
arrives (i.e. the WKWebView window is not yet registered).

---

## Scope

| Platform | Build | E2E |
|----------|-------|-----|
| Linux (ubuntu-24.04) | green | green |
| Windows | green | green |
| macOS arm64 (`macos-latest`) | green | **fails (panic)** |
| macOS x64 (`macos-15-intel`) | green | **fails (panic)** |

Deterministic: re-running the failed jobs reproduces the panic. Not flaky.

---

## Evidence & timeline

### 1. The failing release dry-run (current code)

- Run `27019322120` (`workflow_dispatch`, `main`, `dry_run=true`, 0.9.32).
- Both macOS jobs fail at `Run E2E tests (macOS only)`; re-run of both fails
  identically. Windows + Linux pass.

### 2. The last green release (same E2E harness)

- Run `26025348018` (`push`, tag `v0.9.31`, 2026-05-18): both macOS jobs
  **passed** `Run E2E tests (macOS only)`.

### 3. What changed between the two (the decisive part)

`git diff v0.9.31..main` is **frontend TypeScript only**:

- Changed: `.github/workflows/release-unified.yml` (a daemon version constant),
  `src/**` (the wireless daemon update-gate feature, PR #273).
- **Unchanged**: `src-tauri/`, all `Cargo.lock` files, `yarn.lock`, `e2e/`.

So the Rust binary and the E2E harness are byte-for-byte the same as the
build that passed on 2026-05-18.

### 4. Control proof - rebuild `v0.9.31` today

- Run `27021390218` (`workflow_dispatch`, **tag `v0.9.31`**, `dry_run=true`,
  triggered 2026-06-05): the macOS arm64 job reproduces the **identical**
  panic (`btree/navigate.rs:600`, `unwrap() on None`).
- Conclusion: the exact code that was green three weeks ago is red today
  -> the trigger is **outside the repository**.

### 5. Runner image drift

The macOS runner image was rebuilt between the two runs (same OS, new image):

| Run | Date | `macos-15-arm64` image |
|-----|------|------------------------|
| v0.9.31 (green) | 2026-05-18 | `20260427.0018.1` |
| control / 0.9.32 (red) | 2026-06-05 | `20260527.0100.1` |

This is the only environmental delta we can attribute the regression to
(most likely a WebKit / WKWebView / system-library change in the image).

---

## Dependency analysis

### Local CrabNebula deps are pinned (no npm drift)

`yarn.lock` pins the macOS E2E tooling with integrity hashes, and `yarn install`
(Yarn 1.x) honors them:

- `@crabnebula/tauri-driver@2.0.8`
- `@crabnebula/test-runner-backend@0.1.18`
- plus the per-platform native subpackages at the same versions.

The macOS path additionally uses the **CrabNebula remote/cloud WebDriver**
(`CN_API_KEY`, `REMOTE_WEBDRIVER_URL=http://127.0.0.1:3000`), so the cloud
service is a second uncontrolled variable, but see the bump attempt below.

### Bundled tauri stack

`src-tauri/Cargo.lock` (unchanged since well before v0.9.31):

- `tauri 2.10.3`
- `tao 0.34.5`
- `wry 0.54.2`

`tao 0.34.5` is already **past** the well-known macOS `standardWindowButton` /
`NSScreen` nil-unwrap fix (tao `0.33.0`, PRs tao#1083 / tao#1121). Our panic is
in a different location (`btree/navigate.rs`, the automation window-handle
enumeration), i.e. a distinct manifestation rather than that documented bug.

---

## Attempted fixes

| Attempt | Result |
|---------|--------|
| Re-run the failed macOS jobs | Same panic (deterministic) |
| Bump `@crabnebula/tauri-driver` 2.0.8 -> **2.0.9** and `@crabnebula/test-runner-backend` 0.1.18 -> **0.2.8** (branch `chore/bump-crabnebula-e2e`, dry-run run `27025174799`) | **Same panic**, byte-identical signature |

The CrabNebula bump ruling is important: it proves the panic is **not** in the
CrabNebula tooling. It happens inside the app's own bundled tauri automation
server (logged via `reachy_mini_control_lib`), driven externally by CrabNebula.

---

## Root cause (best current assessment)

The GitHub `macos-15` runner image bump (`20260427` -> `20260527`) changed
runtime behavior (most likely WKWebView/OS-level) such that, under WebDriver
automation, the bundled tauri automation server hits an `unwrap()` on an empty
window `BTreeMap` when `getWindowHandle` is served before the WKWebView window
is registered. It is a race / nil-handling gap in the bundled tauri/tao/wry
automation path, surfaced only by the new runner image, and only under E2E.

Related upstream (same family of macOS `unwrap on None` window panics):
`tauri-apps/tauri#13444`, `tauri-apps/tauri#12886`, `tauri-apps/tao#1081`,
`tauri-apps/tao#1083`, `tauri-apps/tao#1121`.

---

## Impact

**None for end users.** The automation server (port 16161) is only active under
WebDriver/E2E. The shipped Reachy Mini Control app never starts it, so the
panic cannot occur in normal use. The only consequence is that the release
workflow cannot produce a fully-green macOS run.

---

## Mitigation options

1. **Unblock releases (recommended short-term)**: mark `Run E2E tests (macOS only)`
   as `continue-on-error: true` until the runner image / upstream tauri ships a
   fix. Justified because there is no user-facing impact. Track the re-enable
   here.
2. **Capture `RUST_BACKTRACE=1`** in the macOS E2E step to pinpoint the exact
   crate/frame that unwraps, in case a targeted patch/`[patch.crates-io]` is
   warranted.
3. **Bump `tauri`/`tao`/`wry`** to latest and re-validate. Higher risk: it
   changes the real app binary and needs a full QA pass; uncertain to fix this
   specific automation panic.
4. **Pin an older macOS runner label** (e.g. `macos-14`) to dodge the image
   change. Changes the tested platform and may introduce other differences.

---

## How to reproduce / paper trail

```bash
# Failing dry-run (current code)
gh run view 27019322120

# Last green release (same harness)
gh run view 26025348018

# Control proof: rebuild the v0.9.31 tag today (reproduces the panic)
gh workflow run release-unified.yml --ref v0.9.31 -f dry_run=true

# CrabNebula bump attempt (still fails)
gh run view 27025174799

# Inspect the panic in a failed macOS job log
gh api repos/pollen-robotics/reachy-mini-desktop-app/actions/jobs/<job_id>/logs \
  | grep -E "PANIC|btree/navigate|Failed to create a session"

# Confirm the runner image version of a job (Set up job step)
# look for: "Image: macos-15-arm64" + "Version: <date>.<n>"
```
