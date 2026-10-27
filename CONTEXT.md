# Reachy Mini - Technical Context

> Internal knowledge base for development. Quick reference for hardware constraints, architecture decisions, and technical specs.

---

## Platforms

### Reachy Mini Wireless

- **Compute**: Raspberry Pi 4 Compute Module (CM4104016)
  - WiFi enabled, 4GB RAM, 16GB flash
  - WiFi antenna: 2.4-5GHz dual-band, 2.79 dBi
- **Power**: LiFePO4 Battery 2000mAh, 6.4V, 12.8Wh
  - Input voltage: 6.8 - 7.6V
  - BMS with temperature sensor, over-charge/discharge/current protection
- **Connection**: WiFi (hotspot mode or client mode)
  - Default AP SSID: `reachy-mini-ap`, password: `reachy-mini`
  - Robot IP in AP mode: `10.42.0.1`
- **Serial**: Internal UART `/dev/ttyAMA3` (not USB)
- **SSH**: `pollen@reachy-mini.local`, password: `root`

### Reachy Mini Lite

- **Compute**: User's computer (runs daemon locally)
- **Power**: Wall outlet (7V-5A power supply)
- **Connection**: USB-C to computer
- **Serial**: USB VID:PID `1a86:55d3`

### Simulation

- No hardware required
- Daemon runs with `--sim` flag
- Camera simulated at 720p@60fps

---

## Hardware Specs

### Dimensions & Weight

- Dimensions: 30x20x15.5cm (extended)
- Mass: Lite 1.350kg, Wireless 1.475kg
- Materials: ABS, PC, Aluminium, Steel

### Degrees of Freedom (9 total)

- **Head**: 6 DOF (3 rotations + 3 translations via Stewart platform)
- **Body**: 1 rotation (yaw)
- **Antennas**: 2 rotations (1 per antenna)

### Motors (Dynamixel)

| Motor         | ID    | Type          | Location         |
| ------------- | ----- | ------------- | ---------------- |
| body_rotation | 10    | XC330-M288-PG | Base             |
| stewart_1-6   | 11-16 | XL330-M288-T  | Stewart platform |
| right_antenna | 17    | XL330-M077-T  | Right antenna    |
| left_antenna  | 18    | XL330-M077-T  | Left antenna     |

- Serial baudrate: 1,000,000
- Protocol: Dynamixel Protocol 2.0

### Camera

| Version          | Sensor                      | Specs                            | Default Resolution |
| ---------------- | --------------------------- | -------------------------------- | ------------------ |
| Wireless         | Sony IMX708 (RPi Camera v3) | 12MP, wide angle 120°, autofocus | 1920x1080@30fps    |
| Lite             | Custom sensor               | 12MP, wide angle, autofocus      | 1920x1080@60fps    |
| Arducam (legacy) | Arducam 12MP                | 12MP                             | 1280x720@30fps     |

**Available resolutions (Wireless)**:

- 1920x1080@30fps, 1280x720@60fps
- 3840x2592@10fps, 3840x2160@10fps
- 3264x2448@10fps, 3072x1728@10fps

### Audio (ReSpeaker)

| Component   | Spec                     |
| ----------- | ------------------------ |
| Microphones | 4x PDM MEMS digital mics |
| Sample rate | 16 kHz                   |
| Channels    | 2 (stereo)               |
| Sensitivity | -26 dB FS                |
| SNR         | 64 dBA                   |
| Chip        | XMOS XVF3800             |
| Speaker     | 5W @ 4Ω                  |

---

## Streaming / WebRTC

### Architecture

- **Daemon (RPi)**: GStreamer pipeline with `webrtcsink` (gst-plugins-rs)
- **Signaling server**: Built-in, port 8443
- **Video codec**: H.264 (hardware encoded via `v4l2h264enc`)
- **Audio codec**: Opus

### H.264 Profile Configuration (Dec 2024)

**Decision**: Use Level 3.1 + Constrained Baseline for cross-platform compatibility.

| Profile                  | Level   | Max Resolution | Safari | Chrome | Firefox | Tauri macOS |
| ------------------------ | ------- | -------------- | ------ | ------ | ------- | ----------- |
| **Constrained Baseline** | **3.1** | **720p@30fps** | ✅     | ✅     | ✅      | ✅          |
| Main                     | 4.0     | 1080p@30fps    | ❌     | ✅     | ✅      | ❌          |

**Reason**: Safari/WebKit (and Tauri on macOS via WKWebView) only supports H264 Level 3.1. Level 4.0 causes SDP negotiation failure.

**Trade-off**: 720p max resolution for universal compatibility.

**Ref**: PR `fix/webrtc-safari-h264-level`

### Hardware Constraints

- **Single stream only**: RPi cannot encode 2 H.264 streams simultaneously
- **Latency**: rtpjitterbuffer set to 200ms (configurable)
- **Local access**: Unix socket `/tmp/reachymini_camera_socket` for on-device apps (bypasses WebRTC overhead)

---

## Media Backends

The daemon always owns the physical camera and audio hardware via `GstMediaServer`. Clients pick a backend:

