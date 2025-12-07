import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import urdfFile from '../assets/robot-3d/reachy-mini.urdf?raw';

/**
 * Global cache for robot URDF model
 * Allows loading the model once at app startup
 * and reusing it in all components
 */

class RobotModelCache {
  constructor() {
    this.robotModel = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.loadPromise = null;
    this.listeners = new Set();
    this.version = 'v20-debug-merge-vertices'; // Change this version to force reload
  }

  /**
   * Intelligent smooth normal calculation
   * Analyzes geometry to detect curved surfaces vs sharp edges
   * Applies adaptive smoothing based on dihedral angles
   * @param {THREE.BufferGeometry} geometry - Geometry to process
   * @returns {number} Optimal smoothing angle in radians
   */
  computeIntelligentSmoothAngle(geometry) {
    if (!geometry.attributes.position) return Math.PI / 3; // Default 60°
    
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;
    
    // Need at least some vertices to analyze
    if (vertexCount < 3) return Math.PI / 3;
    
    // Handle both indexed and non-indexed geometries
    const hasIndex = geometry.index !== null;
    const indices = hasIndex ? geometry.index.array : null;
    
    // Calculate face normals
    const faceNormals = [];
    const tempV0 = new THREE.Vector3();
    const tempV1 = new THREE.Vector3();
    const tempV2 = new THREE.Vector3();
    const tempEdge1 = new THREE.Vector3();
    const tempEdge2 = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    
    // Determine face count
    let faceCount;
    if (hasIndex) {
      if (indices.length % 3 !== 0) {
        console.warn('⚠️ Invalid index count, not a multiple of 3');
        return Math.PI / 3;
      }
      faceCount = indices.length / 3;
    } else {
      if (vertexCount % 3 !== 0) {
        console.warn('⚠️ Invalid vertex count for non-indexed geometry, not a multiple of 3');
        return Math.PI / 3;
      }
      faceCount = vertexCount / 3; // Non-indexed: vertices are grouped in triangles
    }
    
    // Calculate face normals
    for (let i = 0; i < faceCount; i++) {
      let idx0, idx1, idx2;
      
      if (hasIndex) {
        const baseIdx = i * 3;
        idx0 = indices[baseIdx];
        idx1 = indices[baseIdx + 1];
        idx2 = indices[baseIdx + 2];
        
        // Validate indices
        if (idx0 >= vertexCount || idx1 >= vertexCount || idx2 >= vertexCount ||
            idx0 < 0 || idx1 < 0 || idx2 < 0) {
          continue; // Skip invalid face
        }
      } else {
        idx0 = i * 3;
        idx1 = i * 3 + 1;
        idx2 = i * 3 + 2;
        
        // Validate indices
        if (idx0 >= vertexCount || idx1 >= vertexCount || idx2 >= vertexCount) {
          continue; // Skip invalid face
        }
      }
      
      // Get vertex positions (validate array bounds)
      const pos0Idx = idx0 * 3;
      const pos1Idx = idx1 * 3;
      const pos2Idx = idx2 * 3;
      
      if (pos0Idx + 2 >= positions.length || pos1Idx + 2 >= positions.length || pos2Idx + 2 >= positions.length) {
        continue; // Skip if out of bounds
      }
      
      tempV0.set(positions[pos0Idx], positions[pos0Idx + 1], positions[pos0Idx + 2]);
      tempV1.set(positions[pos1Idx], positions[pos1Idx + 1], positions[pos1Idx + 2]);
      tempV2.set(positions[pos2Idx], positions[pos2Idx + 1], positions[pos2Idx + 2]);
      
      // Calculate face normal
      tempEdge1.subVectors(tempV1, tempV0);
      tempEdge2.subVectors(tempV2, tempV0);
      tempNormal.crossVectors(tempEdge1, tempEdge2);
      
      const length = tempNormal.length();
      if (length > 1e-10) {
        tempNormal.normalize();
        faceNormals.push(tempNormal.clone());
      }
    }
    
    if (faceNormals.length < 3) return Math.PI / 3; // Not enough faces to analyze
    
    // Analyze dihedral angles between faces
    // Sample angles between faces to understand geometry curvature
    const angles = [];
    const sampleSize = Math.min(200, faceNormals.length * 2); // Sample more for better accuracy
    
    for (let i = 0; i < sampleSize; i++) {
      const idx1 = Math.floor(Math.random() * faceNormals.length);
      const idx2 = Math.floor(Math.random() * faceNormals.length);
      
      if (idx1 !== idx2) {
        const normal1 = faceNormals[idx1];
        const normal2 = faceNormals[idx2];
        const dot = normal1.dot(normal2);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot))); // Clamp to avoid NaN
        if (!isNaN(angle) && isFinite(angle)) {
          angles.push(angle);
        }
      }
    }
    
    if (angles.length < 10) return Math.PI / 3; // Not enough samples
    
    // Calculate statistics
    angles.sort((a, b) => a - b);
    const median = angles[Math.floor(angles.length / 2)];
    const p25 = angles[Math.floor(angles.length * 0.25)];
    const p75 = angles[Math.floor(angles.length * 0.75)];
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    
    // Adaptive angle selection based on geometry analysis:
    // - Small angles (< 30°) indicate curved surfaces → smooth more
    // - Large angles (> 60°) indicate sharp edges → smooth less
    // - Use multiple percentiles for robust decision
    
    let smoothAngle;
    if (median < Math.PI / 6 && mean < Math.PI / 4) {
      // Mostly curved surfaces (median < 30°, mean < 45°)
      smoothAngle = Math.PI / 2; // 90° - smooth everything
    } else if (median < Math.PI / 3 && mean < Math.PI / 2) {
      // Mixed geometry (median 30-60°, mean < 90°)
      // Use 75th percentile as threshold - smooth most surfaces but keep sharp edges
      smoothAngle = Math.min(p75 * 1.3, Math.PI / 2);
      smoothAngle = Math.max(smoothAngle, Math.PI / 4); // At least 45°
    } else {
      // Many sharp edges (median > 60° or mean > 90°)
      // Use 25th percentile - only smooth clearly curved surfaces
      smoothAngle = Math.max(p25 * 1.2, Math.PI / 6); // At least 30°
    }
    
    // Clamp to reasonable range (30° to 90°)
    smoothAngle = Math.max(Math.PI / 6, Math.min(Math.PI / 2, smoothAngle));
    
    return smoothAngle;
  }

  /**
   * Loads URDF model and caches it
   */
  async load() {
    // Check if we need to reload due to version change
    try {
      const cachedVersion = localStorage.getItem('robotModelCacheVersion');
      if (cachedVersion !== this.version) {
        this.clear();
        localStorage.setItem('robotModelCacheVersion', this.version);
      }
    } catch (e) {}
    
    // If already loaded, return directly
    if (this.isLoaded && this.robotModel) {
      return this.robotModel;
    }

    // If loading in progress, wait for existing promise
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // New loading
    this.isLoading = true;

    this.loadPromise = (async () => {
      try {
        const loader = new URDFLoader();
        
        // ✅ Map to store STL file names by URL (original and local)
        const stlFileMap = new Map();

        // Configure loader to load meshes from local assets
        loader.manager.setURLModifier((url) => {
          const filename = url.split('/').pop();
          const localUrl = new URL(`../assets/robot-3d/meshes/${filename}`, import.meta.url).href;
          // ✅ Store file name for both URLs (original and local)
          stlFileMap.set(url, filename);
          stlFileMap.set(localUrl, filename);
          return localUrl;
        });
        
        // ✅ Intercept loading events to capture STL file names
        loader.manager.addHandler(/\.stl$/i, {
          load: (url) => {
            const filename = url.split('/').pop();
            stlFileMap.set(url, filename);
          }
        });

        // Parse URDF from imported file
        const robotModel = loader.parse(urdfFile);
        
        // ✅ Wait for ALL STL files to be loaded (async loader)
        let totalMeshes = 0;
        
        // Count initial meshes
        robotModel.traverse((child) => {
          if (child.isMesh) totalMeshes++;
        });
        
        // Wait for LoadingManager to finish
        await new Promise((resolveLoading) => {
          if (loader.manager.onLoad) {
            const originalOnLoad = loader.manager.onLoad;
            loader.manager.onLoad = () => {
              if (originalOnLoad) originalOnLoad();
              resolveLoading();
            };
          } else {
            loader.manager.onLoad = () => resolveLoading();
          }
          
          // Safety timeout (2 seconds max)
          setTimeout(() => resolveLoading(), 2000);
        });
        
        // Recount after complete loading
        totalMeshes = 0;
        robotModel.traverse((child) => {
          if (child.isMesh) totalMeshes++;
        });

        // Initialize default materials
        let meshCount = 0;
        let shellCount = 0;
        
        robotModel.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            
            // ✅ Simple extraction of filename from geometry URL (for detections only)
            let stlFileName = '';
            if (child.geometry) {
              const possibleUrls = [
                child.geometry.userData?.url,
                child.geometry.userData?.sourceFile,
                child.geometry.userData?.filename,
                child.geometry.userData?.sourceURL,
              ].filter(Boolean);
              
              for (const url of possibleUrls) {
                const mappedName = stlFileMap.get(url);
                if (mappedName) {
                  stlFileName = mappedName;
                  break;
                }
                const filename = url.split('/').pop();
                if (filename && filename.toLowerCase().endsWith('.stl')) {
                  stlFileName = filename;
                  break;
                }
              }
            }
            
            // ✅ Store STL file name in userData (for detections: antennas, arducam, etc.)
            if (stlFileName) {
              child.userData.stlFileName = stlFileName;
            }
            

            // ✅ Flat shading: STL files have separate vertices per face = perfect for flat shading
            // No processing needed - just remove any existing normals
            // Three.js will compute face normals automatically with flatShading: true
            if (child.geometry) {
              // Remove any existing normals - they will be computed per-face by Three.js
              if (child.geometry.attributes.normal) {
                child.geometry.deleteAttribute('normal');
              }
            }

            // Save original color
            let originalColor = 0xFF9500;
            if (child.material && child.material.color) {
              originalColor = child.material.color.getHex();
            }
            child.userData.originalColor = originalColor;
            
            // Store material name
            if (child.material && child.material.name) {
              child.userData.materialName = child.material.name;
            }
            
            // Simple detection
            const materialName = (child.material?.name || '').toLowerCase();
            const stlFileNameLower = (child.userData.stlFileName || '').toLowerCase();
            const isBigLens = materialName.includes('big_lens') || 
                              materialName.includes('small_lens') ||
                              materialName.includes('lens_d40') ||
                              materialName.includes('lens_d30');
            // Détection améliorée des antennes : par couleur OU par nom de matériau OU par nom de fichier STL
            const isAntenna = originalColor === 0xFF9500 ||
                              materialName.includes('antenna') ||
                              stlFileNameLower.includes('antenna');
            
            child.userData.isAntenna = isAntenna;
            child.userData.isBigLens = isBigLens;
            }
        });

        this.robotModel = robotModel;
        this.isLoaded = true;
        this.isLoading = false;

        // Notify all listeners
        this.notifyListeners();

        return robotModel;
      } catch (err) {
        console.error('❌ [Cache] URDF loading error:', err);
        this.isLoading = false;
        throw err;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Gets the model (loads if necessary)
   */
  async getModel() {
    if (this.isLoaded && this.robotModel) {
      return this.robotModel;
    }
    return this.load();
  }

  /**
   * Clones the model for use in a scene
   * (necessary to avoid conflicts if used in multiple scenes)
   */
  cloneModel() {
    if (!this.robotModel) {
      console.warn('⚠️ [Cache] Model not loaded yet');
      return null;
    }
    return this.robotModel.clone();
  }

  /**
   * Checks if model is loaded
   */
  isModelLoaded() {
    return this.isLoaded && this.robotModel !== null;
  }

  /**
   * Adds a listener that will be called when model is loaded
   */
  addListener(callback) {
    this.listeners.add(callback);
    // If already loaded, call immediately
    if (this.isLoaded) {
      callback(this.robotModel);
    }
  }

  /**
   * Removes a listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notifies all listeners
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.robotModel);
      } catch (err) {
        console.error('Error in cache listener:', err);
      }
    });
  }

  /**
   * Clears the cache (to be called on app unmount)
   */
  clear() {
    if (this.robotModel) {
      this.robotModel.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
      });
    }
    this.robotModel = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
    this.listeners.clear();
    
    // Also clear localStorage
    try {
      localStorage.removeItem('robotModelCacheVersion');
    } catch (e) {}
  }
}

// Singleton instance
const robotModelCache = new RobotModelCache();

export default robotModelCache;

