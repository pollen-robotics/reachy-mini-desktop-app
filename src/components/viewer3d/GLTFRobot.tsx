import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import glbUrl from '../../assets/robot-3d/reachy_mini_viz.glb?url';

useGLTF.preload(glbUrl);

// ============================================================================
// The glb is exported Z-up (export_yup=False), i.e. the robot's native frame —
// same as the URDF. So headPose applies directly: no Z-up->Y-up basis change.
// The display orientation is the same wrapper the URDF path uses (see render).
// Remaining knobs are just axis/sign/scale, native to the Z-up robot frame.
// ============================================================================
// The glb was modeled ~3x real scale; bring it to the URDF's metres.
const MODEL_SCALE = 0.5;
// Yaw to align the glb's forward with the URDF (URDF wrapper is -PI/2; the glb
// faces 90deg off, so one more -90deg). Flip if it ends up backwards.
const DISPLAY_YAW = -Math.PI;
// The glb robot is ~3.1 model-units per real metre, so head_pose translation
// (metres) maps to model units by this factor. Independent of display scale.
const UNITS_PER_M = 3.1;
const YAW_AXIS = new THREE.Vector3(0, 0, 1); // body spin = robot up axis (Z)
// The glb head frame is offset from the robot frame by a rotation about Z.
// Yaw is correct for any value here; tune this to fix pitch/roll axis mapping.
// Try: -Math.PI/2, Math.PI/2, Math.PI, 0.
const HEAD_FRAME_YAW_OFFSET = -Math.PI / 2;
const HEAD_FIX = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  HEAD_FRAME_YAW_OFFSET
);
const HEAD_FIX_INV = HEAD_FIX.clone().invert();
// head_pose pitch (rotation about robot Y) comes in with the opposite sign.
const PITCH_SIGN = -1;
const YAW_SIGN = 1;
const ANT_AXIS = new THREE.Vector3(0, 0, 1); // antenna hinge axis in glb space
const ANT_SIGN = -1; // URDF path used -antennas[i]

// Bone node names (verified present in the exported glb).
const BONE = {
  body: 'Core',
  head: 'Core.001',
  antL: 'Antenna.L.002',
  antR: 'Antenna.R.002',
} as const;

export interface GLTFRobotProps {
  headPose?: number[] | null;
  yawBody?: number;
  antennas?: number[] | null;
  isActive: boolean;
  onMeshesReady?: (meshes: THREE.Mesh[]) => void;
  onRobotReady?: (robot: THREE.Object3D) => void;
  onPoseReady?: (ready: boolean) => void;
}

function toMatrix(p: GLTFRobotProps['headPose']): THREE.Matrix4 | null {
  if (!p || p.length !== 16) return null;
  // row-major (robot) -> three is column-major, so transpose.
  return new THREE.Matrix4().fromArray(p).transpose();
}

