// Scatters vegetation, rocks, tiki statues and torches around a hole (all instanced).
import * as THREE from 'three';
import type { HoleBuild } from '../course/builder';
import type { IslandBuild } from './island';
import type { EnvPreset } from './environment';
import type { DecorDef } from '../course/types';
import { Rng, hashString } from '../core/math';
import { palmGeo, fernGeo, leafPlantGeo, flowerBushGeo, boulderGeo, tikiGeo, torchGeo, hutGeo, jungleTreeGeo, spireGeo, TORCH_TOP } from './props';
import { makeFoliageMaterial, makeVertexColorMaterial } from '../render/materials';
import { getRockMaterial, getTikiMaterial } from '../course/obstacles';
import { FlameField } from '../render/fx';

export type Theme = 'beach' | 'jungle' | 'volcano';

export interface DecorBuild {
  group: THREE.Group;
  flames: FlameField | null;
  torchPositions: THREE.Vector3[];
  updaters: ((t: number, dt: number) => void)[];
  dispose(): void;
}

interface Inst { key: string; m: THREE.Matrix4; c?: THREE.Color }

let foliageMat: THREE.MeshStandardMaterial | null = null;
let palmMat: THREE.MeshStandardMaterial | null = null;
let propMat: THREE.MeshStandardMaterial | null = null;
const mats = () => {
  if (!foliageMat) foliageMat = makeFoliageMaterial({ windScale: 0.6 });
  if (!palmMat) palmMat = makeFoliageMaterial({ windScale: 1.0 });
  if (!propMat) propMat = makeVertexColorMaterial({ roughness: 0.75 });
  return { foliageMat, palmMat, propMat };
};

