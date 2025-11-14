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
    this.version = 'v7-smooth-shading-non-indexed'; // Changez cette version pour forcer le rechargement
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
        
        // ✅ Map pour stocker les noms de fichiers STL par URL (originale et locale)
        const stlFileMap = new Map();

        // Configure loader to load meshes from local assets
        loader.manager.setURLModifier((url) => {
          const filename = url.split('/').pop();
          const localUrl = new URL(`../assets/robot-3d/meshes/${filename}`, import.meta.url).href;
          // ✅ Stocker le nom du fichier pour les deux URLs (originale et locale)
          stlFileMap.set(url, filename);
          stlFileMap.set(localUrl, filename);
          return localUrl;
        });
        
        // ✅ Intercepter les événements de chargement pour capturer les noms de fichiers STL
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
        
        // ✅ Liste de tous les fichiers STL chargés
        const stlFilesList = [];
        
        robotModel.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            
            // ✅ Logger le nom du fichier STL pour chaque mesh
            // Chercher le nom du fichier STL dans différentes propriétés
            let meshFileName = '';
            
            // Méthode 1: Chercher dans toutes les URLs possibles de la géométrie (avec map)
            if (child.geometry) {
              // Essayer différentes propriétés userData
              const possibleUrls = [
                child.geometry.userData?.url,
                child.geometry.userData?.sourceFile,
                child.geometry.userData?.filename,
                child.geometry.userData?.sourceURL,
              ].filter(Boolean);
              
              for (const url of possibleUrls) {
                // D'abord essayer de trouver dans la map
                const mappedName = stlFileMap.get(url);
                if (mappedName) {
                  meshFileName = mappedName;
                  break;
                }
                // Sinon extraire depuis l'URL
                const filename = url.split('/').pop();
                if (filename && filename.toLowerCase().endsWith('.stl')) {
                  meshFileName = filename;
                  break;
                }
              }
            }
            
            // Méthode 2: Chercher dans le mesh lui-même
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
            
            // Méthode 3: Remonter dans la hiérarchie pour trouver le nom du fichier
            if (!meshFileName) {
              let parent = child.parent;
              let depth = 0;
              while (parent && depth < 5) {
                // Chercher dans userData du parent
                if (parent.userData?.filename) {
                  meshFileName = parent.userData.filename;
                  break;
                }
                // Chercher dans le nom du parent
                if (parent.name && parent.name.toLowerCase().endsWith('.stl')) {
                  meshFileName = parent.name;
                  break;
                }
                parent = parent.parent;
                depth++;
              }
            }
            
            // Méthode 4: Utiliser le nom du mesh si disponible
            if (!meshFileName && child.name) {
              meshFileName = child.name;
            }
            
            // Fallback: unnamed
            if (!meshFileName) {
              meshFileName = 'unnamed';
            }
            
            const stlFileName = meshFileName.toLowerCase().endsWith('.stl') ? meshFileName : `${meshFileName}.stl`;
            
            // ✅ STOCKER le nom du fichier STL dans userData pour pouvoir l'utiliser plus tard
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

            // ✅ Smooth shading de qualité (comme Blender)
            if (child.geometry) {
              // CRUCIAL : Les fichiers STL peuvent avoir des normales "hard edges" intégrées
              // Il faut SUPPRIMER ces normales avant de merger et recalculer pour un vrai smooth shading
              
              // 1. Supprimer les normales existantes du fichier STL (si présentes)
              // Les fichiers STL peuvent avoir des normales "hard edges" qui empêchent le smooth shading
              if (child.geometry.attributes.normal) {
                child.geometry.deleteAttribute('normal');
              }
              
              // 2. Fusionner les vertices dupliqués pour un vrai smooth shading
              // Les fichiers STL ont souvent des vertices dupliqués aux frontières des faces
              // Sans merge, computeVertexNormals ne peut pas créer de smooth shading correct
              const positionAttribute = child.geometry.attributes.position;
              if (positionAttribute) {
                const vertexCount = positionAttribute.count;
                try {
                  // Convertir en non-indexed si nécessaire puis merger
                  // Merge pour TOUTES les pièces pour un smooth shading optimal
                  if (child.geometry.index) {
                    child.geometry = child.geometry.toNonIndexed();
                  }
                  // Seuil de merge : 0.0001 pour fusionner les vertices très proches
                  // Les fichiers STL imprimés en 3D peuvent avoir des vertices légèrement décalés
                  // Un seuil trop petit ne fusionnera pas assez, trop grand fusionnera des vertices différents
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
              
              // 3. ✅ Recalculer les normales SMOOTH après le merge pour un rendu lisse
              // Après avoir mergé les vertices, on recalcule les normales avec un angle de seuil large
              // pour avoir un smooth shading optimal (les surfaces courbes seront lisses)
              
              // IMPORTANT : S'assurer que la géométrie n'a pas d'index avant de calculer les normales
              // Les normales doivent être calculées sur la géométrie non-indexée pour un smooth shading correct
              if (child.geometry.index) {
                // Si la géométrie est indexée, la convertir en non-indexée pour un meilleur smooth shading
                child.geometry = child.geometry.toNonIndexed();
              }
              
              // Calculer les normales avec un angle de seuil large pour smooth même les angles prononcés
              child.geometry.computeVertexNormals(Math.PI / 2); // Angle de 90° pour smooth même les angles prononcés
              
              // Vérifier que les normales sont bien présentes
              if (!child.geometry.attributes.normal) {
                console.warn(`⚠️ No normal attribute found for mesh: ${child.name || 'unnamed'}, recomputing...`);
                child.geometry.computeVertexNormals(Math.PI / 2);
              } else {
                // Log pour vérifier que les normales sont bien présentes
                const normalCount = child.geometry.attributes.normal.count;
                const positionCount = child.geometry.attributes.position.count;
                if (normalCount !== positionCount) {
                  console.warn(`⚠️ Normal count (${normalCount}) != position count (${positionCount}) for mesh: ${child.name || 'unnamed'}`);
                }
              }
            }

            // Sauvegarder la couleur d'origine
            let originalColor = 0xFF9500;
            if (child.material && child.material.color) {
              originalColor = child.material.color.getHex();
            }
            child.userData.originalColor = originalColor;
            
            // ✅ STOCKER le nom du matériau dans userData pour pouvoir l'utiliser plus tard
            // Le matériau peut avoir un nom comme "big_lens_d40_material" qui est très fiable
            if (child.material && child.material.name) {
              child.userData.materialName = child.material.name;
            }
            
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
            // Réutiliser geometryUrl et meshFileName déjà déclarés plus haut
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
            // ✅ Smooth shading est contrôlé par les normales de la géométrie (computeVertexNormals)
            // MeshToonMaterial utilise automatiquement les normales smooth si elles sont présentes
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

