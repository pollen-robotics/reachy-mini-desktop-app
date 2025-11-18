import { useEffect, useState, useRef, useCallback } from 'react';
import { Html, Line } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useAppStore from '../../../store/useAppStore';

/**
 * Determines the group/component of a mesh based on its real name
 */
function getComponentGroup(mesh) {
  const meshName = (mesh.name || '').toLowerCase();
  const materialName = (mesh.userData.materialName || mesh.material?.name || '').toLowerCase();
  
  // Check userData first (more reliable)
  if (mesh.userData.isAntenna) {
    return 'ANTENNA';
  }
  
  // Check lenses by material
  if (materialName.includes('big_lens') || materialName.includes('lens_d40')) {
    return 'OPTICAL LENS';
  }
  if (materialName.includes('small_lens') || materialName.includes('lens_d30')) {
    return 'CAMERA LENS';
  }
  
  // Traverse hierarchy to find parent group
  let currentParent = mesh.parent;
  let depth = 0;
  while (currentParent && depth < 5) {
    const pName = (currentParent.name || '').toLowerCase();
    
    // Main groups based on URDF link names
    if (pName.includes('xl_330') || pName.includes('camera') || meshName.includes('xl_330') || meshName.includes('camera')) {
      return 'CAMERA MODULE';
    }
    if (pName.includes('head') || pName.includes('stewart') || meshName.includes('head') || meshName.includes('stewart')) {
      return 'HEAD ASSEMBLY';
    }
    if (pName.includes('arm') || pName.includes('shoulder') || meshName.includes('arm') || meshName.includes('shoulder')) {
      return 'ARM JOINT';
    }
    if (pName.includes('base') || pName.includes('body') || pName.includes('yaw_body') || meshName.includes('base') || meshName.includes('body')) {
      return 'BASE UNIT';
    }
    
    currentParent = currentParent.parent;
    depth++;
  }
  
  return null;
}

/**
 * Simplified annotation component for scan
 * Displays ONE label per component group (avoids spam)
 */
