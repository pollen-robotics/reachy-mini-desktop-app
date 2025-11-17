import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createCellShadingMaterial, updateCellShadingMaterial, createXrayMaterial, updateXrayMaterial } from './utils/materials';
import robotModelCache from '../../utils/robotModelCache';

/**
 * Robot component loaded from local URDF
 * Loads assets from /assets/robot-3d/ instead of daemon
 * Manages 3D model loading, head and antenna animations
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
  onRobotReady, // Callback with robot reference
  forceLoad = false, // ✅ Force loading even if isActive=false
}) {
  const [robot, setRobot] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const groupRef = useRef();
  const meshesRef = useRef([]);
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hoveredMesh = useRef(null);
  
  // ✅ Reuse Three.js objects to avoid allocations on each frame
  const tempMatrix = useRef(new THREE.Matrix4());
  const tempPosition = useRef(new THREE.Vector3());
  const tempQuaternion = useRef(new THREE.Quaternion());
  const tempScale = useRef(new THREE.Vector3());
  
  // ✅ Cache to avoid unnecessary updates
  const lastHeadPoseRef = useRef(null);
  const lastYawBodyRef = useRef(undefined);
  const lastAntennasRef = useRef(null);
  
  // ✅ Mouse movement handler for raycaster
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
  
  // ✅ Material cache for each mesh (COMPLETE separation between cell shading and X-ray)
  const materialsCache = useRef({
    cellShading: new Map(), // Map<mesh, ShaderMaterial>
    xray: new Map(),         // Map<mesh, ShaderMaterial> (now with improved shader)
  });

  // ✅ Function to create or retrieve cell shading material from cache
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

  // ✅ Function to create or retrieve X-ray material from cache with discrete X-ray style colors
  const getXrayMaterial = useCallback((mesh, opacity, colorOverride = null) => {
    const cache = materialsCache.current.xray;
    const cacheKey = `${mesh.uuid}_${colorOverride || 'default'}`;
    
    if (!cache.has(cacheKey)) {
      // ✅ Determine object type BEFORE determining color
        const isAntenna = mesh.userData?.isAntenna || false;
        const isShellPiece = mesh.userData?.isShellPiece || false;
        const isBigLens = (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('big_lens') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('small_lens') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('lens_d40') ||
                         (mesh.userData?.materialName || mesh.material?.name || '').toLowerCase().includes('lens_d30');
        
      // ✅ Discrete X-ray style colors (gray/light blue tones)
      let xrayColor = colorOverride;
      
      if (!xrayColor) {
        // ✅ Realistic X-ray palette with different tints based on material
        // Medical X-ray style: different densities = different tints
        if (isAntenna) {
          // Antennas: dense metal = medium gray with slight blue tint
          xrayColor = 0x5A6B7C; // Medium-blue gray (medium-high density)
        } else if (isBigLens) {
          // Lenses: glass/plastic = light gray with slight green tint
          xrayColor = 0x6B7B7A; // Light-green gray (low-medium density)
        } else if (isShellPiece) {
          // Shells: thick plastic = medium gray with slight blue tint
          xrayColor = 0x5A6570; // Medium gray (medium density)
        } else {
          // Color based on original luminance (X-ray style)
          const originalColor = mesh.userData?.originalColor || 0xFF9500;
          const r = (originalColor >> 16) & 0xFF;
          const g = (originalColor >> 8) & 0xFF;
          const b = originalColor & 0xFF;
          
          // Calculate luminance to map to realistic palette
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
          
          // ✅ Realistic X-ray palette: darkened with subtle tint variations
          // Darker = more realistic, with slight colored tints like real scans
          if (luminance > 200) {
            xrayColor = 0x6B757D; // Medium-light gray (medium-high density)
          } else if (luminance > 150) {
            xrayColor = 0x5A6570; // Medium gray (medium density)
          } else if (luminance > 100) {
            xrayColor = 0x4A5560; // Medium-dark gray (medium-low density)
          } else if (luminance > 50) {
            xrayColor = 0x3A4550; // Dark gray (low density)
          } else {
            xrayColor = 0x2A3540; // Very dark gray (very low density, almost transparent)
          }
        }
      }
      
      // ✅ Use improved X-ray shader with rim lighting
      // Rim color adapted based on material for more realism
      const rimColor = isAntenna ? 0x8A9AAC : // Slightly blue for metal
                       isBigLens ? 0x7A8A8A : // Slightly green for glass
                       isShellPiece ? 0x7A8590 : // Neutral gray for plastic
                       0x6A7580; // Neutral gray for other materials
      
      // ✅ Increased transparency for 3D printed parts (shell pieces)
      // 3D printed parts are less dense, so more transparent in X-ray
      const finalOpacity = isShellPiece ? opacity * 0.4 : opacity; // 60% more transparency for shells
      
      const material = createXrayMaterial(xrayColor, {
        rimColor: rimColor, // Tint adapted to material
        rimPower: 2.0,
        rimIntensity: 0.25, // Reduced for more realistic look
        opacity: finalOpacity, // Reduced opacity for 3D printed parts
        edgeIntensity: 0.2, // Reduced for more discrete look
        subsurfaceColor: isAntenna ? 0x4A5A6C : // Blue subsurface for metal
                         isBigLens ? 0x5A6A6A : // Green subsurface for glass
                         0x4A5560, // Neutral subsurface for others
        subsurfaceIntensity: 0.15, // Reduced for more subtlety
      });
      cache.set(cacheKey, material);
    } else {
      // Update opacity if it changes
      const material = cache.get(cacheKey);
      if (material.uniforms) {
        // ✅ Apply increased transparency for 3D printed parts
        const isShellPiece = mesh.userData?.isShellPiece || false;
        const finalOpacity = isShellPiece ? opacity * 0.3 : opacity;
        // Shader material
        updateXrayMaterial(material, { opacity: finalOpacity });
      } else {
        // MeshBasicMaterial (fallback)
        const isShellPiece = mesh.userData?.isShellPiece || false;
        const finalOpacity = isShellPiece ? opacity * 0.3 : opacity;
        material.opacity = finalOpacity;
      }
    }
    
    return cache.get(cacheKey);
  }, []);

  // Function to apply materials (used on load AND on changes)
  // ✅ COMPLETE SEPARATION: each mode has its own materials
  const applyMaterials = useCallback((robotModel, transparent, cellShadingConfig, opacity) => {
    let processedCount = 0;
    let skippedCount = 0;
    let antennaCount = 0;
    
    // ✅ First collect all main meshes (to avoid traversing outline meshes)
    const mainMeshes = [];
    robotModel.traverse((child) => {
      if (child.isMesh && !child.userData.isOutline) {
        mainMeshes.push(child);
      }
    });
    
    console.log(`🔍 Processing ${mainMeshes.length} meshes...`);
    
    // Traverse only main meshes
    mainMeshes.forEach((child) => {
      if (!child.material) {
        console.warn('⚠️ Mesh without material:', child.name || 'unnamed');
        skippedCount++;
        return;
      }
      
      // ⚠️ Do not touch error meshes
      if (child.userData.isErrorMesh) {
        skippedCount++;
        return;
      }
      
      // ✅ BIG_LENS only: Always transparent (even in cell shading mode)
      // Robust detection: mesh name, STL file name, parent name (recursive), material name, COLOR
      const meshName = child.name || '';
      const stlFileName = child.userData?.stlFileName || '';
      const geometryUrl = child.geometry?.userData?.url || '';
      const fileName = geometryUrl.split('/').pop() || '';
      // ✅ Use material name stored in userData (more reliable than child.material?.name)
      const materialName = child.userData?.materialName || child.material?.name || '';
      const lensColor = child.userData?.originalColor || 0;
      
      // ✅ Traverse entire parent hierarchy to find "big_lens"
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
      
      // ✅ Detection by EXACT COLOR: big_lens has a very specific gray color
      // In URDF: rgba(0.439216 0.47451 0.501961 0.301961)
      // Conversion: r=0.439216*255≈112, g=0.47451*255≈121, b=0.501961*255≈128
      // Approximate hex: #707980 or #707f80
      const r = (lensColor >> 16) & 0xFF;
      const g = (lensColor >> 8) & 0xFF;
      const b = lensColor & 0xFF;
      
      // ✅ EXACT COLOR of big_lens: very close to #707980
      // Tolerance of ±10 for each component
      const isExactLensColor = r >= 102 && r <= 122 &&  // 112 ± 10
                               g >= 111 && g <= 131 &&  // 121 ± 10
                               b >= 118 && b <= 138 &&  // 128 ± 10
                               Math.abs(r - g) < 15 &&   // Uniform gray
                               Math.abs(g - b) < 15;     // Uniform gray
      
      // ✅ Explicitly EXCLUDE eye_support and similar parts
      const isEyeSupport = meshName.toLowerCase().includes('eye') && 
                          (meshName.toLowerCase().includes('support') || meshName.toLowerCase().includes('mount'));
      const isExcluded = isEyeSupport || 
                        meshName.toLowerCase().includes('support') ||
                        parentNames.some(p => p.toLowerCase().includes('eye') && p.toLowerCase().includes('support'));
      
      // ✅ STRICT detection: material containing "big_lens", "lens_d40", "small_lens" or "lens_d30"
      // Materials "big_lens_d40_material", "small_lens_d30_material" are reliable criteria
      const materialNameLower = materialName.toLowerCase();
      const isBigLens = materialNameLower.includes('big_lens') || 
                       materialNameLower.includes('lens_d40') ||
                       materialNameLower.includes('small_lens') ||
                       materialNameLower.includes('lens_d30'); // big_lens, small_lens or their variants
      
      // ✅ DEBUG: Log if material contains "glasses" to find second lens
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
      
      // Log if detected by other means for debug
      const detectedByName = meshName.toLowerCase().includes('big_lens') || 
                            stlFileName.toLowerCase().includes('big_lens') ||
                            fileName.toLowerCase().includes('big_lens') ||
                            parentName.toLowerCase().includes('big_lens');
      
      if (!isBigLens && detectedByName) {
        console.warn('⚠️ Big lens detected by name but not by material:', {
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
      
      // Log all objects with "big_lens" in their name for complete debug
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
      
      // ✅ LOG ALL MESHES with material containing "lens" or "big" to find big_lens
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
      
      // ✅ LOG ALL MESHES for debug (only first ones to avoid spam)
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
      
      // ✅ LOG if detected as big_lens to see why
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
                 isBigLensValue: isBigLens, // The actual value of isBigLens
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
        
        // ✅ BIG_LENS: Cell shading WITH transparency (no glass material)
        // Apply cell shading like other parts, but with transparency
        if (!transparent) {
          const lensOpacity = 0.75; // Reduced opacity for normal mode (cell shading)
          
          // ✅ Create BLACK cell shading material for lenses
          // Use createCellShadingMaterial directly with black color
          const cellMaterial = createCellShadingMaterial(0x000000, { // Black color
            bands: cellShadingConfig?.bands || 100,
            smoothness: cellShadingConfig?.smoothness ?? 0.45,
            rimIntensity: cellShadingConfig?.rimIntensity ?? 0.4,
            specularIntensity: cellShadingConfig?.specularIntensity ?? 0.3,
            ambientIntensity: cellShadingConfig?.ambientIntensity ?? 0.45,
            contrastBoost: cellShadingConfig?.contrastBoost ?? 0.9,
            opacity: lensOpacity, // Pass opacity during creation
          });
          
          // Update cell shading parameters (use values directly from cellShadingConfig)
          updateCellShadingMaterial(cellMaterial, {
            bands: cellShadingConfig?.bands,
            smoothness: cellShadingConfig?.smoothness,
            rimIntensity: cellShadingConfig?.rimIntensity,
            specularIntensity: cellShadingConfig?.specularIntensity,
            ambientIntensity: cellShadingConfig?.ambientIntensity,
            contrastBoost: cellShadingConfig?.contrastBoost,
            opacity: lensOpacity, // Ensure opacity is properly defined
          });
          
          console.log('👓 Big lens opacity set:', {
            lensOpacity,
            materialTransparent: cellMaterial.transparent,
            materialOpacity: cellMaterial.opacity,
            uniformOpacity: cellMaterial.uniforms.opacity.value,
          });
          
          child.material = cellMaterial;
          
          // No outlines on big_lens
          if (child.userData.outlineMesh) {
            child.remove(child.userData.outlineMesh);
            child.userData.outlineMesh.geometry.dispose();
            child.userData.outlineMesh.material.dispose();
            child.userData.outlineMesh = null;
          }
        } else {
          // In X-ray mode, use X-ray material with light gray color for lenses
          const xrayMaterial = getXrayMaterial(child, opacity, 0x6B7B7A); // Light-green gray for lenses (X-ray style)
          child.material = xrayMaterial;
        }
        
        processedCount++;
        return; // Skip rest of processing
      }
      
      // ✅ ANTENNAS: ALL orange parts become black
      const originalColor = child.userData.originalColor || 0xFF9500;
      const vertexCount = child.geometry?.attributes?.position?.count || 0;
      const isOrange = originalColor === 0xFF9500 || 
                      (originalColor >= 0xFF8000 && originalColor <= 0xFFB000);
      
      // ALL orange parts = antennas (no size limit)
      const isAntenna = child.userData.isAntenna || isOrange;
      
      // Log ALL orange parts
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
          // X-ray mode: Discrete blue-gray for antennas
          const antennaMaterial = getXrayMaterial(child, opacity, 0x5A6B7C); // Medium-blue gray (metal density)
          child.material = antennaMaterial;
        } else {
          // Normal mode: Opaque black
          const antennaMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a1a, // Black
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
        
          // No outlines on antennas
        if (child.userData.outlineMesh) {
          child.remove(child.userData.outlineMesh);
          if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
          if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
          child.userData.outlineMesh = null;
        }
        
        processedCount++;
        return;
      }
      
      // ✅ CELL SHADING HD MODE (Normal)
      if (!transparent) {
        const cellMaterial = getCellShadingMaterial(child, cellShadingConfig);
        
        // Update parameters if changed (use values directly from cellShadingConfig)
        // ✅ Always pass all values to force update
        const updateParams = {};
        if (cellShadingConfig?.bands !== undefined) updateParams.bands = cellShadingConfig.bands;
        if (cellShadingConfig?.smoothness !== undefined) updateParams.smoothness = cellShadingConfig.smoothness;
        if (cellShadingConfig?.rimIntensity !== undefined) updateParams.rimIntensity = cellShadingConfig.rimIntensity;
        if (cellShadingConfig?.specularIntensity !== undefined) updateParams.specularIntensity = cellShadingConfig.specularIntensity;
        if (cellShadingConfig?.ambientIntensity !== undefined) updateParams.ambientIntensity = cellShadingConfig.ambientIntensity;
        if (cellShadingConfig?.contrastBoost !== undefined) updateParams.contrastBoost = cellShadingConfig.contrastBoost;
        
        updateCellShadingMaterial(cellMaterial, updateParams);
        
        child.material = cellMaterial;
        
          // ✅ AAA OUTLINES: "Backface Outline" technique (ONLY silhouette)
          // Used in Zelda BOTW, Genshin Impact, Guilty Gear Strive
          if (cellShadingConfig?.outlineEnabled) {
            // Remove old outline if it exists
            if (child.userData.outlineMesh) {
              child.remove(child.userData.outlineMesh);
              if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
              if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
              child.userData.outlineMesh = null;
            }
            
            const outlineColor = cellShadingConfig?.outlineColor || '#000000';
            const outlineThickness = (cellShadingConfig?.outlineThickness || 15.0) / 1000;
            
            // ✅ Backface outline: enlarged mesh with inverted faces
            const outlineMaterial = new THREE.MeshBasicMaterial({
              color: outlineColor,
              side: THREE.BackSide, // Only back faces
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
            // Remove outline if disabled
            child.remove(child.userData.outlineMesh);
            if (child.userData.outlineMesh.geometry) child.userData.outlineMesh.geometry.dispose();
            if (child.userData.outlineMesh.material) child.userData.outlineMesh.material.dispose();
            child.userData.outlineMesh = null;
          }
      } 
      // ✅ X-RAY MODE (Transparent)
      else {
        const xrayMaterial = getXrayMaterial(child, opacity);
        child.material = xrayMaterial;
        
        // ✅ Fix flickering: use static renderOrder based on hierarchy
        // Objects are naturally sorted by Three.js, we just avoid conflicts
        if (!child.userData.renderOrderSet) {
          child.renderOrder = 0; // Let Three.js handle automatic sorting
          child.userData.renderOrderSet = true;
        }
        
          // Remove outlines in X-ray mode
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

  // Cleanup: Dispose all cached materials on component unmount
  useEffect(() => {
    return () => {
      // Dispose cell shading materials
      materialsCache.current.cellShading.forEach(material => {
        if (material) material.dispose();
      });
      materialsCache.current.cellShading.clear();
      
      // Dispose X-ray materials
      materialsCache.current.xray.forEach(material => {
        if (material) material.dispose();
      });
      materialsCache.current.xray.clear();
      
      console.log('🧹 Materials cache cleaned up');
    };
  }, []);

  // STEP 1: Load URDF model from cache (preloaded at startup)
  useEffect(() => {
    // Reset state when daemon is inactive (except if forceLoad is active)
    if (!isActive && !forceLoad) {
      console.log('⏸️ Daemon inactive, no URDF loading');
      setRobot(null);
      setIsReady(false);
      return;
    }

    let isMounted = true;

    // ✅ Get model from cache (already preloaded)
    console.log('📦 Loading URDF model from cache...');
    
    robotModelCache.getModel().then((cachedModel) => {
      if (!isMounted) return;
      
      // Clone model for this instance
      const robotModel = cachedModel.clone(true); // true = recursive clone
      console.log('✅ URDF loaded from cache: %d meshes', robotModel.children.length);
      
      // ✅ Recalculate smooth normals after cloning to ensure smooth rendering
      // Cloning can sometimes lose normals, so we recalculate them systematically
      let normalsRecalculated = 0;
      const sceneStlFiles = [];
      
      robotModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
          // Log STL file name for each mesh in scene
          const geometryUrl = child.geometry?.userData?.url || '';
          const meshFileName = geometryUrl.split('/').pop() || child.name || 'unnamed';
          const stlFileName = meshFileName.toLowerCase().endsWith('.stl') ? meshFileName : `${meshFileName}.stl`;
          
          if (!sceneStlFiles.includes(stlFileName)) {
            sceneStlFiles.push(stlFileName);
          }
          
          // Recalculate normals with wide threshold angle for optimal smooth shading
          // 90° angle allows smoothing even fairly pronounced angles
          child.geometry.computeVertexNormals(Math.PI / 2);
          normalsRecalculated++;
        }
      });
      
      console.log(`✨ Smooth shading: ${normalsRecalculated} meshes with recalculated normals (threshold angle: 90°)`);
      console.log(`📋 [Scene] STL files in scene: ${sceneStlFiles.length} unique files`);
      console.log(`📋 [Scene] STL files list:`, sceneStlFiles.sort());
      
      // ✅ Detect shells by BOUNDING BOX (shells are large)
      let shellPieceCount = 0;
      const boundingBoxSizes = [];
      
      robotModel.traverse((child) => {
        if (child.isMesh) {
          // Save originalColor if not already done
          if (!child.userData.originalColor && child.material?.color) {
            child.userData.originalColor = child.material.color.getHex();
          }
          
          // Calculate bounding box
          if (!child.geometry.boundingBox) {
            child.geometry.computeBoundingBox();
          }
          
          const bbox = child.geometry.boundingBox;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          
          // Bounding box volume
          const volume = size.x * size.y * size.z;
          boundingBoxSizes.push(volume);
          
          // Shells have large volume (> 0.0003)
          const isLargePiece = volume > 0.0003;
          
          child.userData.isShellPiece = isLargePiece;
          child.userData.boundingBoxVolume = volume;
          
          if (isLargePiece) {
            shellPieceCount++;
          }
        }
      });
      
      // Sort to see distribution
      boundingBoxSizes.sort((a, b) => b - a);
      console.log(`  🛡️ ${shellPieceCount} shell pieces detected (bbox volume > 0.0003)`);
      console.log(`  📊 Bounding box volumes:`);
      console.log(`    - Top 10:`, boundingBoxSizes.slice(0, 10).map(v => v.toFixed(4)));
      console.log(`    - Bottom 10:`, boundingBoxSizes.slice(-10).map(v => v.toFixed(6)));

      // ✅ Prepare initial materials (cell shading or X-ray based on current mode)
      let meshCount = 0;
      robotModel.traverse((child) => {
        if (child.isMesh && child.material) {
          meshCount++;
        }
      });
      
      console.log('✅ Robot ready with %d meshes, materials will be applied by useLayoutEffect', meshCount);
      
      // Collect all meshes for Outline effect
      const collectedMeshes = [];
      robotModel.traverse((child) => {
        if (child.isMesh) {
          collectedMeshes.push(child);
        }
      });
      meshesRef.current = collectedMeshes;
      
      // Notify parent that meshes are ready
      if (onMeshesReady) {
        onMeshesReady(collectedMeshes);
      }
      
      // Notify that robot is ready (for HeadFollowCamera)
      if (onRobotReady) {
        onRobotReady(robotModel);
      }
      
      // ✅ Model loaded, let useLayoutEffect apply materials
      setRobot(robotModel);
      console.log('✅ Robot model ready for rendering');
    }).catch((err) => {
      console.error('❌ URDF loading error:', err);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, forceLoad, onMeshesReady]); // ✅ Load when isActive or forceLoad changes

  // ✅ Apply antennas on initial load and when they change (even if isActive=false)
  useEffect(() => {
    if (!robot) return;
    
    // Force antennas to position (folded by default if no value)
    const leftPos = antennas?.[0] !== undefined ? antennas[0] : 0;
    const rightPos = antennas?.[1] !== undefined ? antennas[1] : 0;
    
    if (robot.joints['left_antenna']) {
      robot.setJointValue('left_antenna', leftPos);
    }
    if (robot.joints['right_antenna']) {
      robot.setJointValue('right_antenna', rightPos);
    }
    
    console.log('🤖 Antennas set to:', [leftPos, rightPos]);
  }, [robot, antennas]); // Triggers on load AND when antennas change
  
  // ✅ Animation loop synchronized with Three.js render (60 FPS)
  // useFrame is more performant than useEffect for Three.js updates
  useFrame(() => {
    if (!robot) return;
    
    // ✅ Allow animations if robot is loaded (isActive OR forceLoad)
    // If forceLoad is true, we want robot to move even if isActive is temporarily false
    if (!isActive && !forceLoad) return;

    // STEP 1: Apply yaw_body (body rotation) - only if changed
    if (yawBody !== lastYawBodyRef.current && yawBody !== undefined && robot.joints['yaw_body']) {
      robot.setJointValue('yaw_body', yawBody);
      lastYawBodyRef.current = yawBody;
    }

    // STEP 2: Apply head_pose (complete head transformation via Stewart platform)
    // ✅ Check if headPose changed to avoid unnecessary recalculations
    const headPoseChanged = headPose && headPose.length === 16 && 
                           JSON.stringify(headPose) !== JSON.stringify(lastHeadPoseRef.current);
    
    if (headPoseChanged) {
      const xl330Link = robot.links['xl_330'];
      
      if (xl330Link) {
        // ✅ Reuse Three.js objects instead of recreating them (CRITICAL for performance)
        tempMatrix.current.fromArray(headPose);
        tempMatrix.current.decompose(tempPosition.current, tempQuaternion.current, tempScale.current);
        
        // Apply rotation + translation
        xl330Link.position.copy(tempPosition.current);
        xl330Link.quaternion.copy(tempQuaternion.current);
        xl330Link.updateMatrix();
        xl330Link.updateMatrixWorld(true);
        
        lastHeadPoseRef.current = headPose.slice(); // Copy for comparison
      }
    }

    // STEP 3: Update antennas - only if changed
    const antennasChanged = antennas && antennas.length >= 2 && 
                           JSON.stringify(antennas) !== JSON.stringify(lastAntennasRef.current);
    
    if (antennasChanged) {
      if (robot.joints['left_antenna']) {
        robot.setJointValue('left_antenna', antennas[0]);
      }
      if (robot.joints['right_antenna']) {
        robot.setJointValue('right_antenna', antennas[1]);
      }
      lastAntennasRef.current = antennas.slice(); // Copy for comparison
    }
    
    // ✅ Hover detection with raycaster for debug (throttled for performance)
    // Disable in production or throttle to ~10 FPS max
    if (process.env.NODE_ENV === 'development') {
      // Throttle raycaster to ~10 FPS (every 6 frames approximately)
      if (Math.random() < 0.16) { // ~10% of frames
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
      }
    }
  });

  // STEP 2: Apply materials (on initial load AND on changes)
  // useLayoutEffect = synchronous BEFORE render, guarantees no "flash"
  useLayoutEffect(() => {
    if (!robot) return;
    
    const isInitialSetup = !isReady;
    console.log(isInitialSetup ? '🎨 Initial material setup (before first render)' : '🔄 Material update (mode/params changed)', {
      cellShading,
      isTransparent,
      xrayOpacity,
    });
    
    applyMaterials(robot, isTransparent, cellShading, xrayOpacity);
    
    // Mark as ready after first material application
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
  ]); // Use individual values to detect changes

  // Only render robot when EVERYTHING is ready (loaded + materials applied)
  return robot && isReady ? (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive ref={groupRef} object={robot} scale={1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  ) : null;
}

