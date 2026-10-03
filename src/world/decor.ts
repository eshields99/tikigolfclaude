// Scatters vegetation, rocks, tiki statues and torches around a hole (all instanced).
import * as THREE from 'three';
import type { HoleBuild } from '../course/builder';
import type { IslandBuild } from './island';
import type { EnvPreset } from './environment';
import type { DecorDef } from '../course/types';
import { Rng, hashString } from '../core/math';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { palmGeo, fernGeo, leafPlantGeo, flowerBushGeo, boulderGeo, tikiGeo, torchGeo, hutGeo, jungleTreeGeo, spireGeo, canoeGeo, surfboardGeo, TORCH_TOP } from './props';
import { makeFoliageMaterial, makeVertexColorMaterial } from '../render/materials';
import { getRockMaterial, getTikiMaterial } from '../course/obstacles';
import { FlameField } from '../render/fx';
import { lanternGeo, bambooPoleGeo, bungalowGeo, bungalowGlowGeo } from './lagoonProps';
import { sharedUniforms } from '../render/materials';

export type Theme = 'beach' | 'jungle' | 'volcano' | 'lagoon';

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
  const lanternStrings: { pts: THREE.Vector3[]; seed: number }[] = [];
  const bungalows: THREE.Matrix4[] = [];
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
      case 'lanterns': {
        const h = d.h ?? 2.6;
        const pts = d.pts.map(([x, z]) => {
          const y = groundY(x, z);
          add('pole' + h.toFixed(2), x, y - 0.05, z, rng.range(0, 6.28), 1);
          occupy(x, z, 0.5);
          return new THREE.Vector3(x, y + h - 0.12, z);
        });
        lanternStrings.push({ pts, seed: d.seed ?? lanternStrings.length });
        break;
      }
      case 'bungalow': {
        const [x, z] = d.at;
        const sc = d.scale ?? 1;
        bungalows.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.rot ?? 0, 0)), new THREE.Vector3(sc, sc, sc)));
        occupy(x, z, 5 * sc);
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- torches on walls
  const posts = hole.wallPosts;
  const torchEvery = theme === 'volcano' ? 1 : 2;
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
  const density = hole.def.island?.jungle ?? (theme === 'jungle' ? 1 : theme === 'volcano' ? 0.55 : theme === 'lagoon' ? 0.85 : 0.75);
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
  // pass 1b: beach life — canoes pulled up on the sand and surfboards stuck upright
  if (theme !== 'volcano') {
    let canoes = 0, boards = 0;
    const maxCanoes = theme === 'beach' ? 2 : 1, maxBoards = theme === 'beach' ? 4 : 0;
    for (const { x, z, y, cd, inland } of cells) {
      if (y < 0.02 || y > 0.6 || inland < 0.4 || inland > 2.2 || cd < 4) continue;
      const p = rng.next();
      // coastline normal from the land SDF gradient (points out to sea)
      const e = 0.5;
      const gx = island.landSDF(x + e, z) - island.landSDF(x - e, z);
      const gz = island.landSDF(x, z + e) - island.landSDF(x, z - e);
      const seaYaw = Math.atan2(gx, gz);
      if (canoes < maxCanoes && p < 0.04 && free(x, z, 3)) {
        // canoe lies along the shore line (its +X across the sea direction)
        add('canoe' + rng.int(0, 2), x, y - 0.05, z, seaYaw + rng.range(-0.3, 0.3), 1);
        occupy(x, z, 3);
        canoes++;
      } else if (boards < maxBoards && p < 0.08 && free(x, z, 1.6)) {
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const d = (k - (n - 1) / 2) * 0.55; // spaced along the shoreline
          const ox = Math.cos(seaYaw) * d, oz = -Math.sin(seaYaw) * d;
          q.setFromEuler(new THREE.Euler(rng.range(-0.18, 0.05), seaYaw + rng.range(-0.25, 0.25), rng.range(-0.12, 0.12), 'YXZ'));
          insts.push({ key: 'surf' + rng.int(0, 5), m: new THREE.Matrix4().compose(new THREE.Vector3(x + ox, y - 0.25, z + oz), q, new THREE.Vector3(1, 1, 1)) });
        }
        occupy(x, z, 1.6);
        boards++;
      }
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
    else if (key.startsWith('canoe')) { geo = canoeGeo(+key.slice(5)); mat = getTikiMaterial(); }
    else if (key.startsWith('surf')) { geo = surfboardGeo(+key.slice(4)); mat = m.propMat; }
    else if (key === 'hut') { geo = hutGeo(); mat = m.propMat; }
    else if (key.startsWith('pole')) { geo = bambooPoleGeo(+key.slice(4)); mat = m.propMat; }
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

  // ---------------------------------------------------------------- lantern strings & bungalows
  const extra: { dispose(): void }[] = [];
  if (lanternStrings.length) {
    const lanterns: { p: THREE.Vector3; c: THREE.Color; s: number }[] = [];
    const ropes: THREE.BufferGeometry[] = [];
    const palette = [0xff8a3a, 0xffc24a, 0xff5a6a, 0xff9fd0, 0xffe08a, 0x9fe8ff];
    for (const st of lanternStrings) {
      const lr = new Rng(hashString(hole.def.id + 'lan' + st.seed));
      for (let i = 0; i < st.pts.length - 1; i++) {
        const a = st.pts[i], b = st.pts[i + 1];
        const len = a.distanceTo(b);
        const sag = Math.min(0.9, 0.12 + len * 0.07);
        const at = (t: number) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
        const curve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => at(k / 8)));
        ropes.push(new THREE.TubeGeometry(curve, 16, 0.014, 4, false));
        const n = Math.max(1, Math.round(len / 1.15));
        for (let k = 0; k < n; k++) {
          const p = at((k + 0.5) / n);
          lanterns.push({ p, c: new THREE.Color(palette[lr.int(0, palette.length - 1)]), s: lr.range(0.85, 1.2) });
        }
      }
    }
    if (ropes.length) {
      const rg = mergeGeometries(ropes);
      const rm = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
      group.add(new THREE.Mesh(rg, rm));
      extra.push(rg, rm);
      for (const r of ropes) r.dispose();
    }
    const lmat = makeLanternMaterial();
    const im = new THREE.InstancedMesh(lanternGeo(), lmat, lanterns.length);
    lanterns.forEach((l, i) => {
      im.setMatrixAt(i, new THREE.Matrix4().compose(l.p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6.28), 0)), new THREE.Vector3(l.s, l.s, l.s)));
      im.setColorAt(i, l.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    extra.push(lmat);
    // every few lanterns lends its glow to the torch light pool
    lanterns.forEach((l, i) => {
      if (i % 3 === 1) torchPositions.push(l.p.clone().add(new THREE.Vector3(0, -0.6, 0)));
    });
  }
  if (bungalows.length) {
    const bm = new THREE.InstancedMesh(bungalowGeo(), m.propMat, bungalows.length);
    const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35a).multiplyScalar(2.2) });
    const gl = new THREE.InstancedMesh(bungalowGlowGeo(), gm, bungalows.length);
    bungalows.forEach((mt, i) => {
      bm.setMatrixAt(i, mt);
      gl.setMatrixAt(i, mt);
    });
    bm.castShadow = true;
    bm.receiveShadow = true;
    bm.computeBoundingSphere();
    gl.computeBoundingSphere();
    group.add(bm, gl);
    extra.push(gm);
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
      for (const e of extra) e.dispose();
    },
  };
}

/** Paper lanterns: unlit, glowing brighter where you look straight through the paper, gently swaying. */
function makeLanternMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: { uTime: sharedUniforms.uTime, uNight: sharedUniforms.uNight },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vC; varying float vG; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 p = position;
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = ip.x * 0.7 + ip.z * 0.43;
        float sw = sin(uTime * 1.3 + ph) * 0.06;
        p.x -= p.y * sw;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #else
          vC = vec3(1.0, 0.6, 0.3);
        #endif
        vG = color.r;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uNight;
      varying vec3 vC; varying float vG; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float flick = 0.92 + 0.08 * sin(uTime * 9.0 + vC.g * 37.0);
        float glow = vG * (0.5 + 0.5 * facing) * flick;
        vec3 col = vC * glow * mix(1.0, 2.4, uNight) + vC * 0.05;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
