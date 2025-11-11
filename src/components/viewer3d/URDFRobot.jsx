import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
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
  cellShading = { enabled: false, bands: 3, smoothShading: true },
  xrayOpacity = 0.15,
  onMeshesReady,
  onRobotReady, // Callback avec la référence au robot
  forceLoad = false, // ✅ Force le chargement même si isActive=false
}) {
  const [robot, setRobot] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const groupRef = useRef();
  const meshesRef = useRef([]);
  
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
        bands: cellShadingConfig?.bands || 12,
        smoothness: cellShadingConfig?.smoothness ?? 0.4,
        rimIntensity: cellShadingConfig?.rimIntensity ?? 0.35,
        specularIntensity: cellShadingConfig?.specularIntensity ?? 0.25,
        ambientIntensity: cellShadingConfig?.ambientIntensity ?? 0.4,
        contrastBoost: cellShadingConfig?.contrastBoost ?? 0.85,
        internalLinesEnabled: cellShadingConfig?.internalLinesEnabled ?? true,
        internalLinesIntensity: cellShadingConfig?.internalLinesIntensity ?? 0.3,
      });
      cache.set(mesh, material);
    }
    
    return cache.get(mesh);
  }, []);

  // ✅ Fonction pour créer ou récupérer un matériau X-ray depuis le cache
  const getXrayMaterial = useCallback((mesh, opacity) => {
    const cache = materialsCache.current.xray;
    
    if (!cache.has(mesh)) {
      const originalColor = mesh.userData.originalColor || 0xFF9500;
      const material = new THREE.MeshBasicMaterial({
        color: originalColor,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      cache.set(mesh, material);
    } else {
      // Mettre à jour l'opacité si elle change
      const material = cache.get(mesh);
      material.opacity = opacity;
    }
    
    return cache.get(mesh);
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
      
      // ✅ VERRES DES LUNETTES : Toujours transparents (même en mode cell shading)
      if (child.userData.isGlass) {
        console.log('👓 Applying glass material to:', child.name, 'color:', child.userData.originalColor?.toString(16));
        
        // Matériau transparent spécial pour les verres - Très visible
        const glassMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x1a1a2e, // Bleu-noir foncé
          transparent: true,
          opacity: 0.15, // ✅ Très transparent pour bien voir à travers
          metalness: 0.0,
          roughness: 0.02, // Très lisse et brillant
          reflectivity: 1.0,
          clearcoat: 1.0, // Coating brillant
          clearcoatRoughness: 0.02,
          transmission: 0.95, // ✅ Transmission maximale (presque invisible)
          thickness: 0.3,
          ior: 1.52, // Indice de réfraction du verre
          attenuationColor: 0x1a1a2e,
          attenuationDistance: 0.3,
          side: THREE.DoubleSide,
        });
        
        child.material = glassMaterial;
        
        // Pas de contours sur les verres
        if (child.userData.outlineMesh) {
          child.remove(child.userData.outlineMesh);
          child.userData.outlineMesh.geometry.dispose();
          child.userData.outlineMesh.material.dispose();
          child.userData.outlineMesh = null;
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
        
        const antennaMaterial = new THREE.MeshBasicMaterial({
          color: transparent ? 0x404040 : 0x1a1a1a, // Gris foncé en x-ray, noir en normal
          transparent: transparent, // Seulement transparent en mode x-ray
          opacity: transparent ? 0.2 : 1.0, // Très discret en mode x-ray, opaque en normal
          side: THREE.FrontSide,
          depthWrite: !transparent, // Depth write seulement en mode normal
        });
        child.material = antennaMaterial;
        
        console.log('📡 Antenna material applied:', {
          transparent,
          color: transparent ? '#404040' : '#1a1a1a',
          opacity: transparent ? 0.2 : 1.0
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
        
        // Mettre à jour les paramètres si changement
        updateCellShadingMaterial(cellMaterial, {
          bands: cellShadingConfig?.bands || 12,
          smoothness: cellShadingConfig?.smoothness ?? 0.4,
          rimIntensity: cellShadingConfig?.rimIntensity ?? 0.35,
          specularIntensity: cellShadingConfig?.specularIntensity ?? 0.25,
          ambientIntensity: cellShadingConfig?.ambientIntensity ?? 0.4,
          contrastBoost: cellShadingConfig?.contrastBoost ?? 0.85,
          internalLinesEnabled: cellShadingConfig?.internalLinesEnabled ?? true,
          internalLinesIntensity: cellShadingConfig?.internalLinesIntensity ?? 0.3,
        });
        
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
        bands: cellShadingConfig?.bands || 12, 
        smoothness: cellShadingConfig?.smoothness ?? 0.4,
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

  // ✅ Animation loop synchronisée avec le render de Three.js (60 FPS)
  // useFrame est plus performant que useEffect pour les mises à jour Three.js
  useFrame(() => {
    if (!robot || !isActive) return;

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
  });

  // ÉTAPE 2 : Appliquer les matériaux (au chargement initial ET aux changements)
  // useLayoutEffect = synchrone AVANT le rendu, garantit aucun "flash"
  useLayoutEffect(() => {
    if (!robot) return;
    
    const isInitialSetup = !isReady;
    console.log(isInitialSetup ? '🎨 Initial material setup (before first render)' : '🔄 Material update (mode/params changed)');
    
    applyMaterials(robot, isTransparent, cellShading, xrayOpacity);
    
    // Marquer comme prêt après la première application des matériaux
    if (isInitialSetup) {
      setIsReady(true);
    }
    
    // ✅ Pas de cleanup : les gradient maps sont maintenant dans un cache
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot, isTransparent, cellShading, xrayOpacity, applyMaterials]); // isReady volontairement exclus pour éviter loop

  // Ne rendre le robot que quand TOUT est prêt (chargé + matériaux appliqués)
  return robot && isReady ? (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive ref={groupRef} object={robot} scale={1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  ) : null;
}

