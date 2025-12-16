<div align="center">
  <a href="https://huggingface.co/spaces?q=reachy_mini">
    <img src="src/assets/reachy-update-box.svg" alt="Reachy Mini" width="200" />
  </a>
  
  <h1>Reachy Mini Control</h1>
  
  <p>
    <img src="https://img.shields.io/github/v/release/pollen-robotics/reachy-mini-desktop-app?label=version&color=blue" alt="Version" />
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="Platform" />
    <img src="https://img.shields.io/badge/tauri-2.0-FFC131?logo=tauri&logoColor=white" alt="Tauri" />
  </p>
</div>

A modern desktop application for controlling and monitoring your Reachy Mini robot. Built with Tauri and React for a native, performant experience.

> **📢 Platform Support**  
> ✅ **macOS** - Fully supported and production-ready  
> 🚧 **Windows & Linux** - Work in progress, not yet ready for production use

This desktop application provides a unified interface to manage your Reachy Mini robot. It handles the robot daemon lifecycle, offers real-time 3D visualization of the robot's state, and includes an integrated app store to discover and install applications from Hugging Face Spaces. The app automatically detects USB-connected robots and provides direct access to audio controls, camera feeds, and robot choreographies.

![Desktop Application Screenshot](src/assets/desktop-app-screenshot.png)

## ✨ Features

- 🤖 **Robot Control** - Start, stop, and monitor your Reachy Mini daemon
- 📊 **Real-time Monitoring** - Live 3D visualization of robot state
- 🏪 **Application Store** - Discover, install, and manage apps from Hugging Face Spaces
  - Browse official and community apps
  - Search and filter by categories
  - One-click installation and removal
  - Start and stop apps directly from the interface
- 📚 **Create Your Own Apps** - Tutorials and guides to build custom applications
  - Learn how to interact with the daemon API
  - Build apps with the Python SDK
  - Deploy and share on Hugging Face Spaces
- 🔄 **Auto Updates** - Seamless automatic updates with progress tracking
- 🎨 **Modern UI** - Clean, intuitive interface built with Material-UI
  - Dark mode support
  - Responsive design
- 🔌 **USB Detection** - Automatic detection of Reachy Mini via USB
- 📱 **Cross-platform** - Works on macOS, Windows, and Linux

## 🚀 Quick Start

### Prerequisites

- **Node.js 24.4.0+** (LTS recommended) and Yarn
  - If using `nvm`: `nvm install --lts && nvm use --lts`
- Rust (latest stable)
- System dependencies for Tauri ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Installation

```bash
# Clone the repository
git clone https://github.com/pollen-robotics/reachy-mini-desktop-app.git
cd reachy-mini-desktop-app/tauri-app

# Install dependencies
yarn install

# Run in development mode
yarn tauri:devc
```

```bash
# Check your Node version
node --version

# If using nvm, install and use the latest LTS
nvm install --lts
nvm use --lts
nvm alias default $(nvm version)  # Set as default
```

### Building

**Important**: You must build the sidecar before building the application.

```bash
# 1. Build the sidecar (required first step)
yarn build:sidecar-macos    # macOS
yarn build:sidecar-linux    # Linux
yarn build:sidecar-windows  # Windows

# 2. Build the application
yarn tauri:build            # Build for production (uses PyPI release by default)

# Build for specific platform
yarn tauri build --target aarch64-apple-darwin
yarn tauri build --target x86_64-apple-darwin
yarn tauri build --target x86_64-pc-windows-msvc
yarn tauri build --target x86_64-unknown-linux-gnu
```

#### Installing the daemon from different sources

By default, the `reachy-mini` package is installed from PyPI (latest stable release). You can also install from any GitHub branch by using the `REACHY_MINI_SOURCE` environment variable:

- **PyPI (default)** : `REACHY_MINI_SOURCE=pypi` or omit the variable
- **GitHub branch** : `REACHY_MINI_SOURCE=<branch-name>` (e.g., `develop`, `main`, `feature/xyz`)

