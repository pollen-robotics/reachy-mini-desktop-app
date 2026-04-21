import { useEffect, useRef, useCallback } from 'react';
import { useController } from '../context/ControllerContext';
import { getInputManager } from '@utils/InputManager';
import {
  ROBOT_POSITION_RANGES,
  EXTENDED_ROBOT_RANGES,
  INPUT_SMOOTHING_FACTORS,
  INPUT_MAPPING_FACTORS,
  INPUT_THRESHOLDS,
} from '@utils/inputConstants';
import { hasActiveInput, clampAntennas, clampBodyYaw, clampHeadPose } from '@utils/inputHelpers';
import type { RawInputs } from '@utils/inputHelpers';
import { smoothInputs, getDeltaTime } from '@utils/inputSmoothing';
import { mapInputToRobot } from '@utils/inputMappings';
import type { HeadPose } from '@utils/targetSmoothing';
import type { RawInputState } from '@utils/InputManager';

interface SmoothedInputs {
  moveForward: number;
  moveRight: number;
  moveUp: number;
  lookHorizontal: number;
  lookVertical: number;
  roll: number;
  bodyYaw: number;
  antennaLeft: number;
  antennaRight: number;
  [key: string]: number | undefined;
}

const createZeroSmoothedInputs = (): SmoothedInputs => ({
  moveForward: 0,
  moveRight: 0,
  moveUp: 0,
  lookHorizontal: 0,
  lookVertical: 0,
  roll: 0,
  bodyYaw: 0,
  antennaLeft: 0,
  antennaRight: 0,
});

const SMOOTHING_FACTOR_MAP = {
  moveForward: INPUT_SMOOTHING_FACTORS.POSITION,
  moveRight: INPUT_SMOOTHING_FACTORS.POSITION,
  moveUp: INPUT_SMOOTHING_FACTORS.POSITION_Z,
  lookHorizontal: INPUT_SMOOTHING_FACTORS.ROTATION,
  lookVertical: INPUT_SMOOTHING_FACTORS.ROTATION,
  roll: INPUT_SMOOTHING_FACTORS.POSITION,
  bodyYaw: INPUT_SMOOTHING_FACTORS.BODY_YAW,
  antennaLeft: INPUT_SMOOTHING_FACTORS.ANTENNA,
  antennaRight: INPUT_SMOOTHING_FACTORS.ANTENNA,
} as const;

interface UseControllerInputReturn {
  processInputs: (rawInputs: RawInputState) => void;
}

/**
 * Subscribe the controller to the global InputManager and translate raw inputs
 * into robot targets.
 *
 * Implementation note: the callback MUST stay referentially stable. It reads
 * the latest `state`/`actions`/`smoother` via refs so that the InputManager
 * listener is installed once and not re-subscribed on every state change.
 * See the "Maximum update depth" incident for why this matters.
 */
export function useControllerInput(): UseControllerInputReturn {
  const { state, actions, smoother, isActive } = useController();

  const smoothedInputsRef = useRef<SmoothedInputs>(createZeroSmoothedInputs());
  const lastFrameTimeRef = useRef<number>(performance.now());
  const wasActiveRef = useRef<boolean>(false);

  // Keep latest state/actions/smoother/isActive readable from a stable callback.
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const smootherRef = useRef(smoother);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
  useEffect(() => {
    smootherRef.current = smoother;
  }, [smoother]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const processInputs = useCallback((rawInputs: RawInputState): void => {
    if (!isActiveRef.current) return;

    const { currentTime } = getDeltaTime(lastFrameTimeRef.current);
    lastFrameTimeRef.current = currentTime;

    smoothedInputsRef.current = smoothInputs(
      smoothedInputsRef.current,
      rawInputs as unknown as RawInputs,
      SMOOTHING_FACTOR_MAP
    ) as SmoothedInputs;

    const inputs = smoothedInputsRef.current;
    const currentActions = actionsRef.current;

    if (!hasActiveInput(inputs, INPUT_THRESHOLDS.ACTIVE_INPUT)) {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        currentActions.endInteraction();
      }
      return;
    }

    if (!wasActiveRef.current) {
      wasActiveRef.current = true;
      currentActions.startGamepadInput();
    }

    const currentState = stateRef.current;
    const currentSmoother = smootherRef.current;

    const POSITION_SENSITIVITY = INPUT_MAPPING_FACTORS.POSITION;
    const ROTATION_SENSITIVITY = INPUT_MAPPING_FACTORS.ROTATION;
    const BODY_YAW_SENSITIVITY = INPUT_MAPPING_FACTORS.BODY_YAW;

    const newX = inputs.moveForward * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY;
    const newY = inputs.moveRight * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY;
    const zIncrement = inputs.moveUp * ROBOT_POSITION_RANGES.POSITION.max * POSITION_SENSITIVITY;
    const newZ = currentState.headPose.z + zIncrement;

    const mappedPitch = mapInputToRobot(inputs.lookVertical, 'pitch');
    const mappedYaw = mapInputToRobot(inputs.lookHorizontal, 'yaw');
    const newPitch = mappedPitch * EXTENDED_ROBOT_RANGES.PITCH.max * ROTATION_SENSITIVITY;
    const newYaw = mappedYaw * EXTENDED_ROBOT_RANGES.YAW.max * ROTATION_SENSITIVITY;
    const newRoll = inputs.roll * ROBOT_POSITION_RANGES.ROLL.max * ROTATION_SENSITIVITY;

    const targetHeadPose: HeadPose = clampHeadPose({
      x: newX,
      y: newY,
      z: newZ,
      pitch: newPitch,
      yaw: newYaw,
      roll: newRoll,
    });

    const bodyYawIncrement =
      inputs.bodyYaw *
      (ROBOT_POSITION_RANGES.BODY_YAW.max - ROBOT_POSITION_RANGES.BODY_YAW.min) *
      BODY_YAW_SENSITIVITY;
    const newBodyYaw = clampBodyYaw(currentState.bodyYaw + bodyYawIncrement);

    const antennaRange = ROBOT_POSITION_RANGES.ANTENNA.max - ROBOT_POSITION_RANGES.ANTENNA.min;
    const targetAntennas = clampAntennas([
      ROBOT_POSITION_RANGES.ANTENNA.min + inputs.antennaLeft * antennaRange,
      ROBOT_POSITION_RANGES.ANTENNA.min + inputs.antennaRight * antennaRange,
    ]);

    currentActions.updateAll({
      headPose: targetHeadPose,
      bodyYaw: newBodyYaw,
      antennas: targetAntennas,
    });

    currentSmoother.setTargets({
      headPose: targetHeadPose,
      antennas: targetAntennas,
      bodyYaw: newBodyYaw,
    });
  }, []);

  // Subscribe once while active. End the interaction on unmount/deactivation ONLY.
  useEffect(() => {
    if (!isActive) return;

    const inputManager = getInputManager();
    const unsubscribe = inputManager.addListener(processInputs);

    return () => {
      unsubscribe();
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        actionsRef.current.endInteraction();
      }
    };
  }, [isActive, processInputs]);

  return { processInputs };
}
