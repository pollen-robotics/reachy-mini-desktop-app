import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import URDFLoader from 'urdf-loader';
import urdfFile from '../assets/robot-3d/reachy-mini.urdf?raw';

/**
 * Cache global pour le modèle URDF du robot
 * Permet de charger le modèle une seule fois au démarrage de l'app
 * et de le réutiliser dans tous les composants
 */

class RobotModelCache {
  constructor() {
    this.robotModel = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.loadPromise = null;
    this.listeners = new Set();
    this.version = 'v5-antenna-all-sizes'; // Changez cette version pour forcer le rechargement
  }

  /**
   * Charge le modèle URDF et le met en cache
   */
  async load() {
    // Vérifier si on doit recharger à cause d'un changement de version
    try {
      const cachedVersion = localStorage.getItem('robotModelCacheVersion');
      if (cachedVersion !== this.version) {
        console.log('🔄 [Cache] Version changed:', cachedVersion, '→', this.version);
        this.clear();
        localStorage.setItem('robotModelCacheVersion', this.version);
      }
    } catch (e) {}
    
    // Si déjà chargé, retourner directement
    if (this.isLoaded && this.robotModel) {
      console.log('✅ Robot model already in cache');
      return this.robotModel;
    }

    // Si en cours de chargement, attendre la promesse existante
    if (this.isLoading && this.loadPromise) {
      console.log('⏳ Robot model loading in progress, waiting...');
      return this.loadPromise;
    }

    // Nouveau chargement
    this.isLoading = true;
    console.log('📦 [Cache] Loading URDF model...');

    this.loadPromise = (async () => {
      try {
        const loader = new URDFLoader();

        // Configure loader to load meshes from local assets
        loader.manager.setURLModifier((url) => {
          const filename = url.split('/').pop();
          return new URL(`../assets/robot-3d/meshes/${filename}`, import.meta.url).href;
        });

        // Parse URDF from imported file
        const robotModel = loader.parse(urdfFile);
        console.log('📦 [Cache] URDF parsed: %d links', robotModel.children.length);
        
        // ✅ Attendre que TOUS les STL soient chargés (loader asynchrone)
        let totalMeshes = 0;
        
        // Compter les meshes initiaux
        robotModel.traverse((child) => {
          if (child.isMesh) totalMeshes++;
        });
        
        console.log(`⏳ Initial meshes: ${totalMeshes}, waiting for STL files to load...`);
        
        // Attendre que le LoadingManager ait fini
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
          
          // Timeout de sécurité (2 secondes max)
          setTimeout(() => resolveLoading(), 2000);
        });
        
        // Recompter après chargement complet
        totalMeshes = 0;
        robotModel.traverse((child) => {
          if (child.isMesh) totalMeshes++;
        });
        
        console.log(`✅ [Cache] All STL loaded: ${totalMeshes} meshes ready`);

        // Initialiser les matériaux par défaut
        let meshCount = 0;
        let shellCount = 0;
        
        robotModel.traverse((child) => {
          if (child.isMesh) {
            meshCount++;

            // ✅ Smooth shading de qualité (comme Blender)
            if (child.geometry) {
              // Fusionner les vertices dupliqués pour un vrai smooth shading
              const positionAttribute = child.geometry.attributes.position;
              if (positionAttribute) {
                // Utiliser mergeVertices pour les coques (grandes pièces)
                const vertexCount = positionAttribute.count;
                if (vertexCount > 500) {
                  try {
                    // Convertir en non-indexed si nécessaire puis merger
                    if (child.geometry.index) {
                      child.geometry = child.geometry.toNonIndexed();
                    }
                    const mergedGeometry = mergeVertices(child.geometry, 0.0001);
                    child.geometry = mergedGeometry;
                    console.log(`🔧 Smooth shading: ${vertexCount} → ${child.geometry.attributes.position.count} vertices`);
                  } catch (e) {
                    console.warn('⚠️ Could not merge vertices:', e.message);
                  }
                }
              }
              
              // Recalculer les normales pour un rendu lisse
              child.geometry.computeVertexNormals();
            }

            // Sauvegarder la couleur d'origine
            let originalColor = 0xFF9500;
            if (child.material && child.material.color) {
              originalColor = child.material.color.getHex();
            }
            child.userData.originalColor = originalColor;
            
            // ✅ Détecter les verres des lunettes par COULEUR GRISE
            // Dans URDF: rgba(0.439216 0.47451 0.501961) = #707f80 ou similaire
            // Tous les meshes gris sont probablement des verres
            const isGrayColor = (originalColor & 0xFF0000) >> 16 < 0x80 && // R < 128
                                (originalColor & 0x00FF00) >> 8 < 0x90 &&  // G < 144
                                (originalColor & 0x0000FF) < 0x90;         // B < 144
            const isGlassMesh = isGrayColor && originalColor !== 0xFF9500; // Gris mais pas orange
            child.userData.isGlass = isGlassMesh;
            
            // ✅ Détecter les GRANDES pièces (coques) et antennes par taille de géométrie
            let vertexCount = 0;
            if (child.geometry?.attributes?.position) {
              vertexCount = child.geometry.attributes.position.count;
            }
            
            // ✅ Détecter les antennes (toujours sombres) 
            const geometryUrl = child.geometry?.userData?.url || '';
            const meshFileName = geometryUrl.split('/').pop() || '';
            const isAntennaByName = meshFileName.toLowerCase().includes('antenna') || 
                                     (child.name && child.name.toLowerCase().includes('antenna'));
            
            // Détection des petites pièces orange (springs des antennes)
            // Ne concerne que les meshes < 200 vertices
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
            
            // Les coques sont généralement de GROS meshes (beaucoup de vertices)
            // Seuil : > 1000 vertices = probablement une coque
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

            // Créer un matériau de base (sera configuré plus tard)
            child.material = new THREE.MeshToonMaterial({
              color: originalColor,
              side: THREE.FrontSide,
              transparent: false,
              opacity: 1.0,
            });
          }
        });
        
        console.log(`✅ [Cache] Materials initialized: ${meshCount} meshes (${shellCount} large shells excluded, ${meshCount - shellCount} components to scan)`);

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
   * Récupère le modèle (charge si nécessaire)
   */
  async getModel() {
    if (this.isLoaded && this.robotModel) {
      return this.robotModel;
    }
    return this.load();
  }

  /**
   * Clone le modèle pour une utilisation dans une scène
   * (nécessaire pour éviter les conflits si utilisé dans plusieurs scènes)
   */
  cloneModel() {
    if (!this.robotModel) {
      console.warn('⚠️ [Cache] Model not loaded yet');
      return null;
    }
    return this.robotModel.clone();
  }

  /**
   * Vérifie si le modèle est chargé
   */
  isModelLoaded() {
    return this.isLoaded && this.robotModel !== null;
  }

  /**
   * Ajoute un listener qui sera appelé quand le modèle est chargé
   */
  addListener(callback) {
    this.listeners.add(callback);
    // Si déjà chargé, appeler immédiatement
    if (this.isLoaded) {
      callback(this.robotModel);
    }
  }

  /**
   * Retire un listener
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

