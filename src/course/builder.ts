// Builds a playable hole (visual meshes + physics world) from a HoleDef.
import * as THREE from 'three';
import type { HoleDef, PieceDef, BridgeDef } from './types';
import { buildTurfMesh, type HeightFn } from './turfmesh';
import { outwardNormals, addWallCollider } from './walls';
import { TriMeshBuilder, raycastDown, type TriMesh } from '../physics/trimesh';
import { PhysicsWorld, BALL_R } from '../physics/world';
import { Mat } from '../physics/surfaces';
import { box, union, segmentDist, bakeSDF, bakeSDFMulti, type SDF } from '../core/sdf';
import { Rng, noise, hashString, type P2 } from '../core/math';
import { makeTurfMaterial, makeStoneMaterial, makeSandMaterial, makeWoodMaterial } from '../render/materials';
import { stoneBlockGeos } from '../world/props';
import { Flag } from './flag';
import { buildObstacles, type ObstacleContext, type BumperFx } from './obstacles';

export const CUP_R = 0.42;
export const CUP_DEPTH = 0.55;
export const WALL_H = 0.42;
export const WALL_T = 0.5;
const CELL = 0.25;

export interface CourseStyle {
  turfA: number;
  turfB: number;
  stone: number;
  plinth: number;
  sand: number;
  wood: number;
  flag: number;
}

export interface HoleBuild {
  def: HoleDef;
  group: THREE.Group;
  world: PhysicsWorld;
  tee: THREE.Vector3;
  cup: THREE.Vector3;
  flag: Flag;
  bounds: THREE.Box3;
  footprint: SDF;
  pieces: { shape: SDF; h: HeightFn }[];
  staticMesh: TriMesh;
  surfaceY(x: number, z: number, fromY?: number): number;
  updaters: ((t: number, dt: number) => void)[];
  aoCircles: [number, number, number][];
  /** Candidate spots on top of stone walls (for torches etc.), with outward normal. */
  wallPosts: { x: number; y: number; z: number; nx: number; nz: number }[];
  bumpers: BumperFx[];
  dispose(): void;
}

const inZones = (zones: SDF[] | undefined, x: number, z: number, margin = 0) => {
  if (!zones) return false;
  for (const s of zones) if (s.f(x, z) < margin) return true;
  return false;
};

function bridgeZone(b: BridgeDef, extra = 0.7): SDF {
  const cx = (b.from[0] + b.to[0]) / 2, cz = (b.from[1] + b.to[1]) / 2;
  const len = Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]);
  const ang = Math.atan2(b.to[1] - b.from[1], b.to[0] - b.from[0]);
  return box(cx, cz, len / 2, b.width / 2 + extra, ang);
}

interface Run { pts: P2[]; closed: boolean; key: number }

