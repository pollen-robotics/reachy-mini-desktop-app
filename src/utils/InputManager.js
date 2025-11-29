import React from 'react';
import { INPUT_DEVICE_TYPES } from './navigationConstants';

// Unified input management class (keyboard and gamepad)
export class InputManager {
  constructor() {
    // Input state
    this.inputs = {
      // Movement
      moveForward: 0, // -1 to 1
      moveRight: 0, // -1 to 1
      moveUp: 0, // -1 to 1
      // Rotation
      lookHorizontal: 0, // -1 to 1
      lookVertical: 0, // -1 to 1
      roll: 0, // -1 to 1
      // Body rotation
      bodyYaw: 0, // -1 to 1 (for body yaw control)
      // Antennas
      antennaLeft: 0, // -1 to 1 (for left antenna control)
      antennaRight: 0, // -1 to 1 (for right antenna control)
      // Actions
      toggleMode: false,
      nextPosition: false,
      action1: false,
      action2: false,
      interact: false, // New action to interact with elements
      returnHome: false, // New action to return home
    };

    // Separate inputs for keyboard and gamepad to combine correctly
    this.keyboardInputs = { ...this.inputs };
    this.gamepadInputs = { ...this.inputs };

    // Configuration
    this.config = {
      deadzone: 0.05, // Reduced deadzone for better responsiveness (5%)
      keyboardSensitivity: 1.5,
      keyboardMovementMultiplier: 1.0,
      keyboardLookMultiplier: 1.8,
    };

    // Internal state
    this.keysPressed = {};
    this.previousButtonStates = {};
    this.listeners = [];
    this.gamepadConnected = false;
    this.rafId = null; // For requestAnimationFrame
    this.lastNotificationTime = 0; // For throttling notifications
    
    // Debug state
    this.debugEnabled = false; // Set to true to enable debug logs
    this.lastButtonStates = {}; // Store last button states to detect changes
    this.lastInputValues = {}; // Store last input values to detect significant changes
    
    // Progressive increment state for body yaw and position Z
    this.progressiveIncrement = {
      bodyYaw: { value: 0, holdTime: 0, isHolding: false },
      moveUp: { value: 0, holdTime: 0, isHolding: false },
    };

    // Active device detection
    // Default to no device (keyboard mode disabled) - will switch to gamepad when detected
    this.activeDevice = null; // No default device (keyboard mode disabled)
    this.lastInputTime = {
      [INPUT_DEVICE_TYPES.KEYBOARD]: 0,
      [INPUT_DEVICE_TYPES.GAMEPAD]: 0,
    };
    this.deviceSwitchThreshold = 100; // ms to consider a device change

    // Start event listeners
    this.bindEvents();
  }

  // Validate and sanitize axis value
  validateAxisValue(value) {
    // Handle invalid values (NaN, Infinity, null, undefined)
    if (value == null || !isFinite(value)) {
      return 0;
    }
    // Clamp to valid range [-1, 1]
    return Math.max(-1, Math.min(1, value));
  }

  // Apply deadzone to joystick values
  applyDeadzone(value) {
    const absValue = Math.abs(value);
    // Very small deadzone to allow even tiny movements
    // Use smooth transition instead of hard cutoff to prevent "snap" at deadzone boundary
    if (absValue <= this.config.deadzone) {
      // Smooth fade-out near deadzone instead of hard cutoff
      // This prevents "anchor" effect at center
      const fadeFactor = absValue / this.config.deadzone;
      return value * fadeFactor;
    }
    // Return raw value (without normalization) for better responsiveness
    // Normalization was reducing values too much
    return value;
  }

  // Apply exponential response curve to camera movements
  // This function amplifies small joystick movements for better responsiveness
  // DISABLED: Removed curve to avoid "magnet" effect on certain values
  // Using linear mapping instead for more predictable control
  applyLookCurve(value) {
    // Apply deadzone only, return raw value for linear response
    return this.applyDeadzone(value);
  }

