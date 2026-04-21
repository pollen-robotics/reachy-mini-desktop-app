export const INPUT_DEVICE_TYPES = {
  KEYBOARD: 'keyboard',
  GAMEPAD: 'gamepad',
} as const;

export type InputDeviceType = (typeof INPUT_DEVICE_TYPES)[keyof typeof INPUT_DEVICE_TYPES];
