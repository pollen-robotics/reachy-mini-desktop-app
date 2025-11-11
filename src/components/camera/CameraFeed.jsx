import React, { useRef, useEffect } from 'react';
import AudioVisualizer from './AudioVisualizer';

/**
 * Composant CameraFeed - Affiche un flux caméra
 * Pour l'instant, affiche un placeholder
 */
export default function CameraFeed({ width = 240, height = 180, onSwap, isLarge = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Obtenir les dimensions réelles du canvas
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Générer du bruit animé (simule le flux vidéo)
    const imageData = ctx.createImageData(canvasWidth, canvasHeight);

    // Fonction pour générer du bruit aléatoire (simule le flux vidéo)
    const drawNoise = () => {
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Générer une valeur de gris aléatoire
        const gray = Math.random() * 255;
        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
        data[i + 3] = 255;  // A (opacité complète)
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Continuer l'animation
      animationRef.current = requestAnimationFrame(drawNoise);
    };

    // Démarrer l'animation
    drawNoise();

    // Nettoyer l'animation au démontage
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, isLarge]);

  // Dimensions du canvas en pixels (pour le dessin)
  const canvasWidth = typeof width === 'number' ? width : 640;
  const canvasHeight = typeof height === 'number' ? height : 480;

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: isLarge ? '16px' : '8px',
        overflow: 'hidden',
        border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.02)',
        background: '#000',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      
      {/* Audio Visualizer - Bottom Left */}
      <div style={{
        position: 'absolute',
        bottom: isLarge ? '12px' : '6px',
        left: isLarge ? '12px' : '6px',
        borderRadius: '4px',
        background: 'rgba(0, 0, 0, 0.15)',
        padding: '2px',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <AudioVisualizer 
          barCount={6} 
          color="rgba(255, 255, 255, 0.95)"
          showBackground={false}
          isLarge={isLarge}
        />
      </div>

      {/* Bouton swap (seulement en mode petit) */}
      {!isLarge && (
        <button
          onClick={onSwap}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '20px',
            height: '20px',
            border: 'none',
            borderRadius: '0',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.2s ease',
            padding: 0,
            color: 'white',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.8)',
            lineHeight: '1',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Swap video and 3D view"
        >
          ⇄
        </button>
      )}
    </div>
  );
}

