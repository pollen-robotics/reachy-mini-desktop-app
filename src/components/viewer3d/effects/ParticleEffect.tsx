import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { simplex3, fbm } from './particles/NoiseGenerator';

void fbm;

const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

type EffectType = 'sleep' | 'love' | 'surprised' | 'sad' | 'thinking' | 'happy';
type LayerType = 'glow' | 'core' | 'dot' | 'heart' | 'drop' | 'star' | 'line';

interface EffectLayer {
  type: LayerType;
  count: number;
  sizeRange: [number, number];
  opacity: number;
}

interface EffectMotion {
  baseVelocity: [number, number, number];
  noiseScale: number;
  noiseSpeed: number;
  spread: number;
  turbulence: number;
  damping: number;
  rotationSpeed: number;
  spiralFactor?: number;
  burstForce?: number;
  gravity?: number;
  orbitSpeed?: number;
  orbitRadius?: number;
}

interface EffectConfig {
  name: string;
  layers: EffectLayer[];
  colors: {
    primary: THREE.Color;
    secondary: THREE.Color;
    glow: THREE.Color;
  };
  motion: EffectMotion;
  spawnPattern: 'gentle' | 'burst' | 'orbit';
  blending: THREE.Blending;
}

const EFFECT_CONFIGS: Record<EffectType, EffectConfig> = {
  sleep: {
    name: 'sleep',
    layers: [
      { type: 'glow', count: 6, sizeRange: [0.08, 0.14], opacity: 0.35 },
      { type: 'core', count: 10, sizeRange: [0.025, 0.05], opacity: 0.85 },
      { type: 'dot', count: 8, sizeRange: [0.01, 0.02], opacity: 1.0 },
    ],
    colors: {
      primary: new THREE.Color(0xc4b5fd),
      secondary: new THREE.Color(0xa78bfa),
      glow: new THREE.Color(0xddd6fe),
    },
    motion: {
      baseVelocity: [0, 0.035, 0],
      noiseScale: 0.6,
      noiseSpeed: 0.25,
      spread: 0.04,
      turbulence: 0.012,
      damping: 0.994,
      rotationSpeed: 0.08,
    },
    spawnPattern: 'gentle',
    blending: THREE.AdditiveBlending,
  },

  love: {
    name: 'love',
    layers: [
      { type: 'glow', count: 5, sizeRange: [0.1, 0.16], opacity: 0.3 },
      { type: 'heart', count: 8, sizeRange: [0.035, 0.06], opacity: 0.9 },
      { type: 'dot', count: 12, sizeRange: [0.008, 0.018], opacity: 0.95 },
    ],
    colors: {
      primary: new THREE.Color(0xfb7185),
      secondary: new THREE.Color(0xfda4af),
      glow: new THREE.Color(0xfecdd3),
    },
    motion: {
      baseVelocity: [0, 0.04, 0],
      noiseScale: 1.0,
      noiseSpeed: 0.35,
      spread: 0.045,
      turbulence: 0.018,
      damping: 0.99,
      rotationSpeed: 0.12,
      spiralFactor: 0.25,
    },
    spawnPattern: 'burst',
    blending: THREE.AdditiveBlending,
  },

  surprised: {
    name: 'surprised',
    layers: [
      { type: 'glow', count: 10, sizeRange: [0.06, 0.12], opacity: 0.4 },
      { type: 'line', count: 8, sizeRange: [0.025, 0.045], opacity: 0.95 },
      { type: 'dot', count: 14, sizeRange: [0.01, 0.025], opacity: 1.0 },
    ],
    colors: {
      primary: new THREE.Color(0xfbbf24),
      secondary: new THREE.Color(0xfcd34d),
      glow: new THREE.Color(0xfef08a),
    },
    motion: {
      baseVelocity: [0, 0.06, 0],
      noiseScale: 1.8,
      noiseSpeed: 0.7,
      spread: 0.08,
      turbulence: 0.035,
      damping: 0.978,
      rotationSpeed: 0.0,
      burstForce: 0.1,
    },
    spawnPattern: 'burst',
    blending: THREE.AdditiveBlending,
  },

  sad: {
    name: 'sad',
    layers: [
      { type: 'glow', count: 4, sizeRange: [0.06, 0.1], opacity: 0.25 },
      { type: 'drop', count: 8, sizeRange: [0.02, 0.04], opacity: 0.8 },
      { type: 'dot', count: 6, sizeRange: [0.008, 0.015], opacity: 0.9 },
    ],
    colors: {
      primary: new THREE.Color(0x60a5fa),
      secondary: new THREE.Color(0x93c5fd),
      glow: new THREE.Color(0xbfdbfe),
    },
    motion: {
      baseVelocity: [0, 0.02, 0],
      noiseScale: 0.4,
      noiseSpeed: 0.15,
      spread: 0.035,
      turbulence: 0.006,
      damping: 0.996,
      rotationSpeed: 0.03,
      gravity: -0.015,
    },
    spawnPattern: 'gentle',
    blending: THREE.AdditiveBlending,
  },

  thinking: {
    name: 'thinking',
    layers: [
      { type: 'glow', count: 3, sizeRange: [0.05, 0.08], opacity: 0.3 },
      { type: 'core', count: 5, sizeRange: [0.02, 0.035], opacity: 0.95 },
    ],
    colors: {
      primary: new THREE.Color(0xa78bfa),
      secondary: new THREE.Color(0xc4b5fd),
      glow: new THREE.Color(0xddd6fe),
    },
    motion: {
      baseVelocity: [0, 0.008, 0],
      noiseScale: 0.25,
      noiseSpeed: 0.12,
      spread: 0.025,
      turbulence: 0.004,
      damping: 0.998,
      rotationSpeed: 0.0,
      orbitSpeed: 1.8,
      orbitRadius: 0.07,
    },
    spawnPattern: 'orbit',
    blending: THREE.AdditiveBlending,
  },

  happy: {
    name: 'happy',
    layers: [
      { type: 'glow', count: 8, sizeRange: [0.05, 0.1], opacity: 0.35 },
      { type: 'star', count: 10, sizeRange: [0.025, 0.045], opacity: 0.95 },
      { type: 'dot', count: 16, sizeRange: [0.006, 0.015], opacity: 1.0 },
    ],
    colors: {
      primary: new THREE.Color(0xfbbf24),
      secondary: new THREE.Color(0xfcd34d),
      glow: new THREE.Color(0xfef3c7),
    },
    motion: {
      baseVelocity: [0, 0.05, 0],
      noiseScale: 1.4,
      noiseSpeed: 0.55,
      spread: 0.07,
      turbulence: 0.028,
      damping: 0.982,
      rotationSpeed: 0.25,
      burstForce: 0.06,
    },
    spawnPattern: 'burst',
    blending: THREE.AdditiveBlending,
  },
};