| Backend    | Camera                      | Audio            | Use Case                            |
| ---------- | --------------------------- | ---------------- | ----------------------------------- |
| `LOCAL`    | GStreamer IPC (`unixfdsrc`) | GStreamer local  | On-device apps (no encode/decode)   |
| `WEBRTC`   | WebRTC client               | WebRTC client    | Remote clients + Lite (desktop app) |
| `NO_MEDIA` | None                        | None             | Headless / SDK only                 |

`DEFAULT` is an alias for `LOCAL`. Old names (`GSTREAMER`, `SOUNDDEVICE_OPENCV`, etc.) are deprecated aliases that map to `LOCAL`.

Auto-detection logic:

1. If on-device (local camera IPC socket exists) → `LOCAL`
2. If remote (Wireless or Lite via USB) → `WEBRTC` (daemon exposes signaling server on `localhost:8443`)
3. Headless → `NO_MEDIA`

---

## Communication

### Zenoh

- Pub/sub middleware for robot state and commands
- Default: localhost only
- Prefix: `reachy_mini`

### REST API (FastAPI)

- Port: 8000
- Docs: `http://localhost:8000/docs`
- WebSocket state: `ws://127.0.0.1:8000/api/state/ws/full`

### Bluetooth (Wireless only)

- Used for WiFi provisioning
- BLE characteristics for SSID/password configuration

---

## Robot Discovery

The desktop app discovers Reachy Mini robots on the LAN via two parallel
methods, merged and deduplicated in `src-tauri/src/discovery/mod.rs`:

| Method | What it does | Latency |
|--------|--------------|---------|
| Static peers | HTTP probe of `reachy-mini.local` and `reachy-mini.home` | ~1-3s |
| mDNS | Browse `_reachy-mini._tcp.local.` and `_http._tcp.local.` | ~5s |

### Hostname > IP

`RobotInfo` carries both `ip` and `hostname`. The frontend uses the
**hostname** (`reachy-mini.local`) as the connection target whenever it's
available, and only falls back to the resolved IP when no hostname was
advertised. Two reasons:

1. **Freshness.** Hostnames are re-resolved by the OS resolver / Bonjour on
   every request, so DHCP renews and network switches are picked up
   automatically. An IP carried in app state goes stale silently.
2. **Observed macOS behaviour.** User reports on macOS had `Connect` silently
   failing against the resolved IP while typing `reachy-mini.local` in the
   manual field worked, with the Local Network permission confirmed ON. The
   exact mechanism is unconfirmed (ATS / WebKit local-network edge case);
   hostname-first sidesteps it either way.

### No app-level cache

A previous version cached `last_known_ip` for a "fast path" on the next
scan. This caused silent connection failures whenever the robot moved to a
new IP (DHCP renew, reboot on a different subnet) until the app was
restarted. The cache only saved ~2s on the very first scan, so it was
removed - see the module-level docs in `discovery/mod.rs` for the full
rationale. We rely on the static peer list + the `mdns-sd` library's own
RFC-6762-compliant cache (TTLs, Goodbye Packets, Cache Flush bit) instead.

### Dedup by canonical identity

Discovered robots are deduplicated by their canonical identity in this
priority order:

1. **Hostname** (`reachy-mini.local`) - survives IP changes
2. **Instance name** (the `<instance>` part of `<instance>._reachy-mini._tcp.local.`) - the RFC-6763 canonical service identifier
3. **IP** - last-resort fallback for static peers / manual entries

This means a robot whose IP changes between two scans is recognised as the
same entity instead of appearing twice in the UI.

Entries are *also* cross-matched by resolved IP, so one robot reached under
several names (`reachy-mini.local` and `reachy-mini.home`, or a manually
entered IP later re-found via mDNS) still collapses to a single entry.

---

## Safety Limits

| Axis                     | Range         |
| ------------------------ | ------------- |
| Body Yaw                 | [-180°, 180°] |
| Head Pitch/Roll          | [-40°, 40°]   |
| Head Yaw                 | [-180°, 180°] |
| Body-Head Yaw difference | [-65°, 65°]   |

Poses outside limits are automatically clamped.

---

## Kinematics Engines

| Engine                 | Description                           | Collision Check |
| ---------------------- | ------------------------------------- | --------------- |
| `AnalyticalKinematics` | Rust-based, fastest (default)         | ❌              |
| `Placo`                | Python, supports gravity compensation | ✅              |
| `NN`                   | ONNX neural network                   | ❌              |

---

## Known Issues / Gotchas

1. **Motor ID 4 / QC #2544**: Some units have faulty motors from a bad batch. Update + reboot reflashes motors.
2. **USB cable length in head**: Too long = restricted movement = motor overload.
3. **Switch position (Wireless)**: Must be on "debug" not "download" for AP to appear.
4. **Safari WebRTC**: Only Level 3.1 H.264 supported (see Streaming section).

---

## File Locations

| Path                                                 | Description               |
| ---------------------------------------------------- | ------------------------- |
| `/venvs/mini_daemon/`                                | Daemon venv on Wireless   |
| `/tmp/reachymini_camera_socket`                      | Local camera unix socket  |
| `src/reachy_mini/assets/config/hardware_config.yaml` | Motor configuration       |
| `src/reachy_mini/media/webrtc_daemon.py`             | WebRTC GStreamer pipeline |
| `src/reachy_mini/daemon/daemon.py`                   | Main daemon entry point   |

---

_Last updated: 2024-12-27_
