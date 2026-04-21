import React, { useRef, useEffect, useLayoutEffect, useState, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import robotModelCache from '../../utils/robotModelCache';
import useAppStore from '../../store/useAppStore';
import { logInfo } from '../../utils/logging';
import { applyRobotMaterials } from '../../utils/viewer3d/applyRobotMaterials';
import { STEWART_JOINT_NAMES, PASSIVE_JOINT_NAMES } from '../../constants/robotBuffer';
import type { RobotStateFull } from '../../types/robot';

// TODO(ts): upstream RobotModel is typed as THREE.Object3D without exposing
// URDF-loader specific `joints` map and `setJointValue`. Widen locally.
interface URDFRobotModel extends THREE.Object3D {
  joints: Record<string, unknown>;
  setJointValue: (name: string, value: number) => void;
}

interface PassiveJointsLike {
  array?: number[];
}

const CLICK_THROTTLE_MS = 300;
const FRAME_UPDATE_INTERVAL = 3;

const CLICK_MESSAGES = [
  '👆 You clicked on Reachy!',
  '🤖 That tickles!',
  '✨ Nice aim!',
  '🎯 Bullseye!',
  '👋 Hey there!',
];

export interface URDFRobotProps {
  headJoints?: number[] | null;
  passiveJoints?: number[] | PassiveJointsLike | null;
  yawBody?: number;
  antennas?: number[] | null;
  isActive: boolean;
  isTransparent?: boolean;
  xrayOpacity?: number;
  wireframe?: boolean;
  onMeshesReady?: (meshes: THREE.Mesh[]) => void;
  onRobotReady?: (robot: THREE.Object3D) => void;
  onPoseReady?: (ready: boolean) => void;
  forceLoad?: boolean;
  /**
   * If true, mount the robot with a zero pose even when no pose data is
   * available. Useful for scan / xray views that don't stream real joints.
   * Defaults to true when `isActive` is false.
   */
  allowZeroPose?: boolean;
  dataVersion?: number;
}

function applyHeadJoints(robot: URDFRobotModel, headJoints: number[]): void {
  if (robot.joints['yaw_body']) robot.setJointValue('yaw_body', headJoints[0]);
  STEWART_JOINT_NAMES.forEach((jointName, index) => {
    if (robot.joints[jointName]) {
      robot.setJointValue(jointName, headJoints[index + 1]);
    }
  });
}

function applyPassiveJoints(robot: URDFRobotModel, passiveArray: number[]): void {
  for (let i = 0; i < 21; i++) {
    const jointName = PASSIVE_JOINT_NAMES[i];
    if (robot.joints[jointName]) {
      robot.setJointValue(jointName, passiveArray[i]);
    }
  }
}

function applyAntennaJoints(robot: URDFRobotModel, antennas: number[]): void {
  if (robot.joints['left_antenna']) robot.setJointValue('left_antenna', -antennas[1]);
  if (robot.joints['right_antenna']) robot.setJointValue('right_antenna', -antennas[0]);
}

function resetAllJoints(robot: URDFRobotModel): void {
  if (robot.joints['yaw_body']) robot.setJointValue('yaw_body', 0);
  STEWART_JOINT_NAMES.forEach(name => {
    if (robot.joints[name]) robot.setJointValue(name, 0);
  });
  PASSIVE_JOINT_NAMES.forEach(name => {
    if (robot.joints[name]) robot.setJointValue(name, 0);
  });
}

function URDFRobot({
  headJoints,
  passiveJoints,
  yawBody,
  antennas,
  isActive,
  isTransparent,
  xrayOpacity = 0.5,
  wireframe = false,
  onMeshesReady,
  onRobotReady,
  onPoseReady,
  forceLoad = false,
  allowZeroPose,
  dataVersion = 0,
}: URDFRobotProps): React.ReactElement | null {
  const [robot, setRobot] = useState<URDFRobotModel | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const groupRef = useRef<THREE.Object3D>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const pendingRobotRef = useRef<URDFRobotModel | null>(null);
  const { camera, gl } = useThree();
  const darkMode = useAppStore(state => state.darkMode);
  const robotStateFull = useAppStore(state => state.robotStateFull) as RobotStateFull;

  const robotStateFullRef = useRef<RobotStateFull | null>(null);
  if (!robotStateFull?.data) {
    robotStateFullRef.current = null;
  } else if (!robotStateFullRef.current && robotStateFull?.data?.head_joints) {
    robotStateFullRef.current = robotStateFull;
  }

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const frameCountRef = useRef<number>(0);
  const lastClickTimeRef = useRef<number>(0);
  const lastAppliedVersionRef = useRef<number>(-1);

  const shouldWaitForPose = allowZeroPose !== undefined ? !allowZeroPose : isActive;

  useEffect(() => {
    onPoseReady?.(isReady);
  }, [isReady, onPoseReady]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent): void => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handleClick = (event: MouseEvent): void => {
      if (!robot) return;

      const now = Date.now();
      if (now - lastClickTimeRef.current < CLICK_THROTTLE_MS) return;
      lastClickTimeRef.current = now;

      requestAnimationFrame(() => {
        const rect = gl.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const intersects = raycaster.current.intersectObject(robot, true);

        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh & {
            isMesh?: boolean;
            userData: { isErrorMesh?: boolean; [key: string]: unknown };
          };
          if (mesh.isMesh && !mesh.userData.isErrorMesh) {
            logInfo(CLICK_MESSAGES[Math.floor(Math.random() * CLICK_MESSAGES.length)]);
          }
        }
      });
    };

    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('click', handleClick);
    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('click', handleClick);
    };
  }, [gl, camera, robot]);

  useEffect(() => {
    if (!isActive && !forceLoad) {
      setRobot(null);
      setIsReady(false);
      pendingRobotRef.current = null;
      return;
    }

    let isMounted = true;

    robotModelCache
      .getModel()
      .then(cachedModel => {
        if (!isMounted) return;

        const robotModel = (cachedModel as unknown as URDFRobotModel).clone(true) as URDFRobotModel;

        const collectedMeshes: THREE.Mesh[] = [];
        robotModel.traverse(child => {
          if ((child as THREE.Mesh).isMesh) collectedMeshes.push(child as THREE.Mesh);
        });
        meshesRef.current = collectedMeshes;
        onMeshesReady?.(collectedMeshes);
        onRobotReady?.(robotModel);

        if (!robotModel?.joints) {
          setRobot(robotModel);
          return;
        }

        const data = robotStateFullRef.current?.data as
          | (RobotStateFull['data'] & { antennas?: number[] })
          | null
          | undefined;
        const initialJoints = data?.head_joints;
        const hasValidInitialJoints = Array.isArray(initialJoints) && initialJoints.length === 7;

        if (hasValidInitialJoints && initialJoints) {
          applyHeadJoints(robotModel, initialJoints);

          const initialAntennas = data?.antennas;
          if (Array.isArray(initialAntennas) && initialAntennas.length === 2) {
            applyAntennaJoints(robotModel, initialAntennas);
          }

          const initialPassiveJoints = data?.passive_joints;
          if (Array.isArray(initialPassiveJoints) && initialPassiveJoints.length >= 21) {
            applyPassiveJoints(robotModel, initialPassiveJoints);
          }
        } else {
          resetAllJoints(robotModel);
        }

        robotModel.traverse(child => {
          if ((child as THREE.Object3D).isObject3D) {
            child.updateMatrix();
            child.updateMatrixWorld(true);
          }
        });

        if (hasValidInitialJoints || !shouldWaitForPose) {
          setRobot(robotModel);
          return;
        }

        // Defer mounting until the first valid pose arrives via useFrame.
        // Keeps the user from seeing the default zero-pose between mount
        // and the first websocket frame.
        pendingRobotRef.current = robotModel;
      })
      .catch(err => {
        console.error('URDF loading error:', err);
      });

    return () => {
      isMounted = false;
      pendingRobotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, forceLoad, onMeshesReady, shouldWaitForPose]);

  useFrame(() => {
    const hasValidHeadJoints = Array.isArray(headJoints) && headJoints.length === 7;

    if (pendingRobotRef.current && hasValidHeadJoints) {
      const pending = pendingRobotRef.current;
      applyHeadJoints(pending, headJoints as number[]);

      if (passiveJoints) {
        const passiveArray = Array.isArray(passiveJoints)
          ? passiveJoints
          : (passiveJoints as PassiveJointsLike).array;
        if (passiveArray && passiveArray.length >= 21) {
          applyPassiveJoints(pending, passiveArray);
        }
      }

      if (antennas && Array.isArray(antennas) && antennas.length >= 2) {
        applyAntennaJoints(pending, antennas);
      }

      pending.traverse(child => {
        if ((child as THREE.Object3D).isObject3D) {
          child.updateMatrix();
          child.updateMatrixWorld(true);
        }
      });

      pendingRobotRef.current = null;
      lastAppliedVersionRef.current = dataVersion;
      setRobot(pending);
      return;
    }

    if (!robot) return;
    if (!isActive && !forceLoad) return;

    frameCountRef.current++;
    if (frameCountRef.current % FRAME_UPDATE_INTERVAL !== 0) return;

    if (dataVersion === lastAppliedVersionRef.current) return;
    lastAppliedVersionRef.current = dataVersion;

    if (hasValidHeadJoints) {
      applyHeadJoints(robot, headJoints as number[]);
    } else if (yawBody !== undefined && robot.joints['yaw_body']) {
      robot.setJointValue('yaw_body', yawBody);
    }

    if (passiveJoints) {
      const passiveArray = Array.isArray(passiveJoints)
        ? passiveJoints
        : (passiveJoints as PassiveJointsLike).array;
      if (passiveArray && passiveArray.length >= 21) {
        applyPassiveJoints(robot, passiveArray);
      }
    }

    if (antennas && Array.isArray(antennas) && antennas.length >= 2) {
      applyAntennaJoints(robot, antennas);
    }
  });

  useLayoutEffect(() => {
    if (!robot) return;

    applyRobotMaterials(robot, {
      transparent: isTransparent,
      wireframe,
      xrayOpacity,
      darkMode,
    });

    if (!isReady) setIsReady(true);
  }, [robot, isTransparent, xrayOpacity, wireframe, darkMode, isReady]);

  return robot && isReady ? (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive ref={groupRef} object={robot} scale={1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  ) : null;
}

const URDFRobotMemo = memo(URDFRobot, (prevProps, nextProps) => {
  if (
    prevProps.isActive !== nextProps.isActive ||
    prevProps.isTransparent !== nextProps.isTransparent ||
    prevProps.wireframe !== nextProps.wireframe ||
    prevProps.forceLoad !== nextProps.forceLoad ||
    prevProps.xrayOpacity !== nextProps.xrayOpacity ||
    prevProps.allowZeroPose !== nextProps.allowZeroPose ||
    prevProps.dataVersion !== nextProps.dataVersion
  ) {
    return false;
  }
  return true;
});

export default URDFRobotMemo;
