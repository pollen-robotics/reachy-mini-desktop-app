import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import URDFRobot from './URDFRobot';
import ScanEffect from './effects/ScanEffect';
import PremiumScanEffect from './effects/PremiumScanEffect';
import ErrorHighlight from './effects/ErrorHighlight';
import CinematicCamera from './CinematicCamera';
import { findErrorMeshes } from '../../utils/viewer3d/findErrorMeshes';

// TODO(ts): URDFLoader augments the robot root with `links` and joint helpers.
// These aren't exposed in the upstream RobotModel type, widen locally.
interface URDFLinkedObject extends THREE.Object3D {
  links?: Record<string, THREE.Object3D>;
}

interface CameraConfig {
  position?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface SceneProps {
  headPose?: number[] | null;
  headJoints?: number[] | null;
  passiveJoints?: number[] | { array?: number[] } | null;
  yawBody?: number;
  antennas?: number[] | null;
  isActive: boolean;
  isTransparent?: boolean;
  wireframe?: boolean;
  forceLoad?: boolean;
  hideGrid?: boolean;
  showScanEffect?: boolean;
  usePremiumScan?: boolean;
  onScanComplete?: (() => void) | null;
  onScanMesh?: ((mesh: THREE.Mesh, index: number, total: number) => void) | null;
  onMeshesReady?: ((meshes: THREE.Mesh[]) => void) | null;
  onPoseReady?: ((ready: boolean) => void) | null;
  cameraConfig?: CameraConfig;
  useCinematicCamera?: boolean;
  errorFocusMesh?: THREE.Mesh | null;
  hideEffects?: boolean;
  darkMode?: boolean;
  allowZeroPose?: boolean;
  dataVersion?: number;
}

// ============================================================================
// Scene constants (hoisted out of the render to keep stable references)
// ============================================================================

const LIGHTING = {
  ambient: 0.3,
  keyIntensity: 1.8,
  fillIntensity: 0.3,
  rimIntensity: 0.8,
} as const;

const SCENE = {
  showGrid: true,
  fogDistance: 2.5,
} as const;

const XRAY_OPACITY_LIGHT = 0.2;
const XRAY_OPACITY_DARK = 0.05;

const FOG_COLOR_LIGHT = '#fdfcfa';
const FOG_COLOR_DARK = '#1a1a1a';

const GRID_COLORS = {
  light: { major: '#999999', minor: '#cccccc', opacity: 0.5 },
  dark: { major: '#555555', minor: '#333333', opacity: 0.4 },
} as const;

const SCAN_COLORS = {
  standard: '#16a34a',
  premium: '#00ff88',
} as const;

const ERROR_COLOR = '#ff0000';

// Dev-only helper: expose latest kinematics payload on window for debugging.
// Never enabled in production builds.
function exposeKinematicsForDebug(payload: {
  headJoints: number[];
  passiveJoints: unknown;
  headPose: number[] | null | undefined;
}): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as { kinematics: unknown }).kinematics = {
    ...payload,
    timestamp: new Date().toISOString(),
  };
}

