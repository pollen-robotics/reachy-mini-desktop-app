import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import urdfFile from '../assets/robot-3d/reachy-mini.urdf?raw';

/**
 * Global cache for robot URDF model. Allows loading the model once at app
 * startup and reusing it in all components.
 */

type RobotModel = THREE.Object3D & { clone: () => THREE.Object3D };
type ModelListener = (model: RobotModel | null) => void;

class RobotModelCache {
  robotModel: RobotModel | null;
  isLoading: boolean;
  isLoaded: boolean;
  loadPromise: Promise<RobotModel> | null;
  listeners: Set<ModelListener>;
  version: string;

  constructor() {
    this.robotModel = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.loadPromise = null;
    this.listeners = new Set();
    // Bump this version to force reload from cache.
    this.version = 'v20-debug-merge-vertices';
  }

  /**
   * Intelligent smooth normal calculation. Analyzes geometry to detect curved
   * surfaces vs sharp edges and returns an adaptive smoothing angle (radians).
   */
  computeIntelligentSmoothAngle(geometry: THREE.BufferGeometry): number {
    if (!geometry.attributes.position) return Math.PI / 3;

    const positions = geometry.attributes.position.array as ArrayLike<number>;
    const vertexCount = positions.length / 3;

    if (vertexCount < 3) return Math.PI / 3;

    const hasIndex = geometry.index !== null;
    const indices = hasIndex ? (geometry.index!.array as ArrayLike<number>) : null;

    const faceNormals: THREE.Vector3[] = [];
    const tempV0 = new THREE.Vector3();
    const tempV1 = new THREE.Vector3();
    const tempV2 = new THREE.Vector3();
    const tempEdge1 = new THREE.Vector3();
    const tempEdge2 = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();

    let faceCount: number;
    if (hasIndex && indices) {
      if (indices.length % 3 !== 0) {
        console.warn('Invalid index count, not a multiple of 3');
        return Math.PI / 3;
      }
      faceCount = indices.length / 3;
    } else {
      if (vertexCount % 3 !== 0) {
        console.warn('Invalid vertex count for non-indexed geometry, not a multiple of 3');
        return Math.PI / 3;
      }
      faceCount = vertexCount / 3;
    }

    for (let i = 0; i < faceCount; i++) {
      let idx0: number;
      let idx1: number;
      let idx2: number;

      if (hasIndex && indices) {
        const baseIdx = i * 3;
        idx0 = indices[baseIdx];
        idx1 = indices[baseIdx + 1];
        idx2 = indices[baseIdx + 2];

        if (
          idx0 >= vertexCount ||
          idx1 >= vertexCount ||
          idx2 >= vertexCount ||
          idx0 < 0 ||
          idx1 < 0 ||
          idx2 < 0
        ) {
          continue;
        }
      } else {
        idx0 = i * 3;
        idx1 = i * 3 + 1;
        idx2 = i * 3 + 2;

        if (idx0 >= vertexCount || idx1 >= vertexCount || idx2 >= vertexCount) {
          continue;
        }
      }

      const pos0Idx = idx0 * 3;
      const pos1Idx = idx1 * 3;
      const pos2Idx = idx2 * 3;

      if (
        pos0Idx + 2 >= positions.length ||
        pos1Idx + 2 >= positions.length ||
        pos2Idx + 2 >= positions.length
      ) {
        continue;
      }

      tempV0.set(positions[pos0Idx], positions[pos0Idx + 1], positions[pos0Idx + 2]);
      tempV1.set(positions[pos1Idx], positions[pos1Idx + 1], positions[pos1Idx + 2]);
      tempV2.set(positions[pos2Idx], positions[pos2Idx + 1], positions[pos2Idx + 2]);

      tempEdge1.subVectors(tempV1, tempV0);
      tempEdge2.subVectors(tempV2, tempV0);
      tempNormal.crossVectors(tempEdge1, tempEdge2);

      const length = tempNormal.length();
      if (length > 1e-10) {
        tempNormal.normalize();
        faceNormals.push(tempNormal.clone());
      }
    }

    if (faceNormals.length < 3) return Math.PI / 3;

    const angles: number[] = [];
    const sampleSize = Math.min(200, faceNormals.length * 2);

    for (let i = 0; i < sampleSize; i++) {
      const idx1 = Math.floor(Math.random() * faceNormals.length);
      const idx2 = Math.floor(Math.random() * faceNormals.length);

      if (idx1 !== idx2) {
        const normal1 = faceNormals[idx1];
        const normal2 = faceNormals[idx2];
        const dot = normal1.dot(normal2);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (!isNaN(angle) && isFinite(angle)) {
          angles.push(angle);
        }
      }
    }

    if (angles.length < 10) return Math.PI / 3;

    angles.sort((a, b) => a - b);
    const median = angles[Math.floor(angles.length / 2)];
    const p25 = angles[Math.floor(angles.length * 0.25)];
    const p75 = angles[Math.floor(angles.length * 0.75)];
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;

    let smoothAngle: number;
    if (median < Math.PI / 6 && mean < Math.PI / 4) {
      // Mostly curved surfaces: smooth aggressively
      smoothAngle = Math.PI / 2;
    } else if (median < Math.PI / 3 && mean < Math.PI / 2) {
      // Mixed geometry: keep sharp edges, smooth most surfaces
      smoothAngle = Math.min(p75 * 1.3, Math.PI / 2);
      smoothAngle = Math.max(smoothAngle, Math.PI / 4);
    } else {
      // Many sharp edges: only smooth clearly curved surfaces
      smoothAngle = Math.max(p25 * 1.2, Math.PI / 6);
    }

    smoothAngle = Math.max(Math.PI / 6, Math.min(Math.PI / 2, smoothAngle));

    return smoothAngle;
  }

