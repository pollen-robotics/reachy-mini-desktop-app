/**
 * Constants for SpinningWheel component
 * All magic numbers documented here for maintainability
 */

// Wheel sizing
export const WHEEL_SIZE_MULTIPLIER = 2; // Wheel is 200% of viewport for smooth scrolling
export const RADIUS_RATIO = 0.18; // Radius as ratio of wheel size (18% of wheel diameter)

// Positioning
export const TOP_ANGLE = -90; // Top position in degrees (12 o'clock)
export const VISIBLE_ARC_RANGE = 120; // Degrees of visible arc
export const BUFFER_DEGREES = 30; // Extra buffer on each side for smooth scrolling

// Spin animation
export const MIN_ROTATIONS = 2; // Minimum rotations for random spin
export const MAX_ROTATIONS = 5; // Maximum rotations for random spin
export const SPIN_DURATION_MIN = 2000; // Minimum spin duration (ms)
export const SPIN_DURATION_MAX = 3000; // Maximum spin duration (ms)

// Momentum physics
export const FRICTION = 0.95; // Deceleration factor for momentum (5% loss per frame)
export const MIN_VELOCITY = 0.1; // Minimum velocity to continue spinning (degrees/frame)
export const MIN_MOMENTUM = 10.0; // Minimum velocity to apply momentum after drag (augmenté pour éviter déclenchement accidentel)

// Random spin
export const RANDOM_EXCLUSION_RADIUS = 15; // Number of items to exclude on each side of current item (total: 2*RADIUS+1 excluded)

// Performance
export const RESIZE_DEBOUNCE_MS = 150; // Debounce delay for resize events
export const DRAG_THROTTLE_MS = 16; // Throttle delay for drag (60fps = ~16ms)

// Action triggering
export const ACTION_COOLDOWN_MS = 500; // Minimum time between action triggers (ms) - prevents rapid double triggers

