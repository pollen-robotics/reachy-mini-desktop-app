import type { HeadPose, Antennas, RawInputs } from '../../../../utils/inputHelpers';

const radToDeg = (rad: number): number => {
  return Math.round((rad * 180) / Math.PI);
};

const formatValue = (value: number, unit: string = 'rad', convertToDeg: boolean = true): string => {
  if (unit === 'rad' && convertToDeg) {
    return `${radToDeg(value)}°`;
  }
  return `${value.toFixed(2)}${unit}`;
};

interface MovementDescription {
  direction: 'up' | 'down';
  magnitude: 'large' | 'medium' | 'small';
  diff: number;
}

const getMovementDescription = (
  value: number,
  previousValue: number | null | undefined,
  threshold: number = 0.01
): MovementDescription | null => {
  const diff = value - (previousValue || 0);
  const absDiff = Math.abs(diff);

  if (absDiff < threshold) return null;

  const direction: 'up' | 'down' = diff > 0 ? 'up' : 'down';
  const magnitude: 'large' | 'medium' | 'small' =
    absDiff > 0.1 ? 'large' : absDiff > 0.05 ? 'medium' : 'small';

  return { direction, magnitude, diff: absDiff };
};

export const generateHeadPositionLog = (
  headPose: HeadPose,
  previousHeadPose: HeadPose | null = null
): string | null => {
  if (!previousHeadPose) {
    return `Moving head to position`;
  }

  const changes: string[] = [];
  const significantThreshold = 0.01;

  const posX = getMovementDescription(headPose.x, previousHeadPose.x, significantThreshold);
  const posY = getMovementDescription(headPose.y, previousHeadPose.y, significantThreshold);
  const posZ = getMovementDescription(headPose.z, previousHeadPose.z, significantThreshold);

  if (posX || posY || posZ) {
    const directions: string[] = [];
    if (posX) directions.push(`X ${posX.direction}`);
    if (posY) directions.push(`Y ${posY.direction}`);
    if (posZ) directions.push(`Z ${posZ.direction}`);
    changes.push(`Position: ${directions.join(', ')}`);
  }

  const pitch = getMovementDescription(headPose.pitch, previousHeadPose.pitch, 0.05);
  const yaw = getMovementDescription(headPose.yaw, previousHeadPose.yaw, 0.05);
  const roll = getMovementDescription(headPose.roll, previousHeadPose.roll, 0.05);

  if (pitch || yaw || roll) {
    const rotations: string[] = [];
    if (pitch) rotations.push(`pitch ${pitch.direction} ${formatValue(pitch.diff, 'rad')}`);
    if (yaw) rotations.push(`yaw ${yaw.direction} ${formatValue(yaw.diff, 'rad')}`);
    if (roll) rotations.push(`roll ${roll.direction} ${formatValue(roll.diff, 'rad')}`);
    changes.push(`Rotation: ${rotations.join(', ')}`);
  }

  const isReset =
    Math.abs(headPose.x) < 0.001 &&
    Math.abs(headPose.y) < 0.001 &&
    Math.abs(headPose.z) < 0.001 &&
    Math.abs(headPose.pitch) < 0.01 &&
    Math.abs(headPose.yaw) < 0.01 &&
    Math.abs(headPose.roll) < 0.01;

  if (isReset) {
    return `Head reset to center`;
  }

  if (changes.length === 0) {
    return null;
  }

  return `Head: ${changes.join(' | ')}`;
};

export const generateBodyYawLog = (
  bodyYaw: number,
  previousBodyYaw: number | null = null
): string | null => {
  if (previousBodyYaw === null) {
    return `Rotating body`;
  }

  const diff = bodyYaw - previousBodyYaw;
  const absDiff = Math.abs(diff);

  if (absDiff < 0.01) {
    return null;
  }

  if (Math.abs(bodyYaw) < 0.01) {
    return `Body reset to center`;
  }

  const direction = diff > 0 ? 'left' : 'right';
  const angle = formatValue(absDiff);

  return `Body rotation: ${direction} ${angle}`;
};

export const generateAntennasLog = (
  antennas: Antennas,
  previousAntennas: Antennas | null = null
): string | null => {
  if (!previousAntennas) {
    return `Moving antennas`;
  }

  const leftDiff = Math.abs(antennas[0] - previousAntennas[0]);
  const rightDiff = Math.abs(antennas[1] - previousAntennas[1]);
  const threshold = 0.01;

  if (leftDiff < threshold && rightDiff < threshold) {
    return null;
  }

  if (Math.abs(antennas[0]) < 0.01 && Math.abs(antennas[1]) < 0.01) {
    return `Antennas reset to center`;
  }

  const changes: string[] = [];

  if (leftDiff >= threshold) {
    const leftDir = antennas[0] > previousAntennas[0] ? 'up' : 'down';
    changes.push(`Left ${leftDir} ${formatValue(leftDiff, 'rad')}`);
  }

  if (rightDiff >= threshold) {
    const rightDir = antennas[1] > previousAntennas[1] ? 'up' : 'down';
    changes.push(`Right ${rightDir} ${formatValue(rightDiff, 'rad')}`);
  }

  if (changes.length === 0) {
    return null;
  }

  return `Antennas: ${changes.join(', ')}`;
};

export interface CombinedLogPrevious {
  headPose?: HeadPose;
  bodyYaw?: number;
  antennas?: Antennas;
}

