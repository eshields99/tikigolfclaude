// Course obstacles: boulders, tiki statues, bumpers, boost pads, ramps, spinners and sliders.
import * as THREE from 'three';
import type { HoleDef } from './types';
import type { CourseStyle } from './builder';
import { TriMeshBuilder } from '../physics/trimesh';
import { PhysicsWorld, makeKinematic, rotAxis, type Pose } from '../physics/world';
import { Mat } from '../physics/surfaces';
import { box } from '../core/sdf';
import type { Rng } from '../core/math';
import { boulderGeo, tikiGeo } from '../world/props';
import { makeStoneMaterial, makeCarvedWoodMaterial, makeWoodMaterial, sharedUniforms } from '../render/materials';
import { GeoBuilder, M } from '../world/geo';

export interface ObstacleContext {
  def: HoleDef;
  tb: TriMeshBuilder;
  group: THREE.Group;
  world: PhysicsWorld;
  updaters: ((t: number, dt: number) => void)[];
  aoCircles: [number, number, number][];
  rng: Rng;
  heightAt: (x: number, z: number) => number;
  disposables: { dispose(): void }[];
  style: CourseStyle;
}

export interface BumperFx { x: number; z: number; mesh: THREE.Object3D; pulse: number }

let tikiMaterial: THREE.MeshStandardMaterial | null = null;
export function getTikiMaterial() {
  if (!tikiMaterial) {
    tikiMaterial = makeCarvedWoodMaterial();
  }
  return tikiMaterial;
}
let rockMaterial: THREE.MeshStandardMaterial | null = null;
export function getRockMaterial() {
  if (!rockMaterial) rockMaterial = makeStoneMaterial({ vertexColors: true, moss: 0.6, scale: 0.8 });
  return rockMaterial;
}

export function addGeoCollider(tb: TriMeshBuilder, geo: THREE.BufferGeometry, m: THREE.Matrix4, mat: number) {
  const pos = geo.getAttribute('position').array as ArrayLike<number>;
  const idx = geo.index ? (geo.index.array as ArrayLike<number>) : null;
  tb.addIndexed(pos, idx, mat, m.elements);
}

