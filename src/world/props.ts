// Procedural prop models: stone blocks, boulders, palms, ferns, leafy plants, hibiscus, tikis, torches, huts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder, M, col, jitterColor } from './geo';
import { Noise, Rng } from '../core/math';

const nz = new Noise(4242);
const cache = new Map<string, THREE.BufferGeometry | THREE.BufferGeometry[]>();
function memo<T extends THREE.BufferGeometry | THREE.BufferGeometry[]>(key: string, fn: () => T): T {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

// ---------------------------------------------------------------------------
// Stone wall blocks (unit cube, centered), slightly lumpy rounded boxes
// ---------------------------------------------------------------------------
export function stoneBlockGeos(): THREE.BufferGeometry[] {
  return memo('stoneBlocks', () => {
    const out: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 5; v++) {
      const g = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const seed = v * 13.7;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = nz.noise3(x * 1.9 + seed, y * 1.9, z * 1.9 - seed) * 0.05 + nz.noise3(x * 5 + seed, y * 5, z * 5) * 0.012;
        const l = Math.hypot(x, y, z) || 1;
        p.setXYZ(i, x + (x / l) * n, y + (y / l) * n * 0.6, z + (z / l) * n);
      }
      g.deleteAttribute('uv');
      const m = mergeVertices(g, 1e-4);
      m.computeVertexNormals();
      out.push(m);
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Boulders (unit radius), smooth lumpy volcanic rocks
// ---------------------------------------------------------------------------
export function boulderGeo(seed: number, detail = 3): THREE.BufferGeometry {
  return memo('boulder' + seed + '_' + detail, () => {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const rng = new Rng(seed * 997 + 1);
    const sx = rng.range(0.85, 1.2), sz = rng.range(0.85, 1.2);
    const o = rng.range(0, 100);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = nz.fbm3(x * 1.1 + o, y * 1.1, z * 1.1 - o, 4) * 0.32;
      const facet = Math.abs(nz.noise3(x * 2.3 + o, y * 2.3, z * 2.3)) * 0.08;
      const r = 1 + n - facet;
      x *= r * sx; y *= r * 0.78; z *= r * sz;
      if (y < -0.35) y = -0.35 + (y + 0.35) * 0.3; // flatter bottom
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    // vertex colors: dark basalt with subtle variation, darker underside
    const colors: number[] = [];
    const base = new THREE.Color(0x4b4c52);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const v = nz.noise3(x * 2 + o, y * 2, z * 2) * 0.06;
      const shade = THREE.MathUtils.clamp(0.7 + (y + 0.4) * 0.35, 0.55, 1.15);
      colors.push(base.r * shade + v, base.g * shade + v, base.b * shade + v * 1.1);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  });
}

// ---------------------------------------------------------------------------
// Palm tree (~6.5 units tall at scale 1). Includes aWind attribute.
// ---------------------------------------------------------------------------
export function palmGeo(seed: number): THREE.BufferGeometry {
  return memo('palm' + seed, () => {
    const rng = new Rng(seed * 31 + 7);
    const gb = new GeoBuilder();
    const H = rng.range(5.6, 7.0);
    const lean = rng.range(0.6, 1.8);
    const P0 = new THREE.Vector3(0, 0, 0);
    const P1 = new THREE.Vector3(lean * 0.15, H * 0.5, 0);
    const P2 = new THREE.Vector3(lean, H, 0);
    const curve = new THREE.QuadraticBezierCurve3(P0, P1, P2);
    const rings = Math.round(H * 3.1);
    const radial = 10;
    const trunkVerts: number[] = [];
    const trunkNormals: number[] = [];
    const trunkCols: THREE.Color[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const frame = (t: number) => {
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      const side = new THREE.Vector3().crossVectors(tan, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const fwd = new THREE.Vector3().crossVectors(side, tan).normalize();
      return { p, tan, side, fwd };
    };
    const radiusAt = (t: number) => 0.3 * (1 - t) + 0.17 * t + Math.max(0, 0.12 - t) * 1.4;
    const ringCol = (k: number) => jitterColor(k % 2 ? 0x977149 : 0x9c7650, () => rng.next(), 0.015, 0.04, 0.05);
    for (let k = 0; k < rings; k++) {
      const t0 = k / rings, t1 = (k + 1) / rings;
      const f0 = frame(t0), f1 = frame(t1 - 0.002);
      const r0 = radiusAt(t0) * 0.86, r1 = radiusAt(t1) * 1.06;
      const cBot = ringCol(k).multiplyScalar(0.74);
      const cTop = ringCol(k).multiplyScalar(1.04);
      const ring0: THREE.Vector3[] = [], ring1: THREE.Vector3[] = [], n0: THREE.Vector3[] = [], n1: THREE.Vector3[] = [];
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        const d0 = f0.side.clone().multiplyScalar(Math.cos(a)).add(f0.fwd.clone().multiplyScalar(Math.sin(a)));
        const d1 = f1.side.clone().multiplyScalar(Math.cos(a)).add(f1.fwd.clone().multiplyScalar(Math.sin(a)));
        ring0.push(f0.p.clone().addScaledVector(d0, r0));
        ring1.push(f1.p.clone().addScaledVector(d1, r1));
        // cone normal tilted downward a bit (top is wider)
        n0.push(d0.clone().addScaledVector(f0.tan, -0.35).normalize());
        n1.push(d1.clone().addScaledVector(f1.tan, -0.35).normalize());
      }
      for (let i = 0; i < radial; i++) {
        const quad = [ring0[i], ring0[i + 1], ring1[i + 1], ring0[i], ring1[i + 1], ring1[i]];
        const qn = [n0[i], n0[i + 1], n1[i + 1], n0[i], n1[i + 1], n1[i]];
        const qc = [cBot, cBot, cTop, cBot, cTop, cTop];
        for (let q = 0; q < 6; q++) {
          trunkVerts.push(quad[q].x, quad[q].y, quad[q].z);
          trunkNormals.push(qn[q].x, qn[q].y, qn[q].z);
          trunkCols.push(qc[q]);
        }
      }
      // underside "step" ring between this ring's top and next ring's bottom
      if (k < rings - 1) {
        const fn = frame(t1);
        const rn = radiusAt(t1) * 0.86;
        for (let i = 0; i < radial; i++) {
          const a0 = (i / radial) * Math.PI * 2, a1 = ((i + 1) / radial) * Math.PI * 2;
          const pa = ring1[i], pb = ring1[i + 1];
          const qa = fn.p.clone().addScaledVector(fn.side.clone().multiplyScalar(Math.cos(a0)).add(fn.fwd.clone().multiplyScalar(Math.sin(a0))), rn);
          const qb = fn.p.clone().addScaledVector(fn.side.clone().multiplyScalar(Math.cos(a1)).add(fn.fwd.clone().multiplyScalar(Math.sin(a1))), rn);
          const tri = [pa, qb, pb, pa, qa, qb];
          const cn = fn.tan.clone();
          for (const v of tri) {
            trunkVerts.push(v.x, v.y, v.z);
            trunkNormals.push(cn.x, cn.y, cn.z);
            trunkCols.push(cBot.clone().multiplyScalar(0.8));
          }
        }
      }
    }
    gb.addTriangles(trunkVerts, (i) => trunkCols[i], (_i, _x, y) => Math.pow(Math.max(0, y / H), 2) * 0.35, trunkNormals);

    // crown + coconuts
    const top = curve.getPoint(1);
    gb.add(new THREE.SphereGeometry(0.3, 10, 8), M.compose(top.x, top.y + 0.05, top.z, 0, 0, 0, 1, 0.8, 1), 0x6b5a2a, 0.35);
    const nCoco = rng.int(2, 5);
    for (let i = 0; i < nCoco; i++) {
      const a = (i / nCoco) * Math.PI * 2 + rng.range(0, 0.6);
      gb.add(new THREE.SphereGeometry(0.17, 10, 8), M.compose(top.x + Math.cos(a) * 0.24, top.y - 0.18 - rng.range(0, 0.12), top.z + Math.sin(a) * 0.24), rng.next() < 0.5 ? 0x5b4a22 : 0x6f7a2c, 0.35);
    }

    // fronds
    const nFronds = rng.int(8, 10);
    for (let f = 0; f < nFronds; f++) {
      const az = (f / nFronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const elev = rng.range(0.15, 0.75);
      const len = rng.range(2.6, 3.5);
      addFrond(gb, top, az, elev, len, rng, { base: 0x2e7a2c, tip: 0x86c64a, dry: rng.next() < 0.12 });
    }
    return gb.build(true);
  });
}

function addFrond(gb: GeoBuilder, origin: THREE.Vector3, az: number, elev: number, len: number, rng: Rng, c: { base: number; tip: number; dry?: boolean }, leafScale = 1, droopK = 1.1) {
  const segs = 16;
  const up = new THREE.Vector3(0, 1, 0);
  const dirH = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const d = s * len;
    const p = origin.clone().addScaledVector(dirH, d * Math.cos(elev)).addScaledVector(up, d * Math.sin(elev) - droopK * d * d / len);
    spine.push(p);
  }
  const verts: number[] = [];
  const cols: THREE.Color[] = [];
  const winds: number[] = [];
  const baseC = new THREE.Color(c.dry ? 0x8a8a3a : c.base);
  const tipC = new THREE.Color(c.dry ? 0xc9b25a : c.tip);
  const tint = rng.range(-0.04, 0.04);
  for (let i = 1; i < segs; i++) {
    const s = i / segs;
    const p = spine[i];
    const tan = spine[i + 1].clone().sub(spine[i - 1]).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const L = (0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05)), 0.6) + 0.12) * leafScale;
    for (const sd of [-1, 1]) {
      const droop = 0.55 + s * 0.4;
      const dir = side.clone().multiplyScalar(sd * Math.cos(droop)).addScaledVector(tan, 0.45).addScaledVector(up, -Math.sin(droop)).normalize();
      const tip = p.clone().addScaledVector(dir, L);
      const perp = new THREE.Vector3().crossVectors(dir, tan).normalize().multiplyScalar(0.075 * leafScale);
      const mid = p.clone().addScaledVector(dir, L * 0.3);
      const m1 = mid.clone().add(perp), m2 = mid.clone().sub(perp);
      verts.push(p.x, p.y, p.z, m1.x, m1.y, m1.z, tip.x, tip.y, tip.z);
      verts.push(p.x, p.y, p.z, tip.x, tip.y, tip.z, m2.x, m2.y, m2.z);
      const cb = baseC.clone().lerp(tipC, s * 0.7).offsetHSL(tint, 0, 0);
      const ct = baseC.clone().lerp(tipC, 0.5 + s * 0.5).offsetHSL(tint, 0, 0.03);
      cols.push(cb.clone().multiplyScalar(0.8), cb, ct, cb.clone().multiplyScalar(0.8), ct, cb);
      const w = 0.45 + s * 0.55;
      winds.push(w, w + 0.1, w + 0.25, w, w + 0.25, w + 0.1);
    }
  }
  // spine strip
  for (let i = 0; i < segs; i++) {
    const a = spine[i], b = spine[i + 1];
    const tan = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(0.03 * (1 - i / segs) + 0.01);
    const a1 = a.clone().add(side), a2 = a.clone().sub(side), b1 = b.clone().add(side), b2 = b.clone().sub(side);
    verts.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, b2.x, b2.y, b2.z, a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
    const cc = new THREE.Color(0x6a7d2a);
    for (let k = 0; k < 6; k++) cols.push(cc);
    const w = 0.4 + (i / segs) * 0.5;
    for (let k = 0; k < 6; k++) winds.push(w);
  }
  gb.addTriangles(verts, (i) => cols[i], (i) => winds[i]);
}

// ---------------------------------------------------------------------------
// Fern / small palm-like ground plant (~1.2 units)
// ---------------------------------------------------------------------------
export function fernGeo(seed: number): THREE.BufferGeometry {
  return memo('fern' + seed, () => {
    const rng = new Rng(seed * 17 + 3);
    const gb = new GeoBuilder();
    const n = rng.int(7, 11);
    const o = new THREE.Vector3(0, 0.05, 0);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      addFrond(gb, o, az, rng.range(0.7, 1.1), rng.range(1.0, 1.5), rng, { base: 0x1f6b2a, tip: 0x5fae3c }, 0.42, 0.75);
    }
    return gb.build(true);
  });
}