function createCircleTexture(size = 128, softness = 0.3): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const center = size / 2;
  const radius = size / 2 - 2;

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1 - softness, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const center = size / 2;
  const radius = size / 2 - 2;

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createHeartTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const scale = size / 30;
  ctx.translate(size / 2, size / 2 + 2 * scale);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.bezierCurveTo(-8, -12, -14, -4, -14, 2);
  ctx.bezierCurveTo(-14, 8, 0, 14, 0, 14);
  ctx.bezierCurveTo(0, 14, 14, 8, 14, 2);
  ctx.bezierCurveTo(14, -4, 8, -12, 0, -4);
  ctx.closePath();

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');

  ctx.fillStyle = gradient;
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createDropTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 3;

  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radius * 1.5);
  ctx.bezierCurveTo(
    centerX + radius * 0.8,
    centerY - radius * 0.5,
    centerX + radius,
    centerY + radius * 0.3,
    centerX,
    centerY + radius
  );
  ctx.bezierCurveTo(
    centerX - radius,
    centerY + radius * 0.3,
    centerX - radius * 0.8,
    centerY - radius * 0.5,
    centerX,
    centerY - radius * 1.5
  );
  ctx.closePath();

  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');

  ctx.fillStyle = gradient;
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createStarTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const center = size / 2;
  const outerRadius = size / 2 - 4;
  const innerRadius = outerRadius * 0.4;
  const points = 4;

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, outerRadius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');

  ctx.fillStyle = gradient;
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createLineTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const gradient = ctx.createLinearGradient(size / 2, 0, size / 2, size);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(size / 2 - 4, 0, 8, size);

  return new THREE.CanvasTexture(canvas);
}

const textureCache = new Map<LayerType, THREE.CanvasTexture>();

function getTexture(type: LayerType): THREE.CanvasTexture {
  const cached = textureCache.get(type);
  if (cached) {
    return cached;
  }

  let texture: THREE.CanvasTexture;
  switch (type) {
    case 'glow':
      texture = createGlowTexture(128);
      break;
    case 'heart':
      texture = createHeartTexture(128);
      break;
    case 'drop':
      texture = createDropTexture(128);
      break;
    case 'star':
      texture = createStarTexture(128);
      break;
    case 'line':
      texture = createLineTexture(128);
      break;
    case 'core':
    case 'dot':
    default:
      texture = createCircleTexture(128, type === 'dot' ? 0.1 : 0.4);
  }

  textureCache.set(type, texture);
  return texture;
}

