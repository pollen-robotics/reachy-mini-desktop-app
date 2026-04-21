/**
 * 🌊 Simplex Noise Generator
 *
 * Fast, high-quality noise for organic particle movement.
 * Based on Stefan Gustavson's implementation.
 */

const perm = new Uint8Array(512);
const gradP: number[][] = new Array(512);

const grad3: number[][] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

function seed(s: number): void {
  if (s > 0 && s < 1) s *= 65536;
  s = Math.floor(s);
  if (s < 256) s |= s << 8;

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v: number;
    if (i & 1) {
      v = p[i] ^ (s & 255);
    } else {
      v = p[i] ^ ((s >> 8) & 255);
    }
    v = ((v * 1664525 + 1013904223) >>> 0) & 255;
    p[i] = v;
  }

  for (let i = 0; i < 256; i++) {
    p[i] = (i + s) & 255;
  }

  for (let i = 255; i > 0; i--) {
    const r = (s = (s * 16807) % 2147483647) % (i + 1);
    [p[i], p[r]] = [p[r], p[i]];
  }

  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    gradP[i] = grad3[perm[i] % 12];
  }
}

seed(Math.random() * 65536);

const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

/**
 * 3D Simplex Noise. Returns value between -1 and 1.
 */
function simplex3(x: number, y: number, z: number): number {
  let n0: number, n1: number, n2: number, n3: number;

  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;

  const x0 = x - X0;
  const y0 = y - Y0;
  const z0 = z - Z0;

  let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3;
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3;
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 < 0) n0 = 0;
  else {
    const gi0 = gradP[ii + perm[jj + perm[kk]]];
    t0 *= t0;
    n0 = t0 * t0 * (gi0[0] * x0 + gi0[1] * y0 + gi0[2] * z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 < 0) n1 = 0;
  else {
    const gi1 = gradP[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    t1 *= t1;
    n1 = t1 * t1 * (gi1[0] * x1 + gi1[1] * y1 + gi1[2] * z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 < 0) n2 = 0;
  else {
    const gi2 = gradP[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    t2 *= t2;
    n2 = t2 * t2 * (gi2[0] * x2 + gi2[1] * y2 + gi2[2] * z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 < 0) n3 = 0;
  else {
    const gi3 = gradP[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
    t3 *= t3;
    n3 = t3 * t3 * (gi3[0] * x3 + gi3[1] * y3 + gi3[2] * z3);
  }

  return 32.0 * (n0 + n1 + n2 + n3);
}

/**
 * Fractal Brownian Motion - layered noise for more detail.
 */
function fbm(
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
  persistence: number = 0.5
): number {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += simplex3(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

export interface CurlVector {
  x: number;
  y: number;
  z: number;
}

/**
 * Curl noise for fluid-like motion.
 */
function curl(x: number, y: number, z: number, epsilon: number = 0.0001): CurlVector {
  const dx = (simplex3(x, y + epsilon, z) - simplex3(x, y - epsilon, z)) / (2 * epsilon);
  const dy = (simplex3(x, y, z + epsilon) - simplex3(x, y, z - epsilon)) / (2 * epsilon);
  const dz = (simplex3(x + epsilon, y, z) - simplex3(x - epsilon, y, z)) / (2 * epsilon);

  return {
    x: dy - (simplex3(x, y, z + epsilon) - simplex3(x, y, z - epsilon)) / (2 * epsilon),
    y: dz - dx,
    z: (simplex3(x + epsilon, y, z) - simplex3(x - epsilon, y, z)) / (2 * epsilon) - dy,
  };
}

export { simplex3, fbm, curl, seed };