export default function ScanAnnotations({ 
  enabled = true,
  currentScannedMesh = null,
}) {
  const { camera } = useThree();
  const darkMode = useAppStore(state => state.darkMode);
  const [annotation, setAnnotation] = useState(null);
  const currentGroupRef = useRef(null); // Track current group to avoid repeated changes
  const annotationDataRef = useRef(null); // Store base annotation data (meshPosition, componentName)
  const lastGroupRef = useRef(null); // Track last logged group to reduce logging

  // ✅ Function to calculate text position on screen edges
  const updateAnnotationPosition = useCallback((meshPosition, componentName) => {
    // Project component position on screen to determine side
    const vector = meshPosition.clone().project(camera);
    
    // If component is left of screen center (x < 0) → text on right (right edge)
    // If component is right of screen center (x > 0) → text on left (left edge)
    // We invert so text is always on opposite side, never above
    const isRightSide = vector.x > 0;
    
    // Calculate text position on sides (never above)
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);
    
    // Camera right vector in world space
    const cameraRight = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    const cameraUp = new THREE.Vector3(0, 1, 0);
    
    camera.getWorldDirection(cameraForward);
    cameraRight.crossVectors(cameraUp, cameraForward).normalize();
    
    // Distance on sides (reduced to stay visible on screen)
    const sideDistance = 0.05; // ✅ Réduit pour des flèches plus courtes
    
    // Text position: slightly higher and horizontally offset based on camera
    const horizontalOffset = isRightSide ? -sideDistance : sideDistance;
    const verticalOffset = 0.02; // Slightly higher to create angled line
    
    // Line start point (base position)
    const lineStartPos = new THREE.Vector3(
      meshPosition.x + (cameraRight.x * horizontalOffset),
      meshPosition.y + verticalOffset,
      meshPosition.z + (cameraRight.z * horizontalOffset)
    );
    
    // Horizontal offset to separate text from line start
    const textToLineOffset = isRightSide ? -0.011 : 0.011; // Text offset outward
    
    // Text position: horizontally offset to create offset with line
    // Text starts after line beginning
    const textPos = new THREE.Vector3(
      lineStartPos.x + (cameraRight.x * textToLineOffset),
      lineStartPos.y + 0.001,
      lineStartPos.z + (cameraRight.z * textToLineOffset)
    );
    
    // Adjust line Y position so it starts from bottom of text
    const textHeight = 0.012; // Approximate text height in 3D units
    lineStartPos.y = textPos.y - textHeight / 2; // Align with bottom of text

    setAnnotation({
      componentName,
      meshPosition: meshPosition.clone(),
      textPosition: textPos,
      lineStartPosition: lineStartPos, // Line start point (separated from text)
      alignLeft: isRightSide, // If component on right → text aligned left (left edge)
    });
  }, [camera]);

  useEffect(() => {
    if (!enabled || !currentScannedMesh) {
      setAnnotation(null);
      currentGroupRef.current = null;
      annotationDataRef.current = null; // ✅ Also clean data
      return;
    }

    const mesh = currentScannedMesh;
    
    // Don't annotate outline meshes or shells
    if (mesh.userData.isOutline || mesh.userData.isShellPiece) {
      return; // Don't reset annotation if passing over ignored mesh
    }

    // Determine mesh group
    const componentGroup = getComponentGroup(mesh);
    
    if (!componentGroup) {
      return; // No group identified, don't display annotation
    }

    // ✅ Only update annotation if group changes
    if (currentGroupRef.current === componentGroup) {
      return; // Same group, no need to change annotation
    }

    // New group detected
    currentGroupRef.current = componentGroup;
    // Reduced logging - only log when group changes
    if (componentGroup !== lastGroupRef.current) {
      console.log(`🔍 Scan group: ${componentGroup}`);
      lastGroupRef.current = componentGroup;
    }

    // Calculate mesh position
    const worldPosition = new THREE.Vector3();
    mesh.getWorldPosition(worldPosition);
    
    // Calculate bounding box to find highest point
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const bbox = mesh.geometry.boundingBox;
    const topPoint = new THREE.Vector3(
      (bbox.min.x + bbox.max.x) / 2,
      bbox.max.y,
      (bbox.min.z + bbox.max.z) / 2
    );
    topPoint.applyMatrix4(mesh.matrixWorld);

    // ✅ Determine best side for text based on camera position
    // Simple and effective approach: use cross product to determine
    // if component is left or right of center relative to camera
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);
    
    // Vectors in camera space
    const cameraToMesh = new THREE.Vector3().subVectors(topPoint, cameraPos);
    const cameraToCenter = new THREE.Vector3().subVectors(new THREE.Vector3(0, topPoint.y, 0), cameraPos);
    
    // Cross product to determine side (in horizontal plane)
    const cross = new THREE.Vector3().crossVectors(cameraToMesh, cameraToCenter);
    
    // If cross.y > 0, component is right of center (from camera view)
    // Place text on left to avoid being hidden by central robot
    const isRightSide = cross.y > 0;
    
    // Text position: always opposite center to avoid overlap
    const horizontalOffset = isRightSide ? -0.08 : 0.08; // Negative = left, Positive = right
    const textOffset = new THREE.Vector3(horizontalOffset, 0.05, 0);
    const textPos = topPoint.clone().add(textOffset);

    // Store base data for dynamic recalculation
    annotationDataRef.current = {
      componentName: componentGroup,
      meshPosition: topPoint.clone(),
    };

    // Calculate initial position
    updateAnnotationPosition(topPoint, componentGroup);

    return () => {
      // Don't reset here, keep annotation until next group
    };
  }, [enabled, currentScannedMesh?.uuid, updateAnnotationPosition]);

  // ✅ Update text position when camera moves
  useFrame(() => {
    if (!annotationDataRef.current) return;
    
    // Recalculate position based on current camera
    updateAnnotationPosition(
      annotationDataRef.current.meshPosition,
      annotationDataRef.current.componentName
    );
  });

  if (!enabled || !annotation) return null;

  return (
    <>
      {/* Futuristic diagonal line pointing to component */}
      {/* ✅ Calculer un point de fin plus proche du mesh pour une flèche plus courte */}
      {(() => {
        const lineStart = annotation.lineStartPosition || annotation.textPosition;
        const meshPos = annotation.meshPosition;
        // ✅ Créer un point à 70% de la distance (flèche plus courte)
        const shortenedEnd = new THREE.Vector3().lerpVectors(meshPos, lineStart, 0.3);
        return (
          <Line
            points={[
              lineStart.toArray(),
              shortenedEnd.toArray(),
            ]}
            color="#16a34a"
            lineWidth={0.8}
            dashed={false}
            opacity={0.9}
            renderOrder={9999}
            depthTest={false}
          />
        );
      })()}
      
      {/* Text without box, futuristic style, always on sides */}
      <Html
        position={annotation.textPosition.toArray()}
        distanceFactor={0.35}
        center={false}
        occlude={false}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontFamily: 'monospace',
            fontWeight: '900',
            color: '#16a34a',
            whiteSpace: 'nowrap',
            // ✅ Align based on side: left if component on right, right if component on left
            // Transform adjusted so line starts from bottom of text
            transform: annotation.alignLeft 
              ? 'translate(0, 0)' // Aligned left, bottom of text at position
              : 'translate(-100%, 0)', // Aligned right, bottom of text at position
            // ✅ Contour de la couleur du fond de la scène pour meilleure lisibilité
            textShadow: `
              -3px -3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              3px -3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              -3px 3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              3px 3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              -2px -2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              2px -2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              -2px 2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              2px 2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              -1px -1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              1px -1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              -1px 1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
              1px 1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'}
            `,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            opacity: 1,
            // z-index hierarchy: 9999 = fullscreen overlays (scan annotations in 3D scene)
            zIndex: 9999,
            position: 'relative',
            background: 'none',
            border: 'none',
            padding: 0,
            textAlign: annotation.alignLeft ? 'left' : 'right',
          }}
        >
          {annotation.componentName}
        </div>
      </Html>
    </>
  );
}
