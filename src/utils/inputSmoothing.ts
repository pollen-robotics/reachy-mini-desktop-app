/**
 * Input smoothing utilities based on industry best practices.
 *
 * Industry standards for smooth gamepad input:
 * 1. Exponential Moving Average (EMA) for input smoothing
 * 2. Delta-time based updates (frame-rate independent)
 * 3. Velocity-based control instead of direct position mapping
 * 4. Ease-in/out curves for acceleration/deceleration
 */

/**
 * Exponential Moving Average (EMA) smoother. Provides smooth interpolation
 * between current and target values.
 *
 * - Lower `smoothingFactor` (0.1-0.2) is more responsive but less smooth.
 * - Higher `smoothingFactor` (0.3-0.5) is smoother but less responsive.
 */
export function smoothValue(current: number, target: number, smoothingFactor = 0.15): number {
  return current + (target - current) * smoothingFactor;
}

export interface VelocityState {
  value: number;
  velocity: number;
}

/**
 * Smooth a value with velocity-based control: accumulate velocity instead of
 * directly setting position.
 */
export function smoothWithVelocity(
  state: VelocityState,
  targetInput: number,
  acceleration: number,
  maxVelocity: number,
  damping = 0.9,
  deltaTime = 1 / 60
): VelocityState {
  const { value: currentValue, velocity: currentVelocity } = state;

  const targetVelocity = targetInput * maxVelocity;

  let newVelocity = currentVelocity;
  if (Math.abs(targetInput) > 0.01) {
    const velocityDiff = targetVelocity - currentVelocity;
    // Scale by 60 for 60fps reference
    newVelocity = currentVelocity + velocityDiff * acceleration * deltaTime * 60;
    newVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, newVelocity));
  } else {
    newVelocity = currentVelocity * damping;
    if (Math.abs(newVelocity) < 0.001) {
      newVelocity = 0;
    }
  }

  const newValue = currentValue + newVelocity * deltaTime;

  return {
    value: newValue,
    velocity: newVelocity,
  };
}

export interface SmoothableInputs {
  moveForward?: number;
  moveRight?: number;
  moveUp?: number;
  lookHorizontal?: number;
  lookVertical?: number;
  roll?: number;
  bodyYaw?: number;
  antennaLeft?: number;
  antennaRight?: number;
  toggleMode?: boolean;
  nextPosition?: boolean;
  action1?: boolean;
  action2?: boolean;
  interact?: boolean;
  returnHome?: boolean;
  [key: string]: number | boolean | undefined;
}

export type SmoothingFactors = Partial<Record<keyof SmoothableInputs, number>>;

/**
 * Apply exponential smoothing to an input object. Smooths all analog inputs.
 */
export function smoothInputs(
  currentInputs: SmoothableInputs,
  rawInputs: SmoothableInputs,
  smoothingFactors: SmoothingFactors = {}
): SmoothableInputs {
  const defaultSmoothing = 0.15;

  return {
    moveForward: smoothValue(
      currentInputs.moveForward ?? 0,
      rawInputs.moveForward ?? 0,
      smoothingFactors.moveForward ?? defaultSmoothing
    ),
    moveRight: smoothValue(
      currentInputs.moveRight ?? 0,
      rawInputs.moveRight ?? 0,
      smoothingFactors.moveRight ?? defaultSmoothing
    ),
    moveUp: smoothValue(
      currentInputs.moveUp ?? 0,
      rawInputs.moveUp ?? 0,
      smoothingFactors.moveUp ?? defaultSmoothing
    ),
    lookHorizontal: smoothValue(
      currentInputs.lookHorizontal ?? 0,
      rawInputs.lookHorizontal ?? 0,
      smoothingFactors.lookHorizontal ?? defaultSmoothing
    ),
    lookVertical: smoothValue(
      currentInputs.lookVertical ?? 0,
      rawInputs.lookVertical ?? 0,
      smoothingFactors.lookVertical ?? defaultSmoothing
    ),
    roll: smoothValue(
      currentInputs.roll ?? 0,
      rawInputs.roll ?? 0,
      smoothingFactors.roll ?? defaultSmoothing
    ),
    bodyYaw: smoothValue(
      currentInputs.bodyYaw ?? 0,
      rawInputs.bodyYaw ?? 0,
      smoothingFactors.bodyYaw ?? 0.2
    ),
    antennaLeft: smoothValue(
      currentInputs.antennaLeft ?? 0,
      rawInputs.antennaLeft ?? 0,
      smoothingFactors.antennaLeft ?? 0.3
    ),
    antennaRight: smoothValue(
      currentInputs.antennaRight ?? 0,
      rawInputs.antennaRight ?? 0,
      smoothingFactors.antennaRight ?? 0.3
    ),
    toggleMode: rawInputs.toggleMode,
    nextPosition: rawInputs.nextPosition,
    action1: rawInputs.action1,
    action2: rawInputs.action2,
    interact: rawInputs.interact,
    returnHome: rawInputs.returnHome,
  };
}

export interface DeltaTimeResult {
  deltaTime: number;
  currentTime: number;
}

/**
 * Calculate delta time for frame-rate independent updates. Capped at 30fps to
 * prevent huge jumps after a stall.
 */
export function getDeltaTime(lastTime: number): DeltaTimeResult {
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000;
  return {
    deltaTime: Math.min(deltaTime, 1 / 30),
    currentTime: now,
  };
}
