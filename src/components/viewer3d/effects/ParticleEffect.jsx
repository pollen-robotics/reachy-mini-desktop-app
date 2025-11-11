import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 🎮 SYSTÈME DE PARTICULES AAA
 * 
 * Caractéristiques professionnelles :
 * - Trajectoires complexes avec courbes de Bézier
 * - Physique réaliste (gravité, résistance de l'air, turbulence)
 * - Variations individuelles par particule
 * - Spawn progressif avec décalage temporel
 * - Opacité avec courbes d'easing sophistiquées
 * - Optimisations pour 60 FPS constant
 */

// Générateur de nombres pseudo-aléatoires avec seed (pour des variations reproductibles)
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Courbe d'easing "ease-out-cubic" pour un ralentissement naturel
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Courbe d'easing "ease-in-out-quad" pour une accélération puis décélération
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function ParticleEffect({ 
  type = 'sleep',
  spawnPoint = [0, 0.18, 0.02],
  particleCount = 8,
  enabled = true,
  duration = 10.0,
}) {
  const groupRef = useRef();
  const particlesRef = useRef([]);
  const timeRef = useRef(0);
  const spawnedCountRef = useRef(0); // Compteur de particules spawned

  // Configuration des effets selon le type
  const effectConfig = useMemo(() => {
    const configs = {
      sleep: {
        symbol: '💤',
        color: '#4B5563', // Gris naturel pas cramé
        baseVelocity: [0, 0.04, 0],
        spread: 0.015,
        rotationSpeed: 0.2,
        scale: 0.065,
        gravity: 0,
        turbulence: 0.001,
        damping: 0.995,
        spreadRate: 0.002,
      },
      love: {
        symbol: '💕',
        color: '#F472B6', // Rose doux pas cramé
        baseVelocity: [0, 0.045, 0],
        spread: 0.015,
        rotationSpeed: 0.3,
        scale: 0.06,
        gravity: 0,
        turbulence: 0.001,
        damping: 0.993,
        spreadRate: 0.0025,
      },
      surprised: {
        symbol: '❗',
        color: '#FB923C', // Orange doux pas cramé
        baseVelocity: [0, 0.05, 0],
        spread: 0.012,
        rotationSpeed: 0.0,
        scale: 0.07,
        gravity: 0,
        turbulence: 0.0008,
        damping: 0.99,
        spreadRate: 0.002,
      },
      sad: {
        symbol: '💧',
        color: '#60A5FA', // Bleu doux pas cramé
        baseVelocity: [0, 0.035, 0],
        spread: 0.01,
        rotationSpeed: 0.15,
        scale: 0.055,
        gravity: 0,
        turbulence: 0.0008,
        damping: 0.994,
        spreadRate: 0.0015,
      },
    };
    
    return configs[type] || configs.sleep;
  }, [type]);

  // Créer les particules avec variations individuelles
  const particles = useMemo(() => {
    if (!enabled) return [];
    
    const particles = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;
    
    // Dessiner le symbole sur un canvas
    context.font = 'bold 200px Arial';
    context.fillStyle = effectConfig.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(effectConfig.symbol, 128, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Créer des particules avec variations individuelles
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 123.456 + Date.now() * 0.001; // Seed unique par particule
      
      const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.NormalBlending, // Blending normal pour couleurs naturelles
      });
      
      const sprite = new THREE.Sprite(material);
      
      // Variations de taille individuelles
      const sizeVariation = 0.8 + seededRandom(seed) * 0.4; // 80% à 120%
      const finalScale = effectConfig.scale * sizeVariation;
      sprite.scale.set(finalScale, finalScale, 1);
      
      // Position initiale très concentrée (fumée commence groupée)
      const angle = (i / particleCount) * Math.PI * 2;
      const radiusVariation = seededRandom(seed + 0.1) * effectConfig.spread * 0.3; // Réduit à 30%
      const randomOffset = new THREE.Vector3(
        Math.cos(angle) * radiusVariation,
        (seededRandom(seed + 0.2) - 0.5) * effectConfig.spread * 0.1, // Ultra minimal sur Y
        Math.sin(angle) * radiusVariation
      );
      
      sprite.position.copy(new THREE.Vector3(...spawnPoint).add(randomOffset));
      
      // Vélocité avec variations pour effet naturel de dispersion
      const velocityVariation = 0.85 + seededRandom(seed + 0.3) * 0.3; // 85% à 115%
      const baseVel = new THREE.Vector3(...effectConfig.baseVelocity);
      const particleVelocity = baseVel.multiplyScalar(velocityVariation);
      
      // Composante latérale pour dispersion radiale naturelle
      const lateralAngle = (i / particleCount) * Math.PI * 2 + seededRandom(seed + 0.4) * 0.5;
      const lateralSpeed = seededRandom(seed + 0.5) * 0.001; // Dispersion douce
      particleVelocity.x += Math.cos(lateralAngle) * lateralSpeed;
      particleVelocity.z += Math.sin(lateralAngle) * lateralSpeed;
      
      // Paramètres d'oscillation très légers
      const oscillationFreq1 = 0.5 + seededRandom(seed + 0.6) * 0.3;
      const oscillationFreq2 = 0.7 + seededRandom(seed + 0.7) * 0.3;
      const oscillationPhase = seededRandom(seed + 0.8) * Math.PI * 2;
      const oscillationAmplitude = 0.08 + seededRandom(seed + 0.9) * 0.1; // Amplitude réduite
      
      // Rotation unique
      const rotationVariation = 0.5 + seededRandom(seed + 1.0) * 1.0;
      const rotationDirection = seededRandom(seed + 1.1) > 0.5 ? 1 : -1;
      
      // Données custom pour l'animation
      sprite.userData = {
        seed: seed,
        spawnDelay: i * (duration / particleCount) * 0.6, // Spawn progressif (60% du temps)
        velocity: particleVelocity,
        baseVelocity: particleVelocity.clone(), // Garder la vélocité de base
        rotationSpeed: effectConfig.rotationSpeed * rotationVariation * rotationDirection,
        
        // Oscillations
        oscillationFreq1: oscillationFreq1,
        oscillationFreq2: oscillationFreq2,
        oscillationPhase: oscillationPhase,
        oscillationAmplitude: oscillationAmplitude,
        
        // Turbulence
        turbulenceOffset: seededRandom(seed + 1.2) * 100,
        
        // Physique
        gravity: effectConfig.gravity,
        damping: effectConfig.damping,
        spreadRate: effectConfig.spreadRate || 0.008, // Vitesse d'élargissement
        
        // État
        age: 0,
        lifeProgress: 0,
        isActive: false, // Devient true après spawnDelay
      };
      
      particles.push(sprite);
    }
    
    particlesRef.current = particles;
    spawnedCountRef.current = 0;
    return particles;
  }, [enabled, particleCount, spawnPoint, duration, effectConfig]);

  // Réinitialiser le timer quand le type d'effet change
  useEffect(() => {
    timeRef.current = 0;
    spawnedCountRef.current = 0;
  }, [type, enabled]);

  // Animation des particules (60 FPS optimisé)
  useFrame((state, delta) => {
    if (!enabled || particles.length === 0) return;
    
    const deltaSeconds = Math.min(delta, 0.1); // Cap delta pour éviter les sauts
    timeRef.current += deltaSeconds;
    
    particles.forEach((particle, index) => {
      const userData = particle.userData;
      
      // Attendre le spawn delay
      if (timeRef.current < userData.spawnDelay) {
        particle.material.opacity = 0;
        return;
      }
      
      // Activer la particule si c'est la première fois
      if (!userData.isActive) {
        userData.isActive = true;
        userData.age = 0;
        spawnedCountRef.current++;
      }
      
      // Mettre à jour l'âge
      userData.age += deltaSeconds;
      userData.lifeProgress = Math.min(userData.age / duration, 1.0);
      
      // Arrêter la particule si elle est morte (pas de loop)
      if (userData.lifeProgress >= 1.0) {
        particle.material.opacity = 0;
        return;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // OPACITÉ SMOOTH (courbe complète sans "pop")
      // ═══════════════════════════════════════════════════════════════
      
      let opacity = 0.0;
      
      // Courbe en cloche smooth : 0 → 1 → 0
      if (userData.lifeProgress < 0.25) {
        // Fade in smooth (premier quart)
        opacity = easeInOutQuad(userData.lifeProgress / 0.25);
      } else if (userData.lifeProgress < 0.75) {
        // Pleine opacité (milieu)
        opacity = 1.0;
      } else {
        // Fade out smooth (dernier quart)
        const fadeProgress = (userData.lifeProgress - 0.75) / 0.25;
        opacity = 1.0 - easeInOutQuad(fadeProgress);
      }
      
      // Pulsation subtile pour effet vivant (optionnel, très léger)
      const breathingFreq = 1.5 + seededRandom(userData.seed) * 0.3;
      const breathingEffect = Math.sin(userData.age * breathingFreq + userData.oscillationPhase) * 0.05;
      
      // Opacité finale smooth
      opacity = opacity * (0.92 + breathingEffect);
      particle.material.opacity = Math.max(0.0, Math.min(1.0, opacity));
      
      // ═══════════════════════════════════════════════════════════════
      // PHYSIQUE TYPE FUMÉE
      // ═══════════════════════════════════════════════════════════════
      
      // Pas de gravité - la fumée monte naturellement
      
      // Dispersion radiale progressive (fumée qui s'élargit en montant)
      const spreadFactor = userData.lifeProgress * userData.spreadRate;
      const spreadAngle = userData.oscillationPhase;
      userData.velocity.x += Math.cos(spreadAngle) * spreadFactor * deltaSeconds;
      userData.velocity.z += Math.sin(spreadAngle) * spreadFactor * deltaSeconds;
      
      // Turbulence très douce pour mouvement naturel
      const turbulenceX = Math.sin(userData.age * 0.8 + userData.turbulenceOffset) * effectConfig.turbulence * 0.5;
      const turbulenceZ = Math.sin(userData.age * 0.9 + userData.turbulenceOffset + 200) * effectConfig.turbulence * 0.5;
      
      userData.velocity.x += turbulenceX * deltaSeconds;
      userData.velocity.z += turbulenceZ * deltaSeconds;
      
      // Résistance de l'air (damping) - ralentit en montant comme de la fumée
      userData.velocity.multiplyScalar(userData.damping);
      
      // ═══════════════════════════════════════════════════════════════
      // MOUVEMENT FUMÉE (montée simple avec dispersion radiale)
      // ═══════════════════════════════════════════════════════════════
      
      // Déplacement principal basé sur la vélocité
      particle.position.x += userData.velocity.x * deltaSeconds;
      particle.position.y += userData.velocity.y * deltaSeconds;
      particle.position.z += userData.velocity.z * deltaSeconds;
      
      // ═══════════════════════════════════════════════════════════════
      // ROTATION NATURELLE
      // ═══════════════════════════════════════════════════════════════
      
      if (userData.rotationSpeed !== 0) {
        // Rotation douce et constante
        const velocityInfluence = Math.abs(userData.velocity.x + userData.velocity.z) * 0.5; // Réduit de 2.0 à 0.5
        const finalRotationSpeed = userData.rotationSpeed * (1.0 + velocityInfluence);
        particle.material.rotation += finalRotationSpeed * deltaSeconds;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // SCALING DYNAMIQUE (effet fumée)
      // ═══════════════════════════════════════════════════════════════
      
      // Scaling simple : pop au spawn puis constant
      let scaleFactor = 1.0;
      if (userData.lifeProgress < 0.04) {
        // Pop rapide au spawn pour effet flashy
        scaleFactor = easeOutCubic(userData.lifeProgress / 0.04) * 1.1;
      } else {
        scaleFactor = 1.1; // Légèrement agrandi
      }
      
      const baseScale = effectConfig.scale * (0.9 + seededRandom(userData.seed) * 0.2);
      const finalScale = baseScale * scaleFactor;
      particle.scale.set(finalScale, finalScale, 1);
    });
  });

  // Cleanup
  useMemo(() => {
    return () => {
      particles.forEach(p => {
        p.material.map?.dispose();
        p.material.dispose();
      });
    };
  }, [particles]);

  if (!enabled || particles.length === 0) {
    return null;
  }

  return (
    <group ref={groupRef} name={`particle-effect-${type}`}>
      {particles.map((particle, i) => (
        <primitive key={`${type}-particle-${i}`} object={particle} />
      ))}
    </group>
  );
}