/** Split a closed loop into maximal runs of identical (non-zero) key. Runs meet at edge midpoints. */
function splitByKey(loop: P2[], key: number[]): Run[] {
  const n = loop.length;
  if (key.every((k) => k === key[0])) return key[0] ? [{ pts: loop.slice(), closed: true, key: key[0] }] : [];
  let start = 0;
  for (let i = 0; i < n; i++) if (key[i] !== key[(i - 1 + n) % n]) { start = i; break; }
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n;
    const kk = k === n ? -999 : key[i];
    if (cur && kk !== cur.key) {
      const p = loop[i], prev = loop[(i - 1 + n) % n];
      cur.pts.push([(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2]);
      if (cur.key) runs.push(cur);
      cur = null;
    }
    if (k === n) break;
    if (!cur) {
      const prev = loop[(i - 1 + n) % n], p = loop[i];
      cur = { pts: [[(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2], p], closed: false, key: kk };
    } else cur.pts.push(loop[i]);
  }
  return runs.filter((r) => r.pts.length >= 2);
}

function arcTable(pts: P2[], closed: boolean) {
  const L = [0];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    L.push(L[L.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const at = (s: number): P2 => {
    s = Math.max(0, Math.min(L[L.length - 1], s));
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (L[mid] <= s) lo = mid; else hi = mid;
    }
    const a = pts[lo % n], b = pts[(lo + 1) % n];
    const t = (s - L[lo]) / Math.max(1e-9, L[lo + 1] - L[lo]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  return { total: L[L.length - 1], at };
}

export function buildHole(def: HoleDef, style: CourseStyle): HoleBuild {
  const group = new THREE.Group();
  group.name = 'hole-' + def.id;
  const tb = new TriMeshBuilder();
  const rng = new Rng(def.seed ?? hashString(def.id));
  const updaters: ((t: number, dt: number) => void)[] = [];
  const disposables: { dispose(): void }[] = [];

  const turfMat = makeTurfMaterial({ a: style.turfA, b: style.turfB });
  const sandMat = makeSandMaterial(style.sand);
  const glideMat = makeTurfMaterial({ a: 0x7fd6e8, b: 0x66c3d8 });
  const stoneMat = makeStoneMaterial({ moss: 0.55 });
  const plinthMat = makeStoneMaterial({ vertexColors: true, moss: 0.4, scale: 0.7 });
  const woodMat = makeWoodMaterial(0xffffff, { vertexColors: true });
  disposables.push(turfMat, sandMat, glideMat, stoneMat, plinthMat, woodMat);

  const pieces = def.pieces.map((p) => ({ def: p, h: (typeof p.height === 'function' ? p.height : ((v: number) => () => v)(p.height ?? 1)) as HeightFn }));
  const cupPiece = pieces.findIndex((p) => p.def.shape.f(def.cup[0], def.cup[1]) < -0.5);
  if (cupPiece < 0) throw new Error(`Hole ${def.id}: cup not inside any piece`);
  const teePiece = pieces.findIndex((p) => p.def.shape.f(def.tee[0], def.tee[1]) < -0.2);
  if (teePiece < 0) throw new Error(`Hole ${def.id}: tee not inside any piece`);

  const wallSegs: number[] = []; // x0 z0 x1 z1
  const wallPosts: { x: number; y: number; z: number; nx: number; nz: number }[] = [];
  const aoCircles: [number, number, number][] = [];
  const stoneInst: { m: THREE.Matrix4; c: THREE.Color; v: number }[] = [];
  const woodGB = { pos: [] as number[], nrm: [] as number[], col: [] as number[], idx: [] as number[] };
  const plinthGeo = { pos: [] as number[], col: [] as number[], idx: [] as number[] };
  const turfMeshes: { mesh: THREE.Mesh; positions: Float32Array; geo: THREE.BufferGeometry }[] = [];
  const stoneColor = new THREE.Color(style.stone);
  const plinthColor = new THREE.Color(style.plinth);

  const addBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, color: THREE.Color, pitch = 0, roll = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const base = woodGB.pos.length / 3;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      woodGB.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      woodGB.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      woodGB.col.push(color.r, color.g, color.b);
      void U;
    }
    const I = g.index!;
    for (let i = 0; i < I.count; i++) woodGB.idx.push(base + I.getX(i));
    g.dispose();
  };

  // ---------------------------------------------------------------- pieces
  pieces.forEach((piece, pi) => {
    const p: PieceDef = piece.def;
    const h = piece.h;
    const wallH = p.wallHeight ?? WALL_H;
    const wallT = p.wallThickness ?? WALL_T;
    const bridgeZones = (p.bridges ?? []).map((b) => bridgeZone(b, 0));
    const bridgeWallZones = (p.bridges ?? []).map((b) => bridgeZone(b, 1.2));
    const cut = pi === cupPiece ? { x: def.cup[0], z: def.cup[1], r: CUP_R } : undefined;
    const turf = buildTurfMesh(p.shape, h, CELL, cut);

    // classify triangles
    const P = turf.positions;
    const I = turf.index;
    const groups: number[][] = [[], [], []]; // turf, sand, glide
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
      const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
      let mat: number = Mat.Turf;
      let grp = 0;
      if (inZones(bridgeZones, cx, cz)) { mat = Mat.Wood; grp = -1; }
      else if (inZones(p.sand, cx, cz)) { mat = Mat.Sand; grp = 1; }
      else if (inZones(p.glide, cx, cz)) { mat = Mat.Glide; grp = 2; }
      tb.addTri(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], P[c * 3], P[c * 3 + 1], P[c * 3 + 2], mat);
      if (grp >= 0) groups[grp].push(a, b, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(turf.normals, 3));
    const ck = new Float32Array((P.length / 3) * 2);
    const csize = p.checker?.size ?? 0.95;
    const cang = p.checker?.angle ?? 0;
    const cc = Math.cos(cang), cs = Math.sin(cang);
    for (let v = 0; v < P.length / 3; v++) {
      const x = P[v * 3], z = P[v * 3 + 2];
      ck[v * 2] = (x * cc + z * cs) / csize;
      ck[v * 2 + 1] = (-x * cs + z * cc) / csize;
    }
    geo.setAttribute('aChecker', new THREE.BufferAttribute(ck, 2));
    geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(P.length / 3).fill(1), 1));
    const idx: number[] = [];
    let start = 0;
    groups.forEach((g, gi) => {
      if (!g.length) return;
      for (const v of g) idx.push(v);
      geo.addGroup(start, g.length, gi);
      start += g.length;
    });
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, [turfMat, sandMat, glideMat]);
    mesh.receiveShadow = true;
    group.add(mesh);
    turfMeshes.push({ mesh, positions: P, geo });

    // ---------------------------------------------------------- loops: walls, base, edges
    for (const loop of turf.loops) {
      const n = loop.length;
      const key = loop.map(([x, z]) => {
        if (inZones(p.open, x, z, 0.02)) return 0;
        if (inZones(p.woodWalls, x, z) || inZones(bridgeWallZones, x, z)) return 2;
        return 1;
      });
      const walled = key.map((k) => k !== 0);
      const runs = splitByKey(loop, key);
      for (const run of runs) {
        const isWood = run.key === 2;
        const H = isWood ? Math.min(wallH, 0.36) : wallH;
        const T = isWood ? 0.16 : wallT;
        addWallCollider(tb, { pts: run.pts, closed: run.closed, height: H, thickness: T, style: isWood ? 'wood' : 'stone' }, h, isWood ? Mat.WoodWall : Mat.Stone);
        const segN = run.closed ? run.pts.length : run.pts.length - 1;
        for (let s = 0; s < segN; s++) {
          const a = run.pts[s], b = run.pts[(s + 1) % run.pts.length];
          wallSegs.push(a[0], a[1], b[0], b[1]);
        }
        if (isWood) placeWoodCurb(run, h, H, rng, addBox, style);
        else {
          placeStones(run, h, H, T, rng, stoneInst, stoneColor);
          // candidate decoration posts along the wall top
          const { total, at } = arcTable(run.pts, run.closed);
          const spacing = 7.5;
          for (let sp = spacing * 0.5; sp < total - 1; sp += spacing) {
            const a = at(sp - 0.2), b = at(sp + 0.2), c = at(sp);
            const dx = b[0] - a[0], dz = b[1] - a[1];
            const l = Math.hypot(dx, dz) || 1;
            const nx = dz / l, nz = -dx / l;
            wallPosts.push({ x: c[0] + nx * T * 0.5, y: h(c[0], c[1]) + H, z: c[1] + nz * T * 0.5, nx, nz });
          }
        }
      }

      // ---- rock base (plinth) + turf edge band ----
      const nrm = outwardNormals(loop, true);
      const offs = walled.map((w) => (w ? wallT * 0.92 : 0));
      const hasBase = loop.map(([x, z]) => !inZones(p.noBase, x, z, 0.1) && !inZones(bridgeZones, x, z, 0.15));
      const bottom = p.baseBottom ?? -1.6;
      const seed = pi * 17.3;
      const rings = (hTop: number) => {
        const out: { y: number; o: number; c: number }[] = [];
        out.push({ y: hTop, o: 0, c: 0 });
        out.push({ y: hTop - 0.1, o: 0, c: 0 });
        const span = hTop - 0.1 - bottom;
        const K = Math.max(2, Math.ceil(span / 0.45));
        for (let k = 0; k <= K; k++) out.push({ y: hTop - 0.1 - (span * k) / K, o: 1, c: 1 });
        return out;
      };
      // Build skirt per segment (segments whose both ends have a base)
      const ringData = loop.map((pt, i) => {
        const hTop = h(pt[0], pt[1]);
        return rings(hTop).map((r, k) => {
          const t = k < 2 ? 0 : (k - 2) / Math.max(1, rings(hTop).length - 3);
          let o = r.o === 0 ? (walled[i] ? offs[i] : 0) : offs[i] + t * 0.55 + (k >= 2 ? (noise.noise3(pt[0] * 0.55 + seed, r.y * 0.8, pt[1] * 0.55) * 0.3 + noise.noise3(pt[0] * 1.7, r.y * 2.1, pt[1] * 1.7 - seed) * 0.08) * Math.min(1, t * 4 + 0.25) : 0);
          if (walled[i] && k === 1) o = offs[i];
          const x = pt[0] + nrm[i][0] * o, z = pt[1] + nrm[i][1] * o;
          return { x, y: r.y, z, c: r.c, open: !walled[i] };
        });
      });
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (!hasBase[i] || !hasBase[j]) continue;
        const A = ringData[i], B = ringData[j];
        const K = Math.min(A.length, B.length);
        for (let k = 0; k < K - 1; k++) {
          const a0 = A[k], a1 = A[k + 1], b0 = B[k], b1 = B[k + 1];
          const base = plinthGeo.pos.length / 3;
          for (const v of [a0, b0, b1, a1]) {
            plinthGeo.pos.push(v.x, v.y, v.z);
            let c: THREE.Color;
            if (v.c === 0) c = v.open ? new THREE.Color(0x3d6a26) : plinthColor.clone().multiplyScalar(0.7);
            else {
              const tt = THREE.MathUtils.clamp((v.y - bottom) / 3, 0, 1);
              c = plinthColor.clone().multiplyScalar(0.55 + tt * 0.5);
            }
            plinthGeo.col.push(c.r, c.g, c.b);
          }
          plinthGeo.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          // collider for open edges only (rock face you can bounce/fall against)
          if (k >= 1 && !walled[i] && !walled[j]) {
            tb.addTri(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, Mat.Rock);
            tb.addTri(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z, Mat.Rock);
          }
        }
        // ledge under walls (between turf edge and stones' back)
        if (walled[i] && walled[j]) {
          const ha = h(loop[i][0], loop[i][1]) - 0.06, hb = h(loop[j][0], loop[j][1]) - 0.06;
          const base = plinthGeo.pos.length / 3;
          const ao = offs[i], bo = offs[j];
          const pts = [
            [loop[i][0], ha, loop[i][1]],
            [loop[j][0], hb, loop[j][1]],
            [loop[j][0] + nrm[j][0] * bo, hb, loop[j][1] + nrm[j][1] * bo],
            [loop[i][0] + nrm[i][0] * ao, ha, loop[i][1] + nrm[i][1] * ao],
          ];
          for (const v of pts) {
            plinthGeo.pos.push(v[0], v[1], v[2]);
            const c = plinthColor.clone().multiplyScalar(0.5);
            plinthGeo.col.push(c.r, c.g, c.b);
          }
          plinthGeo.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
      }
    }

    // ---- bridges: planks + beams + posts + rope (visual) ----
    for (const b of p.bridges ?? []) buildBridgeVisual(b, h, addBox, rng, group, disposables, style);
  });

  // ---------------------------------------------------------------- cup
  const cupY = pieces[cupPiece].h(def.cup[0], def.cup[1]);
  const cupPos = new THREE.Vector3(def.cup[0], cupY, def.cup[1]);
  {
    const N = 40;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const x0 = cupPos.x + Math.cos(a0) * CUP_R, z0 = cupPos.z + Math.sin(a0) * CUP_R;
      const x1 = cupPos.x + Math.cos(a1) * CUP_R, z1 = cupPos.z + Math.sin(a1) * CUP_R;
      const yb = cupY - CUP_DEPTH;
      tb.addTri(x0, cupY, z0, x1, cupY, z1, x1, yb, z1, Mat.Cup);
      tb.addTri(x0, cupY, z0, x1, yb, z1, x0, yb, z0, Mat.Cup);
      tb.addTri(cupPos.x, yb, cupPos.z, x0, yb, z0, x1, yb, z1, Mat.Cup);
    }
    const cg = new THREE.CylinderGeometry(CUP_R, CUP_R, CUP_DEPTH, 48, 6, true);
    const cols: number[] = [];
    const cp = cg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i) + CUP_DEPTH / 2; // 0 bottom .. depth top
      const t = y / CUP_DEPTH;
      const c = t > 0.86 ? new THREE.Color(0xf4f4f0) : new THREE.Color(0x2b2f33).multiplyScalar(0.3 + t * 0.7);
      cols.push(c.r, c.g, c.b);
    }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const cupMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.BackSide });
    const cupMesh = new THREE.Mesh(cg, cupMat);
    cupMesh.position.set(cupPos.x, cupY - CUP_DEPTH / 2, cupPos.z);
    cupMesh.receiveShadow = true;
    group.add(cupMesh);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 40), new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.9 }));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(cupPos.x, cupY - CUP_DEPTH + 0.002, cupPos.z);
    group.add(bottom);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(CUP_R - 0.002, CUP_R + 0.045, 56),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(cupPos.x, cupY + 0.003, cupPos.z);
    rim.receiveShadow = true;
    group.add(rim);
    disposables.push(cg, cupMat);
  }
  const flag = new Flag(cupPos.x, cupY, cupPos.z, style.flag);
  group.add(flag.group);
  updaters.push((_t, dt) => flag.update(dt));

  // ---------------------------------------------------------------- tee
  const teeY = pieces[teePiece].h(def.tee[0], def.tee[1]);
  const teePos = new THREE.Vector3(def.tee[0], teeY + BALL_R, def.tee[1]);
  {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 40),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(def.tee[0], teeY + 0.004, def.tee[1]);
    group.add(ring);
  }

  // ---------------------------------------------------------------- obstacles
  const world = new PhysicsWorld(null as unknown as TriMesh);
  const octx: ObstacleContext = { def, tb, group, world, updaters, aoCircles, rng, heightAt: (x, z) => sampleHeight(x, z), disposables, style };
  const sampleHeight = (x: number, z: number) => {
    let best = -Infinity;
    for (const pc of pieces) if (pc.def.shape.f(x, z) < 0.3) best = Math.max(best, pc.h(x, z));
    return best === -Infinity ? 0 : best;
  };
  const bumpers = buildObstacles(octx);

  // ---------------------------------------------------------------- stones (instanced)
  const stoneGeos = stoneBlockGeos();
  for (let v = 0; v < stoneGeos.length; v++) {
    const list = stoneInst.filter((s) => s.v === v);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(stoneGeos[v], stoneMat, list.length);
    list.forEach((s, i) => {
      im.setMatrixAt(i, s.m);
      im.setColorAt(i, s.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.userData.minorCaster = true;
    im.computeBoundingSphere();
    group.add(im);
  }

  // wood (curbs, bridge planks)
  if (woodGB.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(woodGB.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(woodGB.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(woodGB.col, 3));
    // planar UVs along dominant axes for grain
    const uv: number[] = [];
    for (let i = 0; i < woodGB.pos.length; i += 3) {
      const nx = Math.abs(woodGB.nrm[i]), ny = Math.abs(woodGB.nrm[i + 1]);
      const x = woodGB.pos[i], y = woodGB.pos[i + 1], z = woodGB.pos[i + 2];
      if (ny > 0.7) uv.push(x * 0.6, z * 0.6);
      else if (nx > 0.7) uv.push(z * 0.6, y * 0.6);
      else uv.push(x * 0.6, y * 0.6);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(woodGB.idx);
    const m = new THREE.Mesh(g, woodMat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    disposables.push(g);
  }

  // plinths
  if (plinthGeo.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(plinthGeo.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(plinthGeo.col, 3));
    g.setIndex(plinthGeo.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, plinthMat);
    m.receiveShadow = true;
    m.castShadow = true;
    m.userData.minorCaster = true;
    group.add(m);
    disposables.push(g);
  }

  // ---------------------------------------------------------------- AO on turf
  {
    const cell = 1.0;
    const grid = new Map<string, number[]>();
    const segCount = wallSegs.length / 4;
    for (let s = 0; s < segCount; s++) {
      const x0 = wallSegs[s * 4], z0 = wallSegs[s * 4 + 1], x1 = wallSegs[s * 4 + 2], z1 = wallSegs[s * 4 + 3];
      const i0 = Math.floor((Math.min(x0, x1) - 1.2) / cell), i1 = Math.floor((Math.max(x0, x1) + 1.2) / cell);
      const j0 = Math.floor((Math.min(z0, z1) - 1.2) / cell), j1 = Math.floor((Math.max(z0, z1) + 1.2) / cell);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = i + ',' + j;
          let arr = grid.get(k);
          if (!arr) grid.set(k, (arr = []));
          arr.push(s);
        }
    }
    for (const tm of turfMeshes) {
      const P = tm.positions;
      const ao = tm.geo.getAttribute('aAO') as THREE.BufferAttribute;
      for (let v = 0; v < P.length / 3; v++) {
        const x = P[v * 3], z = P[v * 3 + 2];
        let d = 9;
        const arr = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell));
        if (arr) for (const s of arr) d = Math.min(d, segmentDist(x, z, wallSegs[s * 4], wallSegs[s * 4 + 1], wallSegs[s * 4 + 2], wallSegs[s * 4 + 3]));
        for (const [cx, cz, r] of aoCircles) d = Math.min(d, Math.max(0, Math.hypot(x - cx, z - cz) - r) * 1.3);
        const dc = Math.hypot(x - cupPos.x, z - cupPos.z) - CUP_R;
        ao.setX(v, Math.min(Math.min(1, d / 0.85), 0.55 + Math.min(1, dc / 0.25) * 0.45));
      }
      ao.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- physics world
  const staticMesh = tb.build(1);
  world.static = staticMesh;
  world.cup = { x: cupPos.x, y: cupY, z: cupPos.z, r: CUP_R, depth: CUP_DEPTH };
  for (const hz of def.hazards ?? []) world.hazards.push({ sdf: hz.shape.f, y: hz.y, kind: hz.kind });
  for (const lv of def.lava ?? []) world.hazards.push({ sdf: lv.shape.f, y: lv.y + 0.05, kind: 'lava' });
  for (const pl of def.pools ?? []) world.hazards.push({ sdf: pl.shape.f, y: pl.y - 0.05, kind: 'water' });
  world.waterY = 0;
  world.killY = -4;

  const footprint = bakeSDFMulti(union(...def.pieces.map((p) => p.shape)));
  const bounds = new THREE.Box3(
    new THREE.Vector3(footprint.b[0] - 1, -2, footprint.b[1] - 1),
    new THREE.Vector3(footprint.b[2] + 1, staticMesh.bmax[1] + 2, footprint.b[3] + 1),
  );

  const surfaceY = (x: number, z: number, fromY = 100) => raycastDown(staticMesh, x, z, fromY, 0.3);

  return {
    def,
    group,
    world,
    tee: teePos,
    cup: cupPos,
    flag,
    bounds,
    footprint,
    pieces: pieces.map((p) => ({ shape: bakeSDF(p.def.shape, 0.5, 4), h: p.h })),
    staticMesh,
    surfaceY,
    updaters,
    aoCircles,
    wallPosts,
    bumpers,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
}

// ------------------------------------------------------------------------------------------
function placeStones(run: Run, h: HeightFn, H: number, T: number, rng: Rng, out: { m: THREE.Matrix4; c: THREE.Color; v: number }[], base: THREE.Color) {
  const { total, at } = arcTable(run.pts, run.closed);
  let s = 0;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  while (s < total - 0.02) {
    let len = rng.range(0.55, 0.9);
    if (total - s - len < 0.35) len = total - s;
    // shrink on tight curves
    for (let tries = 0; tries < 3; tries++) {
      const a = at(s), b = at(s + len), mid = at(s + len / 2);
      const dev = Math.hypot(mid[0] - (a[0] + b[0]) / 2, mid[1] - (a[1] + b[1]) / 2);
      if (dev < 0.05 || len < 0.3) break;
      len *= 0.6;
    }
    const a = at(s), b = at(s + len), mid = at(s + len / 2);
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const cl = Math.hypot(dx, dz) || 1e-6;
    const ox = dz / cl, oz = -dx / cl; // outward
    const t = T * rng.range(0.92, 1.08);
    const cx = (a[0] + b[0]) / 2 + ox * (t / 2), cz = (a[1] + b[1]) / 2 + oz * (t / 2);
    const ha = h(a[0], a[1]), hb = h(b[0], b[1]), hm = h(mid[0], mid[1]);
    const top = Math.max(ha, hb, hm) + H + rng.range(-0.015, 0.07);
    const bot = Math.min(ha, hb, hm) - 0.3;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    e.set(rng.range(-0.03, 0.03), yaw + rng.range(-0.03, 0.03), rng.range(-0.04, 0.04), 'YXZ');
    q.setFromEuler(e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, (top + bot) / 2, cz), q, new THREE.Vector3(Math.max(cl, 0.2) * 1.04 + 0.04, top - bot, t));
    const c = base.clone().multiplyScalar(rng.range(0.78, 1.18));
    c.offsetHSL(rng.range(-0.01, 0.01), 0, 0);
    out.push({ m, c, v: rng.int(0, 4) });
    s += len;
  }
}

type AddBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, color: THREE.Color, pitch?: number, roll?: number) => void;

function placeWoodCurb(run: Run, h: HeightFn, H: number, rng: Rng, addBox: AddBox, style: CourseStyle) {
  const { total, at } = arcTable(run.pts, run.closed);
  const segL = 0.9;
  const nSeg = Math.max(1, Math.round(total / segL));
  const woodC = new THREE.Color(style.wood);
  for (let k = 0; k < nSeg; k++) {
    const s0 = (k / nSeg) * total, s1 = ((k + 1) / nSeg) * total;
    const a = at(s0), b = at(s1);
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    const ox = dz / L, oz = -dx / L;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    const ya = h(a[0], a[1]), yb = h(b[0], b[1]);
    const y = (ya + yb) / 2;
    const pitch = 0;
    const roll = Math.atan2(yb - ya, L);
    const c = woodC.clone().multiplyScalar(rng.range(0.85, 1.1));
    addBox((a[0] + b[0]) / 2 + ox * 0.08, y + (H - 0.12) / 2, (a[1] + b[1]) / 2 + oz * 0.08, L + 0.02, H + 0.12, 0.16, yaw, c, pitch, -roll);
  }
}

function buildBridgeVisual(b: BridgeDef, h: HeightFn, addBox: AddBox, rng: Rng, group: THREE.Group, disposables: { dispose(): void }[], style: CourseStyle) {
  const dx = b.to[0] - b.from[0], dz = b.to[1] - b.from[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const px = -uz, pz = ux; // across
  const yaw = Math.atan2(dx, dz);
  const plankW = 0.3;
  const n = Math.floor(len / (plankW + 0.03));
  const woodC = new THREE.Color(style.wood);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * (len / n);
    const cx = b.from[0] + ux * s, cz = b.from[1] + uz * s;
    const y = h(cx, cz);
    const c = woodC.clone().multiplyScalar(rng.range(0.8, 1.15));
    addBox(cx + px * rng.range(-0.04, 0.04), y - 0.045, cz + pz * rng.range(-0.04, 0.04), b.width + 0.25, 0.1, plankW, yaw, c, 0, rng.range(-0.015, 0.015));
  }
  // beams under the planks
  for (const side of [-1, 1]) {
    const ox = px * side * (b.width / 2 - 0.1), oz = pz * side * (b.width / 2 - 0.1);
    const segs = Math.max(1, Math.round(len / 1.0));
    for (let k = 0; k < segs; k++) {
      const s0 = (k / segs) * len, s1 = ((k + 1) / segs) * len;
      const x0 = b.from[0] + ux * s0 + ox, z0 = b.from[1] + uz * s0 + oz;
      const x1 = b.from[0] + ux * s1 + ox, z1 = b.from[1] + uz * s1 + oz;
      const y0 = h(x0, z0), y1 = h(x1, z1);
      addBox((x0 + x1) / 2, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2, 0.18, 0.22, s1 - s0 + 0.02, yaw, woodC.clone().multiplyScalar(0.7), Math.atan2(y0 - y1, s1 - s0));
    }
  }
  // posts with rope wraps + rope railing
  const postS = [0.15, len / 2, len - 0.15];
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.9 });
  disposables.push(ropeMat);
  for (const side of [-1, 1]) {
    const tops: THREE.Vector3[] = [];
    for (const s of postS) {
      const cx = b.from[0] + ux * s + px * side * (b.width / 2 + 0.22), cz = b.from[1] + uz * s + pz * side * (b.width / 2 + 0.22);
      const y = h(b.from[0] + ux * s, b.from[1] + uz * s);
      addBox(cx, y - 0.225, cz, 0.2, 2.75, 0.2, yaw, woodC.clone().multiplyScalar(0.8));
      tops.push(new THREE.Vector3(cx, y + 1.02, cz));
      // rope coil
      for (let r = 0; r < 3; r++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12), ropeMat);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(cx, y + 0.86 + r * 0.07, cz);
        group.add(coil);
      }
    }
    // sagging rope between posts
    for (let k = 0; k < tops.length - 1; k++) {
      const a = tops[k], c = tops[k + 1];
      const mid = a.clone().lerp(c, 0.5);
      mid.y -= 0.22;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, c);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.03, 5, false), ropeMat);
      tube.castShadow = true;
      group.add(tube);
    }
  }
}
