import { box } from '../src/core/sdf';
import { buildTurfMesh } from '../src/course/turfmesh';
import { splitRuns, addWallCollider } from '../src/course/walls';
import { TriMeshBuilder } from '../src/physics/trimesh';
import { Ball, PhysicsWorld, PHYS_DT, BALL_R } from '../src/physics/world';
import { Mat } from '../src/physics/surfaces';

const region = box(0, 0, 2, 16, 0, 0.6);
const h = (_x: number, _z: number) => 0;
const cup = { x: 0, z: -12, r: 0.42 };
const t0 = performance.now();
const turf = buildTurfMesh(region, h, 0.25, cup);
console.log('turf verts', turf.positions.length / 3, 'tris', turf.index.length / 3, 'loops', turf.loops.length, turf.loops.map((l) => l.length), 'ms', (performance.now() - t0).toFixed(1));
const tb = new TriMeshBuilder();
tb.addIndexed(turf.positions, turf.index, Mat.Turf);
for (const loop of turf.loops) for (const run of splitRuns(loop, loop.map(() => true))) addWallCollider(tb, { ...run, height: 0.45, thickness: 0.5, style: 'stone' }, h, Mat.Stone);
// cup cylinder
const N = 32, D = 0.55;
for (let k = 0; k < N; k++) {
  const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
  const x0 = cup.x + Math.cos(a0) * cup.r, z0 = cup.z + Math.sin(a0) * cup.r;
  const x1 = cup.x + Math.cos(a1) * cup.r, z1 = cup.z + Math.sin(a1) * cup.r;
  tb.addTri(x0, 0, z0, x1, 0, z1, x1, -D, z1, Mat.Cup);
  tb.addTri(x0, 0, z0, x1, -D, z1, x0, -D, z0, Mat.Cup);
  tb.addTri(cup.x, -D, cup.z, x0, -D, z0, x1, -D, z1, Mat.Cup);
}
const mesh = tb.build(1);
console.log('collider tris', mesh.count);
const world = new PhysicsWorld(mesh);
world.cup = { x: cup.x, y: 0, z: cup.z, r: cup.r, depth: D };
world.waterY = -10;

function shoot(sx: number, sz: number, dx: number, dz: number, speed: number, log = false) {
  const b = new Ball();
  b.set(sx, BALL_R, sz);
  b.launch(dx, dz, speed);
  let t = 0;
  let holedAt = -1;
  let passed = false;
  const ev = { holed: () => { if (!passed) holedAt = t; }, impact: (s: number, m: number, g: boolean) => { if (log) console.log(`  impact ${s.toFixed(2)} mat ${m} ground ${g} at t=${t.toFixed(2)} pos ${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}`); } };
  let steps = 0;
  while (!b.atRest && t < 40) { world.step(b, t, PHYS_DT, ev); t += PHYS_DT; steps++; if (b.z < -12.9) passed = true; }
  return { x: b.x, y: b.y, z: b.z, t, holedAt, steps, holed: holedAt >= 0 };
}

// rolling distances (shoot along +x? region is 4 wide; shoot along -z from z=14)
for (const sp of [2, 4, 6, 8, 10, 12, 14, 16, 18]) {
  const r = shoot(1.0, 15, 0, -1, sp);
  console.log(`speed ${sp}: traveled ${(15 - r.z).toFixed(2)} in ${r.t.toFixed(2)}s y=${r.y.toFixed(3)}`);
}
// cup capture test: shoot from 1.2 units before the cup so arrival speed ~ launch speed
for (const assist of [0, 0.3, 0.6]) {
  world.cupAssist = assist;
  const row: string[] = [];
  for (const off of [0, 0.15, 0.3, 0.4]) {
    let maxSp = 0;
    for (let sp = 1; sp <= 14; sp += 0.25) {
      const r = shoot(off, -10.8, 0, -1, sp);
      if (r.holed) maxSp = sp; else if (maxSp > 0) break;
    }
    row.push(`off ${off}: max ${maxSp}`);
  }
  console.log(`assist ${assist}: ` + row.join(' | '));
}
world.cupAssist = 0.3;
// wall bounce test
const rb = shoot(0, 10, 1, -0.3, 10, true);
console.log('bounce end', rb);
// perf
const tp = performance.now();
let tot = 0;
for (let i = 0; i < 50; i++) tot += shoot(0, 14, Math.sin(i) * 0.3, -1, 16).steps;
const ms = performance.now() - tp;
console.log(`perf: ${tot} steps in ${ms.toFixed(1)}ms = ${((ms / tot) * 1000).toFixed(2)}us/step`);
