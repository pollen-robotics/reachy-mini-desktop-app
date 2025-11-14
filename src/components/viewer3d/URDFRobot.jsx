import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createCellShadingMaterial, updateCellShadingMaterial } from './utils/materials';
import robotModelCache from '../../utils/robotModelCache';

/**
 * Composant robot chargé depuis URDF local
 * Charge les assets depuis /assets/robot-3d/ au lieu du daemon
 * Gère le chargement du modèle 3D, les animations de la tête et des antennes
 */
export default function URDFRobot({ 
  headPose, 
  yawBody, 
  antennas, 
  isActive, 
  isTransparent, 
  cellShading = { enabled: false, bands: 100, smoothShading: true },
  xrayOpacity = 0.5,
  onMeshesReady,
  onRobotReady, // Callback avec la référence au robot
  forceLoad = false, // ✅ Force le chargement même si isActive=false
}) {
  const [robot, setRobot] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const groupRef = useRef();
  const meshesRef = useRef([]);
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hoveredMesh = useRef(null);
  
  // ✅ Gestionnaire de mouvement de la souris pour le raycaster
  useEffect(() => {
    const handleMouseMove = (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    
    gl.domElement.addEventListener('mousemove', handleMouseMove);
    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
    };
  }, [gl]);
  
  // ✅ Cache des matériaux pour chaque mesh (séparation TOTALE entre cell shading et X-ray)
  const materialsCache = useRef({
    cellShading: new Map(), // Map<mesh, ShaderMaterial>
    xray: new Map(),         // Map<mesh, MeshBasicMaterial>
  });

  // ✅ Fonction pour créer ou récupérer un matériau cell shading depuis le cache
  const getCellShadingMaterial = useCallback((mesh, cellShadingConfig) => {
    const cache = materialsCache.current.cellShading;
    
    if (!cache.has(mesh)) {
      const originalColor = mesh.userData.originalColor || 0xFF9500;
      const material = createCellShadingMaterial(originalColor, {
        bands: cellShadingConfig?.bands || 100,
        smoothness: cellShadingConfig?.smoothness ?? 0.45,
        rimIntensity: cellShadingConfig?.rimIntensity ?? 0.4,
        specularIntensity: cellShadingConfig?.specularIntensity ?? 0.3,
        ambientIntensity: cellShadingConfig?.ambientIntensity ?? 0.45,
        contrastBoost: cellShadingConfig?.contrastBoost ?? 0.9,
      });
      cache.set(mesh, material);
    }
    
    return cache.get(mesh);
  }, []);

  // ✅ Fonction pour créer ou récupérer un matériau X-ray depuis le cache avec couleurs stylées
  const getXrayMaterial = useCallback((mesh, opacity, colorOverride = null) => {
    const cache = materialsCache.current.xray;
    const cacheKey = `${mesh.uuid}_${colorOverride || 'default'}`;
    
    if (!cache.has(cacheKey)) {
      // ✅ Couleurs stylées et punchy pour le mode X-ray
      let xrayColor = colorOverride;
      
      if (!xrayColor) {
        // Déterminer la couleur selon le type d'objet
        const isAntenna = mesh.userData?.isAntenna || false;
        const isShellPiece = mesh.userData?.isShellPiece || false;
        const isBigLens = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('big_lens') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('small_lens') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('lens_d40') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('lens_d30');
        
        if (isAntenna) {
          xrayColor = 0x00FF00; // Vert vif pour les antennes
        } else if (isBigLens) {
          xrayColor = 0x00FFFF; // Cyan vif pour les lentilles
        } else if (isShellPiece) {
          xrayColor = 0xFF00FF; // Magenta vif pour les coques
        } else {
          // Couleur basée sur la couleur originale mais plus saturée
          const originalColor = mesh.userData?.originalColor || 0xFF9500;
          // Convertir en HSV, augmenter la saturation, puis revenir en RGB
          const r = ((originalColor >> 16) & 0xFF) / 255;
          const g = ((originalColor >> 8) & 0xFF) / 255;
          const b = (originalColor & 0xFF) / 255;
          
          // Couleurs vives selon la teinte originale
          if (r > 0.8 && g < 0.5 && b < 0.5) {
            xrayColor = 0xFF0080; // Rouge/Rose vif
          } else if (r > 0.7 && g > 0.7 && b < 0.5) {
            xrayColor = 0xFFFF00; // Jaune vif
          } else if (r < 0.5 && g > 0.7 && b < 0.5) {
            xrayColor = 0x00FF00; // Vert vif
          } else if (r < 0.5 && g < 0.5 && b > 0.7) {
            xrayColor = 0x0080FF; // Bleu vif
          } else if (r > 0.6 && g > 0.6 && b > 0.6) {
            xrayColor = 0xFFFFFF; // Blanc pour les objets gris/blancs
          } else {
            xrayColor = 0xFF9500; // Orange vif par défaut
          }
        }
      }
      
      const material = new THREE.MeshBasicMaterial({
        color: xrayColor,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      cache.set(cacheKey, material);
    } else {
      // Mettre à jour l'opacité si elle change
      const material = cache.get(cacheKey);
      material.opacity = opacity;
    }
    
    return cache.get(cacheKey);
  }, []);

  // Fonction pour appliquer les matériaux (utilisée au chargement ET aux changements)
  // ✅ SÉPARATION TOTALE : chaque mode a ses propres matériaux
  const applyMaterials = useCallback((robotModel, transparent, cellShadingConfig, opacity) => {
    let processedCount = 0;
    let skippedCount = 0;
    let antennaCount = 0;
    
    // ✅ Collecter d'abord tous les meshes principaux (pour éviter de traverser les outline meshes)
    const mainMeshes = [];
    robotModel.traverse((child) => {
      if (child.isMesh && !child.userData.isOutline) {
        mainMeshes.push(child);
      }
    });
    
    console.log(`🔍 Processing ${mainMeshes.length} meshes...`);
    
    // Parcourir uniquement les meshes principaux
    mainMeshes.forEach((child) => {
      if (!child.material) {
        console.warn('⚠️ Mesh sans matériau:', child.name || 'unnamed');
        skippedCount++;
        return;
      }
      
      // ⚠️ Ne pas toucher aux meshes en erreur
      if (child.userData.isErrorMesh) {
        skippedCount++;
        return;
      }
      
      // ✅ BIG_LENS uniquement : Toujours transparents (même en mode cell shading)
      // Détection robuste : nom du mesh, nom du fichier STL, nom du parent (récursif), nom du matériau, COULEUR
      const meshName = child.name || '';
      const stlFileName = child.userData?.stlFileName || '';
      const geometryUrl = child.geometry?.userData?.url || '';
      const fileName = geometryUrl.split('/').pop() || '';
      // ✅ Utiliser le nom du matériau stocké dans userData (plus fiable que child.material?.name)
      const materialName = child.userData?.materialName || child.material?.name || '';
      const lensColor = child.userData?.originalColor || 0;
      
      // ✅ Remonter TOUTE la hiérarchie des parents pour trouver "big_lens"
      let parentName = '';
      let currentParent = child.parent;
      let depth = 0;
      const parentNames = [];
      while (currentParent && depth < 10) {
        const pName = currentParent.name || '';
        if (pName) {
          parentNames.push(pName);
          if (pName.toLowerCase().includes('big_lens')) {
            parentName = pName;
            break;
          }
        }
        currentParent = currentParent.parent;
        depth++;
      }
      
      // ✅ Détection par COULEUR EXACTE : big_lens a une couleur grise très spécifique
      // Dans URDF: rgba(0.439216 0.47451 0.501961 0.301961)
      // Conversion: r=0.439216*255≈112, g=0.47451*255≈121, b=0.501961*255≈128
      // Hex approximatif: #707980 ou #707f80
      const r = (lensColor >> 16) & 0xFF;
      const g = (lensColor >> 8) & 0xFF;
      const b = lensColor & 0xFF;
      
      // ✅ Couleur EXACTE des big_lens : très proche de #707980
      // Tolérance de ±10 pour chaque composante
      const isExactLensColor = r >= 102 && r <= 122 &&  // 112 ± 10
                               g >= 111 && g <= 131 &&  // 121 ± 10
                               b >= 118 && b <= 138 &&  // 128 ± 10
                               Math.abs(r - g) < 15 &&   // Gris uniforme
                               Math.abs(g - b) < 15;     // Gris uniforme
      
      // ✅ EXCLURE explicitement les eye_support et autres pièces similaires
      const isEyeSupport = meshName.toLowerCase().includes('eye') && 
                          (meshName.toLowerCase().includes('support') || meshName.toLowerCase().includes('mount'));
      const isExcluded = isEyeSupport || 
                        meshName.toLowerCase().includes('support') ||
                        parentNames.some(p => p.toLowerCase().includes('eye') && p.toLowerCase().includes('support'));
      
      // ✅ Détection STRICTE : matériau contenant "big_lens", "lens_d40", "small_lens" ou "lens_d30"
      // Les matériaux "big_lens_d40_material", "small_lens_d30_material" sont les critères fiables
      const materialNameLower = materialName.toLowerCase();
      const isBigLens = materialNameLower.includes('big_lens') || 
                       materialNameLower.includes('lens_d40') ||
                       materialNameLower.includes('small_lens') ||
                       materialNameLower.includes('lens_d30'); // big_lens, small_lens ou leurs variantes
      
      // ✅ DEBUG : Log si matériau contient "glasses" pour trouver la seconde lentille
      if (materialNameLower.includes('glasses') || materialNameLower.includes('dolder')) {
        console.log('🔍 Glasses/Dolder material found:', {
          materialName,
          materialNameLower,
          isBigLens,
          hasBigLens: materialNameLower.includes('big_lens'),
          hasLensD40: materialNameLower.includes('lens_d40'),
          meshName,
          stlFileName,
          parentNames: parentNames.slice(0, 3),
        });
      }
      
      // Log si on détecte par d'autres moyens pour debug
      const detectedByName = meshName.toLowerCase().includes('big_lens') || 
                            stlFileName.toLowerCase().includes('big_lens') ||
                            fileName.toLowerCase().includes('big_lens') ||
                            parentName.toLowerCase().includes('big_lens');
      
      if (!isBigLens && detectedByName) {
        console.warn('⚠️ Big lens détecté par nom mais pas par matériau:', {
          meshName,
          materialName,
          stlFileName,
          fileName,
          parentName,
          userDataMaterialName: child.userData?.materialName,
          directMaterialName: child.material?.name,
          parentNames: parentNames.slice(0, 3),
        });
      }
      
      // Log tous les objets avec "big_lens" dans leur nom pour debug complet
      if (detectedByName || isBigLens) {
        console.log('🔍 Big lens candidate (by name or material):', {
          isBigLens,
          detectedByName,
          meshName,
          materialName,
          stlFileName,
          fileName,
          parentName,
          userDataMaterialName: child.userData?.materialName,
          directMaterialName: child.material?.name,
          parentNames: parentNames.slice(0, 3),
        });
      }
      
      // ✅ LOG TOUS LES MESHES avec matériau contenant "lens" ou "big" pour trouver les big_lens
      if (materialName.toLowerCase().includes('lens') || materialName.toLowerCase().includes('big')) {
        console.log('🔍 Lens/Big-related mesh found:', {
          index: processedCount,
          meshName,
          materialName,
          stlFileName,
          fileName,
          parentNames: parentNames.slice(0, 3),
          isBigLens,
          materialType: child.material?.type,
          userDataMaterialName: child.userData?.materialName,
          directMaterialName: child.material?.name,
          materialNameLower: materialName.toLowerCase(),
          hasBigLens: materialName.toLowerCase().includes('big_lens'),
          hasLensD40: materialName.toLowerCase().includes('lens_d40'),
        });
      }
      
      // ✅ LOG TOUS LES MESHES pour debug (seulement les premiers pour ne pas spammer)
      if (processedCount < 10) {
        console.log('🔍 Mesh debug info:', {
          index: processedCount,
          meshName,
          stlFileName,
          fileName,
          parentNames: parentNames.slice(0, 3), // Premiers 3 parents
          materialName,
          materialType: child.material?.type,
          materialConstructor: child.material?.constructor?.name,
          geometryUrl,
          originalColor: `#${lensColor.toString(16).padStart(6, '0')}`,
          rgb: `rgb(${r}, ${g}, ${b})`,
          isExactLensColor,
          isExcluded,
          isAntenna: child.userData.isAntenna,
          isShellPiece: child.userData.isShellPiece,
          userDataKeys: Object.keys(child.userData || {}),
        });
      }
      
      // ✅ LOG si détecté comme big_lens pour voir pourquoi
      if (isBigLens) {
        console.log('🔍 BIG_LENS detection reason:', {
          meshName,
          stlFileName,
          fileName,
          parentName,
          parentNames: parentNames.slice(0, 3),
          materialName,
          materialNameLower: materialName.toLowerCase(),
          materialHasBigLens: materialName.toLowerCase().includes('big_lens'),
          materialHasLensD40: materialName.toLowerCase().includes('lens_d40'),
          isBigLensValue: isBigLens, // La valeur réelle de isBigLens
          isExactLensColor,
          isExcluded,
          rgb: `rgb(${r}, ${g}, ${b})`,
          isAntenna: child.userData.isAntenna,
          isShellPiece: child.userData.isShellPiece,
          userDataMaterialName: child.userData?.materialName,
          directMaterialName: child.material?.name,
        });
      }
      
      if (isBigLens) {
        console.log('👓 ✅ BIG_LENS DETECTED! Applying cell shading with transparency:', {
          meshName,
          stlFileName,
          fileName,
          parentName,
          materialName,
          geometryUrl,
          position: child.position.clone(),
          userData: child.userData,
        });
        
        // ✅ BIG_LENS : Cell shading AVEC transparence (pas de matériau glass)
        // Appliquer le cell shading comme les autres pièces, mais avec transparence
        if (!transparent) {
          const lensOpacity = 0.9; // Opacité transparente mais visible
          
          // ✅ Créer un matériau cell shading NOIR pour les lentilles
          // Utiliser directement createCellShadingMaterial avec couleur noire
          const cellMaterial = createCellShadingMaterial(0x000000, { // Couleur noire
            bands: cellShadingConfig?.bands || 100,
            smoothness: cellShadingConfig?.smoothness ?? 0.45,
            rimIntensity: cellShadingConfig?.rimIntensity ?? 0.4,
            specularIntensity: cellShadingConfig?.specularIntensity ?? 0.3,
            ambientIntensity: cellShadingConfig?.ambientIntensity ?? 0.45,
            contrastBoost: cellShadingConfig?.contrastBoost ?? 0.9,
            opacity: lensOpacity, // Passer l'opacité lors de la création
          });
          
          // Mettre à jour les paramètres du cell shading (utiliser les valeurs directement depuis cellShadingConfig)
          updateCellShadingMaterial(cellMaterial, {
            bands: cellShadingConfig?.bands,
            smoothness: cellShadingConfig?.smoothness,
            rimIntensity: cellShadingConfig?.rimIntensity,
            specularIntensity: cellShadingConfig?.specularIntensity,
            ambientIntensity: cellShadingConfig?.ambientIntensity,
            contrastBoost: cellShadingConfig?.contrastBoost,
            opacity: lensOpacity, // S'assurer que l'opacité est bien définie
          });
          
          console.log('👓 Big lens opacity set:', {
            lensOpacity,
            materialTransparent: cellMaterial.transparent,
            materialOpacity: cellMaterial.opacity,
            uniformOpacity: cellMaterial.uniforms.opacity.value,
          });
          
          child.material = cellMaterial;
          
          // Pas de contours sur les big_lens
          if (child.userData.outlineMesh) {
            child.remove(child.userData.outlineMesh);
            child.userData.outlineMesh.geometry.dispose();
            child.userData.outlineMesh.material.dispose();
            child.userData.outlineMesh = null;
          }
        } else {
          // En mode X-ray, utiliser le matériau X-ray avec couleur cyan pour les lentilles
          const xrayMaterial = getXrayMaterial(child, opacity, 0x00FFFF); // Cyan vif pour les lentilles
          child.material = xrayMaterial;
        }
        
        processedCount++;
        return; // Skip le reste du traitement
      }
      
      // ✅ ANTENNES : TOUTES les pièces orange deviennent noires
      const originalColor = child.userData.originalColor || 0xFF9500;
      const vertexCount = child.geometry?.attributes?.position?.count || 0;
      const isOrange = originalColor === 0xFF9500 || 
                      (originalColor >= 0xFF8000 && originalColor <= 0xFFB000);
      
      // TOUTES les pièces orange = antennes (sans limite de taille)
      const isAntenna = child.userData.isAntenna || isOrange;
      
      // Logger TOUTES les pièces orange
      if (isOrange) {
        console.log(`🟠 ORANGE → DARK:`, {
          color: `#${originalColor.toString(16)}`,
          vertices: vertexCount,
          name: child.name || 'unnamed',
        });
      }
      
      if (isAntenna) {
        antennaCount++;
        
        if (transparent) {
          // Mode X-ray : Vert vif et punchy pour les antennes
          const antennaMaterial = getXrayMaterial(child, opacity, 0x00FF00); // Vert vif
          child.material = antennaMaterial;
        } else {
          // Mode normal : Noir opaque
          const antennaMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a1a, // Noir
            transparent: false,
            opacity: 1.0,
            side: THREE.FrontSide,
            depthWrite: true,
          });
          child.material = antennaMaterial;
        }
        
        console.log('📡 Antenna material applied:', {
          transparent,
          color: transparent ? '#00FF00' : '#1a1a1a',
          opacity: transparent ? opacity : 1.0
        });
        
        // Pas de contours sur les antennes
        if (child.userData.outlineMesh) {
          child.remove(child.userData.outlineMesh);
          if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
          if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
          child.userData.outlineMesh = null;
        }
        
        processedCount++;
        return;
      }
      
      // ✅ MODE CELL SHADING HD (Normal)
      if (!transparent) {
        const cellMaterial = getCellShadingMaterial(child, cellShadingConfig);
        
        // Mettre à jour les paramètres si changement (utiliser les valeurs directement depuis cellShadingConfig)
        // ✅ Toujours passer toutes les valeurs pour forcer la mise à jour
        const updateParams = {};
        if (cellShadingConfig?.bands !== undefined) updateParams.bands = cellShadingConfig.bands;
        if (cellShadingConfig?.smoothness !== undefined) updateParams.smoothness = cellShadingConfig.smoothness;
        if (cellShadingConfig?.rimIntensity !== undefined) updateParams.rimIntensity = cellShadingConfig.rimIntensity;
        if (cellShadingConfig?.specularIntensity !== undefined) updateParams.specularIntensity = cellShadingConfig.specularIntensity;
        if (cellShadingConfig?.ambientIntensity !== undefined) updateParams.ambientIntensity = cellShadingConfig.ambientIntensity;
        if (cellShadingConfig?.contrastBoost !== undefined) updateParams.contrastBoost = cellShadingConfig.contrastBoost;
        
        updateCellShadingMaterial(cellMaterial, updateParams);
        
        child.material = cellMaterial;
        
          // ✅ CONTOURS AAA : Technique "Backface Outline" (silhouette UNIQUEMENT)
          // Utilisée dans Zelda BOTW, Genshin Impact, Guilty Gear Strive
          if (cellShadingConfig?.outlineEnabled) {
            // Supprimer l'ancien outline s'il existe
            if (child.userData.outlineMesh) {
              child.remove(child.userData.outlineMesh);
              if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
              if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
              child.userData.outlineMesh = null;
            }
            
            const outlineColor = cellShadingConfig?.outlineColor || '#000000';
            const outlineThickness = (cellShadingConfig?.outlineThickness || 15.0) / 1000;
            
            // ✅ Backface outline : mesh agrandi avec faces inversées
            const outlineMaterial = new THREE.MeshBasicMaterial({
              color: outlineColor,
              side: THREE.BackSide, // Seulement les faces arrière
              depthTest: true,
              depthWrite: true,
            });
            
            const outlineMesh = new THREE.Mesh(child.geometry, outlineMaterial);
            outlineMesh.scale.setScalar(1 + outlineThickness);
            outlineMesh.renderOrder = -1;
            outlineMesh.userData.isOutline = true;
            
            child.add(outlineMesh);
            child.userData.outlineMesh = outlineMesh;
          } else if (child.userData.outlineMesh) {
            // Supprimer l'outline si désactivé
            child.remove(child.userData.outlineMesh);
            if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
            if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
            child.userData.outlineMesh = null;
          }
      } 
      // ✅ MODE X-RAY (Transparent)
      else {
        const xrayMaterial = getXrayMaterial(child, opacity);
        child.material = xrayMaterial;
        
          // Supprimer les contours en mode X-ray
          if (child.userData.outlineMesh) {
            child.remove(child.userData.outlineMesh);
            if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
            if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
            child.userData.outlineMesh = null;
          }
      }
      
      processedCount++;
    });
    
    console.log(`🎨 Materials applied: ${processedCount} meshes processed (${antennaCount} antennas)${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`, {
      mode: transparent ? 'X-RAY' : 'CELL SHADING ULTRA-SMOOTH',
      transparent,
      ...(transparent ? { opacity } : { 
        bands: cellShadingConfig?.bands || 100, 
        smoothness: cellShadingConfig?.smoothness ?? 0.45,
        outlines: cellShadingConfig?.outlineEnabled ? 'enabled' : 'disabled'
      }),
    });
  }, [getCellShadingMaterial, getXrayMaterial]);

  // Cleanup : Disposer tous les matériaux en cache au démontage du composant
  useEffect(() => {
    return () => {
      // Disposer les matériaux cell shading
      materialsCache.current.cellShading.forEach(material => {
        if (material) material.dispose();
      });
      materialsCache.current.cellShading.clear();
      
      // Disposer les matériaux X-ray
      materialsCache.current.xray.forEach(material => {
        if (material) material.dispose();
      });
      materialsCache.current.xray.clear();
      
      console.log('🧹 Materials cache cleaned up');
    };
  }, []);

  // ÉTAPE 1 : Charger le modèle URDF depuis le cache (préchargé au démarrage)
  useEffect(() => {
    // Reset state when daemon is inactive (sauf si forceLoad est actif)
    if (!isActive && !forceLoad) {
      console.log('⏸️ Daemon inactive, no URDF loading');
      setRobot(null);
      setIsReady(false);
      return;
    }

    let isMounted = true;

    // ✅ Récupérer le modèle depuis le cache (déjà préchargé)
    console.log('📦 Loading URDF model from cache...');
    
    robotModelCache.getModel().then((cachedModel) => {
      if (!isMounted) return;
      
      // Cloner le modèle pour cette instance
      const robotModel = cachedModel.clone(true); // true = recursive clone
      console.log('✅ URDF loaded from cache: %d meshes', robotModel.children.length);
      
      // ✅ Recalculer les normales smooth après clonage pour garantir un rendu lisse
      // Le clonage peut parfois perdre les normales, donc on les recalcule systématiquement
      let normalsRecalculated = 0;
      const sceneStlFiles = [];
      
      robotModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
          // Logger le nom du fichier STL pour chaque mesh de la scène
          const geometryUrl = child.geometry?.userData?.url || '';
          const meshFileName = geometryUrl.split('/').pop() || child.name || 'unnamed';
          const stlFileName = meshFileName.toLowerCase().endsWith('.stl') ? meshFileName : `${meshFileName}.stl`;
          
          if (!sceneStlFiles.includes(stlFileName)) {
            sceneStlFiles.push(stlFileName);
          }
          
          // Recalculer les normales avec un angle de seuil large pour un smooth shading optimal
          // Angle de 90° permet de smooth même les angles assez prononcés
          child.geometry.computeVertexNormals(Math.PI / 2);
          normalsRecalculated++;
        }
      });
      
      console.log(`✨ Smooth shading: ${normalsRecalculated} meshes avec normales recalculées (angle seuil: 90°)`);
      console.log(`📋 [Scene] STL files in scene: ${sceneStlFiles.length} unique files`);
      console.log(`📋 [Scene] STL files list:`, sceneStlFiles.sort());
      
      // ✅ Détecter les coques par BOUNDING BOX (les coques sont grosses)
      let shellPieceCount = 0;
      const boundingBoxSizes = [];
      
      robotModel.traverse((child) => {
        if (child.isMesh) {
          // Sauvegarder originalColor si pas déjà fait
          if (!child.userData.originalColor && child.material?.color) {
            child.userData.originalColor = child.material.color.getHex();
          }
          
          // Calculer la bounding box
          if (!child.geometry.boundingBox) {
            child.geometry.computeBoundingBox();
          }
          
          const bbox = child.geometry.boundingBox;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          
          // Volume de la bounding box
          const volume = size.x * size.y * size.z;
          boundingBoxSizes.push(volume);
          
          // Les coques ont un grand volume (> 0.0003)
          const isLargePiece = volume > 0.0003;
          
          child.userData.isShellPiece = isLargePiece;
          child.userData.boundingBoxVolume = volume;
          
          if (isLargePiece) {
            shellPieceCount++;
          }
        }
      });
      
      // Trier pour voir la distribution
      boundingBoxSizes.sort((a, b) => b - a);
      console.log(`  🛡️ ${shellPieceCount} shell pieces detected (bbox volume > 0.0003)`);
      console.log(`  📊 Bounding box volumes:`);
      console.log(`    - Top 10:`, boundingBoxSizes.slice(0, 10).map(v => v.toFixed(4)));
      console.log(`    - Bottom 10:`, boundingBoxSizes.slice(-10).map(v => v.toFixed(6)));

      // ✅ Préparer les matériaux initiaux (cell shading ou X-ray selon le mode actuel)
      let meshCount = 0;
      robotModel.traverse((child) => {
        if (child.isMesh && child.material) {
          meshCount++;
        }
      });
      
      console.log('✅ Robot ready with %d meshes, materials will be applied by useLayoutEffect', meshCount);
      
      // Collecter tous les meshes pour l'effet Outline
      const collectedMeshes = [];
      robotModel.traverse((child) => {
        if (child.isMesh) {
          collectedMeshes.push(child);
        }
      });
      meshesRef.current = collectedMeshes;
      
      // Notifier le parent que les meshes sont prêts
      if (onMeshesReady) {
        onMeshesReady(collectedMeshes);
      }
      
      // Notifier que le robot est prêt (pour HeadFollowCamera)
      if (onRobotReady) {
        onRobotReady(robotModel);
      }
      
      // ✅ Modèle chargé, on va laisser useLayoutEffect appliquer les matériaux
      setRobot(robotModel);
      console.log('✅ Robot model ready for rendering');
    }).catch((err) => {
      console.error('❌ URDF loading error:', err);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, forceLoad, onMeshesReady]); // ✅ Charger quand isActive ou forceLoad change

  // ✅ Appliquer les antennes au chargement initial et quand elles changent (même si isActive=false)
  useEffect(() => {
    if (!robot) return;
    
    // Forcer les antennes à la position (repliées par défaut si pas de valeur)
    const leftPos = antennas?.[0] !== undefined ? antennas[0] : 0;
    const rightPos = antennas?.[1] !== undefined ? antennas[1] : 0;
    
    if (robot.joints['left_antenna']) {
      robot.setJointValue('left_antenna', leftPos);
    }
    if (robot.joints['right_antenna']) {
      robot.setJointValue('right_antenna', rightPos);
    }
    
    console.log('🤖 Antennes set to:', [leftPos, rightPos]);
  }, [robot, antennas]); // Se déclenche au chargement ET quand antennas change
  
  // ✅ Animation loop synchronisée avec le render de Three.js (60 FPS)
  // useFrame est plus performant que useEffect pour les mises à jour Three.js
  useFrame(() => {
    if (!robot) return;
    
    // ✅ Permettre les animations si le robot est chargé (isActive OU forceLoad)
    // Si forceLoad est true, on veut que le robot bouge même si isActive est temporairement false
    if (!isActive && !forceLoad) return;

    // ÉTAPE 1 : Appliquer yaw_body (rotation du corps)
    if (yawBody !== undefined && robot.joints['yaw_body']) {
      robot.setJointValue('yaw_body', yawBody);
    }

    // ÉTAPE 2 : Appliquer head_pose (transformation complète de la tête via Stewart platform)
    if (headPose && headPose.length === 16) {
      const xl330Link = robot.links['xl_330'];
      
      if (xl330Link) {
        const matrix = new THREE.Matrix4();
        matrix.fromArray(headPose);
        
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);
        
        // Appliquer rotation + translation
        xl330Link.position.copy(position);
        xl330Link.quaternion.copy(quaternion);
        xl330Link.updateMatrix();
        xl330Link.updateMatrixWorld(true);
      }
    }

    // ÉTAPE 3 : Mettre à jour les antennes
    if (antennas && antennas.length >= 2) {
      if (robot.joints['left_antenna']) {
        robot.setJointValue('left_antenna', antennas[0]);
      }
      if (robot.joints['right_antenna']) {
        robot.setJointValue('right_antenna', antennas[1]);
      }
    }
    
    // ✅ Détection du survol avec raycaster pour debug
    raycaster.current.setFromCamera(mouse.current, camera);
    const intersects = raycaster.current.intersectObject(robot, true);
    
    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      if (mesh.isMesh && mesh !== hoveredMesh.current) {
        hoveredMesh.current = mesh;
        const geometryUrl = mesh.geometry?.userData?.url || '';
        const fileName = geometryUrl.split('/').pop() || '';
        
        console.log('🖱️ HOVER on mesh:', {
          meshName: mesh.name || '',
          stlFileName: mesh.userData?.stlFileName || '',
          fileName: fileName || '',
          materialName: mesh.userData?.materialName || mesh.material?.name || '',
          directMaterialName: mesh.material?.name || '',
          materialType: mesh.material?.type || '',
          originalColor: mesh.userData?.originalColor ? `#${mesh.userData.originalColor.toString(16).padStart(6, '0')}` : 'N/A',
          isAntenna: mesh.userData?.isAntenna || false,
          isShellPiece: mesh.userData?.isShellPiece || false,
          isBigLens: (() => {
            const matName = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase();
            return matName.includes('big_lens') || 
                   matName.includes('lens_d40') ||
                   matName.includes('small_lens') ||
                   matName.includes('lens_d30');
          })(),
          parentName: mesh.parent?.name || '',
          parentNames: (() => {
            const names = [];
            let p = mesh.parent;
            let depth = 0;
            while (p && depth < 5) {
              if (p.name) names.push(p.name);
              p = p.parent;
              depth++;
            }
            return names;
          })(),
          position: mesh.position.clone(),
          userDataKeys: Object.keys(mesh.userData || {}),
          geometryUserDataKeys: Object.keys(mesh.geometry?.userData || {}),
        });
      }
    } else {
      hoveredMesh.current = null;
    }
  });

  // ÉTAPE 2 : Appliquer les matériaux (au chargement initial ET aux changements)
  // useLayoutEffect = synchrone AVANT le rendu, garantit aucun "flash"
  useLayoutEffect(() => {
    if (!robot) return;
    
    const isInitialSetup = !isReady;
    console.log(isInitialSetup ? '🎨 Initial material setup (before first render)' : '🔄 Material update (mode/params changed)', {
      cellShading,
      isTransparent,
      xrayOpacity,
    });
    
    applyMaterials(robot, isTransparent, cellShading, xrayOpacity);
    
    // Marquer comme prêt après la première application des matériaux
    if (isInitialSetup) {
      setIsReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    robot, 
    isTransparent, 
    cellShading?.bands,
    cellShading?.smoothness,
    cellShading?.rimIntensity,
    cellShading?.specularIntensity,
    cellShading?.ambientIntensity,
    cellShading?.contrastBoost,
    cellShading?.outlineEnabled,
    cellShading?.outlineThickness,
    cellShading?.outlineColor,
    xrayOpacity, 
    applyMaterials
  ]); // Utiliser les valeurs individuelles pour détecter les changements

  // Ne rendre le robot que quand TOUT est prêt (chargé + matériaux appliqués)
  return robot && isReady ? (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive ref={groupRef} object={robot} scale={1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  ) : null;
}