// ---------------------------------------------------------------------------
// Big-leaf tropical plant (elephant ear / monstera-ish), ~1.4 units
// ---------------------------------------------------------------------------
export function leafPlantGeo(seed: number): THREE.BufferGeometry {
  return memo('leafplant' + seed, () => {
    const rng = new Rng(seed * 53 + 11);
    const gb = new GeoBuilder();
    const n = rng.int(4, 7);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const h = rng.range(0.6, 1.2);
      const out = rng.range(0.25, 0.5);
      const stemTop = new THREE.Vector3(Math.cos(az) * out, h, Math.sin(az) * out);
      // stem
      const stem = new THREE.CylinderGeometry(0.025, 0.035, 1, 5, 1);
      const mid = stemTop.clone().multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), stemTop.clone().normalize());
      const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, stemTop.length(), 1));
      gb.add(stem, m, 0x4f8a2c, (p) => p.y * 0.3);
      // leaf: heart shape fan, bent along midrib, tilted outward & down
      const L = rng.range(0.7, 1.0), W = L * 0.62;
      const pts: [number, number][] = [];
      const steps = 14;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps; // 0 = tip side ... along the outline
        const ang = Math.PI * t;
        // outline in leaf space: x across, y along (0 at stem, L at tip)
        const x = Math.sin(ang) * W * (1 - 0.25 * Math.sin(ang * 2));
        const y = L * (1 - t) - 0.18 * L * Math.sin(ang) * 0.4;
        pts.push([x, y]);
      }
      const verts: number[] = [];
      const cols: THREE.Color[] = [];
      const base = new THREE.Color(rng.next() < 0.5 ? 0x2d8a3a : 0x3c9a32);
      const leafPoint = (x: number, y: number) => {
        // fold along midrib & arch downward along length
        const fold = Math.abs(x) * 0.35;
        const arch = -Math.pow(y / L, 2) * 0.35 * L;
        const local = new THREE.Vector3(x, fold + arch, y);
        // orient: leaf base at stemTop, pointing outward at az, tilted up 25deg
        local.applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.45);
        local.applyAxisAngle(new THREE.Vector3(0, 1, 0), -az + Math.PI / 2);
        return local.add(stemTop);
      };
      const center = leafPoint(0, L * 0.45);
      for (const sd of [-1, 1]) {
        for (let k = 0; k < pts.length - 1; k++) {
          const a = leafPoint(pts[k][0] * sd, pts[k][1]);
          const b = leafPoint(pts[k + 1][0] * sd, pts[k + 1][1]);
          const midA = leafPoint(0, pts[k][1]);
          const midB = leafPoint(0, pts[k + 1][1]);
          verts.push(midA.x, midA.y, midA.z, a.x, a.y, a.z, b.x, b.y, b.z);
          verts.push(midA.x, midA.y, midA.z, b.x, b.y, b.z, midB.x, midB.y, midB.z);
          const ce = base.clone().multiplyScalar(0.85), cm = base.clone().lerp(new THREE.Color(0x9bd25a), 0.35);
          cols.push(cm, ce, ce, cm, ce, cm);
        }
      }
      void center;
      gb.addTriangles(verts, (i) => cols[i], (_i, _x, y) => 0.25 + y * 0.35);
    }
    return gb.build(true);
  });
}

