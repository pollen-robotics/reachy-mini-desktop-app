import React, { useState, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';

// Charger toutes les images du dossier reachies/small-top-sided dynamiquement avec Vite
const imageModules = import.meta.glob('../assets/reachies/small-top-sided/*.png', { eager: true });

/**
 * Composant qui charge toutes les images PNG du dossier reachies/small-top-sided,
 * les met en mémoire et les affiche en séquence avec une transition fade superposée.
 * 
 * Les images sont chargées dynamiquement et affichées les unes après les autres
 * dans un cadre fixe, avec une transition fade in/out entre chaque image.
 */
export default function ReachiesCarousel({ 
  width = 100, 
  height = 100, 
  interval = 1000, // Durée d'affichage de chaque image en ms (plus rapide)
  transitionDuration = 150, // Durée de la transition fade en ms (très nette) - DEPRECATED, utilise fadeInDuration et fadeOutDuration
  fadeInDuration = 350, // Durée du fade-in pour l'image entrante (plus lent, style Apple/Google)
  fadeOutDuration = 120, // Durée du fade-out pour l'image sortante (plus rapide, style Apple/Google)
  zoom = 1.8, // Facteur de zoom pour agrandir le sticker
  verticalAlign = 'center', // Alignement vertical: 'top', 'center', 'bottom', ou pourcentage (ex: '60%')
  darkMode = false,
  sx = {} 
}) {
  // Extraire les URLs des images chargées et les trier pour un ordre cohérent
  const imagePaths = useMemo(() => {
    const paths = Object.values(imageModules)
      .map(module => {
        // Avec eager: true, le module est déjà chargé, on accède à .default
        return typeof module === 'object' && module !== null && 'default' in module 
          ? module.default 
          : module;
      })
      .filter(Boolean) // Filtrer les valeurs nulles/undefined
      .sort(); // Trier pour un ordre cohérent
    
    return paths;
  }, []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [fadeOutComplete, setFadeOutComplete] = useState(false);

  // Précharger toutes les images en mémoire pour des transitions fluides
  useEffect(() => {
    imagePaths.forEach(imagePath => {
      const img = new Image();
      img.src = imagePath;
    });
  }, [imagePaths]);

  // Fonction pour obtenir un index aléatoire différent du courant
  const getRandomIndex = (currentIdx, total) => {
    if (total <= 1) return 0;
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * total);
    } while (newIndex === currentIdx && total > 1);
    return newIndex;
  };

  // Changer d'image automatiquement avec overlap et sélection aléatoire
  useEffect(() => {
    if (imagePaths.length > 0) {
      const timer = setInterval(() => {
        // Sauvegarder l'index précédent AVANT de changer pour garantir le crossfade
        const prevIdx = currentIndex;
        setPreviousIndex(prevIdx);
        setIsTransitioning(true);
        setFadeOutComplete(false); // Réinitialiser au début de la transition
        
        // Sélectionner une image aléatoire différente de la courante
        const newIndex = getRandomIndex(currentIndex, imagePaths.length);
        setCurrentIndex(newIndex);
        
        // L'image sortante commence à disparaître après un délai pour créer plus d'overlap
        // Les deux images restent visibles ensemble plus longtemps
        const overlapDelay = Math.min(fadeInDuration * 0.4, fadeOutDuration * 2); // 40% du fade-in ou 2x fade-out
        setTimeout(() => {
          setFadeOutComplete(true);
        }, overlapDelay);
        
        // Réinitialiser l'état de transition après la durée la plus longue (fade-in)
        setTimeout(() => {
          setIsTransitioning(false);
          setPreviousIndex(null);
          setFadeOutComplete(false);
        }, Math.max(fadeInDuration, fadeOutDuration));
      }, interval);

      return () => clearInterval(timer);
    }
  }, [imagePaths.length, interval, currentIndex, fadeInDuration, fadeOutDuration]);

  if (imagePaths.length === 0) {
    return (
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...sx,
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden', // Empêcher le débordement du zoom
        ...sx,
      }}
    >
      {imagePaths.map((imageSrc, index) => {
        const isActive = index === currentIndex;
        const isPrevious = index === previousIndex && isTransitioning;
        
        // Calculer la position verticale selon l'alignement
        let topValue, transformY;
        if (verticalAlign === 'top') {
          topValue = 0;
          transformY = '0';
        } else if (verticalAlign === 'bottom') {
          topValue = '100%';
          transformY = '-100%';
        } else if (typeof verticalAlign === 'string' && verticalAlign.includes('%')) {
          // Pourcentage personnalisé
          topValue = verticalAlign;
          transformY = '-50%';
        } else {
          // Par défaut: center
          topValue = '50%';
          transformY = '-50%';
        }
        
        // Crossfade style Apple/Google : sortant disparaît plus vite que l'entrant n'apparaît
        const baseOpacity = darkMode ? 0.8 : 0.9;
        let opacity = 0;
        let transitionStyle = 'none';
        
        // Logique de crossfade : les deux images doivent être visibles simultanément
        if (isActive) {
          // Image entrante : fade-in lent et progressif (style premium)
          opacity = baseOpacity;
          transitionStyle = `opacity ${fadeInDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`; // Ease-out fluide
        } else if (isPrevious) {
          // Image sortante : fade-out rapide (disparaît vite pour laisser place)
          // Commence visible, puis disparaît après fadeOutDuration
          opacity = fadeOutComplete ? 0 : baseOpacity;
          transitionStyle = `opacity ${fadeOutDuration}ms cubic-bezier(0.4, 0, 1, 1)`; // Ease-out plus agressif
        }
        // Sinon opacity reste à 0 (invisible)
        
        return (
          <Box
            key={`${imageSrc}-${index}`} // Key unique pour forcer le re-render
            component="img"
            src={imageSrc}
            alt={`Reachy ${index + 1}`}
            sx={{
              position: 'absolute',
              width: width * zoom,
              height: height * zoom,
              objectFit: 'cover',
              objectPosition: 'center top', // Aligner le haut de l'image vers le haut
              opacity,
              transform: `translate(-50%, ${transformY})`, // Pas de scale
              transition: transitionStyle,
              pointerEvents: 'none',
              // Positionner l'image zoomée avec alignement vertical personnalisé
              left: '50%',
              top: topValue,
              zIndex: isActive ? 2 : (isPrevious ? 1 : 0), // Image active au-dessus
              willChange: 'opacity', // Optimisation GPU
              backfaceVisibility: 'hidden', // Éviter les artefacts de rendu
              WebkitBackfaceVisibility: 'hidden',
            }}
          />
        );
      })}
    </Box>
  );
}

