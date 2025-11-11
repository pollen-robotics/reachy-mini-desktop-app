import React, { useRef, useEffect } from 'react';

/**
 * Composant AudioVisualizer - Affiche un égaliseur audio épuré
 * Pour l'instant, simule des données FFT avec du bruit aléatoire
 */
export default function AudioVisualizer({ barCount = 6, color = 'rgba(150, 150, 150, 0.8)', showBackground = true, isLarge = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const barsRef = useRef([]);
  
  // Canvas toujours à la taille max pour la qualité
  const canvasWidth = 100;
  const canvasHeight = 48;
  
  // Tailles d'affichage selon le mode
  const displayWidth = isLarge ? 60 : 30;
  const displayHeight = isLarge ? 38 : 14;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Initialiser les barres avec des valeurs aléatoires
    if (barsRef.current.length === 0) {
      barsRef.current = Array(barCount).fill(0).map(() => Math.random() * 0.3);
    }

    // Fonction pour simuler une FFT avec du bruit
    const updateBars = () => {
      const bars = barsRef.current;
      
      for (let i = 0; i < bars.length; i++) {
        // Simulation d'une FFT : les basses fréquences (début) ont plus d'énergie
        const frequencyBias = Math.exp(-i / (barCount * 0.3));
        
        // Ajouter du bruit avec inertie pour un mouvement fluide
        const targetValue = Math.random() * frequencyBias * 0.8 + 0.1;
        bars[i] = bars[i] * 0.85 + targetValue * 0.15; // Lissage
      }
    };

    // Fonction de rendu
    const draw = () => {
      const bars = barsRef.current;
      
      // Effacer le canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const padding = 2;
      const barWidth = (canvasWidth - padding * 2) / barCount;
      const barGap = 2.5; // Gap entre les barres
      const barRadius = 1.5; // Rayon pour les coins arrondis

      // Dessiner les barres avec coins arrondis
      for (let i = 0; i < barCount; i++) {
        const barHeight = bars[i] * (canvasHeight - padding * 2) * 0.9;
        const x = padding + i * barWidth + barGap;
        const y = canvasHeight - padding - barHeight;
        const w = barWidth - barGap * 2; // Largeur des barres

        // Barres avec la couleur spécifiée et coins arrondis (haut ET bas)
        ctx.fillStyle = color;
        
        // Dessiner rectangle avec tous les coins arrondis
        ctx.beginPath();
        // Coin haut gauche
        ctx.moveTo(x + barRadius, y);
        // Ligne haut + coin haut droit
        ctx.lineTo(x + w - barRadius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + barRadius);
        // Ligne droite + coin bas droit
        ctx.lineTo(x + w, y + barHeight - barRadius);
        ctx.quadraticCurveTo(x + w, y + barHeight, x + w - barRadius, y + barHeight);
        // Ligne bas + coin bas gauche
        ctx.lineTo(x + barRadius, y + barHeight);
        ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - barRadius);
        // Ligne gauche
        ctx.lineTo(x, y + barRadius);
        ctx.quadraticCurveTo(x, y, x + barRadius, y);
        ctx.closePath();
        ctx.fill();
      }

      // Mettre à jour et continuer l'animation
      updateBars();
      animationRef.current = requestAnimationFrame(draw);
    };

    // Démarrer l'animation
    draw();

    // Nettoyer l'animation au démontage
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [barCount, canvasWidth, canvasHeight, color, showBackground]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        display: 'block',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    />
  );
}

