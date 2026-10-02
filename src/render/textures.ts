// Procedurally generated, tileable textures (no external assets needed).
import * as THREE from 'three';
import { Rng } from '../core/math';

// ---------- tileable gradient noise ----------
function hash2(i: number, j: number, seed: number) {
  let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

// Gradient tables per (period, seed): turns 4 hash + cos/sin evaluations per sample into lookups.
const gradTables = new Map<number, Float32Array>();
function gradTable(P: number, seed: number) {
  const key = P * 100003 + seed;
  let g = gradTables.get(key);
  if (!g) {
    g = new Float32Array(P * P * 2);
    for (let j = 0; j < P; j++)
      for (let i = 0; i < P; i++) {
        const a = hash2(i, j, seed) * Math.PI * 2;
        g[(j * P + i) * 2] = Math.cos(a);
        g[(j * P + i) * 2 + 1] = Math.sin(a);
      }
    gradTables.set(key, g);
  }
  return g;
}

/** Periodic 2D gradient noise in [-1,1] with integer period P. */
export function pnoise(x: number, y: number, P: number, seed = 0) {
  const g = gradTable(P, seed);
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const i0 = ((xi % P) + P) % P, j0 = ((yi % P) + P) % P;
  const i1 = i0 + 1 === P ? 0 : i0 + 1, j1 = j0 + 1 === P ? 0 : j0 + 1;
  const a = (j0 * P + i0) * 2, b = (j0 * P + i1) * 2, c = (j1 * P + i0) * 2, d = (j1 * P + i1) * 2;
  const n00 = g[a] * xf + g[a + 1] * yf;
  const n10 = g[b] * (xf - 1) + g[b + 1] * yf;
  const n01 = g[c] * xf + g[c + 1] * (yf - 1);
  const n11 = g[d] * (xf - 1) + g[d + 1] * (yf - 1);
  const u = fade(xf), v = fade(yf);
  return 1.41 * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v);
}

/** Tileable fbm over a unit square: u,v in [0,1). baseFreq integer. */
export function pfbm(u: number, v: number, baseFreq: number, octaves: number, seed = 0, gain = 0.5) {
  let amp = 1, f = baseFreq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * pnoise(u * f, v * f, f, seed + o * 31);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// Feature points per (cells, seed) for tileable Worley noise.
const worleyTables = new Map<number, Float32Array>();
function worleyTable(cells: number, seed: number) {
  const key = cells * 100003 + seed;
  let t = worleyTables.get(key);
  if (!t) {
    t = new Float32Array(cells * cells * 2);
    for (let j = 0; j < cells; j++)
      for (let i = 0; i < cells; i++) {
        t[(j * cells + i) * 2] = hash2(i, j, seed);
        t[(j * cells + i) * 2 + 1] = hash2(i, j, seed + 7);
      }
    worleyTables.set(key, t);
  }
  return t;
}

/** Tileable Worley (cellular) noise: [F1, F2] distances, u,v in [0,1). */
export function pworley(u: number, v: number, cells: number, seed = 0) {
  const t = worleyTable(cells, seed);
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 9, second = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const ci = xi + i, cj = yi + j;
      const wi = ((ci % cells) + cells) % cells, wj = ((cj % cells) + cells) % cells;
      const k = (wj * cells + wi) * 2;
      const dx = ci + t[k] - x, dy = cj + t[k + 1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { second = best; best = d; } else if (d < second) second = d;
    }
  return [best, second];
}

function makeDataTexture(data: Uint8Array, size: number, srgb: boolean, repeat = true) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Build a tangent-space normal map from a height array (wrapping). */
function heightToNormal(h: Float32Array, size: number, strength: number) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const o = (y * size + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  return out;
}

export interface TexPair { map: THREE.DataTexture; normal: THREE.DataTexture }

const cache = new Map<string, unknown>();
function cached<T>(key: string, fn: () => T): T {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

/** Fine grass/turf detail: luminance in R, blade-y height for normals. */
export function grassTextures(): TexPair {
  return cached('grass', () => {
    const S = 256;
    const h = new Float32Array(S * S);
    const lum = new Uint8Array(S * S * 4);
    const rng = new Rng(42);
    // base noise
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = pfbm(u, v, 8, 4, 11) * 0.5 + pfbm(u, v, 48, 2, 3) * 0.5;
        h[y * S + x] = n * 0.4;
      }
    // tiny blade tufts: short strokes
    for (let k = 0; k < 9000; k++) {
      const cx = rng.next() * S, cy = rng.next() * S;
      const ang = rng.range(-0.6, 0.6) + Math.PI / 2;
      const len = rng.range(2, 6);
      const hgt = rng.range(0.4, 1.0);
      for (let s = 0; s < len; s++) {
        const px = Math.floor(cx + Math.cos(ang) * s + S) % S;
        const py = Math.floor(cy + Math.sin(ang) * s + S) % S;
        h[py * S + px] = Math.max(h[py * S + px], hgt * (1 - s / (len + 1)) * 0.9 + rng.range(-0.1, 0.1));
      }
    }
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(255, Math.round(150 + h[i] * 90)));
      lum[i * 4] = lum[i * 4 + 1] = lum[i * 4 + 2] = v;
      lum[i * 4 + 3] = 255;
    }
    return { map: makeDataTexture(lum, S, false), normal: makeDataTexture(heightToNormal(h, S, 2.2), S, false) };
  });
}

