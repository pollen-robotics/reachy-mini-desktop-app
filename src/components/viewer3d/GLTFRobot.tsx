import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import glbUrl from '../../assets/robot-3d/reachy_mini_viz.glb?url';

// Draco-compressed glb; decoder vendored at public/draco (offline desktop app,
// so we can't use drei's default CDN decoder path).
const DRACO_PATH = '/draco/';
useGLTF.preload(glbUrl, DRACO_PATH);

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
// head_pose translation (metres) -> model units. Calibrated so the head's
// vertical travel stays within the Stewart platform's reach (see HEAD_Z_* below).
const UNITS_PER_M = 1.7;
// Platform head-Z reach measured from the rig (model units, relative to rest):
// it saturates at +0.044 up / -0.085 down. Clamp so the head can't be driven
// past where the legs physically reach (the real mechanical limit).
const HEAD_Z_MAX = 0.044;
const HEAD_Z_MIN = -0.085;
// Robot frame (X-fwd, Y-left, Z-up) -> glb model frame (Blender world: X-right,
// Y-fwd, Z-up). That's the proper change of basis from the rig's `C` matrix,
// which works out to Rz(+90) here. Applied as a conjugation R_model = M·R·M⁻¹
// (det +1, no reflection).
const HEAD_FRAME_YAW_OFFSET = Math.PI / 2;
const HEAD_FIX = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  HEAD_FRAME_YAW_OFFSET
);
const HEAD_FIX_INV = HEAD_FIX.clone().invert();
const YAW_SIGN = 1;
const ANT_AXIS = new THREE.Vector3(0, 0, 1); // antenna hinge axis in glb space
const ANT_SIGN = -1; // URDF path used -antennas[i]

// Exponential smoothing rate (1/s) for the streamed pose: the daemon pushes at
// a much lower rate than the render loop, so easing toward the latest sample
// keeps motion fluid at 60 fps. Higher = snappier, lower = smoother.
const SMOOTH_K = 15;

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

// GLTFLoader sanitizes '.' out of node names ("Core.001" -> "Core001"),
// so look bones up by a normalized key.
const norm = (s: string): string => s.replace(/[^a-z0-9]/gi, '').toLowerCase();

// --- Neck leg IK -----------------------------------------------------------
// Each leg is a 4-bone chain that, in Blender, IK-solves so its tip reaches a
// target riding on the head. glTF can't carry that, so we re-solve it here with
// a small CCD pass: target rides on the head bone, effector sits at the leg
// tip, and we rotate the chain each frame to close the gap. Bielles/motors are
// rigidly parented to these bones, so they follow.
const LEG_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const; // all 6 Stewart legs
const LEG_IK_ITERATIONS = 12;
// Per-chain-bone DOF (identical for all 6 legs). Verified against Blender's IK
// solve (posed the head, measured each bone's rotation axis):
//   .001 fixed base — outside the IK chain, never rotates
//   .002 lower bielle: 1-DOF hinge about local X (purely, on all 6 legs)
//   .003 rigid
//   .004 .360 / Bielle_360: free ball joint (the IK-constrained bone)
type Dof = 'free' | 'hingeX' | 'locked';
const LEG_DOF: Dof[] = ['locked', 'hingeX', 'locked', 'free'];
const HINGE_AXIS = new THREE.Vector3(1, 0, 0); // .002 bielle hinge = bone local X

interface LegChain {
  chain: THREE.Object3D[]; // root -> tip bones (Neck.X.001 .. .004)
  restQ: THREE.Quaternion[]; // chain bones' rest rotations (the correct fold)
  effector: THREE.Object3D; // tip point, child of the last bone
  target: THREE.Object3D; // attach point, child of the head bone (rides on it)
}

function setupLeg(
  id: string,
  byName: Record<string, THREE.Object3D>,
  head: THREE.Object3D
): LegChain | null {
  const chain = ['001', '002', '003', '004'].map(s => byName[norm(`Neck.${id}.${s}`)]);
  const ikTarget = byName[norm(`Neck.loc.IK.${id}`)];
  if (chain.some(b => !b) || !ikTarget) {
    console.warn(`[GLTFRobot] leg ${id}: missing bones, IK skipped`);
    return null;
  }
  // Rest attach point = the leg's IK target position (where the tip meets head).
  const attach = ikTarget.getWorldPosition(new THREE.Vector3());
  const effector = new THREE.Object3D();
  chain[3].add(effector);
  effector.position.copy(chain[3].worldToLocal(attach.clone()));
  const target = new THREE.Object3D();
  head.add(target);
  target.position.copy(head.worldToLocal(attach.clone()));
  const restQ = chain.map(b => b!.quaternion.clone());
  return { chain: chain as THREE.Object3D[], restQ, effector, target };
}