export function buildObstacles(ctx: ObstacleContext) {
  const { def, tb, group, world, updaters, aoCircles, rng, heightAt } = ctx;
  const bumpers: BumperFx[] = [];
  let boostId = 0;
  for (const o of def.obstacles ?? []) {
    switch (o.type) {
      case 'rock': {
        const [x, z] = o.at;
        const y = heightAt(x, z);
        const seed = o.seed ?? rng.int(0, 999);
        const hh = o.h ?? o.r * 0.8;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + hh * 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6.28), 0)), new THREE.Vector3(o.r, hh, o.r));
        const mesh = new THREE.Mesh(boulderGeo(seed, 3), getRockMaterial());
        mesh.applyMatrix4(m);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        addGeoCollider(tb, boulderGeo(seed, 1), m, Mat.Rock);
        aoCircles.push([x, z, o.r * 0.9]);
        break;
      }
      case 'tiki': {
        const [x, z] = o.at;
        const y = heightAt(x, z);
        const s = o.scale ?? 1;
        const rot = o.rot ?? 0;
        const mesh = new THREE.Mesh(tikiGeo(o.variant ?? 0), getTikiMaterial());
        mesh.position.set(x, y - 0.05, z);
        mesh.rotation.y = rot;
        mesh.scale.setScalar(s);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        const col = new THREE.BoxGeometry(1.18, 2.6, 0.98);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.2 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(s, s, s));
        addGeoCollider(tb, col, m, Mat.WoodWall);
        col.dispose();
        aoCircles.push([x, z, 0.62 * s]);
        break;
      }
      case 'bumper': {
        const [x, z] = o.at;
        const y = heightAt(x, z);
        const r = o.r ?? 0.45;
        const gb = new GeoBuilder();
        gb.add(new THREE.CylinderGeometry(r, r * 1.05, 0.5, 24), M.compose(0, 0.25, 0), 0xc2452d);
        gb.add(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.04, 24), M.compose(0, 0.51, 0), 0xf1dfb0);
        gb.add(new THREE.TorusGeometry(r * 1.03, 0.06, 8, 28), M.compose(0, 0.27, 0, Math.PI / 2), 0xffc42e);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          gb.add(new THREE.BoxGeometry(0.05, 0.42, 0.05), M.compose(Math.cos(a) * r * 1.01, 0.26, Math.sin(a) * r * 1.01, 0, -a, 0.35), 0xe8d8a8);
        }
        const mesh = new THREE.Mesh(gb.build(), getTikiMaterial());
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        const cyl = new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.6, 24, 1, false);
        const m = new THREE.Matrix4().makeTranslation(x, y + 0.3, z);
        addGeoCollider(tb, cyl, m, Mat.Bumper);
        cyl.dispose();
        aoCircles.push([x, z, r]);
        const fx: BumperFx = { x, z, mesh, pulse: 0 };
        bumpers.push(fx);
        updaters.push((_t, dt) => {
          fx.pulse = Math.max(0, fx.pulse - dt * 3.5);
          const k = 1 + Math.sin(fx.pulse * Math.PI * 3) * fx.pulse * 0.18;
          mesh.scale.set(k, 2 - k, k);
        });
        break;
      }
      case 'boost': {
        const [x, z] = o.at;
        const y = heightAt(x, z);
        const len = o.len ?? 2.2, width = o.width ?? 1.4;
        const dx = Math.cos(o.dir), dz = Math.sin(o.dir);
        const sdf = box(x, z, len / 2, width / 2, o.dir);
        world.boosts.push({ sdf: sdf.f, yMin: y - 0.5, yMax: y + 0.8, dx, dz, speed: o.speed ?? 17, id: boostId++ });
        const geo = new THREE.PlaneGeometry(len, width, 1, 1);
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
          uniforms: { uTime: sharedUniforms.uTime },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `
            varying vec2 vUv; uniform float uTime;
            void main(){
              vec2 uv = vUv;
              float edge = smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.92, uv.y) * smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x);
              float x = uv.x * 3.0 - uTime * 2.2;
              float chev = fract(x - abs(uv.y - 0.5) * 1.1);
              float a = smoothstep(0.55, 0.6, chev) * smoothstep(0.95, 0.9, chev);
              vec3 c1 = vec3(1.0, 0.85, 0.2), c2 = vec3(1.0, 0.35, 0.08);
              vec3 col = mix(c2, c1, a);
              float alpha = (0.45 + a * 0.55) * edge;
              gl_FragColor = vec4(col * (1.2 + a * 1.6), alpha);
            }`,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -o.dir; // plane local x -> world dir
        mesh.position.set(x, y + 0.012, z);
        mesh.renderOrder = 2;
        group.add(mesh);
        ctx.disposables.push(geo, mat);
        break;
      }
      case 'ramp': {
        const [x, z] = o.at;
        const y0 = heightAt(x, z);
        const dx = Math.cos(o.dir), dz = Math.sin(o.dir);
        const px = -dz, pz = dx;
        const N = 12;
        const prof = (t: number) => (o.kicker ? Math.pow(t, 1.7) : t) * o.height;
        const w2 = o.width / 2;
        const pt = (t: number, side: number, yOff = 0): THREE.Vector3 =>
          new THREE.Vector3(x + dx * (t * o.len) + px * side * w2, y0 + prof(t) + yOff, z + dz * (t * o.len) + pz * side * w2);
        for (let i = 0; i < N; i++) {
          const t0 = i / N, t1 = (i + 1) / N;
          const a = pt(t0, -1), b = pt(t1, -1), c = pt(t1, 1), d = pt(t0, 1);
          tb.addTri(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, Mat.Wood);
          tb.addTri(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, Mat.Wood);
          // sides
          for (const sd of [-1, 1]) {
            const s0 = pt(t0, sd), s1 = pt(t1, sd);
            const s0b = new THREE.Vector3(s0.x, y0 - 0.05, s0.z), s1b = new THREE.Vector3(s1.x, y0 - 0.05, s1.z);
            tb.addTri(s0b.x, s0b.y, s0b.z, s1b.x, s1b.y, s1b.z, s1.x, s1.y, s1.z, Mat.WoodWall);
            tb.addTri(s0b.x, s0b.y, s0b.z, s1.x, s1.y, s1.z, s0.x, s0.y, s0.z, Mat.WoodWall);
          }
        }
        // back face
        const e1 = pt(1, -1), e2 = pt(1, 1);
        tb.addTri(e1.x, y0 - 0.05, e1.z, e2.x, y0 - 0.05, e2.z, e2.x, e2.y, e2.z, Mat.WoodWall);
        tb.addTri(e1.x, y0 - 0.05, e1.z, e2.x, e2.y, e2.z, e1.x, e1.y, e1.z, Mat.WoodWall);
        // visual: planks + side panels
        const gb = new GeoBuilder();
        const plankN = Math.max(4, Math.round(o.len / 0.32));
        const yaw = Math.atan2(dx, dz);
        const wood = new THREE.Color(ctx.style.wood);
        for (let i = 0; i < plankN; i++) {
          const t = (i + 0.5) / plankN;
          const tA = i / plankN, tB = (i + 1) / plankN;
          const slope = Math.atan2(prof(tB) - prof(tA), o.len / plankN);
          const c = pt(t, 0, -0.035);
          gb.add(new THREE.BoxGeometry(o.width + 0.08, 0.07, (o.len / plankN) * 1.04), M.compose(c.x, c.y, c.z, -slope, yaw, 0), wood.clone().multiplyScalar(rng.range(0.85, 1.12)));
        }
        for (const sd of [-1, 1]) {
          const shape = new THREE.Shape();
          shape.moveTo(0, -0.05);
          for (let i = 0; i <= N; i++) shape.lineTo((i / N) * o.len, prof(i / N) + 0.02);
          shape.lineTo(o.len, -0.05);
          const sg = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
          // shape x along dir, y up, extrude along local z (across)
          const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(px, 0, pz));
          m.setPosition(x + px * (sd * w2 - (sd > 0 ? 0 : 0.08)), y0, z + pz * (sd * w2 - (sd > 0 ? 0 : 0.08)));
          gb.add(sg, m, wood.clone().multiplyScalar(0.62));
        }
        const rampMat = makeWoodMaterial(0xffffff, { vertexColors: true });
        const g = gb.build();
        const uv: number[] = [];
        const P = g.getAttribute('position');
        for (let i = 0; i < P.count; i++) uv.push(P.getX(i) * 0.5 + P.getY(i) * 0.3, P.getZ(i) * 0.5);
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const mesh = new THREE.Mesh(g, rampMat);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        ctx.disposables.push(rampMat);
        break;
      }
      case 'spinner': {
        const [x, z] = o.at;
        const y = heightAt(x, z);
        const arms = o.arms ?? 2;
        const L = o.len;
        // static post
        const post = new THREE.CylinderGeometry(0.28, 0.32, 1.0, 16);
        addGeoCollider(tb, post, new THREE.Matrix4().makeTranslation(x, y + 0.5, z), Mat.WoodWall);
        // kinematic arms (local space)
        const ktb = new TriMeshBuilder();
        const armVis = new GeoBuilder();
        for (let k = 0; k < arms; k++) {
          const a = (k / arms) * Math.PI * 2;
          const bx = new THREE.BoxGeometry(L - 0.25, 0.26, 0.26);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * (0.25 + (L - 0.25) / 2), 0.24, -Math.sin(a) * (0.25 + (L - 0.25) / 2)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(1, 1, 1));
          addGeoCollider(ktb, bx, m, Mat.WoodWall);
          // visual: log with bands
          const log = new THREE.CylinderGeometry(0.14, 0.14, L - 0.25, 10);
          const lm = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * (0.25 + (L - 0.25) / 2), 0.24, -Math.sin(a) * (0.25 + (L - 0.25) / 2)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, Math.PI / 2)), new THREE.Vector3(1, 1, 1));
          armVis.add(log, lm, 0x8f5a2e);
          for (let b = 1; b < 4; b++) {
            const r = 0.25 + ((L - 0.25) * b) / 4;
            armVis.add(new THREE.TorusGeometry(0.145, 0.025, 6, 12), M.compose(Math.cos(a) * r, 0.24, -Math.sin(a) * r, 0, a + Math.PI / 2, 0), 0xe8c26a);
          }
          armVis.add(new THREE.SphereGeometry(0.16, 10, 8), M.compose(Math.cos(a) * L, 0.24, -Math.sin(a) * L), 0xd14a2c);
          bx.dispose();
        }
        const kmesh = ktb.build(0.5);
        const speed = o.speed, phase = o.phase ?? 0;
        world.addKinematic(
          makeKinematic('spinner', kmesh, (t: number, out: Pose) => {
            out.x = x; out.y = y; out.z = z;
            rotAxis(out.m, 0, 1, 0, phase + speed * t);
          }),
        );
        const armMesh = new THREE.Mesh(armVis.build(), getTikiMaterial());
        armMesh.position.set(x, y, z);
        armMesh.castShadow = true;
        group.add(armMesh);
        // decorative post with a little tiki head
        const pg = new GeoBuilder();
        pg.add(post, M.compose(0, 0.5, 0), 0x7a4a24);
        pg.add(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16), M.compose(0, 1.0, 0), 0xe8c26a);
        const postMesh = new THREE.Mesh(pg.build(), getTikiMaterial());
        postMesh.position.set(x, y, z);
        postMesh.castShadow = postMesh.receiveShadow = true;
        group.add(postMesh);
        const head = new THREE.Mesh(tikiGeo(0), getTikiMaterial());
        head.scale.setScalar(0.42);
        head.position.set(x, y + 0.95, z);
        head.castShadow = true;
        group.add(head);
        updaters.push((t) => {
          armMesh.rotation.y = phase + speed * t;
          head.rotation.y = phase + speed * t;
        });
        post.dispose();
        aoCircles.push([x, z, 0.35]);
        break;
      }
      case 'slider': {
        const [ax, az] = o.from, [bx, bz] = o.to;
        const y = heightAt((ax + bx) / 2, (az + bz) / 2);
        const [w, d] = o.size;
        const hgt = o.height ?? 0.6;
        const ktb = new TriMeshBuilder();
        const bg = new THREE.BoxGeometry(w, hgt, d);
        addGeoCollider(ktb, bg, new THREE.Matrix4().makeTranslation(0, hgt / 2, 0), Mat.Stone);
        const kmesh = ktb.build(0.5);
        const period = o.period, phase = o.phase ?? 0;
        const posAt = (t: number) => {
          const s = 0.5 - 0.5 * Math.cos(((t + phase) / period) * Math.PI * 2);
          return [ax + (bx - ax) * s, az + (bz - az) * s];
        };
        world.addKinematic(
          makeKinematic('slider', kmesh, (t: number, out: Pose) => {
            const [px, pz] = posAt(t);
            out.x = px; out.y = y; out.z = pz;
            out.m.fill(0); out.m[0] = out.m[4] = out.m[8] = 1;
          }),
        );
        const vis = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), makeStoneMaterial({ color: 0x8a8f99 }));
        vis.castShadow = vis.receiveShadow = true;
        group.add(vis);
        updaters.push((t) => {
          const [px, pz] = posAt(t);
          vis.position.set(px, y + hgt / 2, pz);
        });
        bg.dispose();
        break;
      }
      case 'planter': {
        const [x, z] = o.at;
        const y = heightAt(x + o.r + 0.6, z);
        const gb = new GeoBuilder();
        gb.add(new THREE.CylinderGeometry(o.r + 0.05, o.r + 0.05, 0.6, 32), M.compose(0, -0.2, 0), 0x4a3524);
        gb.add(new THREE.SphereGeometry(o.r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.compose(0, 0.08, 0, 0, 0, 0, 1, 0.18, 1), 0x3f7a2a);
        const mesh = new THREE.Mesh(gb.build(), getTikiMaterial());
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        group.add(mesh);
        if (!ctx.def.decor) ctx.def.decor = [];
        if (o.palm !== false && !ctx.def.decor.some((d) => d.type === 'palm' && d.at[0] === x && d.at[1] === z)) ctx.def.decor.push({ type: 'palm', at: [x, z], y: y + 0.1, scale: 0.85 });
        const n = Math.max(3, Math.round(o.r * 3));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.3;
          const fx = x + Math.cos(a) * o.r * 0.62, fz = z + Math.sin(a) * o.r * 0.62;
          if (!ctx.def.decor.some((d) => 'at' in d && d.at[0] === fx && d.at[1] === fz)) ctx.def.decor.push({ type: k % 2 ? 'flowers' : 'fern', at: [fx, fz], y: y + 0.1, scale: 0.7 });
        }
        break;
      }
    }
  }
  return bumpers;
}