export const generateCombinedLog = (
  headPose: HeadPose,
  bodyYaw: number,
  antennas: Antennas,
  previous: CombinedLogPrevious | null = null
): string | null => {
  if (!previous) {
    return `Moving robot`;
  }

  const headLog = generateHeadPositionLog(headPose, previous.headPose ?? null);
  const bodyLog = generateBodyYawLog(bodyYaw, previous.bodyYaw ?? null);
  const antennasLog = generateAntennasLog(antennas, previous.antennas ?? null);

  const logs = [headLog, bodyLog, antennasLog].filter(Boolean) as string[];

  if (logs.length === 0) {
    return null;
  }

  const isFullReset =
    (!headLog || headLog.includes('reset')) &&
    (!bodyLog || bodyLog.includes('reset')) &&
    (!antennasLog || antennasLog.includes('reset'));

  if (isFullReset) {
    return `Robot reset to center position`;
  }

  if (logs.length > 1) {
    return logs.join(' | ');
  }

  return logs[0];
};

export const generateGamepadInputLog = (
  inputs: RawInputs,
  previousInputs: RawInputs | null = null
): string | null => {
  if (!previousInputs) {
    return `Gamepad input detected`;
  }

  const changes: string[] = [];
  const threshold = 0.1;

  const hasPositionInput =
    Math.abs(inputs.moveForward ?? 0) > threshold ||
    Math.abs(inputs.moveRight ?? 0) > threshold ||
    Math.abs(inputs.moveUp ?? 0) > threshold;

  if (hasPositionInput) {
    const posChanges: string[] = [];
    if (Math.abs(inputs.moveForward ?? 0) > threshold) {
      const dir = (inputs.moveForward ?? 0) > 0 ? 'forward' : 'backward';
      posChanges.push(`X ${dir}`);
    }
    if (Math.abs(inputs.moveRight ?? 0) > threshold) {
      const dir = (inputs.moveRight ?? 0) > 0 ? 'right' : 'left';
      posChanges.push(`Y ${dir}`);
    }
    if (Math.abs(inputs.moveUp ?? 0) > threshold) {
      const dir = (inputs.moveUp ?? 0) > 0 ? 'up' : 'down';
      posChanges.push(`Z ${dir}`);
    }
    if (posChanges.length > 0) {
      changes.push(`Position: ${posChanges.join(', ')}`);
    }
  }

  const hasRotationInput =
    Math.abs(inputs.lookHorizontal ?? 0) > threshold ||
    Math.abs(inputs.lookVertical ?? 0) > threshold ||
    Math.abs(inputs.roll ?? 0) > threshold;

  if (hasRotationInput) {
    const rotChanges: string[] = [];
    if (Math.abs(inputs.lookVertical ?? 0) > threshold) {
      const dir = (inputs.lookVertical ?? 0) > 0 ? 'up' : 'down';
      rotChanges.push(`pitch ${dir}`);
    }
    if (Math.abs(inputs.lookHorizontal ?? 0) > threshold) {
      const dir = (inputs.lookHorizontal ?? 0) > 0 ? 'right' : 'left';
      rotChanges.push(`yaw ${dir}`);
    }
    if (Math.abs(inputs.roll ?? 0) > threshold) {
      const dir = (inputs.roll ?? 0) > 0 ? 'right' : 'left';
      rotChanges.push(`roll ${dir}`);
    }
    if (rotChanges.length > 0) {
      changes.push(`Rotation: ${rotChanges.join(', ')}`);
    }
  }

  if (Math.abs(inputs.bodyYaw ?? 0) > threshold) {
    const dir = (inputs.bodyYaw ?? 0) > 0 ? 'left' : 'right';
    changes.push(`Body rotation: ${dir}`);
  }

  const hasAntennaInput =
    Math.abs(inputs.antennaLeft ?? 0) > threshold || Math.abs(inputs.antennaRight ?? 0) > threshold;

  if (hasAntennaInput) {
    const antennaChanges: string[] = [];
    if (Math.abs(inputs.antennaLeft ?? 0) > threshold) {
      antennaChanges.push(`Left ${(inputs.antennaLeft ?? 0) > 0 ? 'up' : 'down'}`);
    }
    if (Math.abs(inputs.antennaRight ?? 0) > threshold) {
      antennaChanges.push(`Right ${(inputs.antennaRight ?? 0) > 0 ? 'up' : 'down'}`);
    }
    if (antennaChanges.length > 0) {
      changes.push(`Antennas: ${antennaChanges.join(', ')}`);
    }
  }

  const isReset =
    Math.abs(inputs.moveForward ?? 0) < threshold &&
    Math.abs(inputs.moveRight ?? 0) < threshold &&
    Math.abs(inputs.moveUp ?? 0) < threshold &&
    Math.abs(inputs.lookHorizontal ?? 0) < threshold &&
    Math.abs(inputs.lookVertical ?? 0) < threshold &&
    Math.abs(inputs.roll ?? 0) < threshold &&
    Math.abs(inputs.bodyYaw ?? 0) < threshold &&
    Math.abs(inputs.antennaLeft ?? 0) < threshold &&
    Math.abs(inputs.antennaRight ?? 0) < threshold;

  if (isReset && !previousInputs) {
    return null;
  }

  if (changes.length === 0) {
    return null;
  }

  return `Gamepad: ${changes.join(' | ')}`;
};
