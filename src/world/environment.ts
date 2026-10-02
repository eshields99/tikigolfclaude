// Time-of-day presets, sky dome, stylized clouds, distant islands and lighting rig.
import * as THREE from 'three';
import { Rng } from '../core/math';
import { sharedUniforms } from '../render/materials';

export interface EnvPreset {
  id: string;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  skyBottom: THREE.Color;
  sunGlow: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  waterShallow: THREE.Color;
  waterDeep: THREE.Color;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  exposure: number;
  envIntensity: number;
  islandTint: THREE.Color;
  torchBoost: number;
}

const C = (h: number) => new THREE.Color(h);
const dir = (azDeg: number, elDeg: number) => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
};

export const PRESETS: Record<string, EnvPreset> = {
  day: {
    id: 'day',
    sunDir: dir(-35, 50),
    sunColor: C(0xfff0d8),
    sunIntensity: 3.9,
    skyTop: C(0x1f7fe0),
    skyHorizon: C(0xa8e0f5),
    skyBottom: C(0x5cc2dc),
    sunGlow: C(0xfff3c8),
    hemiSky: C(0xa8d4ff),
    hemiGround: C(0x6b8a4a),
    hemiIntensity: 0.85,
    fog: C(0xa8daf0),
    fogNear: 220,
    fogFar: 1100,
    waterShallow: C(0x3ee6d6),
    waterDeep: C(0x0a6fa8),
    cloudLit: C(0xffffff),
    cloudShade: C(0xb7cfe4),
    exposure: 1.0,
    envIntensity: 0.45,
    islandTint: C(0x8fb8c8),
    torchBoost: 0.6,
  },
  golden: {
    id: 'golden',
    sunDir: dir(-20, 24),
    sunColor: C(0xffd59a),
    sunIntensity: 3.9,
    skyTop: C(0x2f78cc),
    skyHorizon: C(0xffd9a8),
    skyBottom: C(0x88c9cf),
    sunGlow: C(0xffc070),
    hemiSky: C(0xc9dcff),
    hemiGround: C(0x6a7a3a),
    hemiIntensity: 0.8,
    fog: C(0xf2d6b0),
    fogNear: 200,
    fogFar: 1000,
    waterShallow: C(0x40dccc),
    waterDeep: C(0x0d5f9a),
    cloudLit: C(0xfff0dc),
    cloudShade: C(0xc9a9b8),
    exposure: 1.0,
    envIntensity: 0.45,
    islandTint: C(0xc2a9a6),
    torchBoost: 1.0,
  },
  sunset: {
    id: 'sunset',
    sunDir: dir(-10, 9),
    sunColor: C(0xffa25a),
    sunIntensity: 3.4,
    skyTop: C(0x3a3f8f),
    skyHorizon: C(0xff9a62),
    skyBottom: C(0x7a5a8a),
    sunGlow: C(0xff7a3a),
    hemiSky: C(0x9d8fd6),
    hemiGround: C(0x5a3a2a),
    hemiIntensity: 0.85,
    fog: C(0xe8907a),
    fogNear: 180,
    fogFar: 900,
    waterShallow: C(0x3fb8c0),
    waterDeep: C(0x1d3f7a),
    cloudLit: C(0xffc29a),
    cloudShade: C(0x8a6a9a),
    exposure: 1.05,
    envIntensity: 0.4,
    islandTint: C(0x9a6a8a),
    torchBoost: 1.6,
  },
};

// ------------------------------------------------------------------ sky dome
export function makeSky(p: EnvPreset) {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: p.skyTop.clone() },
      uHorizon: { value: p.skyHorizon.clone() },
      uBottom: { value: p.skyBottom.clone() },
      uSunDir: { value: p.sunDir.clone() },
      uSunColor: { value: p.sunGlow.clone() },
      uTime: sharedUniforms.uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col;
        if (h > 0.0) {
          float t = pow(smoothstep(0.0, 0.75, h), 0.65);
          col = mix(uHorizon, uTop, t);
        } else {
          col = mix(uHorizon, uBottom, smoothstep(0.0, -0.08, h));
        }
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.55);
        col += uSunColor * smoothstep(0.99935, 0.99965, sd) * 6.0;
        // gentle haze near horizon
        col = mix(col, uHorizon * 1.05, (1.0 - smoothstep(0.0, 0.12, abs(h))) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ------------------------------------------------------------------ clouds
export function makeClouds(p: EnvPreset, seed = 3) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uLit: { value: p.cloudLit.clone() },
      uShade: { value: p.cloudShade.clone() },
      uSunDir: { value: p.sunDir.clone() },
      uHorizon: { value: p.skyHorizon.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLit, uShade, uSunDir, uHorizon;
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN);
        float l = dot(n, normalize(uSunDir)) * 0.5 + 0.5;
        l = smoothstep(0.15, 0.95, l);
        float up = n.y * 0.5 + 0.5;
        vec3 col = mix(uShade, uLit, l * 0.8 + up * 0.25);
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        col += uLit * rim * 0.25;
        // fade toward horizon colour at low altitude
        float hz = smoothstep(60.0, 0.0, vW.y);
        col = mix(col, uHorizon, hz * 0.45);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sphere = new THREE.IcosahedronGeometry(1, 3);
  const geos: THREE.BufferGeometry[] = [];
  const nClouds = 16;
  for (let c = 0; c < nClouds; c++) {
    const parts: THREE.BufferGeometry[] = [];
    const n = rng.int(6, 11);
    const w = rng.range(30, 70);
    for (let i = 0; i < n; i++) {
      const g = sphere.clone();
      const t = i / (n - 1) - 0.5;
      const r = rng.range(8, 15) * (1 - Math.abs(t) * 0.9);
      g.scale(r, r * rng.range(0.75, 1.0), r);
      g.translate(t * w + rng.range(-4, 4), r * 0.35 + rng.range(0, 4) * (1 - Math.abs(t) * 1.6), rng.range(-6, 6));
      parts.push(g);
    }
    // flat-ish base
    const merged = mergeGeos(parts);
    const pos = merged.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.25);
    merged.computeVertexNormals();
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(330, 560);
    merged.rotateY(-ang + Math.PI / 2);
    merged.translate(Math.cos(ang) * dist, rng.range(45, 110), Math.sin(ang) * dist);
    geos.push(merged);
  }
  const all = mergeGeos(geos);
  const mesh = new THREE.Mesh(all, mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  sphere.dispose();
  return { group, update: (t: number) => { group.rotation.y = t * 0.0025; }, dispose: () => { all.dispose(); mat.dispose(); } };
}

