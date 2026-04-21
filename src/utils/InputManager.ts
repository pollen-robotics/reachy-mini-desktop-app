import React from 'react';
import { INPUT_DEVICE_TYPES, type InputDeviceType } from './navigationConstants';
import { PROGRESSIVE_INCREMENT, TIMING } from './inputConstants';
import { telemetry } from './telemetry';

export interface RawInputState {
  // Movement
  moveForward: number;
  moveRight: number;
  moveUp: number;
  // Rotation
  lookHorizontal: number;
  lookVertical: number;
  roll: number;
  // Body rotation
  bodyYaw: number;
  // Antennas
  antennaLeft: number;
  antennaRight: number;
  // Actions
  toggleMode: boolean;
  nextPosition: boolean;
  action1: boolean;
  action2: boolean;
  interact: boolean;
  returnHome: boolean;
}

export interface InputManagerConfig {
  deadzone: number;
  keyboardSensitivity: number;
  keyboardMovementMultiplier: number;
  keyboardLookMultiplier: number;
}

interface ProgressiveIncrement {
  value: number;
  holdTime: number;
  isHolding: boolean;
}

type InputListener = (inputs: RawInputState) => void;
type DeviceChangeListener = (device: InputDeviceType | null) => void;

const BIPOLAR_AXES = [
  'moveForward',
  'moveRight',
  'moveUp',
  'lookHorizontal',
  'lookVertical',
  'roll',
  'bodyYaw',
] as const satisfies ReadonlyArray<keyof RawInputState>;

const UNIPOLAR_AXES = ['antennaLeft', 'antennaRight'] as const satisfies ReadonlyArray<
  keyof RawInputState
>;

const BUTTON_KEYS = [
  'toggleMode',
  'nextPosition',
  'action1',
  'action2',
  'interact',
  'returnHome',
] as const satisfies ReadonlyArray<keyof RawInputState>;

const clamp01 = (value: number, min: number): number => Math.max(min, Math.min(1, value));

const createEmptyInputs = (): RawInputState => {
  const base: Record<string, number | boolean> = {};
  for (const axis of BIPOLAR_AXES) base[axis] = 0;
  for (const axis of UNIPOLAR_AXES) base[axis] = 0;
  for (const button of BUTTON_KEYS) base[button] = false;
  return base as unknown as RawInputState;
};

const resetInputObject = (obj: RawInputState): void => {
  for (const axis of BIPOLAR_AXES) obj[axis] = 0;
  for (const axis of UNIPOLAR_AXES) obj[axis] = 0;
  for (const button of BUTTON_KEYS) obj[button] = false;
};

interface ProgressiveBounds {
  initial: number;
  frameStep: number;
  max: number;
}

const DEFAULT_PROGRESSIVE_BOUNDS: ProgressiveBounds = {
  initial: PROGRESSIVE_INCREMENT.INITIAL_MAGNITUDE,
  frameStep: PROGRESSIVE_INCREMENT.FRAME_STEP,
  max: PROGRESSIVE_INCREMENT.MAX_MAGNITUDE,
};

/**
 * Advance the held-button state machine for one frame and return the output value.
 * Mutates `state` in-place.
 */
/**
 * Read a D-pad direction (-1, 0, 1) from a gamepad by comparing two button indices.
 */
function readDpadDirection(
  gamepad: Gamepad,
  positiveIndex: number,
  negativeIndex: number
): -1 | 0 | 1 {
  const positive = gamepad.buttons[positiveIndex]?.pressed || false;
  const negative = gamepad.buttons[negativeIndex]?.pressed || false;
  if (positive && !negative) return 1;
  if (negative && !positive) return -1;
  return 0;
}

