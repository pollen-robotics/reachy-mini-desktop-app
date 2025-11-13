# Reachy Mini Control

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)
![Tauri](https://img.shields.io/badge/tauri-2.0-FFC131?logo=tauri&logoColor=white)

A modern desktop application for controlling and monitoring your Reachy Mini robot. Built with Tauri and React for a native, performant experience.

## ✨ Features

- 🤖 **Robot Control** - Start, stop, and monitor your Reachy Mini daemon
- 📊 **Real-time Monitoring** - Live 3D visualization of robot state
- 🔄 **Auto Updates** - Seamless automatic updates with progress tracking
- 🎨 **Modern UI** - Clean, intuitive interface built with Material-UI
- 🔌 **USB Detection** - Automatic detection of Reachy Mini via USB
- 📱 **Cross-platform** - Works on macOS and Windows

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and Yarn
- Rust (latest stable)
- System dependencies for Tauri ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Installation

```bash
# Clone the repository
git clone https://github.com/pollen-robotics/reachy-mini-control.git
cd reachy-mini-control/tauri-app

# Install dependencies
yarn install

# Run in development mode
yarn tauri:dev
```

### Building

```bash
# Build for production
yarn tauri:build

# Build for specific platform
yarn tauri build --target aarch64-apple-darwin
```

## 📖 Documentation

- [Update Pipelines](./docs/UPDATE_PIPELINES.md) - Dev and production update workflows
- [Testing Guide](./docs/TESTING_GUIDE.md) - How to test the application
- [Architecture](./docs/STATE_MACHINE.md) - Application state machine and architecture

## 🛠️ Development

### Available Scripts

```bash
yarn dev              # Start Vite dev server
yarn tauri:dev        # Run Tauri app in dev mode
yarn tauri:build      # Build production bundle
yarn build:update:dev # Build update for local testing
yarn serve:updates    # Serve updates locally for testing
```

### Project Structure

```
tauri-app/
├── src/                    # Frontend React code
│   ├── components/         # React components
│   ├── hooks/             # Custom React hooks
│   └── store/             # State management
├── src-tauri/             # Rust backend
│   ├── src/               # Rust source code
│   └── tauri.conf.json    # Tauri configuration
├── scripts/               # Build and utility scripts
└── docs/                  # Documentation
```

## 🔄 Updates

The application includes automatic update functionality:

- **Development**: Test updates locally with `yarn build:update:dev` and `yarn serve:updates`
- **Production**: Updates are automatically built and signed via GitHub Actions

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