function Scene({
  headPose,
  headJoints,
  passiveJoints,
  yawBody,
  antennas,
  isActive,
  isTransparent,
  wireframe = false,
  forceLoad = false,
  hideGrid = false,
  showScanEffect = false,
  usePremiumScan = false,
  onScanComplete = null,
  onScanMesh = null,
  onMeshesReady = null,
  onPoseReady = null,
  cameraConfig = {},
  useCinematicCamera = false,
  errorFocusMesh = null,
  darkMode = false,
  allowZeroPose,
  dataVersion = 0,
}: SceneProps): React.ReactElement {
  const [outlineMeshes, setOutlineMeshes] = useState<THREE.Mesh[]>([]);
  const [robotRef, setRobotRef] = useState<URDFLinkedObject | null>(null);

  useEffect(() => {
    if (onMeshesReady && outlineMeshes.length > 0) {
      onMeshesReady(outlineMeshes);
    }
  }, [onMeshesReady, outlineMeshes]);

  const lastHeadJointsRef = useRef<number[] | null>(null);
  const lastHasPassiveJointsRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!headJoints || headJoints.length !== 7) return;

    const prev = lastHeadJointsRef.current;
    const headJointsChanged =
      !prev || headJoints.some((v, i) => Math.abs(v - (prev[i] ?? 0)) > 0.001);
    const hasPassiveJoints = !!passiveJoints;
    const passiveJointsChanged = hasPassiveJoints !== lastHasPassiveJointsRef.current;

    if (!headJointsChanged && !passiveJointsChanged) return;

    exposeKinematicsForDebug({ headJoints, passiveJoints, headPose });
    lastHeadJointsRef.current = headJoints;
    lastHasPassiveJointsRef.current = hasPassiveJoints;
  }, [headJoints, passiveJoints, headPose]);

  const xrayOpacity = darkMode ? XRAY_OPACITY_DARK : XRAY_OPACITY_LIGHT;
  const fogColor = darkMode ? FOG_COLOR_DARK : FOG_COLOR_LIGHT;

  const gridHelper = useMemo(() => {
    const palette = darkMode ? GRID_COLORS.dark : GRID_COLORS.light;
    const grid = new THREE.GridHelper(2, 20, palette.major, palette.minor);
    const gridMat = grid.material as THREE.Material & {
      opacity: number;
      transparent: boolean;
      fog: boolean;
    };
    gridMat.opacity = palette.opacity;
    gridMat.transparent = true;
    gridMat.fog = true;
    return grid;
  }, [darkMode]);

  const errorMeshes = useMemo(
    () => findErrorMeshes(errorFocusMesh, robotRef, outlineMeshes),
    [errorFocusMesh, robotRef, outlineMeshes]
  );

  return (
    <>
      <fog attach="fog" args={[fogColor, 1, SCENE.fogDistance]} />

      <ambientLight intensity={LIGHTING.ambient} />

      <directionalLight
        position={[2, 4, 2]}
        intensity={LIGHTING.keyIntensity}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <directionalLight position={[-2, 2, 1.5]} intensity={LIGHTING.fillIntensity} />

      <directionalLight position={[0, 3, -2]} intensity={LIGHTING.rimIntensity} color="#FFB366" />

      {!hideGrid && SCENE.showGrid && <primitive object={gridHelper} position={[0, 0, 0]} />}

      <URDFRobot
        headJoints={headJoints}
        passiveJoints={passiveJoints}
        yawBody={yawBody}
        antennas={antennas}
        isActive={isActive}
        isTransparent={isTransparent}
        wireframe={wireframe}
        xrayOpacity={xrayOpacity}
        onMeshesReady={setOutlineMeshes}
        onRobotReady={(r: THREE.Object3D) => setRobotRef(r as URDFLinkedObject)}
        onPoseReady={onPoseReady ?? undefined}
        forceLoad={forceLoad}
        allowZeroPose={allowZeroPose}
        dataVersion={dataVersion}
      />

      {showScanEffect &&
        (usePremiumScan ? (
          <PremiumScanEffect
            meshes={outlineMeshes}
            scanColor={SCAN_COLORS.premium}
            enabled={true}
            onScanMesh={(mesh, index, total) => onScanMesh?.(mesh, index, total)}
            onComplete={() => onScanComplete?.()}
          />
        ) : (
          <ScanEffect
            meshes={outlineMeshes}
            scanColor={SCAN_COLORS.standard}
            enabled={true}
            onScanMesh={(mesh, index, total) => onScanMesh?.(mesh, index, total)}
            onComplete={() => onScanComplete?.()}
          />
        ))}

      {errorFocusMesh && (
        <ErrorHighlight
          errorMesh={errorFocusMesh}
          errorMeshes={errorMeshes}
          allMeshes={outlineMeshes}
          errorColor={ERROR_COLOR}
          enabled={true}
        />
      )}

      {useCinematicCamera ? (
        <CinematicCamera
          initialPosition={cameraConfig.position || [0, 0.22, 0.35]}
          target={cameraConfig.target || [0, 0.12, 0]}
          fov={cameraConfig.fov || 55}
          enabled={true}
          errorFocusMesh={errorFocusMesh}
        />
      ) : (
        <OrbitControls
          enablePan={false}
          enableRotate={true}
          enableZoom={true}
          enableDamping={true}
          dampingFactor={0.05}
          target={cameraConfig.target || [0, 0.2, 0]}
          minDistance={cameraConfig.minDistance || 0.2}
          maxDistance={cameraConfig.maxDistance || 10}
        />
      )}
    </>
  );
}

export default memo(Scene, (prevProps, nextProps) => {
  if (
    prevProps.isActive !== nextProps.isActive ||
    prevProps.isTransparent !== nextProps.isTransparent ||
    prevProps.wireframe !== nextProps.wireframe ||
    prevProps.forceLoad !== nextProps.forceLoad ||
    prevProps.hideGrid !== nextProps.hideGrid ||
    prevProps.showScanEffect !== nextProps.showScanEffect ||
    prevProps.useCinematicCamera !== nextProps.useCinematicCamera ||
    prevProps.hideEffects !== nextProps.hideEffects ||
    prevProps.darkMode !== nextProps.darkMode ||
    prevProps.allowZeroPose !== nextProps.allowZeroPose ||
    prevProps.errorFocusMesh !== nextProps.errorFocusMesh
  ) {
    return false;
  }

  if (prevProps.dataVersion !== nextProps.dataVersion) {
    return false;
  }

  return true;
});