  // Get currently active device
  getActiveDevice() {
    // Return 'gamepad' if active, null otherwise (keyboard mode disabled)
    return this.activeDevice === INPUT_DEVICE_TYPES.GAMEPAD ? INPUT_DEVICE_TYPES.GAMEPAD : null;
  }

  // Update active device based on last input
  updateActiveDevice(deviceType) {
    const now = Date.now();
    this.lastInputTime[deviceType] = now;

    // Switch active device if input is recent
    if (this.activeDevice !== deviceType) {
      const timeSinceLastActiveInput =
        now - this.lastInputTime[this.activeDevice];

      if (timeSinceLastActiveInput > this.deviceSwitchThreshold) {
        if (this.debugEnabled) {
          console.log(`🎮 Device switched: ${this.activeDevice} → ${deviceType}`);
        }
        this.activeDevice = deviceType;

        // Notify listeners of device change
        this.notifyDeviceChange(deviceType);
      }
    }
  }

  // Add listener for device changes
  addDeviceChangeListener(callback) {
    if (!this.deviceChangeListeners) {
      this.deviceChangeListeners = [];
    }

    this.deviceChangeListeners.push(callback);
    return () => {
      this.deviceChangeListeners = this.deviceChangeListeners.filter(
        (cb) => cb !== callback
      );
    };
  }

  // Notify listeners of device change
  notifyDeviceChange(newDevice) {
    if (this.deviceChangeListeners) {
      for (const listener of this.deviceChangeListeners) {
        listener(newDevice);
      }
    }
  }

  // Add listener to receive input updates
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  // Notify all listeners of input update (throttled to ~30fps for performance)
  notifyListeners() {
    const now = Date.now();
    const throttleMs = 33; // ~30fps (33ms between notifications)
    
    // Throttle notifications to avoid excessive re-renders
    if (now - this.lastNotificationTime < throttleMs) {
      return;
    }
    
    this.lastNotificationTime = now;
    
    for (const listener of this.listeners) {
      listener({ ...this.inputs });
    }
  }

  // Combine keyboard and gamepad inputs
  combineInputs() {
    // Analog inputs (addition with limit)
    this.inputs.moveForward = Math.max(
      -1,
      Math.min(
        1,
        this.keyboardInputs.moveForward + this.gamepadInputs.moveForward
      )
    );

    this.inputs.moveRight = Math.max(
      -1,
      Math.min(1, this.keyboardInputs.moveRight + this.gamepadInputs.moveRight)
    );

    this.inputs.moveUp = Math.max(
      -1,
      Math.min(1, this.keyboardInputs.moveUp + this.gamepadInputs.moveUp)
    );

    this.inputs.lookHorizontal = Math.max(
      -1,
      Math.min(
        1,
        this.keyboardInputs.lookHorizontal + this.gamepadInputs.lookHorizontal
      )
    );

    this.inputs.lookVertical = Math.max(
      -1,
      Math.min(
        1,
        this.keyboardInputs.lookVertical + this.gamepadInputs.lookVertical
      )
    );

    this.inputs.roll = Math.max(
      -1,
      Math.min(1, this.keyboardInputs.roll + this.gamepadInputs.roll)
    );

    // Body yaw (analog input)
    this.inputs.bodyYaw = Math.max(
      -1,
      Math.min(1, this.keyboardInputs.bodyYaw + this.gamepadInputs.bodyYaw)
    );

    // Antennas (analog inputs) - triggers are 0 to 1, not -1 to 1
    // Clamp to 0-1 range since triggers are always positive (0 = not pressed, 1 = fully pressed)
    this.inputs.antennaLeft = Math.max(
      0,
      Math.min(1, this.keyboardInputs.antennaLeft + this.gamepadInputs.antennaLeft)
    );
    this.inputs.antennaRight = Math.max(
      0,
      Math.min(1, this.keyboardInputs.antennaRight + this.gamepadInputs.antennaRight)
    );

    // Boolean inputs (OR combination)
    this.inputs.toggleMode =
      this.keyboardInputs.toggleMode || this.gamepadInputs.toggleMode;
    this.inputs.nextPosition =
      this.keyboardInputs.nextPosition || this.gamepadInputs.nextPosition;
    this.inputs.action1 =
      this.keyboardInputs.action1 || this.gamepadInputs.action1;
    this.inputs.action2 =
      this.keyboardInputs.action2 || this.gamepadInputs.action2;
    this.inputs.interact =
      this.keyboardInputs.interact || this.gamepadInputs.interact;
    this.inputs.returnHome =
      this.keyboardInputs.returnHome || this.gamepadInputs.returnHome;
  }

