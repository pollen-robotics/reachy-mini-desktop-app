# Section mapping

Include a section only if at least one PR lands there. When in doubt, pick the most
user-facing section. A user-visible fix goes in the section of the feature it fixes only
if that section already exists for this release; otherwise use `🐛 Bug fixes`.

## 💔 Breaking changes

Something users relied on stops working or changes behavior: a dropped platform or OS
version, a removed feature, a minimum daemon version bump.

## 🔌 Connection & setup

Finding and connecting to the robot: USB, Wi-Fi, Bluetooth, discovery, mDNS, the local
proxy, first-time setup and Wi-Fi provisioning, Hugging Face sign-in.

## 🧩 Apps

The app store and installed apps: discover, install, update, uninstall, start/stop,
startup app, the embedded app view and pop-out windows, app web interfaces.

## 🤖 Robot control

Driving the robot from the app: 3D viewer, head and antenna controls, expressions and
dances, camera and audio streams (WebRTC), volume, wake up / sleep.

## 🖥️ Interface

Window, layout, themes, settings, logs console, telemetry and privacy options, text and
translations.

## 📦 Install & updates

Installers and packaging (DMG, MSI, DEB, RPM, AppImage), signing and notarization,
auto-update, OS permissions, app size and startup time.

## ⚙️ Daemon

The bundled Python daemon (sidecar): its version, how the app starts, stops and
updates it, uv and Python environment.

## 🐛 Bug fixes

User-visible fixes that don't fit a section above.

## 🏗️ Internal

CI, tests, refactors, dependency bumps, code style, developer tooling. Nothing a user
of the app would notice.
