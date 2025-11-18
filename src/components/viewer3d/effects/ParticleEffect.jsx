import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 🎮 AAA PARTICLE SYSTEM
 * 
 * Professional features:
 * - Complex trajectories with Bézier curves
 * - Realistic physics (gravity, air resistance, turbulence)
 * - Individual variations per particle
 * - Progressive spawn with temporal offset
 * - Opacity with sophisticated easing curves
 * - Optimizations for constant 60 FPS
 */

// Pseudo-random number generator with seed (for reproducible variations)
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// "ease-out-cubic" easing curve for natural deceleration
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// "ease-in-out-quad" easing curve for acceleration then deceleration
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
  const spawnedCountRef = useRef(0); // Spawned particles counter

  // Effect configuration according to type
  const effectConfig = useMemo(() => {
    const configs = {
      sleep: {
        symbol: '💤',
        color: '#4B5563', // Natural gray not burnt
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
        color: '#F472B6', // Soft pink not burnt
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
        color: '#FB923C', // Soft orange not burnt
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
        color: '#60A5FA', // Soft blue not burnt
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

  // Create particles with individual variations
  const particles = useMemo(() => {
    if (!enabled) return [];
    
    const particles = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;
    
    // Draw symbol on canvas
    context.font = 'bold 200px Arial';
    context.fillStyle = effectConfig.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(effectConfig.symbol, 128, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create particles with individual variations
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 123.456 + Date.now() * 0.001; // Unique seed per particle
      
      const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.NormalBlending, // Normal blending for natural colors
      });
      
      const sprite = new THREE.Sprite(material);
      
      // Individual size variations
      const sizeVariation = 0.8 + seededRandom(seed) * 0.4; // 80% to 120%
      const finalScale = effectConfig.scale * sizeVariation;
      sprite.scale.set(finalScale, finalScale, 1);
      
      // Very concentrated initial position (smoke starts grouped)
      const angle = (i / particleCount) * Math.PI * 2;
      const radiusVariation = seededRandom(seed + 0.1) * effectConfig.spread * 0.3; // Reduced to 30%
      const randomOffset = new THREE.Vector3(
        Math.cos(angle) * radiusVariation,
        (seededRandom(seed + 0.2) - 0.5) * effectConfig.spread * 0.1, // Ultra minimal on Y
        Math.sin(angle) * radiusVariation
      );
      
      sprite.position.copy(new THREE.Vector3(...spawnPoint).add(randomOffset));
      
      // Velocity with variations for natural dispersion effect
      const velocityVariation = 0.85 + seededRandom(seed + 0.3) * 0.3; // 85% to 115%
      const baseVel = new THREE.Vector3(...effectConfig.baseVelocity);
      const particleVelocity = baseVel.multiplyScalar(velocityVariation);
      
      // Lateral component for natural radial dispersion
      const lateralAngle = (i / particleCount) * Math.PI * 2 + seededRandom(seed + 0.4) * 0.5;
      const lateralSpeed = seededRandom(seed + 0.5) * 0.001; // Soft dispersion
      particleVelocity.x += Math.cos(lateralAngle) * lateralSpeed;
      particleVelocity.z += Math.sin(lateralAngle) * lateralSpeed;
      
      // Very light oscillation parameters
      const oscillationFreq1 = 0.5 + seededRandom(seed + 0.6) * 0.3;
      const oscillationFreq2 = 0.7 + seededRandom(seed + 0.7) * 0.3;
      const oscillationPhase = seededRandom(seed + 0.8) * Math.PI * 2;
      const oscillationAmplitude = 0.08 + seededRandom(seed + 0.9) * 0.1; // Reduced amplitude
      
      // Unique rotation
      const rotationVariation = 0.5 + seededRandom(seed + 1.0) * 1.0;
      const rotationDirection = seededRandom(seed + 1.1) > 0.5 ? 1 : -1;
      
      // Custom data for animation
      sprite.userData = {
        seed: seed,
        spawnDelay: i * (duration / particleCount) * 0.6, // Progressive spawn (60% of time)
        velocity: particleVelocity,
        baseVelocity: particleVelocity.clone(), // Keep base velocity
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
        spreadRate: effectConfig.spreadRate || 0.008, // Expansion speed
        
        // State
        age: 0,
        lifeProgress: 0,
        isActive: false, // Becomes true after spawnDelay
      };
      
      particles.push(sprite);
    }
    
    particlesRef.current = particles;
    spawnedCountRef.current = 0;
    return particles;
  }, [enabled, particleCount, spawnPoint, duration, effectConfig]);

  // Reset timer when effect type changes
  useEffect(() => {
    timeRef.current = 0;
    spawnedCountRef.current = 0;
  }, [type, enabled]);

  // Particle animation (optimized 60 FPS)
  useFrame((state, delta) => {
    if (!enabled || particles.length === 0) return;
    
    const deltaSeconds = Math.min(delta, 0.1); // Cap delta to avoid jumps
    timeRef.current += deltaSeconds;
    
    particles.forEach((particle, index) => {
      const userData = particle.userData;
      
      // Attendre le spawn delay
      if (timeRef.current < userData.spawnDelay) {
        particle.material.opacity = 0;
        return;
      }
      
      // Activate particle if it's the first time
      if (!userData.isActive) {
        userData.isActive = true;
        userData.age = 0;
        spawnedCountRef.current++;
      }
      
      // Update age
      userData.age += deltaSeconds;
      userData.lifeProgress = Math.min(userData.age / duration, 1.0);
      
      // Stop particle if it's dead (no loop)
      if (userData.lifeProgress >= 1.0) {
        particle.material.opacity = 0;
        return;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // SMOOTH OPACITY (complete curve without "pop")
      // ═══════════════════════════════════════════════════════════════
      
      let opacity = 0.0;
      
      // Smooth bell curve: 0 → 1 → 0
      if (userData.lifeProgress < 0.25) {
        // Smooth fade in (first quarter)
        opacity = easeInOutQuad(userData.lifeProgress / 0.25);
      } else if (userData.lifeProgress < 0.75) {
        // Full opacity (middle)
        opacity = 1.0;
      } else {
        // Smooth fade out (last quarter)
        const fadeProgress = (userData.lifeProgress - 0.75) / 0.25;
        opacity = 1.0 - easeInOutQuad(fadeProgress);
      }
      
      // Subtle pulsation for living effect (optional, very light)
      const breathingFreq = 1.5 + seededRandom(userData.seed) * 0.3;
      const breathingEffect = Math.sin(userData.age * breathingFreq + userData.oscillationPhase) * 0.05;
      
      // Final smooth opacity
      opacity = opacity * (0.92 + breathingEffect);
      particle.material.opacity = Math.max(0.0, Math.min(1.0, opacity));
      
      // ═══════════════════════════════════════════════════════════════
      // SMOKE-TYPE PHYSICS
      // ═══════════════════════════════════════════════════════════════
      
      // No gravity - smoke rises naturally
      
      // Progressive radial dispersion (smoke widens as it rises)
      const spreadFactor = userData.lifeProgress * userData.spreadRate;
      const spreadAngle = userData.oscillationPhase;
      userData.velocity.x += Math.cos(spreadAngle) * spreadFactor * deltaSeconds;
      userData.velocity.z += Math.sin(spreadAngle) * spreadFactor * deltaSeconds;
      
      // Very soft turbulence for natural movement
      const turbulenceX = Math.sin(userData.age * 0.8 + userData.turbulenceOffset) * effectConfig.turbulence * 0.5;
      const turbulenceZ = Math.sin(userData.age * 0.9 + userData.turbulenceOffset + 200) * effectConfig.turbulence * 0.5;
      
      userData.velocity.x += turbulenceX * deltaSeconds;
      userData.velocity.z += turbulenceZ * deltaSeconds;
      
      // Air resistance (damping) - slows down as it rises like smoke
      userData.velocity.multiplyScalar(userData.damping);
      
      // ═══════════════════════════════════════════════════════════════
      // SMOKE MOVEMENT (simple rise with radial dispersion)
      // ═══════════════════════════════════════════════════════════════
      
      // Main displacement based on velocity
      particle.position.x += userData.velocity.x * deltaSeconds;
      particle.position.y += userData.velocity.y * deltaSeconds;
      particle.position.z += userData.velocity.z * deltaSeconds;
      
      // ═══════════════════════════════════════════════════════════════
      // NATURAL ROTATION
      // ═══════════════════════════════════════════════════════════════
      
      if (userData.rotationSpeed !== 0) {
        // Smooth and constant rotation
        const velocityInfluence = Math.abs(userData.velocity.x + userData.velocity.z) * 0.5; // Reduced from 2.0 to 0.5
        const finalRotationSpeed = userData.rotationSpeed * (1.0 + velocityInfluence);
        particle.material.rotation += finalRotationSpeed * deltaSeconds;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // DYNAMIC SCALING (smoke effect)
      // ═══════════════════════════════════════════════════════════════
      
      // Simple scaling: pop on spawn then constant
      let scaleFactor = 1.0;
      if (userData.lifeProgress < 0.04) {
        // Fast pop on spawn for flashy effect
        scaleFactor = easeOutCubic(userData.lifeProgress / 0.04) * 1.1;
      } else {
        scaleFactor = 1.1; // Slightly enlarged
      }
      
      const baseScale = effectConfig.scale * (0.9 + seededRandom(userData.seed) * 0.2);
      const finalScale = baseScale * scaleFactor;
      particle.scale.set(finalScale, finalScale, 1);
    });
  });

  // ✅ Cleanup particles on unmount or when particles change
  useEffect(() => {
    return () => {
      // Dispose materials and textures to prevent memory leaks
      particles.forEach(p => {
        if (p.material) {
          if (p.material.map) {
            p.material.map.dispose();
          }
        p.material.dispose();
        }
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