Examples to build the sidecar with different sources:
```bash
# Build with develop branch
REACHY_MINI_SOURCE=develop bash ./scripts/build/build-sidecar-unix.sh

# Build with main branch
REACHY_MINI_SOURCE=main bash ./scripts/build/build-sidecar-unix.sh

# Build with any other branch
REACHY_MINI_SOURCE=feature/my-feature bash ./scripts/build/build-sidecar-unix.sh
```

## 📖 Documentation

- [Project Conventions](./CONVENTIONS.md) - Coding standards, naming conventions, and project structure
- [Build Process](./RAPPORT_BUILD.md) - Detailed documentation of the build process, sidecar, signing, and CI/CD
- [Release Files](./RELEASE_FILES.md) - Documentation of all release-related files and their roles
- [Scripts Directory](./scripts/README.md) - Organization and usage of build scripts
- [Update Pipelines](./docs/UPDATE_PIPELINES.md) - Dev and production update workflows
- [Testing Guide](./docs/TESTING_GUIDE.md) - How to test the application
- [Architecture](./docs/STATE_MACHINE.md) - Application state machine and architecture

### Application Store

The application includes a built-in store for discovering and installing apps:

- **Discover Apps**: Browse apps from Hugging Face Spaces tagged with `reachy_mini`
- **Install & Manage**: Install, uninstall, start, and stop apps with a simple interface
- **Search & Filter**: Find apps by name or filter by categories
- **Create Apps**: Access tutorials to learn how to build your own Reachy Mini applications

Apps are managed through the FastAPI daemon API, which handles installation and execution.

## 🛠️ Development

### Available Scripts

**Development:**
```bash
yarn dev                    # Start Vite dev server only
yarn tauri:dev              # Run Tauri app in dev mode
```

**Building:**
```bash
# Build sidecar (required before tauri:build)
yarn build:sidecar-macos              # macOS (PyPI)
yarn build:sidecar-linux              # Linux (PyPI)
yarn build:sidecar-windows            # Windows (PyPI)

# Build sidecar with specific branch
yarn build:sidecar-macos:develop      # macOS with develop branch
yarn build:sidecar-macos:main         # macOS with main branch
yarn build:sidecar:branch             # Interactive branch selection

# Build application
yarn tauri:build                      # Build production bundle

# Build web dashboard (for daemon)
yarn build:web                        # Build web version
yarn deploy:daemon-v2                 # Deploy to daemon dashboard
```

**Updates:**
```bash
yarn build:update:dev       # Build update files for local testing
yarn build:update:prod      # Build update files for production
yarn serve:updates          # Serve updates locally for testing
```

**Testing:**
```bash
yarn test:sidecar           # Test the sidecar build
yarn test:app               # Test the complete application
yarn test:updater           # Test the update system
yarn test:update-prod       # Test production updates
yarn test:all               # Run all tests
```

**Utilities:**
```bash
yarn check-daemon           # Check daemon status and health
yarn kill-daemon            # Stop all running daemon processes
yarn kill-zombie-apps       # Kill zombie app processes
yarn reset-permissions      # Reset macOS permissions (dev)
yarn clean                  # Clean build artifacts
```

### Project Structure