// ---------------------------------------------------------------------------
// Hibiscus flower (single bloom ~0.22 units) and flower bush
// ---------------------------------------------------------------------------
function addHibiscus(gb: GeoBuilder, pos: THREE.Vector3, normal: THREE.Vector3, size: number, color: THREE.Color, rng: Rng) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  const spin = rng.range(0, Math.PI * 2);
  const verts: number[] = [];
  const cols: THREE.Color[] = [];
  const inner = color.clone().multiplyScalar(0.45).lerp(new THREE.Color(0x8a0a2a), 0.4);
  for (let p = 0; p < 5; p++) {
    const a0 = spin + (p / 5) * Math.PI * 2;
    const ring: THREE.Vector3[] = [];
    const segs = 5;
    for (let k = 0; k <= segs; k++) {
      const a = a0 + ((k / segs) - 0.5) * 1.25;
      const r = size * (0.85 + 0.15 * Math.sin((k / segs) * Math.PI));
      ring.push(new THREE.Vector3(Math.cos(a) * r, size * 0.32, Math.sin(a) * r));
    }
    for (let k = 0; k < segs; k++) {
      const c0 = new THREE.Vector3(0, 0, 0);
      const a = ring[k], b = ring[k + 1];
      for (const v of [c0, a, b]) {
        const w = v.clone().applyQuaternion(q).add(pos);
        verts.push(w.x, w.y, w.z);
      }
      cols.push(inner, color, color);
    }
  }
  gb.addTriangles(verts, (i) => cols[i], 0.3);
  // stamen
  const st = new THREE.CylinderGeometry(0.012, 0.012, size * 0.9, 4);
  const sm = new THREE.Matrix4().compose(pos.clone().add(normal.clone().multiplyScalar(size * 0.45)), q, new THREE.Vector3(1, 1, 1));
  gb.add(st, sm, 0xf5d54a, 0.3);
  gb.add(new THREE.SphereGeometry(size * 0.09, 6, 4), new THREE.Matrix4().compose(pos.clone().add(normal.clone().multiplyScalar(size * 0.9)), q, new THREE.Vector3(1, 1, 1)), 0xffc93a, 0.3);
}