/** Volcanic stone: dark basalt with pores and soft lumps. */
export function stoneTextures(): TexPair {
  return cached('stone', () => {
    const S = 256;
    const h = new Float32Array(S * S);
    const col = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const lumps = pfbm(u, v, 4, 4, 5);
        const [f1] = pworley(u, v, 22, 9);
        const pores = Math.max(0, 0.18 - f1) * 6; // small holes
        const fine = pfbm(u, v, 32, 2, 77) * 0.15;
        const hh = lumps * 0.5 + fine - pores * 0.7;
        h[y * S + x] = hh;
        const c = 0.55 + lumps * 0.25 + fine * 0.8 - pores * 0.5;
        const g = Math.max(0, Math.min(1, c));
        const o = (y * S + x) * 4;
        col[o] = Math.round(g * 255);
        col[o + 1] = Math.round(g * 255);
        col[o + 2] = Math.round(g * 255);
        col[o + 3] = 255;
      }
    return { map: makeDataTexture(col, S, false), normal: makeDataTexture(heightToNormal(h, S, 3.0), S, false) };
  });
}

/** Wood planks grain (luminance). */
export function woodTextures(): TexPair {
  return cached('wood', () => {
    const S = 256;
    const h = new Float32Array(S * S);
    const col = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const warp = pfbm(u, v, 4, 3, 21) * 0.08;
        const grain = Math.sin((v + warp + pfbm(u, v, 2, 2, 8) * 0.03) * Math.PI * 2 * 24);
        const streak = pfbm(u * 1, v, 2, 4, 13);
        const knotsD = pworley(u, v, 3, 99)[0];
        const knot = Math.max(0, 0.12 - knotsD) * 8;
        const g = 0.62 + grain * 0.08 + streak * 0.18 - knot * 0.35 + pfbm(u, v, 64, 1, 3) * 0.04;
        h[y * S + x] = grain * 0.15 + streak * 0.2 - knot * 0.3;
        const c = Math.max(0, Math.min(1, g));
        const o = (y * S + x) * 4;
        col[o] = col[o + 1] = col[o + 2] = Math.round(c * 255);
        col[o + 3] = 255;
      }
    return { map: makeDataTexture(col, S, false), normal: makeDataTexture(heightToNormal(h, S, 1.6), S, false) };
  });
}

/** Sand: fine grain + soft ripples. */
export function sandTextures(): TexPair {
  return cached('sand', () => {
    const S = 256;
    const h = new Float32Array(S * S);
    const col = new Uint8Array(S * S * 4);
    const rng = new Rng(7);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const rip = Math.sin((u * 6 + pfbm(u, v, 3, 3, 4) * 0.6) * Math.PI * 2) * 0.5;
        const grain = rng.next() - 0.5;
        h[y * S + x] = rip * 0.3 + grain * 0.25;
        const c = 0.8 + grain * 0.12 + pfbm(u, v, 8, 3, 2) * 0.08;
        const o = (y * S + x) * 4;
        col[o] = col[o + 1] = col[o + 2] = Math.round(Math.max(0, Math.min(1, c)) * 255);
        col[o + 3] = 255;
      }
    return { map: makeDataTexture(col, S, false), normal: makeDataTexture(heightToNormal(h, S, 1.2), S, false) };
  });
}

/** Water ripple normals (tileable). */
export function waterNormal(): THREE.DataTexture {
  return cached('waterN', () => {
    const S = 256;
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const [f1, f2] = pworley(u, v, 6, 3);
        h[y * S + x] = pfbm(u, v, 4, 4, 17) * 0.6 + (f2 - f1) * 0.5;
      }
    return makeDataTexture(heightToNormal(h, S, 6), S, false);
  });
}