```
tauri-app/
├── src/                              # Frontend React code
│   ├── components/                   # Reusable React components
│   │   ├── viewer3d/                # 3D robot visualization (README.md)
│   │   ├── emoji-grid/              # Emotion wheel and emoji display
│   │   ├── App.jsx                  # Main application component
│   │   ├── AppTopBar.jsx            # Top bar with controls
│   │   └── FullscreenOverlay.jsx    # Overlay component
│   ├── hooks/                        # Custom React hooks (organized by domain)
│   │   ├── daemon/                  # Daemon lifecycle hooks
│   │   │   ├── useDaemon.js         # Start/stop daemon
│   │   │   ├── useDaemonHealthCheck.js  # Health monitoring
│   │   │   └── useDaemonEventBus.js # Event bus for daemon events
│   │   ├── robot/                   # Robot state hooks
│   │   │   ├── useRobotState.js     # Robot state polling
│   │   │   └── useRobotCommands.js  # Robot command execution
│   │   └── system/                  # System hooks
│   │       ├── useUpdater.js        # Auto-update management
│   │       ├── useUsbDetection.js   # USB robot detection
│   │       ├── usePermissions.js    # macOS permissions
│   │       ├── useViewRouter.jsx    # View state machine
│   │       └── useWindowResize.js   # Window size management
│   ├── views/                        # Main application views
│   │   ├── update/                  # Update view
│   │   ├── permissions-required/    # Permissions view (macOS)
│   │   ├── robot-not-detected/      # USB detection view
│   │   ├── ready-to-start/          # Ready to start view
│   │   ├── starting/                # Hardware scan view
│   │   ├── transition/              # Transition view
│   │   ├── closing/                 # Closing view
│   │   └── active-robot/            # Active robot view
│   │       ├── application-store/   # App store (README.md)
│   │       ├── controller/          # Robot controller (README.md)
│   │       ├── audio/               # Audio controls
│   │       ├── camera/              # Camera feed
│   │       ├── right-panel/         # Right panel sections
│   │       └── context/             # Active robot context
│   ├── store/                        # State management (Zustand)
│   │   ├── useAppStore.js           # Composite store
│   │   ├── useRobotStore.js         # Robot state
│   │   ├── useLogsStore.js          # Logs management
│   │   └── useUIStore.js            # UI state
│   ├── utils/                        # Utility functions
│   ├── config/                       # Centralized configuration
│   └── constants/                    # Shared constants
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── lib.rs                   # Main entry point
│   │   ├── daemon/                  # Daemon management
│   │   ├── usb/                     # USB detection
│   │   ├── permissions/             # macOS permissions
│   │   ├── signing/                 # Code signing
│   │   ├── python/                  # Python environment
│   │   └── window/                  # Window management
│   ├── tauri.conf.json              # Tauri configuration
│   └── capabilities/                # Security capabilities
├── scripts/                          # Build and utility scripts (README.md)
│   ├── build/                       # Build scripts
│   ├── signing/                     # Code signing scripts
│   ├── test/                        # Test scripts
│   ├── daemon/                      # Daemon management
│   └── utils/                       # Utility scripts
├── uv-wrapper/                       # UV wrapper (Rust) for Python
└── docs/                             # Additional documentation
```

### Module Documentation

Each major module has its own README with detailed documentation:

| Module | Path | Description |
|--------|------|-------------|
| **Viewer 3D** | [`src/components/viewer3d/README.md`](./src/components/viewer3d/README.md) | 3D visualization, X-ray effects, WebSocket |
| **Application Store** | [`src/views/active-robot/application-store/README.md`](./src/views/active-robot/application-store/README.md) | App discovery, installation, management |
| **Controller** | [`src/views/active-robot/controller/README.md`](./src/views/active-robot/controller/README.md) | Robot position control, joysticks, sliders |
| **Installation** | [`src/views/active-robot/application-store/hooks/installation/README.md`](./src/views/active-robot/application-store/hooks/installation/README.md) | Installation lifecycle and polling |
| **Scripts** | [`scripts/README.md`](./scripts/README.md) | Build, test, and utility scripts |
| **DMG Assets** | [`src-tauri/dmg-assets/README.md`](./src-tauri/dmg-assets/README.md) | macOS DMG customization guide |
| **Updates** | [`docs/README.md`](./docs/README.md) | Update system documentation |