export function flowerBushGeo(seed: number): THREE.BufferGeometry {
  return memo('flowerbush' + seed, () => {
    const rng = new Rng(seed * 7 + 1);
    const gb = new GeoBuilder();
    // leafy mound: several flattened leaf blobs
    const leaf = new THREE.IcosahedronGeometry(0.28, 1);
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0, 0.38);
      gb.add(leaf, M.compose(Math.cos(a) * r, rng.range(0.18, 0.42), Math.sin(a) * r, rng.range(0, 3), rng.range(0, 3), 0, rng.range(0.8, 1.2), rng.range(0.55, 0.8), rng.range(0.8, 1.2)), jitterColor(0x2f7a35, () => rng.next(), 0.03, 0.1, 0.1), 0.2);
    }
    const palette = [0xe8243c, 0xff4f6d, 0xff7a2f, 0xf0306a, 0xffd23f];
    const flowerCol = new THREE.Color(palette[seed % palette.length]);
    const nF = rng.int(4, 7);
    for (let i = 0; i < nF; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0.1, 0.42);
      const p = new THREE.Vector3(Math.cos(a) * r, rng.range(0.42, 0.62), Math.sin(a) * r);
      const n = new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize();
      addHibiscus(gb, p, n, rng.range(0.13, 0.18), flowerCol.clone().offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.05, 0.05)), rng);
    }
    return gb.build(true);
  });
}

