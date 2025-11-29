/**
 * Input smoothing utilities based on industry best practices
 * 
 * Industry standards for smooth gamepad input:
 * 1. Exponential Moving Average (EMA) for input smoothing
 * 2. Delta-time based updates (frame-rate independent)
 * 3. Velocity-based control instead of direct position mapping
 * 4. Ease-in/out curves for acceleration/deceleration
 */

/**
 * Exponential Moving Average (EMA) smoother
 * Provides smooth interpolation between current and target values
 * 
 * @param {number} current - Current smoothed value
 * @param {number} target - Target value to smooth towards
 * @param {number} smoothingFactor - Smoothing factor (0-1), higher = smoother but slower response
 * @returns {number} New smoothed value
 */
export function smoothValue(current, target, smoothingFactor = 0.15) {
  // EMA formula: newValue = current + (target - current) * smoothingFactor
  // Lower smoothingFactor (0.1-0.2) = more responsive, less smooth
  // Higher smoothingFactor (0.3-0.5) = smoother, less responsive
  return current + (target - current) * smoothingFactor;
}

/**
 * Smooth a value with velocity-based control
 * Accumulates velocity instead of directly setting position
 * 
 * @param {Object} state - Current state object with { value, velocity }
 * @param {number} targetInput - Target input value (-1 to 1)
 * @param {number} acceleration - Acceleration rate per frame
 * @param {number} maxVelocity - Maximum velocity
 * @param {number} damping - Damping factor for deceleration (0-1)
 * @param {number} deltaTime - Time since last frame in seconds
 * @returns {Object} New state with { value, velocity }
 */
export function smoothWithVelocity(state, targetInput, acceleration, maxVelocity, damping = 0.9, deltaTime = 1/60) {
  const { value: currentValue, velocity: currentVelocity } = state;
  
  // Calculate target velocity based on input
  const targetVelocity = targetInput * maxVelocity;
  
  // Accelerate towards target velocity
  let newVelocity = currentVelocity;
  if (Math.abs(targetInput) > 0.01) {
    // Accelerate
    const velocityDiff = targetVelocity - currentVelocity;
    newVelocity = currentVelocity + (velocityDiff * acceleration * deltaTime * 60); // Scale by 60 for 60fps reference
    newVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, newVelocity));
  } else {
    // Decelerate (damping)
    newVelocity = currentVelocity * damping;
    if (Math.abs(newVelocity) < 0.001) {
      newVelocity = 0;
    }
  }
  
  // Update value based on velocity
  const newValue = currentValue + (newVelocity * deltaTime);
  
  return {
    value: newValue,
    velocity: newVelocity,
  };
}

/**
 * Apply exponential smoothing to an input object
 * Smooths all analog inputs in the input object
 * 
 * @param {Object} currentInputs - Current smoothed input values
 * @param {Object} rawInputs - Raw input values from InputManager
 * @param {Object} smoothingFactors - Smoothing factors for each input (optional)
 * @returns {Object} New smoothed input values
 */
export function smoothInputs(currentInputs, rawInputs, smoothingFactors = {}) {
  const defaultSmoothing = 0.15; // Default smoothing factor
  
  return {
    moveForward: smoothValue(
      currentInputs.moveForward || 0,
      rawInputs.moveForward || 0,
      smoothingFactors.moveForward ?? defaultSmoothing
    ),
    moveRight: smoothValue(
      currentInputs.moveRight || 0,
      rawInputs.moveRight || 0,
      smoothingFactors.moveRight ?? defaultSmoothing
    ),
    moveUp: smoothValue(
      currentInputs.moveUp || 0,
      rawInputs.moveUp || 0,
      smoothingFactors.moveUp ?? defaultSmoothing
    ),
    lookHorizontal: smoothValue(
      currentInputs.lookHorizontal || 0,
      rawInputs.lookHorizontal || 0,
      smoothingFactors.lookHorizontal ?? defaultSmoothing
    ),
    lookVertical: smoothValue(
      currentInputs.lookVertical || 0,
      rawInputs.lookVertical || 0,
      smoothingFactors.lookVertical ?? defaultSmoothing
    ),
    roll: smoothValue(
      currentInputs.roll || 0,
      rawInputs.roll || 0,
      smoothingFactors.roll ?? defaultSmoothing
    ),
    bodyYaw: smoothValue(
      currentInputs.bodyYaw || 0,
      rawInputs.bodyYaw || 0,
      smoothingFactors.bodyYaw ?? 0.2 // Slightly more smoothing for body yaw
    ),
    // Antennas: less smoothing to ensure full range is reachable
    antennaLeft: smoothValue(
      currentInputs.antennaLeft || 0,
      rawInputs.antennaLeft || 0,
      smoothingFactors.antennaLeft ?? 0.3 // Slightly more smoothing but still responsive
    ),
    antennaRight: smoothValue(
      currentInputs.antennaRight || 0,
      rawInputs.antennaRight || 0,
      smoothingFactors.antennaRight ?? 0.3 // Slightly more smoothing but still responsive
    ),
    // Boolean inputs don't need smoothing
    toggleMode: rawInputs.toggleMode,
    nextPosition: rawInputs.nextPosition,
    action1: rawInputs.action1,
    action2: rawInputs.action2,
    interact: rawInputs.interact,
    returnHome: rawInputs.returnHome,
  };
}

/**
 * Calculate delta time for frame-rate independent updates
 * 
 * @param {number} lastTime - Last frame timestamp
 * @returns {number} Delta time in seconds
 */
export function getDeltaTime(lastTime) {
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000; // Convert to seconds
  return {
    deltaTime: Math.min(deltaTime, 1/30), // Cap at 30fps minimum to prevent huge jumps
    currentTime: now,
  };
}

