// Island terrain around a hole: beaches, jungle hills, seabed. Also bakes a height texture for the ocean shader.
import * as THREE from 'three';
import type { HoleBuild } from '../course/builder';
import { noise, smoothstep } from '../core/math';
import type { EnvPreset } from './environment';
import { sandTextures, grassTextures } from '../render/textures';

export interface IslandBuild {
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  landSDF(x: number, z: number): number;
  depthTex: THREE.DataTexture;
  depthBounds: THREE.Vector4; // minX, minZ, size, unused
  /** Mark a circular area as solid in the ocean depth texture (rocks standing in the water). */
  stamp(x: number, z: number, r: number, h: number): void;
  center: THREE.Vector2;
  half: number;
  dispose(): void;
}

export const SAND = new THREE.Color(0xf3dba2);
const WET_SAND = new THREE.Color(0xcfb47a);
const SEABED = new THREE.Color(0xd9c690);
const JUNGLE = new THREE.Color(0x4f9a3a);
const JUNGLE_DARK = new THREE.Color(0x2f6e2c);
const ROCK = new THREE.Color(0x5f5a58);
const VOLC_SAND = new THREE.Color(0x6e625c);
const VOLC_WET = new THREE.Color(0x4a403c);

export function buildIsland(hole: HoleBuild, _preset: EnvPreset, opts: { volcanic?: boolean } = {}): IslandBuild {
  const def = hole.def.island ?? {};
  const fp = hole.footprint;
  const margin = def.margin ?? 4;
  const landH = def.height ?? 0.45;
  const hills = def.hills ?? 0.9;
  const mounds = def.mounds ?? [];
  const extraLand = def.land ?? [];
  const water = def.water ?? [];
  const pieces = hole.pieces;
  const carves = def.carve ?? [];

  const cx = (fp.b[0] + fp.b[2]) / 2, cz = (fp.b[1] + fp.b[3]) / 2;
  const half = Math.max(fp.b[2] - fp.b[0], fp.b[3] - fp.b[1]) / 2 + 60;
  const N = Math.min(150, Math.ceil((half * 2) / 1.2));
  const cell = (half * 2) / N;

  const landExact = (x: number, z: number) => {
    let d = fp.f(x, z) - margin;
    for (const s of extraLand) d = Math.min(d, s.f(x, z));
    for (const w of water) d = Math.max(d, -w.f(x, z));
    d += noise.fbm2(x * 0.045 + 3.1, z * 0.045 - 1.7, 3) * 3.2;
    return d;
  };

  const gridLookup = (G: Float32Array, x: number, z: number, outside: number) => {
    const fx = (x - (cx - half)) / cell, fz = (z - (cz - half)) / cell;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return outside;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = G[j * (N + 1) + i], b = G[j * (N + 1) + i + 1], c = G[(j + 1) * (N + 1) + i], d = G[(j + 1) * (N + 1) + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  let Lref: Float32Array | null = null;
  const landSDF = (x: number, z: number) => (Lref ? gridLookup(Lref, x, z, 50) : landExact(x, z));
  const rawHeight = (x: number, z: number) => {
    const d = landSDF(x, z);
    let h: number;
    if (d >= 0) h = -0.06 - 3.2 * (1 - Math.exp(-d / 7)) - 1.5 * smoothstep(12, 45, d);
    else {
      const inl = -d;
      h = -0.06 + landH * (1 - Math.exp(-inl / 2.2));
      h += hills * smoothstep(3, 14, inl) * (noise.fbm2(x * 0.05, z * 0.05, 4) * 0.5 + 0.55) * 2.2;
    }
    for (const [mx, mz, mr, mh] of mounds) {
      const t = Math.hypot(x - mx, z - mz) / mr;
      if (t < 1.4) h += mh * Math.exp(-t * t * 2.2) * (1 + noise.noise2(x * 0.2, z * 0.2) * 0.12);
    }
    for (const cv of carves) {
      const sd = cv.shape.f(x, z);
      if (sd < 1.5) {
        const k = smoothstep(1.5, -0.5, sd);
        h = h * (1 - k) + Math.min(h, cv.y) * k;
      }
    }
    // keep terrain under the course
    for (const pc of pieces) {
      const sd = pc.shape.f(x, z);
      if (sd < 2.5) {
        const lim = pc.h(x, z) - 0.55 - Math.max(0, sd) * 0.0;
        const k = smoothstep(2.5, 0.6, sd);
        h = Math.min(h, h * (1 - k) + Math.min(h, lim) * k);
      }
    }
    return h;
  };

  // grid
  const x0 = cx - half, z0 = cz - half;
  const verts = (N + 1) * (N + 1);
  const H = new Float32Array(verts);
  const L = new Float32Array(verts);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) L[j * (N + 1) + i] = landExact(x0 + i * cell, z0 + j * cell);
  Lref = L;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = rawHeight(x0 + i * cell, z0 + j * cell);

  const heightAt = (x: number, z: number) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -5;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = H[j * (N + 1) + i], b = H[j * (N + 1) + i + 1], c = H[(j + 1) * (N + 1) + i], d = H[(j + 1) * (N + 1) + i + 1];
    // match triangle split used by the mesh (PlaneGeometry: a-c-b / c-d-b)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };

  const geo = new THREE.PlaneGeometry(half * 2, half * 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  // PlaneGeometry after rotation: x from -half..half, z from -half..half; rows from z=-half
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k) + cx, z = pos.getZ(k) + cz;
    const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
    pos.setXYZ(k, x, H[j * (N + 1) + i], z);
  }
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const sandW = new Float32Array(pos.count);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const ny = nrm.getY(k);
    const d = landSDF(x, z);
    const n1 = noise.noise2(x * 0.15, z * 0.15);
    const beach = smoothstep(-3.2 + n1 * 0.8, -1.4 + n1 * 0.6, d) * (1 - smoothstep(0.9, 1.6, y));
    if (y < -0.02) {
      c.copy(opts.volcanic ? VOLC_WET : SEABED).lerp(opts.volcanic ? VOLC_SAND : WET_SAND, smoothstep(0, -1.5, y) * 0.5);
    } else {
      const jungle = JUNGLE.clone().lerp(JUNGLE_DARK, smoothstep(-0.3, 0.6, noise.fbm2(x * 0.08, z * 0.08, 3)));
      if (opts.volcanic) jungle.lerp(new THREE.Color(0x4f5a2e), 0.45);
      const sand = opts.volcanic ? (y < 0.12 ? VOLC_WET : VOLC_SAND) : y < 0.12 ? WET_SAND : SAND;
      c.copy(jungle).lerp(sand, beach);
    }
    const steep = 1 - smoothstep(0.62, 0.82, ny);
    c.lerp(opts.volcanic ? new THREE.Color(0x3d3a3a) : ROCK, steep * (y > 0 ? 1 : 0.4));
    cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    sandW[k] = y < 0 ? 1 : Math.max(beach, 0) * (1 - steep);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('aSand', new THREE.BufferAttribute(sandW, 1));

  const mat = makeTerrainMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);

  // ---- bake height texture for the ocean (R: height mapped from [-5, 3]) ----
  const T = 256;
  const data = new Uint8Array(T * T * 4);
  for (let j = 0; j < T; j++)
    for (let i = 0; i < T; i++) {
      const x = x0 + ((i + 0.5) / T) * half * 2, z = z0 + ((j + 0.5) / T) * half * 2;
      let h = heightAt(x, z);
      // course rock bases stand in the water
      const fd = fp.f(x, z);
      if (fd < 0.55) h = Math.max(h, 0.6);
      const v = Math.max(0, Math.min(1, (h + 5) / 8));
      const o = (j * T + i) * 4;
      data[o] = Math.round(v * 255);
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  const depthTex = new THREE.DataTexture(data, T, T, THREE.RGBAFormat, THREE.UnsignedByteType);
  depthTex.minFilter = THREE.LinearFilter;
  depthTex.magFilter = THREE.LinearFilter;
  depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
  depthTex.needsUpdate = true;

  return {
    group,
    heightAt,
    landSDF,
    depthTex,
    depthBounds: new THREE.Vector4(x0, z0, half * 2, 0),
    stamp(x: number, z: number, r: number, h: number) {
      const size = half * 2;
      const i0 = Math.max(0, Math.floor(((x - r - x0) / size) * T)), i1 = Math.min(T - 1, Math.ceil(((x + r - x0) / size) * T));
      const j0 = Math.max(0, Math.floor(((z - r - z0) / size) * T)), j1 = Math.min(T - 1, Math.ceil(((z + r - z0) / size) * T));
      const v = Math.round(Math.max(0, Math.min(1, (h + 5) / 8)) * 255);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const px = x0 + ((i + 0.5) / T) * size, pz = z0 + ((j + 0.5) / T) * size;
          if (Math.hypot(px - x, pz - z) > r) continue;
          const o = (j * T + i) * 4;
          data[o] = Math.max(data[o], v);
        }
      depthTex.needsUpdate = true;
    },
    center: new THREE.Vector2(cx, cz),
    half,
    dispose() {
      geo.dispose();
      mat.dispose();
      depthTex.dispose();
    },
  };
}

function makeTerrainMaterial() {
  const s = sandTextures();
  const g = grassTextures();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tSand = { value: s.map };
    sh.uniforms.tSandN = { value: s.normal };
    sh.uniforms.tGrass = { value: g.map };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSand;\nvarying float vSand;\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSand = aSand;\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tSand;\nuniform sampler2D tSandN;\nuniform sampler2D tGrass;\nvarying float vSand;\nvarying vec3 vWP;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sd = texture2D(tSand, vWP.xz * 0.35).r;
        float gd = texture2D(tGrass, vWP.xz * 0.6).r;
        float gd2 = texture2D(tGrass, vWP.xz * 0.05).r;
        diffuseColor.rgb *= mix((0.75 + gd * 0.45) * (0.8 + gd2 * 0.4), 0.86 + sd * 0.2, vSand);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        { vec3 sn = texture2D(tSandN, vWP.xz * 0.35).xyz * 2.0 - 1.0;
          normal = normalize(normal + (viewMatrix * vec4(sn.x, 0.0, sn.y, 0.0)).xyz * 0.35 * vSand); }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain';
  return mat;
}
