/**
 * WebdriverIO Configuration for Tauri v2 E2E Testing
 *
 * Supports all three platforms:
 * - Linux: Uses WebKitWebDriver via tauri-driver
 * - Windows: Uses MSEdgeDriver via tauri-driver
 * - macOS: Uses CrabNebula WebDriver (requires CN_API_KEY)
 *
 * Based on official Tauri v2 documentation:
 * https://v2.tauri.app/develop/tests/webdriver/example/webdriverio/
 *
 * CrabNebula integration:
 * https://www.npmjs.com/package/@crabnebula/tauri-driver
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Detect platform
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const isMacOS = process.platform === 'darwin';

/**
 * Get the path to the installed application
 * Can be overridden via E2E_APP_BINARY environment variable
 */
function getAppBinary() {
  // Allow override via environment variable (useful for CI)
  if (process.env.E2E_APP_BINARY) {
    console.log(`📍 Using E2E_APP_BINARY from env: ${process.env.E2E_APP_BINARY}`);
    return process.env.E2E_APP_BINARY;
  }

  if (isWindows) {
    // Windows: Installed via MSI to Program Files
    return 'C:\\Program Files\\Reachy Mini Control\\Reachy Mini Control.exe';
  } else if (isLinux) {
    // Linux: Installed via .deb to /usr/bin
    return '/usr/bin/reachy-mini-control';
  } else if (isMacOS) {
    // macOS: Use .app bundle (CrabNebula supports both .app and binary)
    // In CI, this will be overridden via E2E_APP_BINARY
    return '/Applications/Reachy Mini Control.app';
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Get the path to tauri-driver executable
 * On macOS with CrabNebula, we use @crabnebula/tauri-driver npm package
 */
function getTauriDriverPath() {
  if (isMacOS) {
    // On macOS, use the npm package's binary
    // It will be resolved by npx or node_modules/.bin
    return path.join(__dirname, '..', 'node_modules', '.bin', 'tauri-driver');
  }
  
  // Linux/Windows: use cargo-installed tauri-driver
  const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
  const binName = isWindows ? 'tauri-driver.exe' : 'tauri-driver';
  return path.join(cargoHome, 'bin', binName);
}

const APP_BINARY = getAppBinary();

/**
 * Windows: give msedgedriver an explicit, writable WebView2 user data folder.
 * WebView2 150+ ignores WEBVIEW2_* env vars from elevated processes (see
 * MicrosoftEdge/WebView2Feedback#5645), so in elevated CI the folder must
 * ALSO be forced on the app via the HKLM WebView2 loader policy, using the
 * same path. E2E_WV2_UDF carries that shared path; the CI step sets both.
 */
function getWindowsWebviewOptions() {
  const userDataFolder = process.env.E2E_WV2_UDF || path.join(os.tmpdir(), 'reachy-e2e-webview2');
  fs.mkdirSync(userDataFolder, { recursive: true });
  console.log(`📁 WebView2 user data folder: ${userDataFolder}`);
  return { userDataFolder };
}

// Keep track of child processes
let tauriDriver;
let testRunnerBackend;
let exit = false;

export const config = {
  //
  // ====================
  // Runner Configuration
  // ====================
  host: '127.0.0.1',
  port: 4444,
  runner: 'local',

  //
  // ==================
  // Specify Test Files
  // ==================
  specs: [path.join(__dirname, 'specs', '**', '*.spec.js')],
  exclude: [],

  //
  // ============
  // Capabilities
  // ============
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: APP_BINARY,
        ...(isWindows && { webviewOptions: getWindowsWebviewOptions() }),
      },
    },
  ],

  //
  // ===================
  // Test Configurations
  // ===================
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  //
  // ==============
  // Test Framework
  // ==============
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  //
  // =====
  // Hooks
  // =====

  /**
   * Runs once before all workers start
   * On macOS, start the CrabNebula test-runner-backend
   */
  onPrepare: async () => {
    if (isMacOS) {
      // Verify CN_API_KEY is set (required for CrabNebula WebDriver)
      if (!process.env.CN_API_KEY) {
        console.error('❌ CN_API_KEY is not set!');
        console.error('   CrabNebula API key is required for macOS E2E testing.');
        console.error('   Get one at: https://crabnebula.cloud');
        process.exit(1);
      }

      console.log('🍎 macOS detected - starting CrabNebula test-runner-backend...');

      // Start the test-runner-backend for macOS
      const testRunnerPath = path.join(
        __dirname,
        '..',
        'node_modules',
        '.bin',
        'test-runner-backend'
      );

      testRunnerBackend = spawn(testRunnerPath, [], {
        stdio: 'inherit',
        env: {
          ...process.env,
        },
      });

      testRunnerBackend.on('error', (error) => {
        console.error('❌ test-runner-backend error:', error);
        process.exit(1);
      });

      testRunnerBackend.on('exit', (code) => {
        if (!exit) {
          console.error('❌ test-runner-backend exited unexpectedly with code:', code);
          process.exit(1);
        }
      });

      // Wait for test-runner-backend to be ready
      console.log('⏳ Waiting for test-runner-backend to start...');
      const { waitTestRunnerBackendReady } = await import(
        '@crabnebula/test-runner-backend'
      );
      await waitTestRunnerBackendReady();
      console.log('✅ test-runner-backend is ready');

      // Set the remote WebDriver URL for tauri-driver to connect to
      process.env.REMOTE_WEBDRIVER_URL = 'http://127.0.0.1:3000';
    }
  },

  /**
   * Start tauri-driver before each session
   */
  beforeSession: async () => {
    const tauriDriverPath = getTauriDriverPath();

    console.log('🚀 Starting tauri-driver...');
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Path: ${tauriDriverPath}`);
    console.log(`   App: ${APP_BINARY}`);

    if (isMacOS) {
      console.log(`   Mode: CrabNebula WebDriver (REMOTE_WEBDRIVER_URL: ${process.env.REMOTE_WEBDRIVER_URL})`);
      
      // On macOS, use the CrabNebula tauri-driver
      const { waitTauriDriverReady } = await import('@crabnebula/tauri-driver');

      tauriDriver = spawn(tauriDriverPath, [], {
        stdio: [null, process.stdout, process.stderr],
        env: {
          ...process.env,
        },
      });

      tauriDriver.on('error', (error) => {
        console.error('❌ tauri-driver error:', error);
        process.exit(1);
      });

      tauriDriver.on('exit', (code) => {
        if (!exit) {
          console.error('❌ tauri-driver exited with code:', code);
          process.exit(1);
        }
      });

      // Wait for tauri-driver to be ready
      await waitTauriDriverReady();
      console.log('✅ tauri-driver is ready (CrabNebula mode)');
    } else {
      // Linux/Windows: use standard tauri-driver
      tauriDriver = spawn(tauriDriverPath, [], {
        stdio: [null, process.stdout, process.stderr],
      });

      tauriDriver.on('error', (error) => {
        console.error('❌ tauri-driver error:', error);
        process.exit(1);
      });

      tauriDriver.on('exit', (code) => {
        if (!exit) {
          console.error('❌ tauri-driver exited with code:', code);
          process.exit(1);
        }
      });
    }
  },

  /**
   * Clean up tauri-driver after session ends
   */
  afterSession: () => {
    closeProcesses();
  },

  /**
   * Clean up test-runner-backend after all tests
   */
  onComplete: () => {
    closeProcesses();
  },
};

function closeProcesses() {
  exit = true;
  tauriDriver?.kill();
  testRunnerBackend?.kill();
}

function onShutdown(fn) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
  process.on('SIGBREAK', cleanup);
}

// Ensure processes are closed when the test process exits
onShutdown(() => {
  closeProcesses();
});