### Architecture Overview

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React)"]
        App["App.jsx"]
        ViewRouter["useViewRouter"]
        Views["Views"]
        Store["Zustand Store"]
        Hooks["Custom Hooks"]
    end
    
    subgraph Backend["Backend (Tauri/Rust)"]
        Commands["Tauri Commands"]
        Modules["Rust Modules<br/>(daemon, usb, permissions)"]
    end
    
    subgraph Sidecar["Python Sidecar"]
        UV["UV Wrapper"]
        Daemon["FastAPI Daemon<br/>:8000"]
    end
    
    subgraph External["External"]
        HF["Hugging Face Spaces"]
        GH["GitHub Pages<br/>(Updates)"]
    end
    
    subgraph Hardware["Hardware"]
        Robot["Reachy Mini"]
    end
    
    App --> ViewRouter
    ViewRouter --> Views
    Views --> Hooks
    Hooks --> Store
    
    Hooks <-->|IPC| Commands
    Commands --> Modules
    Modules --> UV
    UV --> Daemon
    
    Hooks <-->|REST API| Daemon
    Daemon <-->|Serial| Robot
    
    Hooks -.-> HF
    Hooks -.-> GH
```

**Key Architecture Points:**
- **Hooks** are organized by domain (daemon, robot, system) for better maintainability
- **Views** are organized in dedicated folders with their associated components
- **Store** uses a composite pattern with specialized sub-stores
- **Config** centralizes all configuration constants (timeouts, intervals, etc.)
- See [CONVENTIONS.md](./CONVENTIONS.md) for detailed coding standards and conventions

### View Router State Machine

The application uses a priority-based view router that determines which screen to display based on the current state:

```mermaid
stateDiagram-v2
    [*] --> PermissionsCheck: App Launch
    
    PermissionsCheck --> UpdateView: Permissions OK
    PermissionsCheck --> PermissionsRequired: Missing Permissions
    PermissionsRequired --> Restarting: Permissions Granted
    Restarting --> [*]: Relaunch App
    
    UpdateView --> CheckingUpdate: Auto Check
    CheckingUpdate --> DownloadingUpdate: Update Available
    CheckingUpdate --> USBCheck: No Update / Error
    DownloadingUpdate --> Installing: Download Complete
    Installing --> [*]: Restart Required
    
    USBCheck --> FindingRobot: No USB
    USBCheck --> ReadyToStart: USB Connected
    FindingRobot --> ReadyToStart: USB Connected
    
    ReadyToStart --> Starting: User Clicks Start
    Starting --> HardwareScan: Daemon Starting
    HardwareScan --> HardwareError: Error Detected
    HardwareError --> ReadyToStart: User Retry
    HardwareScan --> Transition: Scan Complete
    
    Transition --> ActiveRobot: Window Resized
    ActiveRobot --> Closing: User Stops
    ActiveRobot --> FindingRobot: USB Disconnected
    
    Closing --> ReadyToStart: Daemon Stopped
    Closing --> FindingRobot: USB Gone
```

**Priority order (highest to lowest):**
1. 🔐 **Permissions** (macOS only) - Blocks until camera/microphone granted
2. 🔄 **Update** - Check and download updates
3. 🔌 **USB Check** - Detect robot connection
4. ⏳ **Ready to Start** - Robot connected, waiting for user
5. 🔍 **Starting** - Hardware scan animation
6. ✨ **Transition** - Window resize animation
7. 🛑 **Closing** - Shutdown sequence
8. 🤖 **Active Robot** - Full control interface

## 🔄 Updates

The application includes automatic update functionality:

- **Automatic Updates**: Checks for updates on startup and periodically (every hour)
- **Development**: Test updates locally with `yarn build:update:dev` and `yarn serve:updates`
- **Production**: Updates are automatically built, signed, and deployed to GitHub Pages via GitHub Actions
- **Update Endpoint**: `https://pollen-robotics.github.io/reachy-mini-desktop-app/latest.json`

See [UPDATE_PIPELINES.md](./docs/UPDATE_PIPELINES.md) for detailed information.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Framework for building desktop apps
- [React](https://react.dev/) - UI library
- [Material-UI](https://mui.com/) - Component library
- [Reachy Mini](https://www.pollen-robotics.com/reachy-mini/) - The robot this app controls

---

Made with ❤️ for the Reachy Mini community