/** Foam / caustic style cellular pattern in R, soft noise in G. */
export function foamTexture(): THREE.DataTexture {
  return cached('foam', () => {
    const S = 256;
    const d = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const [f1, f2] = pworley(u, v, 8, 5);
        const edge = Math.max(0, 1 - (f2 - f1) * 6); // cell borders (caustic lines)
        const n = pfbm(u, v, 4, 4, 9) * 0.5 + 0.5;
        const o = (y * S + x) * 4;
        d[o] = Math.round(Math.min(1, edge) * 255);
        d[o + 1] = Math.round(n * 255);
        d[o + 2] = Math.round((pfbm(u, v, 16, 3, 12) * 0.5 + 0.5) * 255);
        d[o + 3] = 255;
      }
    return makeDataTexture(d, S, false);
  });
}

/** Golf ball dimple normal map (equirectangular). */
export function ballDimpleNormal(): THREE.DataTexture {
  return cached('dimple', () => {
    const W = 512, H = 256;
    // Fibonacci sphere dimple centers
    const N = 340;
    const cs: number[][] = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = ga * i;
      cs.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    const dimpleR = 0.105; // in radians-ish (chord)
    const data = new Uint8Array(W * H * 4);
    for (let py = 0; py < H; py++) {
      const lat = (0.5 - (py + 0.5) / H) * Math.PI; // +pi/2 .. -pi/2
      for (let px = 0; px < W; px++) {
        const lon = ((px + 0.5) / W) * Math.PI * 2;
        // match three.js SphereGeometry: x = -cos(phi)sin(theta), y = cos(theta), z = sin(phi) sin(theta)
        const theta = Math.PI / 2 - lat;
        const phi = lon;
        const dx = -Math.cos(phi) * Math.sin(theta), dy = Math.cos(theta), dz = Math.sin(phi) * Math.sin(theta);
        // Fibonacci points have y = 1 - 2i/(N-1): only a narrow band of indices can be within reach
        let best = 9, bc = cs[0];
        const band = dimpleR * 1.6;
        const i0 = Math.max(0, Math.floor(((1 - dy - band) * (N - 1)) / 2));
        const i1 = Math.min(N - 1, Math.ceil(((1 - dy + band) * (N - 1)) / 2));
        for (let ci = i0; ci <= i1; ci++) {
          const c = cs[ci];
          const d = (c[0] - dx) ** 2 + (c[1] - dy) ** 2 + (c[2] - dz) ** 2;
          if (d < best) { best = d; bc = c; }
        }
        const dist = Math.sqrt(best);
        let tx = 0, ty = 0;
        if (dist < dimpleR) {
          // slope of a spherical dimple: push normal toward the dimple center direction
          const k = (dist / dimpleR);
          const s = Math.sin(k * Math.PI) * 0.55;
          // tangent basis at (dx,dy,dz): east = d(pos)/d(phi), north = d(pos)/d(lat)
          const ex = Math.sin(phi), ez = Math.cos(phi); // east (normalized, y=0)
          const nx0 = Math.cos(phi) * Math.cos(theta), ny0 = Math.sin(theta), nz0 = -Math.sin(phi) * Math.cos(theta);
          const vx = dx - bc[0], vy = dy - bc[1], vz = dz - bc[2];
          const vl = Math.hypot(vx, vy, vz) || 1;
          tx = ((vx * ex + vz * ez) / vl) * s;
          ty = ((vx * nx0 + vy * ny0 + vz * nz0) / vl) * s;
        }
        const nz = Math.sqrt(Math.max(0, 1 - tx * tx - ty * ty));
        const o = (py * W + px) * 4;
        data[o] = Math.round((tx * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((ty * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  });
}

/** Radial soft glow sprite. */
export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Soft puffy particle (smoke / mist / cloud puff). */
export function puffTexture(): THREE.Texture {
  return cached('puff', () => {
    const S = 128;
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const dx = u - 0.5, dy = v - 0.5;
        const r = Math.hypot(dx, dy) * 2;
        const n = pfbm(u, v, 4, 4, 3) * 0.5 + 0.5;
        const a = Math.max(0, 1 - r) ** 1.5 * (0.55 + n * 0.6);
        const o = (y * S + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 255;
        data[o + 3] = Math.round(Math.min(1, a) * 255);
      }
    const t = makeDataTexture(data, S, true, false);
    return t;
  });
}