  // Set up event listeners
  bindEvents() {
    // Keyboard handling
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Gamepad event handling
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected
    );

    // Start polling loop for gamepad
    this.startGamepadPolling();
  }

  // Clean up event listeners
  unbindEvents() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected
    );

    // Cancel requestAnimationFrame if active
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // Keyboard event handling
  // DISABLED: Keyboard mode is not implemented yet - keyboard events are ignored for movement
  handleKeyDown = (event) => {
    // Do NOT update active device to KEYBOARD (keyboard mode disabled)
    // this.updateActiveDevice(INPUT_DEVICE_TYPES.KEYBOARD);
    this.keysPressed[event.code] = true;

    // Special action handling
    if (event.code === 'Tab') {
      event.preventDefault();
      this.keyboardInputs.toggleMode = true;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      // Only activate if not already activated
      if (!this.keyboardInputs.nextPosition) {
        this.keyboardInputs.nextPosition = true;
      }
    }

    // Interaction action with T key
    if (event.code === 'KeyT') {
      // Only activate if not already activated
      if (!this.keyboardInputs.interact) {
        this.keyboardInputs.interact = true;
      }
    }

    // Return home action with Escape key
    if (event.code === 'Escape') {
      event.preventDefault();
      // Only activate if not already activated
      if (!this.keyboardInputs.returnHome) {
        this.keyboardInputs.returnHome = true;
      }
    }

    // Process inputs after handling special actions
    this.processKeyboardInput();

    // Combine inputs and notify
    this.combineInputs();
    this.notifyListeners();
  };

  handleKeyUp = (event) => {
    // Do NOT update active device to KEYBOARD (keyboard mode disabled)
    // this.updateActiveDevice(INPUT_DEVICE_TYPES.KEYBOARD);
    this.keysPressed[event.code] = false;

    // Reset actions after notification
    if (event.code === 'Tab') {
      this.keyboardInputs.toggleMode = false;
    }
    if (event.code === 'Space') {
      // Short delay to ensure action is processed before reset
      setTimeout(() => {
        this.keyboardInputs.nextPosition = false;
        this.combineInputs();
        this.notifyListeners();
      }, 50);
    }

    // Reset interaction action
    if (event.code === 'KeyT') {
      // Short delay to ensure action is processed before reset
      setTimeout(() => {
        this.keyboardInputs.interact = false;
        this.combineInputs();
        this.notifyListeners();
      }, 50);
    }

    // Reset return home action
    if (event.code === 'Escape') {
      setTimeout(() => {
        this.keyboardInputs.returnHome = false;
        this.combineInputs();
        this.notifyListeners();
      }, 50);
    }

    // Process inputs
    this.processKeyboardInput();
  };

  // Keyboard input processing
  // DISABLED: Keyboard mode is not implemented yet - all keyboard movement inputs are ignored
  processKeyboardInput() {
    // Reset all keyboard movement inputs to zero (keyboard mode disabled)
    this.keyboardInputs.moveForward = 0;
    this.keyboardInputs.moveRight = 0;
    this.keyboardInputs.moveUp = 0;
    this.keyboardInputs.lookHorizontal = 0;
    this.keyboardInputs.lookVertical = 0;
    this.keyboardInputs.roll = 0;
    this.keyboardInputs.bodyYaw = 0;
    this.keyboardInputs.antennaLeft = 0;
    this.keyboardInputs.antennaRight = 0;
    
    // Note: Special actions (toggleMode, nextPosition, interact, returnHome) are still processed
    // in handleKeyDown/handleKeyUp for future keyboard mode implementation
    
    // Combine and notify (even though keyboard inputs are zero, gamepad inputs may still be active)
    this.combineInputs();
    this.notifyListeners();
  }

  // Gamepad handling
  handleGamepadConnected = (event) => {
    if (this.debugEnabled) {
      console.log('🎮 Gamepad connected:', event.gamepad.id);
    }
    this.gamepadConnected = true;
  };

  handleGamepadDisconnected = (event) => {
    if (this.debugEnabled) {
      console.log('🎮 Gamepad disconnected');
    }
    this.gamepadConnected = false;

    // Reset gamepad inputs
    this.resetGamepadInputs();
    this.combineInputs();
    this.notifyListeners();
  };

  startGamepadPolling() {
    // Use requestAnimationFrame for better performance and sync with display refresh rate
    const poll = () => {
      this.pollGamepad();
      this.rafId = requestAnimationFrame(poll);
    };
    this.rafId = requestAnimationFrame(poll);
  }

  pollGamepad() {
    try {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gamepad = gamepads[0]; // Use first gamepad

      if (!gamepad) {
        if (this.gamepadConnected) {
          this.gamepadConnected = false;
          this.resetGamepadInputs();
          this.combineInputs();
          this.notifyListeners();
        }
        return;
      }

      // Validate gamepad axes exist and are valid
      if (!gamepad.axes || !Array.isArray(gamepad.axes)) {
        return;
      }

    // Update connection state if necessary
    if (!this.gamepadConnected) {
      this.gamepadConnected = true;
    }

    // Detect gamepad activity
    const hasGamepadInput =
      Math.abs(gamepad.axes[0]) > this.config.deadzone ||
      Math.abs(gamepad.axes[1]) > this.config.deadzone ||
      Math.abs(gamepad.axes[2]) > this.config.deadzone ||
      Math.abs(gamepad.axes[3]) > this.config.deadzone ||
      gamepad.buttons.some((button) => button.pressed);

    if (hasGamepadInput) {
      this.updateActiveDevice(INPUT_DEVICE_TYPES.GAMEPAD);
    }

    // Movements (left stick)
    // axes[0] = left stick horizontal (left = -1, right = +1)
    // axes[1] = left stick vertical (up = -1, down = +1)
    // Validate and sanitize axis values
    const leftStickXValue = this.validateAxisValue(gamepad.axes[0]);
    const leftStickYValue = this.validateAxisValue(gamepad.axes[1]);
    const leftStickX = this.applyDeadzone(leftStickXValue);
    const leftStickY = this.applyDeadzone(leftStickYValue);
    this.gamepadInputs.moveRight = leftStickX;
    this.gamepadInputs.moveForward = -leftStickY; // Invert Y (up = forward)

    // Vertical axis movements (Z position) - controlled by D-pad Up/Down
    // D-pad Up = move up (Z+), D-pad Down = move down (Z-)
    // D-pad buttons: 12 = Up, 13 = Down, 14 = Left, 15 = Right (Xbox controller)
    // Use progressive increment instead of direct mapping
    const dpadUpPressed = gamepad.buttons[12]?.pressed || false;
    const dpadDownPressed = gamepad.buttons[13]?.pressed || false;
    const moveUpDirection = dpadUpPressed ? 1 : (dpadDownPressed ? -1 : 0);
    
    // Progressive increment for Z position (gamepad)
    if (moveUpDirection !== 0) {
      if (!this.progressiveIncrement.moveUp.isHolding) {
        // First press: small increment (same as body yaw)
        this.progressiveIncrement.moveUp.value = moveUpDirection * 0.2; // Initial step (20%)
        this.progressiveIncrement.moveUp.isHolding = true;
        this.progressiveIncrement.moveUp.holdTime = Date.now();
      } else {
        // Holding: linear increment per frame (slower, same as body yaw)
        const frameIncrement = 0.002; // Slower increment per frame (~60fps) - same as body yaw
        const maxIncrement = 1.0;
        const newIncrement = this.progressiveIncrement.moveUp.value + (frameIncrement * moveUpDirection);
        // Clamp to max increment
        if (moveUpDirection > 0) {
          this.progressiveIncrement.moveUp.value = Math.min(newIncrement, maxIncrement);
        } else {
          this.progressiveIncrement.moveUp.value = Math.max(newIncrement, -maxIncrement);
        }
      }
    } else {
      // Button released: reset
      this.progressiveIncrement.moveUp.value = 0;
      this.progressiveIncrement.moveUp.isHolding = false;
      this.progressiveIncrement.moveUp.holdTime = 0;
    }
    
    this.gamepadInputs.moveUp = this.progressiveIncrement.moveUp.value;
    
    // Body yaw - controlled by D-pad Left/Right
    // D-pad Right = rotate right, D-pad Left = rotate left
    // Use progressive increment instead of direct mapping
    const dpadRightPressed = gamepad.buttons[15]?.pressed || false;
    const dpadLeftPressed = gamepad.buttons[14]?.pressed || false;
    const bodyYawDirection = dpadRightPressed ? 1 : (dpadLeftPressed ? -1 : 0);
    
    // Progressive increment for body yaw (gamepad)
    if (bodyYawDirection !== 0) {
      if (!this.progressiveIncrement.bodyYaw.isHolding) {
        // First press: small increment
        this.progressiveIncrement.bodyYaw.value = bodyYawDirection * 0.2; // Initial step (20%)
        this.progressiveIncrement.bodyYaw.isHolding = true;
        this.progressiveIncrement.bodyYaw.holdTime = Date.now();
      } else {
        // Holding: linear increment per frame (slower for body yaw)
        const frameIncrement = 0.002; // Slower increment per frame (~60fps) - same as moveUp
        const maxIncrement = 1.0;
        const newIncrement = this.progressiveIncrement.bodyYaw.value + (frameIncrement * bodyYawDirection);
        // Clamp to max increment
        if (bodyYawDirection > 0) {
          this.progressiveIncrement.bodyYaw.value = Math.min(newIncrement, maxIncrement);
        } else {
          this.progressiveIncrement.bodyYaw.value = Math.max(newIncrement, -maxIncrement);
        }
      }
    } else {
      // Button released: reset
      this.progressiveIncrement.bodyYaw.value = 0;
      this.progressiveIncrement.bodyYaw.isHolding = false;
      this.progressiveIncrement.bodyYaw.holdTime = 0;
    }
    
    this.gamepadInputs.bodyYaw = this.progressiveIncrement.bodyYaw.value;

    // Antennas control (front triggers/bumpers L1/R1) - buttons[6] and buttons[7]
    // These are analog buttons, so we use the .value property (0 to 1)
    // Left bumper (L1, button 6) → Left antenna
    // Right bumper (R1, button 7) → Right antenna
    this.gamepadInputs.antennaLeft = gamepad.buttons[6]?.value || 0;
    this.gamepadInputs.antennaRight = gamepad.buttons[7]?.value || 0;

    // Camera rotation (right stick) - Use curve for better sensitivity
    // axes[2] = right stick horizontal (left = -1, right = +1)
    // axes[3] = right stick vertical (up = -1, down = +1)
    // Validate and sanitize axis values
    const rightStickXValue = this.validateAxisValue(gamepad.axes[2]);
    const rightStickYValue = this.validateAxisValue(gamepad.axes[3]);
    this.gamepadInputs.lookHorizontal = this.applyLookCurve(rightStickXValue);
    this.gamepadInputs.lookVertical = -this.applyLookCurve(rightStickYValue); // Invert Y (up = pitch up)

    // Smart debug: only log when buttons/inputs change state
    if (this.debugEnabled) {
      // Check D-pad buttons
      const dpadButtons = [
        { index: 12, name: 'D-pad Up' },
        { index: 13, name: 'D-pad Down' },
        { index: 14, name: 'D-pad Left' },
        { index: 15, name: 'D-pad Right' },
      ];
      
      dpadButtons.forEach(({ index, name }) => {
        const isPressed = gamepad.buttons[index]?.pressed || false;
        const lastState = this.lastButtonStates[`dpad_${index}`];
        if (isPressed !== lastState) {
          console.log(`🎮 ${name}: ${isPressed ? 'PRESSED' : 'RELEASED'}`);
          this.lastButtonStates[`dpad_${index}`] = isPressed;
        }
      });
      
      // Check bumpers (L1/R1)
      const bumpers = [
        { index: 6, name: 'L1 (Left Antenna)' },
        { index: 7, name: 'R1 (Right Antenna)' },
      ];
      
      bumpers.forEach(({ index, name }) => {
        const value = gamepad.buttons[index]?.value || 0;
        const lastValue = this.lastInputValues[`bumper_${index}`] || 0;
        const threshold = 0.1; // Only log if value changes significantly
        if (Math.abs(value - lastValue) > threshold) {
          console.log(`🎮 ${name}: ${(value * 100).toFixed(0)}%`);
          this.lastInputValues[`bumper_${index}`] = value;
        }
      });
      
      // Check action buttons (only when pressed)
      const actionButtons = [
        { index: 0, name: 'A (Interact)' },
        { index: 1, name: 'B (Return Home)' },
        { index: 2, name: 'X (Next Position)' },
        { index: 3, name: 'Y (Toggle Mode)' },
      ];
      
      actionButtons.forEach(({ index, name }) => {
        const isPressed = gamepad.buttons[index]?.pressed || false;
        const lastState = this.lastButtonStates[`action_${index}`];
        if (isPressed && !lastState) {
          console.log(`🎮 ${name}: PRESSED`);
          this.lastButtonStates[`action_${index}`] = isPressed;
        } else if (!isPressed && lastState) {
          this.lastButtonStates[`action_${index}`] = isPressed;
        }
      });
      
      // Check sticks - only log when they move significantly
      const sticks = [
        { axes: [0, 1], name: 'Left Stick', inputs: ['moveRight', 'moveForward'] },
        { axes: [2, 3], name: 'Right Stick', inputs: ['lookHorizontal', 'lookVertical'] },
      ];
      
      sticks.forEach(({ axes, name, inputs }) => {
        const x = gamepad.axes[axes[0]] || 0;
        const y = gamepad.axes[axes[1]] || 0;
        const magnitude = Math.sqrt(x * x + y * y);
        const lastMagnitude = this.lastInputValues[`stick_${name}`] || 0;
        
        // Only log if stick moves significantly (crosses deadzone threshold)
        if ((magnitude > this.config.deadzone && lastMagnitude <= this.config.deadzone) ||
            (magnitude <= this.config.deadzone && lastMagnitude > this.config.deadzone)) {
          if (magnitude > this.config.deadzone) {
            console.log(`🎮 ${name}: Active (${x.toFixed(2)}, ${y.toFixed(2)})`);
          } else {
            console.log(`🎮 ${name}: Centered`);
          }
          this.lastInputValues[`stick_${name}`] = magnitude;
        }
      });
    }

    // Roll - removed from gamepad, no longer controlled via gamepad
    this.gamepadInputs.roll = 0;

    // Actions (with state management to avoid repetition)
    // Mode toggle (Y or triangle button)
    if (gamepad.buttons[3]?.pressed && !this.previousButtonStates.mode) {
      this.gamepadInputs.toggleMode = true;
    } else {
      this.gamepadInputs.toggleMode = false;
    }
    this.previousButtonStates.mode = gamepad.buttons[3]?.pressed;

    // Next position (X button)
    if (
      gamepad.buttons[2]?.pressed &&
      !this.previousButtonStates.nextPosition
    ) {
      this.gamepadInputs.nextPosition = true;
      setTimeout(() => {
        this.gamepadInputs.nextPosition = false;
        this.combineInputs();
        this.notifyListeners();
      }, 50);
    }
    this.previousButtonStates.nextPosition = gamepad.buttons[2]?.pressed;

    // Interaction action (A or cross button)
    if (gamepad.buttons[0]?.pressed && !this.previousButtonStates.interact) {
      this.gamepadInputs.interact = true;
    } else {
      this.gamepadInputs.interact = false;
    }
    this.previousButtonStates.interact = gamepad.buttons[0]?.pressed;

    // Return home (B or circle button)
    if (gamepad.buttons[1]?.pressed && !this.previousButtonStates.returnHome) {
      this.gamepadInputs.returnHome = true;
      // Reset after short delay, like keyboard
      setTimeout(() => {
        this.gamepadInputs.returnHome = false;
        this.combineInputs();
        this.notifyListeners();
      }, 50);
    }
    this.previousButtonStates.returnHome = gamepad.buttons[1]?.pressed;

    // Action2 (Y or triangle)
    this.gamepadInputs.action2 = gamepad.buttons[3]?.pressed || false;

    // Combine and notify
    this.combineInputs();
    this.notifyListeners();
    } catch (error) {
      console.error('❌ Error in pollGamepad:', error);
      // Fallback: reset inputs on error to prevent stuck states
      this.resetGamepadInputs();
      this.combineInputs();
      this.notifyListeners();
    }
  }

  resetGamepadInputs() {
    // Reset gamepad inputs to zero
    Object.keys(this.gamepadInputs).forEach((key) => {
      if (typeof this.gamepadInputs[key] === 'number') {
        this.gamepadInputs[key] = 0;
      } else if (typeof this.gamepadInputs[key] === 'boolean') {
        this.gamepadInputs[key] = false;
      }
    });
  }

  resetKeyboardInputs() {
    // Reset keyboard inputs to zero
    Object.keys(this.keyboardInputs).forEach((key) => {
      if (typeof this.keyboardInputs[key] === 'number') {
        this.keyboardInputs[key] = 0;
      } else if (typeof this.keyboardInputs[key] === 'boolean') {
        this.keyboardInputs[key] = false;
      }
    });
  }

  resetInputs() {
    // Reset all inputs
    this.resetGamepadInputs();
    this.resetKeyboardInputs();
    this.combineInputs();
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  // Enable/disable debug logging
  setDebugEnabled(enabled) {
    this.debugEnabled = enabled;
    if (!enabled) {
      this.lastButtonStates = {};
      this.lastInputValues = {};
    } else {
      console.log('🎮 Debug mode enabled - will show button presses and significant input changes');
    }
  }

  // Method to clean up and release resources
  dispose() {
    this.unbindEvents();
    this.listeners = [];
    this.lastButtonStates = {};
    this.lastInputValues = {};
  }

  // Check if a gamepad is connected
  isGamepadConnected() {
    return this.gamepadConnected;
  }

  // Method to simulate next position action
  triggerNextPositionAction() {
    console.log("InputManager: Simulating nextPosition action");

    // Reset all inputs first to avoid conflicts
    this.resetInputs();

    // Set nextPosition to true (as if user pressed the key)
    this.keyboardInputs.nextPosition = true;

    // Combine and notify
    this.combineInputs();
    this.notifyListeners();

    // Then set to false on next cycle (simulates key release)
    setTimeout(() => {
      this.keyboardInputs.nextPosition = false;
      this.combineInputs();
      this.notifyListeners();
      console.log("InputManager: nextPosition action completed");
    }, 50);
  }

  // Method to simulate interaction action
  triggerInteractAction() {
    console.log("InputManager: Simulating interact action");

    // Reset all inputs first to avoid conflicts
    this.resetInputs();

    // Set interact to true (as if user pressed the key)
    this.keyboardInputs.interact = true;

    // Combine and notify
    this.combineInputs();
    this.notifyListeners();

    // Then set to false on next cycle (simulates key release)
    setTimeout(() => {
      this.keyboardInputs.interact = false;
      this.combineInputs();
      this.notifyListeners();
      console.log("InputManager: interact action completed");
    }, 50);
  }

  /**
   * Vibrate gamepad when connected
   * @param {number} duration - Vibration duration in ms
   * @param {number} weakMagnitude - Weak vibration intensity (0-1)
   * @param {number} strongMagnitude - Strong vibration intensity (0-1)
   * @returns {Promise|null} - Promise that resolves when vibration is complete, or null if gamepad is not available
   */
  vibrateGamepad(duration = 200, weakMagnitude = 0.5, strongMagnitude = 0.8) {
    // Check if at least one gamepad is connected
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gamepad = gamepads[0]; // Use first gamepad

    if (!gamepad || !this.gamepadConnected) {
      console.log('No gamepad available for vibration');
      return null;
    }

    // Try to use vibrationActuator (more widely supported)
    if (
      gamepad.vibrationActuator &&
      typeof gamepad.vibrationActuator.playEffect === 'function'
    ) {
      console.log('Vibration via vibrationActuator');
      return gamepad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: duration,
        weakMagnitude: weakMagnitude,
        strongMagnitude: strongMagnitude,
      });
    }
    // Alternative: use hapticActuators if available
    else if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
      console.log('Vibration via hapticActuators');
      return gamepad.hapticActuators[0].pulse(strongMagnitude, duration);
    } else {
      console.log("This gamepad does not support vibration");
      return null;
    }
  }
}