export function buildDecor(hole: HoleBuild, island: IslandBuild, preset: EnvPreset, theme: Theme, detail = 1, exclude: { f(x: number, z: number): number }[] = []): DecorBuild {
  const group = new THREE.Group();
  const rng = new Rng(hashString(hole.def.id + 'decor'));
  const insts: Inst[] = [];
  const torchPositions: THREE.Vector3[] = [];
  const flamePts: { p: THREE.Vector3; s: number }[] = [];
  const fp = hole.footprint;
  void preset;

  const occupied: [number, number, number][] = [];
  const free = (x: number, z: number, r: number) => {
    for (const [ox, oz, or] of occupied) if ((ox - x) ** 2 + (oz - z) ** 2 < (or + r) ** 2) return false;
    return true;
  };
  const occupy = (x: number, z: number, r: number) => occupied.push([x, z, r]);
  const groundY = (x: number, z: number) => {
    // course turf if inside a piece, otherwise the island terrain (never wall tops)
    let best = -Infinity;
    for (const pc of hole.pieces) if (pc.shape.f(x, z) < -0.05) best = Math.max(best, pc.h(x, z));
    const t = island.heightAt(x, z);
    return best === -Infinity ? t : Math.max(best, t);
  };
  const q = new THREE.Quaternion();
  const add = (key: string, x: number, y: number, z: number, rot: number, s: number | THREE.Vector3, c?: THREE.Color) => {
    q.setFromEuler(new THREE.Euler(0, rot, 0));
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
    insts.push({ key, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, sc), c });
  };

  // ---------------------------------------------------------------- hand placed decor
  for (const d of hole.def.decor ?? []) placeDecor(d);
  function placeDecor(d: DecorDef) {
    switch (d.type) {
      case 'palm': {
        const [x, z] = d.at;
        add('palm' + rng.int(0, 3), x, d.y ?? groundY(x, z) - 0.1, z, d.rot ?? rng.range(0, 6.28), d.scale ?? rng.range(0.9, 1.15));
        occupy(x, z, 2.5);
        break;
      }
      case 'tiki': {
        const [x, z] = d.at;
        add('tiki' + (d.variant ?? 0), x, d.y ?? groundY(x, z) - 0.05, z, d.rot ?? 0, d.scale ?? 1);
        occupy(x, z, 1.2 * (d.scale ?? 1));
        break;
      }
      case 'torch': {
        const [x, z] = d.at;
        const y = d.y ?? groundY(x, z);
        const s = d.h ?? 1;
        add('torch', x, y, z, rng.range(0, 6), s);
        const fpnt = new THREE.Vector3(x, y + TORCH_TOP * s, z);
        torchPositions.push(fpnt);
        flamePts.push({ p: fpnt, s: 0.85 * s });
        occupy(x, z, 0.5);
        break;
      }
      case 'hut': {
        const [x, z] = d.at;
        add('hut', x, d.y ?? groundY(x, z) - 0.1, z, d.rot ?? 0, d.scale ?? 1);
        occupy(x, z, 3 * (d.scale ?? 1));
        break;
      }
      case 'rock': {
        const [x, z] = d.at;
        const hh = d.h ?? d.r * 0.75;
        add('rock' + ((d.seed ?? rng.int(0, 5)) % 6), x, d.y ?? groundY(x, z) - hh * 0.25, z, rng.range(0, 6.28), new THREE.Vector3(d.r, hh, d.r));
        occupy(x, z, d.r);
        break;
      }
      case 'fern': {
        const [x, z] = d.at;
        add('fern' + rng.int(0, 2), x, d.y ?? groundY(x, z), z, rng.range(0, 6.28), d.scale ?? rng.range(0.8, 1.2));
        occupy(x, z, 0.8);
        break;
      }
      case 'flowers': {
        const [x, z] = d.at;
        add('flower' + rng.int(0, 4), x, d.y ?? groundY(x, z), z, rng.range(0, 6.28), d.scale ?? rng.range(0.9, 1.3));
        occupy(x, z, 0.7);
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- torches on walls
  const posts = hole.wallPosts;
  const torchEvery = theme === 'volcano' ? 1 : theme === 'jungle' ? 2 : 2;
  posts.forEach((p, i) => {
    if (i % torchEvery !== 0) return;
    if (!free(p.x, p.z, 1.2)) return;
    add('torch', p.x, p.y - 0.05, p.z, rng.range(0, 6), 0.9);
    const fpnt = new THREE.Vector3(p.x, p.y - 0.05 + TORCH_TOP * 0.9, p.z);
    torchPositions.push(fpnt);
    flamePts.push({ p: fpnt, s: 0.78 });
    occupy(p.x, p.z, 1.5);
  });

  // ---------------------------------------------------------------- scatter
  // Two passes over a jittered grid: big trees first (so they get clearance), then rocks & undergrowth.
  const half = island.half;
  const cx = island.center.x, cz = island.center.y;
  const step = 1.15;
  const density = hole.def.island?.jungle ?? (theme === 'jungle' ? 1 : theme === 'volcano' ? 0.55 : 0.75);
  interface Cell { x: number; z: number; y: number; cd: number; inland: number }
  const cells: Cell[] = [];
  for (let gz = -half + 4; gz < half - 4; gz += step) {
    for (let gx = -half + 4; gx < half - 4; gx += step) {
      const x = cx + gx + rng.range(-0.5, 0.5), z = cz + gz + rng.range(-0.5, 0.5);
      const cd = fp.f(x, z);
      if (cd < 0.75) continue;
      let excluded = false;
      for (const e of exclude) if (e.f(x, z) < 1.2) { excluded = true; break; }
      if (excluded) continue;
      if (Math.hypot(x - cx, z - cz) > half - 6) continue;
      cells.push({ x, z, y: island.heightAt(x, z), cd, inland: -island.landSDF(x, z) });
    }
  }
  // pass 1: trees & spires
  for (const { x, z, y, cd, inland } of cells) {
    if (y < -0.05) continue;
    const p = rng.next();
    if (theme === 'jungle' && cd > 5.2 && inland > 1.2 && p < 0.1 && free(x, z, 3.0)) {
      add('jtree' + rng.int(0, 3), x, y - 0.15, z, rng.range(0, 6.28), rng.range(0.85, 1.2));
      occupy(x, z, 3.2);
    } else if (theme === 'volcano' && cd > 3.5 && inland > 1.5 && p < 0.03 && free(x, z, 2.2)) {
      const sc = rng.range(0.6, 1.3);
      add('spire' + rng.int(0, 3), x, y - 0.3, z, rng.range(0, 6.28), new THREE.Vector3(sc, sc * rng.range(0.9, 1.5), sc));
      occupy(x, z, 2.2 * sc);
    } else if (cd > 3.2 && inland > 0.6 && p < 0.05 * (theme === 'volcano' ? 0.5 : 1.2) && free(x, z, 3.0)) {
      add('palm' + rng.int(0, 3), x, y - 0.1, z, rng.range(0, 6.28), rng.range(0.85, 1.2));
      occupy(x, z, 3.0);
    }
  }
  // pass 2: shallows rocks, undergrowth and boulders
  for (const { x, z, y, cd, inland } of cells) {
    if (y < -0.05) {
      // rocks poking out of the shallows, especially around the course bases
      if (y > -1.4 && rng.next() < (cd < 3 ? 0.1 : 0.02) && free(x, z, 1.2)) {
        const r = rng.range(0.7, 1.7);
        const hh = r * rng.range(0.7, 1.05);
        const top = rng.range(0.25, 0.9);
        add('rock' + rng.int(0, 5), x, top - hh * 0.75, z, rng.range(0, 6.28), new THREE.Vector3(r, hh, r));
        island.stamp(x, z, r * 0.8, 0.3);
        occupy(x, z, r);
      }
      continue;
    }
    if (inland < 1.2 && cd > 2) continue; // keep beaches open
    // plants hug the walls; undergrowth is denser around tree trunks
    const nearWall = cd < 2.4;
    const chance = (nearWall ? 0.55 : 0.2) * density * detail;
    if (rng.next() > chance) continue;
    const r2 = rng.next();
    if (theme === 'volcano' && r2 < 0.25) {
      if (free(x, z, 0.8)) {
        const r = rng.range(0.4, 1.1);
        add('rock' + rng.int(0, 5), x, y - r * 0.25, z, rng.range(0, 6.28), new THREE.Vector3(r, r * 0.8, r));
        occupy(x, z, r);
      }
      continue;
    }
    if (r2 < 0.38) {
      if (free(x, z, 0.7)) { add('fern' + rng.int(0, 2), x, y, z, rng.range(0, 6.28), rng.range(0.7, 1.25)); occupy(x, z, 0.7); }
    } else if (r2 < 0.62) {
      if (free(x, z, 0.8)) { add('leaf' + rng.int(0, 2), x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.3)); occupy(x, z, 0.8); }
    } else if (r2 < 0.82) {
      if (free(x, z, 0.6)) { add('flower' + rng.int(0, 4), x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.3)); occupy(x, z, 0.6); }
    } else if (free(x, z, 0.7)) {
      const r = rng.range(0.35, 0.8);
      add('rock' + rng.int(0, 5), x, y - r * 0.3, z, rng.range(0, 6.28), new THREE.Vector3(r, r * 0.7, r));
      occupy(x, z, r);
    }
  }

  // ---------------------------------------------------------------- build instanced meshes
  const m = mats();
  const byKey = new Map<string, Inst[]>();
  for (const it of insts) {
    let arr = byKey.get(it.key);
    if (!arr) byKey.set(it.key, (arr = []));
    arr.push(it);
  }
  for (const [key, list] of byKey) {
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;
    let cast = true;
    if (key.startsWith('palm')) { geo = palmGeo(+key.slice(4)); mat = m.palmMat; }
    else if (key.startsWith('jtree')) { geo = jungleTreeGeo(+key.slice(5)); mat = m.palmMat; }
    else if (key.startsWith('spire')) { geo = spireGeo(+key.slice(5)); mat = getRockMaterial(); }
    else if (key.startsWith('fern')) { geo = fernGeo(+key.slice(4)); mat = m.foliageMat; cast = false; }
    else if (key.startsWith('leaf')) { geo = leafPlantGeo(+key.slice(4)); mat = m.foliageMat; cast = false; }
    else if (key.startsWith('flower')) { geo = flowerBushGeo(+key.slice(6)); mat = m.foliageMat; cast = false; }
    else if (key.startsWith('rock')) { geo = boulderGeo(+key.slice(4) + 100, 2); mat = getRockMaterial(); }
    else if (key.startsWith('tiki')) { geo = tikiGeo(+key.slice(4)); mat = getTikiMaterial(); }
    else if (key === 'torch') { geo = torchGeo(); mat = m.propMat; }
    else if (key === 'hut') { geo = hutGeo(); mat = m.propMat; }
    else continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      if (it.c) im.setColorAt(i, it.c);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }

  let flames: FlameField | null = null;
  if (flamePts.length) {
    flames = new FlameField(flamePts);
    group.add(flames.mesh, flames.glow);
  }

  return {
    group,
    flames,
    torchPositions,
    updaters: [],
    dispose() {
      flames?.dispose();
    },
  };
}