function GLTFRobot({
  headPose,
  yawBody = 0,
  antennas,
  isActive,
  onMeshesReady,
  onRobotReady,
  onPoseReady,
}: GLTFRobotProps): React.ReactElement {
  const { scene } = useGLTF(glbUrl);
  // SkeletonUtils.clone preserves the armature + skinned-mesh bindings.
  const model = useMemo(() => skeletonClone(scene) as THREE.Object3D, [scene]);

  const bones = useRef<Record<string, THREE.Object3D | undefined>>({});
  // Local rest rotations (for body yaw + antenna hinges, applied in local space).
  const rest = useRef<Record<string, THREE.Quaternion>>({});
  // Head rest captured in MODEL space: the head bone has a large rest rotation
  // and a rotated parent chain, so we apply head_pose in the model (robot)
  // frame and convert back to the bone's local frame each update.
  const headRest = useRef<{
    parentInv: THREE.Matrix4; // parent world (model-frame) inverse
    q: THREE.Quaternion; // head world (model-frame) rest rotation
    p: THREE.Vector3; // head world (model-frame) rest position
    s: THREE.Vector3; // head world (model-frame) rest scale
  } | null>(null);

  // Capture bones + rest pose ONCE per model. (Must not depend on the parent
  // callbacks — Scene passes inline arrows, so depending on them re-runs this
  // every render and re-captures rest from already-posed bones => no motion.)
  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    model.traverse(o => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    model.updateWorldMatrix(true, true);
    const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    // GLTFLoader sanitizes '.' out of node names ("Core.001" -> "Core001"),
    // so match on a normalized key instead of the exact name.
    const norm = (s: string): string => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const byName: Record<string, THREE.Object3D> = {};
    model.traverse(o => {
      if (o.name) byName[norm(o.name)] = o;
    });
    for (const [key, name] of Object.entries(BONE)) {
      const node = byName[norm(name)];
      bones.current[key] = node;
      if (node) rest.current[key] = node.quaternion.clone();
      else console.warn(`[GLTFRobot] bone node not found: ${name}`);
    }
    const head = bones.current.head;
    if (head?.parent) {
      const headModel = new THREE.Matrix4().multiplyMatrices(modelInv, head.matrixWorld);
      const parentModel = new THREE.Matrix4().multiplyMatrices(modelInv, head.parent.matrixWorld);
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      headModel.decompose(p, q, s);
      headRest.current = { parentInv: parentModel.invert(), q, p, s };
    }
    onMeshesReady?.(meshes);
    onRobotReady?.(model);
    onPoseReady?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // scratch objects (no per-frame allocation)
  const tmp = useRef({
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: new THREE.Vector3(),
    worldQ: new THREE.Quaternion(),
    worldP: new THREE.Vector3(),
    mat: new THREE.Matrix4(),
  }).current;

  useFrame(() => {
    if (!isActive) return;
    const { body, head, antL, antR } = bones.current;

    // Body yaw
    if (body && rest.current.body) {
      tmp.q.setFromAxisAngle(YAW_AXIS, YAW_SIGN * yawBody);
      body.quaternion.copy(rest.current.body).multiply(tmp.q);
    }

    // Head 6-DOF from the cartesian pose matrix (no Stewart IK needed — the
    // whole head is rigidly parented to this one bone). head_pose is in the
    // robot/model frame; apply it there, then convert to the bone's local frame.
    const m = toMatrix(headPose);
    const hr = headRest.current;
    if (head && hr && m) {
      m.decompose(tmp.p, tmp.q, tmp.s); // tmp.q = R_robot, tmp.p = translation (m)
      tmp.q.y *= PITCH_SIGN; // flip pitch (robot Y) sign convention
      // Re-express the pose in the model's head frame: R_model = C * R * C^-1,
      // t_model = C * t  (C = HEAD_FIX, a rotation about Z). Fixes pitch/roll
      // axis mapping; yaw is unaffected.
      tmp.q.premultiply(HEAD_FIX).multiply(HEAD_FIX_INV);
      tmp.p.applyQuaternion(HEAD_FIX);
      // target world (model-frame) orientation: rotate rest by R in model axes
      tmp.worldQ.copy(tmp.q).multiply(hr.q);
      // target world (model-frame) position: head pivot + translation
      tmp.worldP.copy(hr.p).addScaledVector(tmp.p, UNITS_PER_M);
      tmp.mat.compose(tmp.worldP, tmp.worldQ, hr.s);
      // back to local (relative to the head bone's parent)
      tmp.mat.premultiply(hr.parentInv);
      tmp.mat.decompose(head.position, head.quaternion, head.scale);
    }

    // Antennas
    if (antennas) {
      if (antL && rest.current.antL) {
        tmp.q.setFromAxisAngle(ANT_AXIS, ANT_SIGN * antennas[1]);
        antL.quaternion.copy(rest.current.antL).multiply(tmp.q);
      }
      if (antR && rest.current.antR) {
        tmp.q.setFromAxisAngle(ANT_AXIS, ANT_SIGN * antennas[0]);
        antR.quaternion.copy(rest.current.antR).multiply(tmp.q);
      }
    }
  });

  // Same Z-up -> scene display wrapper as the URDF path (URDFRobot.tsx),
  // plus model scale + a yaw to match the URDF's facing.
  return (
    <group position={[0, 0, 0]} rotation={[0, DISPLAY_YAW, 0]} scale={MODEL_SCALE}>
      <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

export default GLTFRobot;