// ---------------------------------------------------------------------------
// Tiki statue (front = +Z, ~2.3 units tall). Variants: 0 happy, 1 fierce, 2 totem.
// ---------------------------------------------------------------------------
export const TIKI_COLORS = { wood: 0xb06f3a, dark: 0x6e3c1a, light: 0xd49a5c, mouth: 0x2a1208, teeth: 0xf3ead6, gem: 0xe0302a, eye: 0xf2e3c4, pupil: 0x23130a, tongue: 0xd8434d };

function addTikiHead(gb: GeoBuilder, m0: THREE.Matrix4, variant: number) {
  const C = TIKI_COLORS;
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4, c: number) => gb.add(g, m0.clone().multiply(m), c, 0);
  const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
  // head block
  add(rb(1.15, 1.55, 0.95, 0.16), M.compose(0, 0.78, 0), C.wood);
  // headband + crown steps
  add(rb(1.27, 0.3, 1.07, 0.08), M.compose(0, 1.5, 0), C.dark);
  add(rb(1.08, 0.16, 0.88, 0.06), M.compose(0, 1.72, 0), C.light);
  // zigzag teeth on headband
  for (let i = -3; i <= 3; i++) {
    const cone = new THREE.ConeGeometry(0.07, 0.15, 4);
    add(cone, M.compose(i * 0.16, 1.5 + (i % 2 === 0 ? 0.03 : -0.03), 0.54, i % 2 === 0 ? 0 : Math.PI, Math.PI / 4, 0, 1, 1, 0.4), C.light);
  }
  // gem
  add(new THREE.OctahedronGeometry(0.13, 0), M.compose(0, 1.5, 0.56, 0, 0, 0, 1, 1.35, 0.55), C.gem);
  // brow ridge (two halves forming a slight arch / V)
  const browAng = variant === 1 ? -0.28 : 0.16;
  add(rb(0.52, 0.15, 0.2, 0.06), M.compose(-0.26, 1.2, 0.47, -0.1, 0, browAng), C.light);
  add(rb(0.52, 0.15, 0.2, 0.06), M.compose(0.26, 1.2, 0.47, -0.1, 0, -browAng), C.light);
  // eyes
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(0.15, 0.045, 8, 18), M.compose(sx * 0.27, 0.98, 0.49, 0, 0, 0, 1, variant === 1 ? 0.7 : 0.85, 1), C.light);
    add(new THREE.SphereGeometry(0.15, 14, 10), M.compose(sx * 0.27, 0.98, 0.47, 0, 0, 0, 1, variant === 1 ? 0.7 : 0.85, 0.4), C.eye);
    add(new THREE.SphereGeometry(0.075, 10, 8), M.compose(sx * 0.25, 0.97, 0.52, 0, 0, 0, 1, 1, 0.5), C.pupil);
  }
  // nose
  add(new THREE.SphereGeometry(0.2, 14, 10), M.compose(0, 0.72, 0.5, 0, 0, 0, 0.85, 1.25, 0.8), C.light);
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.09, 10, 8), M.compose(sx * 0.13, 0.6, 0.5, 0, 0, 0, 1, 0.8, 0.9), C.wood);
  // cheeks
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.17, 12, 8), M.compose(sx * 0.42, 0.5, 0.4, 0, 0, 0, 1, 0.8, 0.7), C.wood);
  // ears
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), M.compose(sx * 0.6, 0.95, 0.05), C.dark);
  // mouth: grin shape
  const mouthW = variant === 1 ? 0.36 : 0.44;
  const mouthH = variant === 1 ? 0.36 : 0.26;
  const shape = new THREE.Shape();
  shape.moveTo(-mouthW, 0);
  shape.quadraticCurveTo(0, 0.06, mouthW, 0);
  shape.quadraticCurveTo(mouthW * 0.9, -mouthH * 1.05, 0, -mouthH);
  shape.quadraticCurveTo(-mouthW * 0.9, -mouthH * 1.05, -mouthW, 0);
  const lips = new THREE.Shape();
  const lw = mouthW + 0.08, lh = mouthH + 0.08;
  lips.moveTo(-lw, 0.06);
  lips.quadraticCurveTo(0, 0.14, lw, 0.06);
  lips.quadraticCurveTo(lw * 0.9, -lh * 1.05, 0, -lh);
  lips.quadraticCurveTo(-lw * 0.9, -lh * 1.05, -lw, 0.06);
  lips.holes.push(shape.clone() as unknown as THREE.Path);
  const lipGeo = new THREE.ExtrudeGeometry(lips, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 10 });
  add(lipGeo, M.compose(0, 0.36, 0.43), C.light);
  const mouthGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 10 });
  add(mouthGeo, M.compose(0, 0.36, 0.46), C.mouth);
  // teeth
  const nT = variant === 1 ? 4 : 7;
  for (let i = 0; i < nT; i++) {
    const x = (i / (nT - 1) - 0.5) * mouthW * 1.6;
    add(rb(mouthW * 1.6 / nT - 0.015, 0.1, 0.05, 0.02), M.compose(x, 0.36 - 0.05, 0.52), C.teeth);
  }
  if (variant !== 1) {
    for (let i = 0; i < 5; i++) {
      const x = (i / 4 - 0.5) * mouthW * 1.0;
      const y = 0.36 - mouthH * 0.86 + Math.pow(Math.abs(x) / mouthW, 2) * mouthH * 0.6;
      add(rb(0.075, 0.08, 0.05, 0.02), M.compose(x, y + 0.04, 0.51), C.teeth);
    }
  } else {
    // tongue
    add(new THREE.SphereGeometry(0.16, 12, 8), M.compose(0, 0.36 - mouthH * 0.9, 0.53, 0.3, 0, 0, 0.9, 0.55, 0.6), C.tongue);
  }
}