function tickProgressive(
  state: ProgressiveIncrement,
  direction: -1 | 0 | 1,
  bounds: ProgressiveBounds = DEFAULT_PROGRESSIVE_BOUNDS
): number {
  if (direction === 0) {
    state.value = 0;
    state.isHolding = false;
    state.holdTime = 0;
    return 0;
  }

  if (!state.isHolding) {
    state.value = direction * bounds.initial;
    state.isHolding = true;
    state.holdTime = Date.now();
    return state.value;
  }

  const next = state.value + bounds.frameStep * direction;
  state.value = direction > 0 ? Math.min(next, bounds.max) : Math.max(next, -bounds.max);
  return state.value;
}

/** Unified input management class (keyboard and gamepad). */
export class InputManager {
  inputs: RawInputState;
  keyboardInputs: RawInputState;
  gamepadInputs: RawInputState;
  config: InputManagerConfig;

  keysPressed: Record<string, boolean>;
  previousButtonStates: Record<string, boolean | undefined>;
  listeners: InputListener[];
  gamepadConnected: boolean;
  rafId: number | null;
  lastNotificationTime: number;

  debugEnabled: boolean;
  lastButtonStates: Record<string, boolean>;
  lastInputValues: Record<string, number>;

  progressiveIncrement: {
    bodyYaw: ProgressiveIncrement;
    moveUp: ProgressiveIncrement;
  };

  activeDevice: InputDeviceType | null;
  lastInputTime: Record<InputDeviceType, number>;
  deviceSwitchThreshold: number;

  deviceChangeListeners?: DeviceChangeListener[];

  constructor() {
    this.inputs = createEmptyInputs();
    this.keyboardInputs = createEmptyInputs();
    this.gamepadInputs = createEmptyInputs();

    this.config = {
      deadzone: 0.05,
      keyboardSensitivity: 1.5,
      keyboardMovementMultiplier: 1.0,
      keyboardLookMultiplier: 1.8,
    };

    this.keysPressed = {};
    this.previousButtonStates = {};
    this.listeners = [];
    this.gamepadConnected = false;
    this.rafId = null;
    this.lastNotificationTime = 0;

    this.debugEnabled = false;
    this.lastButtonStates = {};
    this.lastInputValues = {};

    this.progressiveIncrement = {
      bodyYaw: { value: 0, holdTime: 0, isHolding: false },
      moveUp: { value: 0, holdTime: 0, isHolding: false },
    };

    // Default to no device (keyboard mode disabled) - will switch to gamepad when detected
    this.activeDevice = null;
    this.lastInputTime = {
      [INPUT_DEVICE_TYPES.KEYBOARD]: 0,
      [INPUT_DEVICE_TYPES.GAMEPAD]: 0,
    };
    this.deviceSwitchThreshold = 100;

    this.bindEvents();
  }

  validateAxisValue(value: number | undefined | null): number {
    if (value == null || !isFinite(value)) {
      return 0;
    }
    return Math.max(-1, Math.min(1, value));
  }

  applyDeadzone(value: number): number {
    const absValue = Math.abs(value);
    if (absValue <= this.config.deadzone) {
      // Smooth fade-out near deadzone instead of hard cutoff
      const fadeFactor = absValue / this.config.deadzone;
      return value * fadeFactor;
    }
    return value;
  }

  /**
   * Apply exponential response curve to camera movements. Currently linear:
   * the curve was disabled because it produced a "magnet" effect at certain
   * values.
   */
  applyLookCurve(value: number): number {
    return this.applyDeadzone(value);
  }

  /** Get currently active device. Returns `null` when keyboard-only. */
  getActiveDevice(): InputDeviceType | null {
    return this.activeDevice === INPUT_DEVICE_TYPES.GAMEPAD ? INPUT_DEVICE_TYPES.GAMEPAD : null;
  }

  updateActiveDevice(deviceType: InputDeviceType): void {
    const now = Date.now();
    this.lastInputTime[deviceType] = now;

    if (this.activeDevice !== deviceType) {
      const lastActive = this.activeDevice ? this.lastInputTime[this.activeDevice] : 0;
      const timeSinceLastActiveInput = now - lastActive;

      if (timeSinceLastActiveInput > this.deviceSwitchThreshold) {
        this.activeDevice = deviceType;
        this.notifyDeviceChange(deviceType);
      }
    }
  }