interface ParticleUserData {
  seed: number;
  rand: (offset?: number) => number;
  layerIndex: number;
  layerType: LayerType;
  baseSize: number;
  maxOpacity: number;
  velocity: THREE.Vector3;
  baseVelocity: THREE.Vector3;
  spawnDelay: number;
  noiseOffset: number;
  rotationSpeed: number;
  orbitPhase: number;
  age: number;
  lifeProgress: number;
  isActive: boolean;
  initialPosition: THREE.Vector3;
}

type ParticleSprite = THREE.Sprite & { userData: ParticleUserData };

export interface ParticleEffectProps {
  type?: EffectType;
  spawnPoint?: [number, number, number];
  particleCount?: number;
  enabled?: boolean;
  duration?: number;
}

export default function ParticleEffect({
  type = 'sleep',
  spawnPoint = [0, 0.18, 0.02],
  particleCount = 20,
  enabled = true,
  duration = 5.0,
}: ParticleEffectProps): React.ReactElement | null {
  void particleCount;
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<ParticleSprite[]>([]);
  const timeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const config = useMemo<EffectConfig>(() => {
    return EFFECT_CONFIGS[type] || EFFECT_CONFIGS.sleep;
  }, [type]);

  const particles = useMemo<ParticleSprite[]>(() => {
    if (!enabled) return [];

    const allParticles: ParticleSprite[] = [];
    const spawnPos = new THREE.Vector3(...spawnPoint);
    let globalIndex = 0;

    config.layers.forEach((layer, layerIndex) => {
      const texture = getTexture(layer.type);
      const colorKey: 'glow' | 'secondary' | 'primary' =
        layer.type === 'glow' ? 'glow' : layer.type === 'dot' ? 'secondary' : 'primary';
      const baseColor = config.colors[colorKey];

      for (let i = 0; i < layer.count; i++) {
        const seed = globalIndex * 137.5 + layerIndex * 1000;
        const rand = (offset = 0): number => {
          const x = Math.sin((seed + offset) * 12.9898) * 43758.5453;
          return x - Math.floor(x);
        };

        const size = layer.sizeRange[0] + rand(0.1) * (layer.sizeRange[1] - layer.sizeRange[0]);

        const material = new THREE.SpriteMaterial({
          map: texture,
          color: baseColor,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: config.blending,
        });

        const sprite = new THREE.Sprite(material) as ParticleSprite;
        sprite.scale.set(size, size, 1);

        const angle = rand(0.2) * Math.PI * 2;
        const radius = rand(0.3) * config.motion.spread * 0.3;
        sprite.position.copy(spawnPos);
        sprite.position.x += Math.cos(angle) * radius;
        sprite.position.z += Math.sin(angle) * radius;
        sprite.position.y += (rand(0.4) - 0.5) * config.motion.spread * 0.2;

        const vel = new THREE.Vector3(...config.motion.baseVelocity);
        const velVariation = 0.7 + rand(0.5) * 0.6;
        vel.multiplyScalar(velVariation);

        if (config.spawnPattern === 'burst' && config.motion.burstForce) {
          const burstAngle = rand(0.6) * Math.PI * 2;
          const burstMag = config.motion.burstForce * (0.5 + rand(0.7) * 0.5);
          vel.x += Math.cos(burstAngle) * burstMag;
          vel.z += Math.sin(burstAngle) * burstMag;
        }

        sprite.userData = {
          seed,
          rand,
          layerIndex,
          layerType: layer.type,
          baseSize: size,
          maxOpacity: layer.opacity,
          velocity: vel,
          baseVelocity: vel.clone(),

          spawnDelay:
            config.spawnPattern === 'gentle'
              ? (globalIndex / config.layers.reduce((a, l) => a + l.count, 0)) * duration * 0.4
              : rand(0.8) * duration * 0.15,

          noiseOffset: rand(0.9) * 1000,
          rotationSpeed:
            config.motion.rotationSpeed * (0.5 + rand(1.0)) * (rand(1.1) > 0.5 ? 1 : -1),
          orbitPhase: rand(1.2) * Math.PI * 2,

          age: 0,
          lifeProgress: 0,
          isActive: false,
          initialPosition: sprite.position.clone(),
        };

        allParticles.push(sprite);
        globalIndex++;
      }
    });

    particlesRef.current = allParticles;
    return allParticles;
  }, [enabled, config, spawnPoint, duration]);

  useEffect(() => {
    timeRef.current = 0;
    startTimeRef.current = performance.now() / 1000;
    particles.forEach(p => {
      p.userData.age = 0;
      p.userData.lifeProgress = 0;
      p.userData.isActive = false;
      (p.material as THREE.SpriteMaterial).opacity = 0;
    });
  }, [type, enabled, particles]);

  useFrame((_state, delta) => {
    if (!enabled || particles.length === 0) return;

    const dt = Math.min(delta, 0.1);
    timeRef.current += dt;
    const globalTime = timeRef.current;

    particles.forEach(particle => {
      const ud = particle.userData;
      const mat = particle.material as THREE.SpriteMaterial;

      if (globalTime < ud.spawnDelay) {
        mat.opacity = 0;
        return;
      }

      if (!ud.isActive) {
        ud.isActive = true;
        ud.age = 0;
      }

      ud.age += dt;
      ud.lifeProgress = Math.min(ud.age / duration, 1.0);

      if (ud.lifeProgress >= 1.0) {
        mat.opacity = 0;
        return;
      }

      let opacity = 0;
      const fadeInDuration = ud.layerType === 'glow' ? 0.3 : 0.2;
      const fadeOutStart = ud.layerType === 'glow' ? 0.6 : 0.7;

      if (ud.lifeProgress < fadeInDuration) {
        opacity = easeOutExpo(ud.lifeProgress / fadeInDuration);
      } else if (ud.lifeProgress < fadeOutStart) {
        opacity = 1.0;
      } else {
        const fadeProgress = (ud.lifeProgress - fadeOutStart) / (1 - fadeOutStart);
        opacity = 1.0 - easeInOutSine(fadeProgress);
      }

      const breathe = 1 + Math.sin(ud.age * 2 + ud.seed) * 0.05;
      mat.opacity = Math.max(0, Math.min(1, opacity * ud.maxOpacity * breathe));

      const noiseTime = ud.age * config.motion.noiseSpeed + ud.noiseOffset;
      const noiseX = simplex3(noiseTime, ud.seed * 0.1, 0) * config.motion.turbulence;
      const noiseZ = simplex3(0, noiseTime, ud.seed * 0.1) * config.motion.turbulence;

      ud.velocity.x += noiseX * dt;
      ud.velocity.z += noiseZ * dt;

      if (config.motion.gravity) {
        ud.velocity.y += config.motion.gravity * dt;
      }

      if (config.motion.spiralFactor) {
        const spiralAngle = ud.age * 2 + ud.orbitPhase;
        const spiralRadius = config.motion.spiralFactor * ud.lifeProgress;
        ud.velocity.x += Math.cos(spiralAngle) * spiralRadius * dt;
        ud.velocity.z += Math.sin(spiralAngle) * spiralRadius * dt;
      }

      if (config.motion.orbitSpeed && config.motion.orbitRadius) {
        const orbitAngle = ud.age * config.motion.orbitSpeed + ud.orbitPhase;
        const targetX = ud.initialPosition.x + Math.cos(orbitAngle) * config.motion.orbitRadius;
        const targetZ = ud.initialPosition.z + Math.sin(orbitAngle) * config.motion.orbitRadius;

        particle.position.x += (targetX - particle.position.x) * 0.1;
        particle.position.z += (targetZ - particle.position.z) * 0.1;
        particle.position.y += ud.velocity.y * dt;
      } else {
        particle.position.x += ud.velocity.x * dt;
        particle.position.y += ud.velocity.y * dt;
        particle.position.z += ud.velocity.z * dt;
      }

      ud.velocity.multiplyScalar(config.motion.damping);

      if (ud.rotationSpeed !== 0) {
        mat.rotation += ud.rotationSpeed * dt;
      }

      let scaleFactor = 1.0;

      if (ud.lifeProgress < 0.1) {
        scaleFactor = easeOutQuart(ud.lifeProgress / 0.1);
      } else if (ud.lifeProgress > 0.8) {
        scaleFactor = 1.0 - smoothstep((ud.lifeProgress - 0.8) / 0.2) * 0.3;
      }

      if (ud.layerType === 'glow') {
        scaleFactor *= 1 + Math.sin(ud.age * 1.5 + ud.seed) * 0.1;
      }

      const finalScale = ud.baseSize * scaleFactor;
      particle.scale.set(finalScale, finalScale, 1);
    });
  });

  useEffect(() => {
    return () => {
      particles.forEach(p => {
        if (p.material) {
          (p.material as THREE.SpriteMaterial).dispose();
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
