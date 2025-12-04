import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';

/**
 * Triangle friction indicator - fixed position at top center
 * When a new item becomes active, the triangle gets a rotation impulse in that direction,
 * then smoothly returns to center (pointing down)
 */
export default function WheelIndicator({ 
  activeItemAngle, 
  rotation, 
  wheelSize, 
  radiusRatio,
  isSpinning = false
}) {
  // Position fixe en haut du conteneur, centré - remonté
  const triangleTop = '60px';
  
  // ✅ OPTIMIZED: Use refs to track state without causing re-renders
  const prevActiveItemAngleRef = useRef(activeItemAngle);
  const [impulseRotation, setImpulseRotation] = useState(0);
  const impulseAnimationRef = useRef(null);
  const isSpinningRef = useRef(isSpinning);
  
  // Keep refs in sync without triggering effects
  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);
  
  // ✅ OPTIMIZED: Only trigger on activeItemAngle change (isSpinning removed from deps)
  // isSpinning is tracked via ref to avoid unnecessary effect re-runs
  useEffect(() => {
    const prevAngle = prevActiveItemAngleRef.current;
    const currentAngle = activeItemAngle;
    
    // Early return if angle hasn't changed
    if (prevAngle === currentAngle || 
        prevAngle === null || prevAngle === undefined ||
        currentAngle === null || currentAngle === undefined) {
      // Still update the ref even if no change (for next comparison)
      prevActiveItemAngleRef.current = currentAngle;
      return;
    }
      
      // Calculer la direction du changement
      // On normalise les angles pour gérer le passage de 360 à 0
      let angleDiff = currentAngle - prevAngle;
      
      // Normaliser pour avoir le chemin le plus court
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;
      
      // Déterminer la direction : positif = sens horaire, négatif = anti-horaire
      // L'impulsion doit être dans la direction opposée (le triangle "pousse" contre le mouvement)
      // Si la roue tourne dans le sens horaire (angle augmente), le triangle penche vers la droite (positif)
      const impulseDirection = angleDiff > 0 ? 1 : -1;
      const impulseMagnitude = Math.min(Math.abs(angleDiff) * 0.5, 25); // Max 25 degrés (augmenté pour plus de visibilité)
      
      // Appliquer l'impulsion
      setImpulseRotation(impulseDirection * impulseMagnitude);
      
      // Animation de retour élastique vers le centre
      // Annuler toute animation en cours pour permettre une réaction immédiate aux nouveaux changements
      if (impulseAnimationRef.current) {
        cancelAnimationFrame(impulseAnimationRef.current);
      impulseAnimationRef.current = null;
      }
      
      let startTime = Date.now();
      const duration = 800; // 800ms pour revenir au centre (plus lent, plus fluide)
      const startRotation = impulseDirection * impulseMagnitude;
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Fonction d'easing élastique pour un retour naturel
        const easeOutElastic = (t) => {
          const c4 = (2 * Math.PI) / 3;
          return t === 0
            ? 0
            : t === 1
            ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        };
        
        const eased = easeOutElastic(progress);
        const currentRotation = startRotation * (1 - eased);
        
        setImpulseRotation(currentRotation);
        
        if (progress < 1) {
          impulseAnimationRef.current = requestAnimationFrame(animate);
        } else {
          setImpulseRotation(0);
        impulseAnimationRef.current = null;
        }
      };
      
      impulseAnimationRef.current = requestAnimationFrame(animate);
    
    // Mettre à jour la référence après traitement
    prevActiveItemAngleRef.current = currentAngle;
    
    return () => {
      if (impulseAnimationRef.current) {
        cancelAnimationFrame(impulseAnimationRef.current);
        impulseAnimationRef.current = null;
      }
    };
  }, [activeItemAngle]); // ✅ Removed isSpinning from deps (tracked via ref)
  
  // Le triangle pointe normalement vers le bas (0 degrés)
  // L'impulsion s'ajoute à cette rotation de base
  const finalRotation = impulseRotation;
  
  return (
    <Box
      sx={{
        position: 'absolute',
        left: '50%',
        top: triangleTop,
        transform: `translateX(-50%) rotate(${finalRotation}deg)`,
        zIndex: 4, // Above gradients and wheel items
        pointerEvents: 'none',
        // Pas de transition CSS pendant l'animation d'impulsion (gérée par requestAnimationFrame)
        // Transition douce seulement quand il n'y a pas d'impulsion active
        transition: Math.abs(impulseRotation) < 0.1 ? 'transform 0.15s ease-out' : 'none',
      }}
    >
      {/* Triangle avec bordure primary et fond transparent */}
      <svg
        width="20"
        height="28"
        viewBox="0 0 20 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          transformOrigin: '50% 100%', // Rotation autour de la pointe en bas (centre horizontal, bas vertical) - logique car c'est la pointe qui indique l'élément
        }}
      >
        {/* Triangle extérieur (bordure) - stroke seulement - pointe vers le bas */}
        <path
          d="M10 28 L0 0 L20 0 Z"
          fill="none"
          stroke="#FF9500"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  );
}

