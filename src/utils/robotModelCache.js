import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
    this.version = 'v7-smooth-shading-non-indexed'; // Change this version to force reload
  }

  /**
   * Loads URDF model and caches it
   */
  async load() {
    // Check if we need to reload due to version change
    try {
      const cachedVersion = localStorage.getItem('robotModelCacheVersion');
      if (cachedVersion !== this.version) {
        console.log('🔄 [Cache] Version changed:', cachedVersion, '→', this.version);
        this.clear();
        localStorage.setItem('robotModelCacheVersion', this.version);
      }
    } catch (e) {}
    
    // If already loaded, return directly
    if (this.isLoaded && this.robotModel) {
      console.log('✅ Robot model already in cache');
      return this.robotModel;
    }

    // If loading in progress, wait for existing promise
    if (this.isLoading && this.loadPromise) {
      console.log('⏳ Robot model loading in progress, waiting...');
      return this.loadPromise;
    }

    // New loading
    this.isLoading = true;
    console.log('📦 [Cache] Loading URDF model...');

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
            console.log(`📥 Loading STL: ${filename} from ${url}`);
          }
        });

        // Parse URDF from imported file
        const robotModel = loader.parse(urdfFile);
        console.log('📦 [Cache] URDF parsed: %d links', robotModel.children.length);
        
        // ✅ Wait for ALL STL files to be loaded (async loader)
        let totalMeshes = 0;
        
        // Count initial meshes
        robotModel.traverse((child) => {
          if (child.isMesh) totalMeshes++;
        });
        
        console.log(`⏳ Initial meshes: ${totalMeshes}, waiting for STL files to load...`);
        
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
        
        console.log(`✅ [Cache] All STL loaded: ${totalMeshes} meshes ready`);

        // Initialize default materials
        let meshCount = 0;
        let shellCount = 0;
        
        // ✅ List of all loaded STL files
        const stlFilesList = [];
        
        robotModel.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            
            // ✅ Log STL file name for each mesh
            // Search for STL file name in different properties
            let meshFileName = '';
            
            // Method 1: Search in all possible geometry URLs (with map)
            if (child.geometry) {
              // Try different userData properties
              const possibleUrls = [
                child.geometry.userData?.url,
                child.geometry.userData?.sourceFile,
                child.geometry.userData?.filename,
                child.geometry.userData?.sourceURL,
              ].filter(Boolean);
              
              for (const url of possibleUrls) {
                // First try to find in map
                const mappedName = stlFileMap.get(url);
                if (mappedName) {
                  meshFileName = mappedName;
                  break;
                }
                // Otherwise extract from URL
                const filename = url.split('/').pop();
                if (filename && filename.toLowerCase().endsWith('.stl')) {
                  meshFileName = filename;
                  break;
                }
              }
            }
            
            // Method 2: Search in mesh itself
            if (!meshFileName && child.userData) {
              const meshUrls = [
                child.userData.url,
                child.userData.sourceFile,
                child.userData.filename,
                child.userData.sourceURL,
              ].filter(Boolean);
              
              for (const url of meshUrls) {
                const mappedName = stlFileMap.get(url);
                if (mappedName) {
                  meshFileName = mappedName;
                  break;
                }
                const filename = url.split('/').pop();
                if (filename && filename.toLowerCase().endsWith('.stl')) {
                  meshFileName = filename;
                  break;
                }
              }
            }
            
            // Method 3: Go up hierarchy to find file name
            if (!meshFileName) {
              let parent = child.parent;
              let depth = 0;
              while (parent && depth < 5) {
                // Search in parent userData
                if (parent.userData?.filename) {
                  meshFileName = parent.userData.filename;
                  break;
                }
                // Search in parent name
                if (parent.name && parent.name.toLowerCase().endsWith('.stl')) {
                  meshFileName = parent.name;
                  break;
                }
                parent = parent.parent;
                depth++;
              }
            }
            
            // Method 4: Use mesh name if available
            if (!meshFileName && child.name) {
              meshFileName = child.name;
            }
            
            // Fallback: unnamed
            if (!meshFileName) {
              meshFileName = 'unnamed';
            }
            
            const stlFileName = meshFileName.toLowerCase().endsWith('.stl') ? meshFileName : `${meshFileName}.stl`;
            
            // ✅ STORE STL file name in userData to use it later
            child.userData.stlFileName = stlFileName;
            
            if (!stlFilesList.includes(stlFileName)) {
              stlFilesList.push(stlFileName);
            }
            
            const geometryUrl = child.geometry?.userData?.url || 'not found';
            console.log(`📦 STL file [${meshCount}]: ${stlFileName}`, {
              meshName: child.name || 'unnamed',
              geometryUrl: geometryUrl,
              vertices: child.geometry?.attributes?.position?.count || 0,
              hasNormals: !!child.geometry?.attributes?.normal,
              parentName: child.parent?.name || 'no parent',
              userDataKeys: Object.keys(child.geometry?.userData || {}),
              meshUserDataKeys: Object.keys(child.userData || {}),
            });

            // ✅ Quality smooth shading (like Blender)
            if (child.geometry) {
              // CRUCIAL: STL files can have built-in "hard edges" normals
              // Must DELETE these normals before merging and recalculating for true smooth shading
              
              // 1. Remove existing normals from STL file (if present)
              // STL files can have "hard edges" normals that prevent smooth shading
              if (child.geometry.attributes.normal) {
                child.geometry.deleteAttribute('normal');
              }
              
              // 2. Merge duplicate vertices for true smooth shading
              // STL files often have duplicate vertices at face boundaries
              // Without merge, computeVertexNormals cannot create correct smooth shading
              const positionAttribute = child.geometry.attributes.position;
              if (positionAttribute) {
                const vertexCount = positionAttribute.count;
                try {
                  // Convert to non-indexed if necessary then merge
                  // Merge for ALL pieces for optimal smooth shading
                  if (child.geometry.index) {
                    child.geometry = child.geometry.toNonIndexed();
                  }
                  // Merge threshold: 0.0001 to merge very close vertices
                  // 3D printed STL files can have slightly offset vertices
                  // Too small threshold won't merge enough, too large will merge different vertices
                  const mergedGeometry = mergeVertices(child.geometry, 0.0001);
                  child.geometry = mergedGeometry;
                  const mergedCount = child.geometry.attributes.position.count;
                  if (vertexCount !== mergedCount) {
                    console.log(`🔧 Smooth shading: ${vertexCount} → ${mergedCount} vertices (${((1 - mergedCount/vertexCount) * 100).toFixed(1)}% reduction)`);
                  }
                } catch (e) {
                  console.warn('⚠️ Could not merge vertices:', e.message);
                }
              }
              
              // 3. ✅ Recalculate SMOOTH normals after merge for smooth rendering
              // After merging vertices, recalculate normals with wide threshold angle
              // for optimal smooth shading (curved surfaces will be smooth)
              
              // IMPORTANT: Ensure geometry has no index before calculating normals
              // Normals must be calculated on non-indexed geometry for correct smooth shading
              if (child.geometry.index) {
                // If geometry is indexed, convert to non-indexed for better smooth shading
                child.geometry = child.geometry.toNonIndexed();
              }
              
              // Calculate normals with wide threshold angle to smooth even sharp angles
              child.geometry.computeVertexNormals(Math.PI / 2); // 90° angle to smooth even sharp angles
              
              // Verify normals are present
              if (!child.geometry.attributes.normal) {
                console.warn(`⚠️ No normal attribute found for mesh: ${child.name || 'unnamed'}, recomputing...`);
                child.geometry.computeVertexNormals(Math.PI / 2);
              } else {
                // Log to verify normals are present
                const normalCount = child.geometry.attributes.normal.count;
                const positionCount = child.geometry.attributes.position.count;
                if (normalCount !== positionCount) {
                  console.warn(`⚠️ Normal count (${normalCount}) != position count (${positionCount}) for mesh: ${child.name || 'unnamed'}`);
                }
              }
            }

            // Save original color
            let originalColor = 0xFF9500;
            if (child.material && child.material.color) {
              originalColor = child.material.color.getHex();
            }
            child.userData.originalColor = originalColor;
            
            // ✅ STORE material name in userData to use it later
            // Material can have a name like "big_lens_d40_material" which is very reliable
            if (child.material && child.material.name) {
              child.userData.materialName = child.material.name;
            }
            
            // ✅ Detect glasses lenses by GRAY COLOR
            // In URDF: rgba(0.439216 0.47451 0.501961) = #707f80 or similar
            // All gray meshes are probably lenses
            const isGrayColor = (originalColor & 0xFF0000) >> 16 < 0x80 && // R < 128
                                (originalColor & 0x00FF00) >> 8 < 0x90 &&  // G < 144
                                (originalColor & 0x0000FF) < 0x90;         // B < 144
            const isGlassMesh = isGrayColor && originalColor !== 0xFF9500; // Gray but not orange
            child.userData.isGlass = isGlassMesh;
            
            // ✅ Detect LARGE pieces (shells) and antennas by geometry size
            let vertexCount = 0;
            if (child.geometry?.attributes?.position) {
              vertexCount = child.geometry.attributes.position.count;
            }
            
            // ✅ Detect antennas (always dark)
            // Reuse geometryUrl and meshFileName already declared above
            const isAntennaByName = meshFileName.toLowerCase().includes('antenna') || 
                                     (child.name && child.name.toLowerCase().includes('antenna'));
            
            // Detection of small orange pieces (antenna springs)
            // Only concerns meshes < 200 vertices
            const isOrange = originalColor === 0xFF9500 || 
                            (originalColor >= 0xFF8000 && originalColor <= 0xFFB000);
            const isSmallOrangePiece = isOrange && vertexCount < 200;
            
            const isAntenna = isAntennaByName || isSmallOrangePiece;
            child.userData.isAntenna = isAntenna;
            
            // ✅ LOG TOUS LES MESHES (sans condition)
            console.log(`Mesh ${meshCount}:`, {
              name: child.name || 'unnamed',
              color: `#${originalColor.toString(16).padStart(6, '0')}`,
              vertices: vertexCount,
              geometry: meshFileName,
              isOrange: isOrange ? '🟠 YES' : '',
              isSmallOrange: isSmallOrangePiece ? '🟠 SMALL' : '',
              isAntennaByName: isAntennaByName ? '📡 NAME' : '',
              isAntenna: isAntenna ? '✅ ANTENNA' : ''
            });
            
            // Shells are generally LARGE meshes (many vertices)
            // Threshold: > 1000 vertices = probably a shell
            const isLargeMesh = vertexCount > 1000;
            
            child.userData.isShellPiece = isLargeMesh;
            child.userData.vertexCount = vertexCount;
            
            if (isLargeMesh) {
              shellCount++;
            }
            
            // Debug : log quelques exemples
            if (meshCount <= 5 || (isLargeMesh && shellCount <= 3)) {
              console.log(`  ${isLargeMesh ? '🛡️ Large shell' : '⚙️ Small component'} (${vertexCount} vertices, color: #${originalColor.toString(16).padStart(6, '0')})`);
            }

            // Dispose old material
            if (child.material) {
              child.material.dispose();
            }

            // Create base material (will be configured later)
            // ✅ Smooth shading is controlled by geometry normals (computeVertexNormals)
            // MeshToonMaterial automatically uses smooth normals if present
            child.material = new THREE.MeshToonMaterial({
              color: originalColor,
              side: THREE.FrontSide,
              transparent: false,
              opacity: 1.0,
            });
          }
        });
        
        console.log(`✅ [Cache] Materials initialized: ${meshCount} meshes (${shellCount} large shells excluded, ${meshCount - shellCount} components to scan)`);
        console.log(`📋 [Cache] Total STL files loaded: ${stlFilesList.length} unique files`);
        console.log(`📋 [Cache] STL files list:`, stlFilesList.sort());

        this.robotModel = robotModel;
        this.isLoaded = true;
        this.isLoading = false;

        // Notifier tous les listeners
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
   * Notifie tous les listeners
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
   * Nettoie le cache (à appeler au démontage de l'app)
   */
  clear() {
    console.log('🧹 [Cache] Robot model cache cleared - version:', this.version);
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
    
    // Vider aussi le localStorage
    try {
      localStorage.removeItem('robotModelCacheVersion');
    } catch (e) {}
  }
}

// Singleton instance
const robotModelCache = new RobotModelCache();

export default robotModelCache;