// Singleton instance to share the same input manager
let inputManagerInstance = null;

export const getInputManager = () => {
  if (!inputManagerInstance) {
    inputManagerInstance = new InputManager();
  }
  return inputManagerInstance;
};

// React hook to use input manager in components
export const useInputs = () => {
  const [inputs, setInputs] = React.useState(getInputManager().inputs);

  React.useEffect(() => {
    // Subscribe to input updates
    const unsubscribe = getInputManager().addListener((newInputs) => {
      setInputs({ ...newInputs });
    });

    // Clean up subscription
    return unsubscribe;
  }, []);

  return inputs;
};

// React hook to get active device information
export const useActiveDevice = () => {
  const [activeDevice, setActiveDevice] = React.useState(
    getInputManager().getActiveDevice()
  );

  React.useEffect(() => {
    const inputManager = getInputManager();

    // Subscribe to device changes
    const unsubscribe = inputManager.addDeviceChangeListener((newDevice) => {
      setActiveDevice(newDevice);
    });

    // Check current device on mount
    setActiveDevice(inputManager.getActiveDevice());

    // Clean up subscription
    return unsubscribe;
  }, []);

  return activeDevice;
};

// React hook to check if a gamepad is connected
export const useGamepadConnected = () => {
  const [isConnected, setIsConnected] = React.useState(
    getInputManager().isGamepadConnected()
  );

  React.useEffect(() => {
    const inputManager = getInputManager();
    
    // Periodically check connection state
    const checkInterval = setInterval(() => {
      setIsConnected(inputManager.isGamepadConnected());
    }, 500);

    return () => clearInterval(checkInterval);
  }, []);

  return isConnected;
};