  addDeviceChangeListener(callback: DeviceChangeListener): () => void {
    if (!this.deviceChangeListeners) {
      this.deviceChangeListeners = [];
    }

    this.deviceChangeListeners.push(callback);
    return () => {
      this.deviceChangeListeners = this.deviceChangeListeners?.filter(cb => cb !== callback);
    };
  }

  notifyDeviceChange(newDevice: InputDeviceType | null): void {
    if (this.deviceChangeListeners) {
      for (const listener of this.deviceChangeListeners) {
        listener(newDevice);
      }
    }

    if (newDevice === INPUT_DEVICE_TYPES.GAMEPAD) {
      telemetry.controllerUsed({ control: 'gamepad' });
    } else if (newDevice === INPUT_DEVICE_TYPES.KEYBOARD) {
      telemetry.controllerUsed({ control: 'keyboard' });
    }
  }

  addListener(callback: InputListener): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /** Notify all listeners of input update (throttled for performance). */
  notifyListeners(): void {
    const now = Date.now();

    if (now - this.lastNotificationTime < TIMING.NOTIFICATION_THROTTLE) {
      return;
    }

    this.lastNotificationTime = now;

    for (const listener of this.listeners) {
      listener({ ...this.inputs });
    }
  }

  combineInputs(): void {
    for (const axis of BIPOLAR_AXES) {
      this.inputs[axis] = clamp01(this.keyboardInputs[axis] + this.gamepadInputs[axis], -1);
    }
    for (const axis of UNIPOLAR_AXES) {
      this.inputs[axis] = clamp01(this.keyboardInputs[axis] + this.gamepadInputs[axis], 0);
    }
    for (const button of BUTTON_KEYS) {
      this.inputs[button] = this.keyboardInputs[button] || this.gamepadInputs[button];
    }
  }

  bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    this.startGamepadPolling();
  }

  unbindEvents(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Keyboard event handling. Keyboard movement is currently disabled (only
   * special action bindings remain active for future implementation).
   */
  handleKeyDown = (event: KeyboardEvent): void => {
    this.keysPressed[event.code] = true;

    if (event.code === 'Tab') {
      event.preventDefault();
      this.keyboardInputs.toggleMode = true;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!this.keyboardInputs.nextPosition) {
        this.keyboardInputs.nextPosition = true;
      }
    }

    if (event.code === 'KeyT') {
      if (!this.keyboardInputs.interact) {
        this.keyboardInputs.interact = true;
      }
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      if (!this.keyboardInputs.returnHome) {
        this.keyboardInputs.returnHome = true;
      }
    }

    this.processKeyboardInput();
    this.combineInputs();
    this.notifyListeners();
  };

  handleKeyUp = (event: KeyboardEvent): void => {
    this.keysPressed[event.code] = false;

    if (event.code === 'Tab') {
      this.keyboardInputs.toggleMode = false;
    }
    if (event.code === 'Space') {
      this.releaseKeyboardButtonLater('nextPosition');
    }
    if (event.code === 'KeyT') {
      this.releaseKeyboardButtonLater('interact');
    }
    if (event.code === 'Escape') {
      this.releaseKeyboardButtonLater('returnHome');
    }

    this.processKeyboardInput();
  };

  /**
   * Release a keyboard button key after the configured pulse delay,
   * then recombine inputs and notify listeners.
   */
  private releaseKeyboardButtonLater(key: keyof RawInputState): void {
    setTimeout(() => {
      (this.keyboardInputs[key] as boolean) = false;
      this.combineInputs();
      this.notifyListeners();
    }, TIMING.BUTTON_PULSE);
  }

  private releaseGamepadButtonLater(key: keyof RawInputState): void {
    setTimeout(() => {
      (this.gamepadInputs[key] as boolean) = false;
      this.combineInputs();
      this.notifyListeners();
    }, TIMING.BUTTON_PULSE);
  }

  /** Keyboard input processing (movement currently disabled). */
  processKeyboardInput(): void {
    this.keyboardInputs.moveForward = 0;
    this.keyboardInputs.moveRight = 0;
    this.keyboardInputs.moveUp = 0;
    this.keyboardInputs.lookHorizontal = 0;
    this.keyboardInputs.lookVertical = 0;
    this.keyboardInputs.roll = 0;
    this.keyboardInputs.bodyYaw = 0;
    this.keyboardInputs.antennaLeft = 0;
    this.keyboardInputs.antennaRight = 0;

    this.combineInputs();
    this.notifyListeners();
  }

  handleGamepadConnected = (_event: Event): void => {
    this.gamepadConnected = true;
  };

  handleGamepadDisconnected = (_event: Event): void => {
    this.gamepadConnected = false;
    this.resetGamepadInputs();
    this.combineInputs();
    this.notifyListeners();
  };

  startGamepadPolling(): void {
    const poll = (): void => {
      this.pollGamepad();
      this.rafId = requestAnimationFrame(poll);
    };
    this.rafId = requestAnimationFrame(poll);
  }

  pollGamepad(): void {
    try {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gamepad = gamepads[0];

      if (!gamepad) {
        if (this.gamepadConnected) {
          this.gamepadConnected = false;
          this.resetGamepadInputs();
          this.combineInputs();
          this.notifyListeners();
        }
        return;
      }

      if (!gamepad.axes || !Array.isArray(gamepad.axes)) {
        return;
      }

      if (!this.gamepadConnected) {
        this.gamepadConnected = true;
      }

      const hasGamepadInput =
        Math.abs(gamepad.axes[0]) > this.config.deadzone ||
        Math.abs(gamepad.axes[1]) > this.config.deadzone ||
        Math.abs(gamepad.axes[2]) > this.config.deadzone ||
        Math.abs(gamepad.axes[3]) > this.config.deadzone ||
        gamepad.buttons.some(button => button.pressed);

      if (hasGamepadInput) {
        this.updateActiveDevice(INPUT_DEVICE_TYPES.GAMEPAD);
      }

      // Movements (left stick)
      const leftStickXValue = this.validateAxisValue(gamepad.axes[0]);
      const leftStickYValue = this.validateAxisValue(gamepad.axes[1]);
      const leftStickX = this.applyDeadzone(leftStickXValue);
      const leftStickY = this.applyDeadzone(leftStickYValue);
      this.gamepadInputs.moveRight = leftStickX;
      this.gamepadInputs.moveForward = -leftStickY;

      // D-pad Up/Down -> Z position with progressive increment
      const moveUpDirection = readDpadDirection(gamepad, /*positive*/ 12, /*negative*/ 13);
      this.gamepadInputs.moveUp = tickProgressive(
        this.progressiveIncrement.moveUp,
        moveUpDirection
      );

      // D-pad Left/Right -> body yaw with progressive increment
      const bodyYawDirection = readDpadDirection(gamepad, /*positive*/ 15, /*negative*/ 14);
      this.gamepadInputs.bodyYaw = tickProgressive(
        this.progressiveIncrement.bodyYaw,
        bodyYawDirection
      );

      // Antennas: L1/R1 bumpers (analog buttons)
      this.gamepadInputs.antennaLeft = gamepad.buttons[6]?.value || 0;
      this.gamepadInputs.antennaRight = gamepad.buttons[7]?.value || 0;

      // Camera rotation (right stick)
      const rightStickXValue = this.validateAxisValue(gamepad.axes[2]);
      const rightStickYValue = this.validateAxisValue(gamepad.axes[3]);
      this.gamepadInputs.lookHorizontal = this.applyLookCurve(rightStickXValue);
      this.gamepadInputs.lookVertical = -this.applyLookCurve(rightStickYValue);

      if (this.debugEnabled) {
        const dpadButtons = [12, 13, 14, 15];
        dpadButtons.forEach(index => {
          const isPressed = gamepad.buttons[index]?.pressed || false;
          const lastState = this.lastButtonStates[`dpad_${index}`];
          if (isPressed !== lastState) {
            this.lastButtonStates[`dpad_${index}`] = isPressed;
          }
        });

        [6, 7].forEach(index => {
          const value = gamepad.buttons[index]?.value || 0;
          this.lastInputValues[`bumper_${index}`] = value;
        });

        [0, 1, 2, 3].forEach(index => {
          const isPressed = gamepad.buttons[index]?.pressed || false;
          const lastState = this.lastButtonStates[`action_${index}`];
          if (isPressed !== Boolean(lastState)) {
            this.lastButtonStates[`action_${index}`] = isPressed;
          }
        });

        const sticks: Array<{ axes: [number, number]; name: string }> = [
          { axes: [0, 1], name: 'Left Stick' },
          { axes: [2, 3], name: 'Right Stick' },
        ];

        sticks.forEach(({ axes, name }) => {
          const x = gamepad.axes[axes[0]] || 0;
          const y = gamepad.axes[axes[1]] || 0;
          const magnitude = Math.sqrt(x * x + y * y);
          const lastMagnitude = this.lastInputValues[`stick_${name}`] || 0;

          if (
            (magnitude > this.config.deadzone && lastMagnitude <= this.config.deadzone) ||
            (magnitude <= this.config.deadzone && lastMagnitude > this.config.deadzone)
          ) {
            this.lastInputValues[`stick_${name}`] = magnitude;
          }
        });
      }

      this.gamepadInputs.roll = 0;

      // Mode toggle (Y / triangle)
      if (gamepad.buttons[3]?.pressed && !this.previousButtonStates.mode) {
        this.gamepadInputs.toggleMode = true;
      } else {
        this.gamepadInputs.toggleMode = false;
      }
      this.previousButtonStates.mode = gamepad.buttons[3]?.pressed;

      // Next position (X)
      if (gamepad.buttons[2]?.pressed && !this.previousButtonStates.nextPosition) {
        this.gamepadInputs.nextPosition = true;
        this.releaseGamepadButtonLater('nextPosition');
      }
      this.previousButtonStates.nextPosition = gamepad.buttons[2]?.pressed;

      // Interact (A / cross)
      if (gamepad.buttons[0]?.pressed && !this.previousButtonStates.interact) {
        this.gamepadInputs.interact = true;
      } else {
        this.gamepadInputs.interact = false;
      }
      this.previousButtonStates.interact = gamepad.buttons[0]?.pressed;

      // Return home (B / circle)
      if (gamepad.buttons[1]?.pressed && !this.previousButtonStates.returnHome) {
        this.gamepadInputs.returnHome = true;
        this.releaseGamepadButtonLater('returnHome');
      }
      this.previousButtonStates.returnHome = gamepad.buttons[1]?.pressed;

      this.gamepadInputs.action2 = gamepad.buttons[3]?.pressed || false;

      this.combineInputs();
      this.notifyListeners();
    } catch (error) {
      console.error('Error in pollGamepad:', error);
      this.resetGamepadInputs();
      this.combineInputs();
      this.notifyListeners();
    }
  }

  resetGamepadInputs(): void {
    resetInputObject(this.gamepadInputs);
  }

  resetKeyboardInputs(): void {
    resetInputObject(this.keyboardInputs);
  }

  resetInputs(): void {
    this.resetGamepadInputs();
    this.resetKeyboardInputs();
    this.combineInputs();
  }

  updateConfig(newConfig: Partial<InputManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (!enabled) {
      this.lastButtonStates = {};
      this.lastInputValues = {};
    }
  }

  dispose(): void {
    this.unbindEvents();
    this.listeners = [];
    this.lastButtonStates = {};
    this.lastInputValues = {};
  }

  isGamepadConnected(): boolean {
    return this.gamepadConnected;
  }

  triggerNextPositionAction(): void {
    this.triggerKeyboardPulse('nextPosition');
  }

  triggerInteractAction(): void {
    this.triggerKeyboardPulse('interact');
  }

  /**
   * Reset all inputs, set a keyboard button to pressed, notify, then release
   * the button after the standard pulse delay.
   */
  private triggerKeyboardPulse(key: keyof RawInputState): void {
    this.resetInputs();
    (this.keyboardInputs[key] as boolean) = true;
    this.combineInputs();
    this.notifyListeners();
    this.releaseKeyboardButtonLater(key);
  }

  /**
   * Vibrate gamepad (when connected). Returns the underlying promise, or
   * `null` if no controller is available / haptics are unsupported.
   */
  vibrateGamepad(
    duration = 200,
    weakMagnitude = 0.5,
    strongMagnitude = 0.8
  ): Promise<unknown> | null {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gamepad = gamepads[0];

    if (!gamepad || !this.gamepadConnected) {
      return null;
    }

    const actuator = (gamepad as Gamepad & { vibrationActuator?: GamepadHapticActuator })
      .vibrationActuator;
    if (
      actuator &&
      typeof (actuator as GamepadHapticActuator & { playEffect?: unknown }).playEffect ===
        'function'
    ) {
      return (
        actuator as GamepadHapticActuator & {
          playEffect: (
            type: string,
            params: {
              startDelay: number;
              duration: number;
              weakMagnitude: number;
              strongMagnitude: number;
            }
          ) => Promise<unknown>;
        }
      ).playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude,
        strongMagnitude,
      });
    }

    const hapticActuators = (
      gamepad as Gamepad & {
        hapticActuators?: Array<{ pulse: (value: number, duration: number) => Promise<unknown> }>;
      }
    ).hapticActuators;
    if (hapticActuators && hapticActuators.length > 0) {
      return hapticActuators[0].pulse(strongMagnitude, duration);
    }

    return null;
  }
}