function mergeGeos(list: THREE.BufferGeometry[]) {
  let count = 0, icount = 0;
  for (const g of list) {
    count += g.getAttribute('position').count;
    icount += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const idx = new Uint32Array(icount);
  let o = 0, io = 0;
  for (const g of list) {
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    const N = g.getAttribute('normal') as THREE.BufferAttribute;
    pos.set(P.array as Float32Array, o * 3);
    if (N) nrm.set(N.array as Float32Array, o * 3);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + o;
    else for (let i = 0; i < P.count; i++) idx[io++] = i + o;
    o += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ------------------------------------------------------------------ distant islands
export function makeDistantIslands(p: EnvPreset, seed = 7) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true });
  const tint = p.islandTint;
  const geos: THREE.BufferGeometry[] = [];
  const n = 6;
  const used: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.CircleGeometry(1, 48, 0, Math.PI * 2);
    // add rings by subdividing radially: build our own polar grid instead
    g.dispose();
    const R = 24, A = 48;
    const pos: number[] = [];
    const idx: number[] = [];
    const peaks: [number, number, number, number][] = [];
    const np = rng.int(1, 3);
    for (let k = 0; k < np; k++) peaks.push([rng.range(-0.35, 0.35), rng.range(-0.25, 0.25), rng.range(0.25, 0.5), rng.range(0.55, 1.0)]);
    for (let r = 0; r <= R; r++) {
      for (let a = 0; a < A; a++) {
        const rr = r / R;
        const ang = (a / A) * Math.PI * 2;
        const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
        let hgt = 0;
        for (const [px, pz, pr, ph] of peaks) {
          const d = Math.hypot(x - px, z - pz) / pr;
          hgt = Math.max(hgt, ph * Math.exp(-d * d * 1.6));
        }
        hgt *= 1 + Math.sin(ang * 5 + i) * 0.08;
        const edge = Math.max(0, (rr - 0.82) / 0.18);
        hgt = hgt * (1 - edge * edge) - edge * 0.05;
        pos.push(x, Math.max(-0.05, hgt + 0.02 * (1 - rr)), z);
      }
    }
    for (let r = 0; r < R; r++)
      for (let a = 0; a < A; a++) {
        const i0 = r * A + a, i1 = r * A + ((a + 1) % A), i2 = (r + 1) * A + a, i3 = (r + 1) * A + ((a + 1) % A);
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const w = rng.range(28, 70), h = rng.range(12, 34);
    geo.scale(w, h, w * rng.range(0.55, 0.9));
    geo.rotateY(rng.range(0, Math.PI));
    let ang = 0;
    for (let tries = 0; tries < 20; tries++) {
      ang = rng.range(0, Math.PI * 2);
      if (used.every((u) => Math.abs(Math.atan2(Math.sin(u - ang), Math.cos(u - ang))) > 0.5)) break;
    }
    used.push(ang);
    const d = rng.range(320, 520);
    geo.translate(Math.cos(ang) * d, -1.2, Math.sin(ang) * d);
    geo.computeVertexNormals();
    const cols: number[] = [];
    const P2 = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < P2.count; k++) {
      const y = P2.getY(k) + 1.2;
      const base = y < 1.6 ? new THREE.Color(0xf0dca8) : new THREE.Color(0x3f8a4a).lerp(new THREE.Color(0x2b6a3e), Math.min(1, y / 30));
      const c = base.lerp(tint, 0.35 + Math.min(0.25, y / 120));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geos.push(geo);
  }
  const merged = mergeGeosColored(geos);
  const mesh = new THREE.Mesh(merged, mat);
  group.add(mesh);
  return { group, dispose: () => { merged.dispose(); mat.dispose(); } };
}

function mergeGeosColored(list: THREE.BufferGeometry[]) {
  const base = mergeGeos(list);
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const C2 = g.getAttribute('color') as THREE.BufferAttribute;
    col.set(C2.array as Float32Array, o * 3);
    o += C2.count;
  }
  base.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return base;
}

// ------------------------------------------------------------------ lights
export class LightRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  group = new THREE.Group();
  constructor(p: EnvPreset, shadowSize = 2048) {
    this.sun = new THREE.DirectionalLight(p.sunColor, p.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiIntensity);
    this.group.add(this.sun, this.sun.target, this.hemi);
    this.apply(p);
  }
  apply(p: EnvPreset) {
    this.sun.color.copy(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.preset = p;
  }
  preset!: EnvPreset;
  /** Fit the shadow camera around a box (world space). */
  fit(box: THREE.Box3) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.5 * 1.15 + 4;
    const d = this.preset.sunDir;
    this.sun.position.copy(center).addScaledVector(d, 120);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
  }
}