  /** Loads URDF model and caches it. */
  async load(): Promise<RobotModel> {
    try {
      const cachedVersion = localStorage.getItem('robotModelCacheVersion');
      if (cachedVersion !== this.version) {
        this.clear();
        localStorage.setItem('robotModelCacheVersion', this.version);
      }
    } catch {
      /* ignore storage failures */
    }

    if (this.isLoaded && this.robotModel) {
      return this.robotModel;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;

    this.loadPromise = (async () => {
      try {
        const loader = new URDFLoader();

        const stlFileMap = new Map<string, string>();

        loader.manager.setURLModifier((url: string) => {
          const filename = url.split('/').pop() ?? url;
          const localUrl = new URL(`../assets/robot-3d/meshes/${filename}`, import.meta.url).href;
          stlFileMap.set(url, filename);
          stlFileMap.set(localUrl, filename);
          return localUrl;
        });

        loader.manager.addHandler(/\.stl$/i, {
          load: (url: string) => {
            const filename = url.split('/').pop() ?? url;
            stlFileMap.set(url, filename);
          },
        } as unknown as THREE.Loader);

        const robotModel = loader.parse(urdfFile) as RobotModel;

        // Wait for ALL STL files to be loaded (loader is async).
        await new Promise<void>(resolveLoading => {
          if (loader.manager.onLoad) {
            const originalOnLoad = loader.manager.onLoad;
            loader.manager.onLoad = (): void => {
              if (originalOnLoad) originalOnLoad();
              resolveLoading();
            };
          } else {
            loader.manager.onLoad = (): void => resolveLoading();
          }

          // Safety timeout (2 seconds max)
          setTimeout(() => resolveLoading(), 2000);
        });

        robotModel.traverse((child: THREE.Object3D) => {
          const mesh = child as THREE.Mesh & {
            isMesh?: boolean;
            material?: THREE.Material & { color?: THREE.Color; name?: string };
            geometry?: THREE.BufferGeometry & {
              userData?: {
                url?: string;
                sourceFile?: string;
                filename?: string;
                sourceURL?: string;
              };
            };
          };
          if (!mesh.isMesh) return;

          let stlFileName = '';
          if (mesh.geometry) {
            const possibleUrls = [
              mesh.geometry.userData?.url,
              mesh.geometry.userData?.sourceFile,
              mesh.geometry.userData?.filename,
              mesh.geometry.userData?.sourceURL,
            ].filter((u): u is string => Boolean(u));

            for (const url of possibleUrls) {
              const mappedName = stlFileMap.get(url);
              if (mappedName) {
                stlFileName = mappedName;
                break;
              }
              const filename = url.split('/').pop() ?? '';
              if (filename && filename.toLowerCase().endsWith('.stl')) {
                stlFileName = filename;
                break;
              }
            }
          }

          if (stlFileName) {
            mesh.userData.stlFileName = stlFileName;
          }

          // Flat shading: STL files have separate vertices per face. Removing
          // any existing normals lets Three.js compute face normals
          // automatically with `flatShading: true`.
          if (mesh.geometry) {
            if (mesh.geometry.attributes.normal) {
              mesh.geometry.deleteAttribute('normal');
            }
          }

          let originalColor = 0xff9500;
          if (mesh.material && mesh.material.color) {
            originalColor = mesh.material.color.getHex();
          }
          mesh.userData.originalColor = originalColor;

          if (mesh.material && mesh.material.name) {
            mesh.userData.materialName = mesh.material.name;
          }

          const materialName = (mesh.material?.name || '').toLowerCase();
          const stlFileNameLower = String(mesh.userData.stlFileName ?? '').toLowerCase();
          const isBigLens =
            materialName.includes('big_lens') ||
            materialName.includes('small_lens') ||
            materialName.includes('lens_d40') ||
            materialName.includes('lens_d30');
          const isAntenna =
            originalColor === 0xff9500 ||
            materialName.includes('antenna') ||
            stlFileNameLower.includes('antenna');

          mesh.userData.isAntenna = isAntenna;
          mesh.userData.isBigLens = isBigLens;
        });

        this.robotModel = robotModel;
        this.isLoaded = true;
        this.isLoading = false;

        this.notifyListeners();

        return robotModel;
      } catch (err) {
        console.error('[Cache] URDF loading error:', err);
        this.isLoading = false;
        throw err;
      }
    })();

    return this.loadPromise;
  }

  /** Gets the model (loads if necessary). */
  async getModel(): Promise<RobotModel> {
    if (this.isLoaded && this.robotModel) {
      return this.robotModel;
    }
    return this.load();
  }

  /**
   * Clones the model for use in a scene (necessary to avoid conflicts when
   * used in multiple scenes).
   */
  cloneModel(): THREE.Object3D | null {
    if (!this.robotModel) {
      console.warn('[Cache] Model not loaded yet');
      return null;
    }
    return this.robotModel.clone();
  }

  isModelLoaded(): boolean {
    return this.isLoaded && this.robotModel !== null;
  }

  /** Adds a listener called when the model is loaded. */
  addListener(callback: ModelListener): void {
    this.listeners.add(callback);
    if (this.isLoaded) {
      callback(this.robotModel);
    }
  }

  removeListener(callback: ModelListener): void {
    this.listeners.delete(callback);
  }

  notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.robotModel);
      } catch (err) {
        console.error('Error in cache listener:', err);
      }
    });
  }

  /** Clears the cache (called on app unmount). */
  clear(): void {
    if (this.robotModel) {
      this.robotModel.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh & {
          isMesh?: boolean;
          material?: THREE.Material;
          geometry?: THREE.BufferGeometry;
        };
        if (!mesh.isMesh) return;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) (mesh.material as THREE.Material).dispose();
      });
    }
    this.robotModel = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
    this.listeners.clear();

    try {
      localStorage.removeItem('robotModelCacheVersion');
    } catch {
      /* ignore storage failures */
    }
  }
}

const robotModelCache = new RobotModelCache();

export default robotModelCache;