let inputManagerInstance: InputManager | null = null;

export const getInputManager = (): InputManager => {
  if (!inputManagerInstance) {
    inputManagerInstance = new InputManager();
  }
  return inputManagerInstance;
};

/** React hook to use input manager in components. */
export const useInputs = (): RawInputState => {
  const [inputs, setInputs] = React.useState<RawInputState>(getInputManager().inputs);

  React.useEffect(() => {
    const unsubscribe = getInputManager().addListener(newInputs => {
      setInputs({ ...newInputs });
    });
    return unsubscribe;
  }, []);

  return inputs;
};

/** React hook to get active device information. */
export const useActiveDevice = (): InputDeviceType | null => {
  const [activeDevice, setActiveDevice] = React.useState<InputDeviceType | null>(
    getInputManager().getActiveDevice()
  );

  React.useEffect(() => {
    const inputManager = getInputManager();

    const unsubscribe = inputManager.addDeviceChangeListener(newDevice => {
      setActiveDevice(newDevice);
    });

    setActiveDevice(inputManager.getActiveDevice());

    return unsubscribe;
  }, []);

  return activeDevice;
};

/**
 * React hook to check whether a gamepad is connected. Pauses polling when the
 * window is hidden.
 */
export const useGamepadConnected = (): boolean => {
  const [isConnected, setIsConnected] = React.useState<boolean>(
    getInputManager().isGamepadConnected()
  );
  const [isVisible, setIsVisible] = React.useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  React.useEffect(() => {
    const handler = (): void => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  React.useEffect(() => {
    if (!isVisible) return;

    const inputManager = getInputManager();
    setIsConnected(inputManager.isGamepadConnected());

    const checkInterval = setInterval(() => {
      setIsConnected(inputManager.isGamepadConnected());
    }, TIMING.GAMEPAD_CONNECTION_POLL);

    return () => clearInterval(checkInterval);
  }, [isVisible]);

  return isConnected;
};