export function tikiGeo(variant: number): THREE.BufferGeometry {
  return memo('tiki' + variant, () => {
    const gb = new GeoBuilder();
    const C = TIKI_COLORS;
    const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
    if (variant === 2) {
      // totem: base block + two stacked heads
      gb.add(rb(1.0, 0.5, 0.9, 0.1), M.compose(0, 0.25, 0), C.dark);
      addTikiHead(gb, M.compose(0, 0.48, 0, 0, 0, 0, 0.85), 1);
      addTikiHead(gb, M.compose(0, 2.05, 0, 0, 0, 0, 0.75), 0);
    } else {
      // body below head: carved bands
      gb.add(rb(1.05, 0.62, 0.9, 0.12), M.compose(0, 0.31, 0), C.wood);
      gb.add(rb(1.15, 0.1, 1.0, 0.04), M.compose(0, 0.18, 0), C.dark);
      gb.add(rb(1.15, 0.1, 1.0, 0.04), M.compose(0, 0.48, 0), C.dark);
      // little hands on belly
      for (const sx of [-1, 1]) gb.add(rb(0.3, 0.14, 0.18, 0.06), M.compose(sx * 0.2, 0.33, 0.46), C.light);
      addTikiHead(gb, M.compose(0, 0.6, 0), variant);
    }
    return gb.build(false);
  });
}