// CCD scratch (module-level, no per-frame allocation).
const _jp = new THREE.Vector3();
const _ep = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _hw = new THREE.Vector3();
const _cx = new THREE.Vector3();
const _qr = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

function solveLeg(leg: LegChain, iterations: number): void {
  // Start from the rest fold each frame so CCD converges in the correct branch
  // (otherwise it can drift into a mirrored fold and a leg crosses to a
  // neighbour's ball). Head motion is small, so a few iterations from rest reach.
  for (let i = 0; i < leg.chain.length; i++) leg.chain[i].quaternion.copy(leg.restQ[i]);
  leg.chain[0].updateWorldMatrix(false, true);
  leg.target.getWorldPosition(_tp);
  for (let it = 0; it < iterations; it++) {
    // Root-first: drive the reach DOF (.002 hinge) before the free tip ball
    // (.004) can "cheat" by pointing the rod at the target and stalling .002.
    for (let i = 0; i < leg.chain.length; i++) {
      const dof = LEG_DOF[i];
      if (dof === 'locked') continue; // rigid bone, never rotates
      const joint = leg.chain[i];
      leg.effector.getWorldPosition(_ep);
      if (_ep.distanceToSquared(_tp) < 1e-8) return;
      joint.getWorldPosition(_jp);
      joint.getWorldQuaternion(_qw);
      if (dof === 'free') {
        _v1.subVectors(_ep, _jp).normalize();
        _v2.subVectors(_tp, _jp).normalize();
        _qr.setFromUnitVectors(_v1, _v2); // free 3-DOF: point effector at target
      } else {
        // 1-DOF hinge: optimal angle ABOUT the hinge axis (project to its plane).
        _hw.copy(HINGE_AXIS).applyQuaternion(_qw).normalize(); // hinge axis in world
        _v1.subVectors(_ep, _jp).projectOnPlane(_hw);
        _v2.subVectors(_tp, _jp).projectOnPlane(_hw);
        if (_v1.lengthSq() < 1e-12 || _v2.lengthSq() < 1e-12) continue;
        _v1.normalize();
        _v2.normalize();
        const ang = Math.atan2(_cx.crossVectors(_v1, _v2).dot(_hw), _v1.dot(_v2));
        _qr.setFromAxisAngle(_hw, ang);
      }
      _qr.multiply(_qw); // -> desired world quaternion
      joint.parent?.getWorldQuaternion(_qp);
      joint.quaternion.copy(_qp.invert().multiply(_qr)); // back to local
      joint.updateWorldMatrix(false, true); // refresh effector subtree
    }
  }
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
  const { scene } = useGLTF(glbUrl, DRACO_PATH);
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
  const legs = useRef<LegChain[]>([]);
  // Body-spin axis expressed in the Core bone's PARENT frame (see setup effect).
  // Blender bones roll about their local Y, so the Core bone's local Z is NOT
  // the vertical (it points along model -Y): spinning about it makes the robot
  // tumble. We instead spin about the model's up axis (Z), mapped into the
  // parent frame so a pre-multiply gives a clean vertical yaw regardless of the
  // bone's rest orientation.
  const bodyYawAxis = useRef(new THREE.Vector3(0, 0, 1));

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
    // Map the model's up axis (Z) into the Core bone's parent frame so a
    // pre-multiplied yaw spins the body about the true vertical (see bodyYawAxis).
    const bodyNode = bones.current.body;
    if (bodyNode?.parent) {
      const parentModel = new THREE.Matrix4().multiplyMatrices(
        modelInv,
        bodyNode.parent.matrixWorld
      );
      const pq = new THREE.Quaternion();
      parentModel.decompose(new THREE.Vector3(), pq, new THREE.Vector3());
      bodyYawAxis.current.set(0, 0, 1).applyQuaternion(pq.invert()).normalize();
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
      legs.current = LEG_IDS.map(id => setupLeg(id, byName, head)).filter(
        (l): l is LegChain => l !== null
      );
    }
    onMeshesReady?.(meshes);
    onRobotReady?.(model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Latch so onPoseReady fires only once, when the first VALID head pose is
  // actually applied in the frame loop — not at bone-capture time, when the
  // model still shows its rest pose and the stream hasn't warmed up yet.
  const firstPoseFired = useRef(false);

  // scratch objects (no per-frame allocation)
  const tmp = useRef({
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: new THREE.Vector3(),
    worldQ: new THREE.Quaternion(),
    worldP: new THREE.Vector3(),
    mat: new THREE.Matrix4(),
  }).current;
  // Smoothing state: eased pose + latest stream target (no per-frame allocation).
  const sm = useRef({
    headInit: false,
    yawInit: false,
    antInit: false,
    smP: new THREE.Vector3(),
    smQ: new THREE.Quaternion(),
    tgtP: new THREE.Vector3(),
    tgtQ: new THREE.Quaternion(),
    smYaw: 0,
    smAnt: [0, 0] as [number, number],
  }).current;

  useFrame((_, delta) => {
    if (!isActive) return;
    const { body, head, antL, antR } = bones.current;
    // Exponential smoothing factor (clamp dt so a stalled tab can't jump).
    const a = 1 - Math.exp(-SMOOTH_K * Math.min(delta, 0.05));

    // Body yaw
    if (body && rest.current.body) {
      if (!sm.yawInit) {
        sm.smYaw = yawBody;
        sm.yawInit = true;
      } else {
        sm.smYaw += (yawBody - sm.smYaw) * a;
      }
      // Pre-multiply: spin about the vertical (parent-frame) axis, then the rest
      // pose. `rest * Rz(localZ)` (post-multiply) would spin about the bone's
      // local Z, which isn't vertical -> tumbling.
      tmp.q.setFromAxisAngle(bodyYawAxis.current, YAW_SIGN * sm.smYaw);
      body.quaternion.copy(tmp.q).multiply(rest.current.body);
    }

    // Head 6-DOF from the cartesian pose matrix (no Stewart IK needed — the
    // whole head is rigidly parented to this one bone). head_pose is in the
    // robot/model frame; smooth it there, then convert to the bone's local frame.
    const m = toMatrix(headPose);
    const hr = headRest.current;
    if (head && hr && m) {
      m.decompose(sm.tgtP, sm.tgtQ, tmp.s); // tgtQ = R_robot, tgtP = translation (m)
      if (!sm.headInit) {
        sm.smP.copy(sm.tgtP);
        sm.smQ.copy(sm.tgtQ);
        sm.headInit = true;
      } else {
        sm.smP.lerp(sm.tgtP, a);
        sm.smQ.slerp(sm.tgtQ, a);
      }
      tmp.p.copy(sm.smP);
      tmp.q.copy(sm.smQ);
      // Change of basis robot -> model frame: R_model = M·R·M⁻¹, t_model = M·t
      // (M = HEAD_FIX). Proper rotation, no reflection.
      tmp.q.premultiply(HEAD_FIX).multiply(HEAD_FIX_INV);
      tmp.p.applyQuaternion(HEAD_FIX);
      // target world (model-frame) orientation: rotate rest by R in model axes
      tmp.worldQ.copy(tmp.q).multiply(hr.q);
      // target world (model-frame) position: head pivot + translation, with Z
      // clamped to the platform's reach so the legs can always follow.
      tmp.worldP.copy(hr.p).addScaledVector(tmp.p, UNITS_PER_M);
      tmp.worldP.z = Math.min(hr.p.z + HEAD_Z_MAX, Math.max(hr.p.z + HEAD_Z_MIN, tmp.worldP.z));
      tmp.mat.compose(tmp.worldP, tmp.worldQ, hr.s);
      // back to local (relative to the head bone's parent)
      tmp.mat.premultiply(hr.parentInv);
      tmp.mat.decompose(head.position, head.quaternion, head.scale);
      if (!firstPoseFired.current) {
        firstPoseFired.current = true;
        onPoseReady?.(true);
      }
    }

    // Neck leg IK: re-solve each leg so its tip tracks the head-mounted target.
    // Runs after the head is posed (targets are children of the head bone).
    for (const leg of legs.current) solveLeg(leg, LEG_IK_ITERATIONS);

    // Antennas
    if (antennas) {
      if (!sm.antInit) {
        sm.smAnt[0] = antennas[0];
        sm.smAnt[1] = antennas[1];
        sm.antInit = true;
      } else {
        sm.smAnt[0] += (antennas[0] - sm.smAnt[0]) * a;
        sm.smAnt[1] += (antennas[1] - sm.smAnt[1]) * a;
      }
      if (antL && rest.current.antL) {
        tmp.q.setFromAxisAngle(ANT_AXIS, ANT_SIGN * sm.smAnt[1]);
        antL.quaternion.copy(rest.current.antL).multiply(tmp.q);
      }
      if (antR && rest.current.antR) {
        tmp.q.setFromAxisAngle(ANT_AXIS, ANT_SIGN * sm.smAnt[0]);
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