// ---------------------------------------------------------------------------
// Tiki torch body (flame attached separately at y = top). ~2.1 units.
// ---------------------------------------------------------------------------
export const TORCH_TOP = 2.15;
export function torchGeo(): THREE.BufferGeometry {
  return memo('torch', () => {
    const gb = new GeoBuilder();
    const segs = 4;
    const segH = 1.85 / segs;
    for (let i = 0; i < segs; i++) {
      gb.add(new THREE.CylinderGeometry(0.085, 0.095, segH, 10, 1), M.compose(0, segH * (i + 0.5), 0), i % 2 ? 0xa8782f : 0x9a6c2a);
      gb.add(new THREE.TorusGeometry(0.095, 0.026, 6, 12), M.compose(0, segH * (i + 1), 0, Math.PI / 2), 0x5e3f1a);
    }
    // cup
    const pts = [new THREE.Vector2(0.08, 0), new THREE.Vector2(0.15, 0.08), new THREE.Vector2(0.2, 0.22), new THREE.Vector2(0.17, 0.27)];
    gb.add(new THREE.LatheGeometry(pts, 12), M.compose(0, 1.85, 0), 0x4a2f16);
    for (let k = 0; k < 3; k++) gb.add(new THREE.TorusGeometry(0.155 + k * 0.016, 0.026, 6, 14), M.compose(0, 1.9 + k * 0.065, 0, Math.PI / 2), 0xd3b47a);
    return gb.build(false);
  });
}

// ---------------------------------------------------------------------------
// Tiki hut (thatched roof on bamboo posts) ~3.5 units tall
// ---------------------------------------------------------------------------
export function hutGeo(): THREE.BufferGeometry {
  return memo('hut', () => {
    const gb = new GeoBuilder();
    const rng = new Rng(5);
    for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]] as const) {
      gb.add(new THREE.CylinderGeometry(0.09, 0.1, 2.3, 8), M.compose(x, 1.15, z), 0xbf9a4f);
    }
    // floor deck
    gb.add(new THREE.BoxGeometry(2.6, 0.12, 2.6), M.compose(0, 0.35, 0), 0x9b7046);
    // bar counter
    gb.add(new THREE.BoxGeometry(2.3, 0.9, 0.3), M.compose(0, 0.85, 1.05), 0x8a5a30);
    // roof: layered thatch cones
    for (let k = 0; k < 3; k++) {
      const r = 2.3 - k * 0.55;
      const cone = new THREE.ConeGeometry(r, 1.1 - k * 0.1, 12, 2, true);
      const p = cone.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < 0) p.setY(i, y + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 12) * 0.05);
      }
      cone.computeVertexNormals();
      gb.add(cone, M.compose(0, 2.65 + k * 0.42, 0), jitterColor(k % 2 ? 0xc9a45c : 0xb8913f, () => rng.next()));
    }
    gb.add(new THREE.ConeGeometry(0.25, 0.6, 8), M.compose(0, 3.85, 0), 0xa07a3a);
    return gb.build(false);
  });
}

export { col };
