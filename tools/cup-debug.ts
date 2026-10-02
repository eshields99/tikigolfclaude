import { box } from '../src/core/sdf';
import { buildTurfMesh } from '../src/course/turfmesh';
import { TriMeshBuilder } from '../src/physics/trimesh';
import { Ball, PhysicsWorld, PHYS_DT, BALL_R } from '../src/physics/world';
import { Mat } from '../src/physics/surfaces';
const region = box(0, 0, 2, 16, 0, 0.6);
const h = () => 0;
const cup = { x: 0, z: -12, r: 0.42 };
const turf = buildTurfMesh(region, h, 0.25, cup);
const tb = new TriMeshBuilder();
tb.addIndexed(turf.positions, turf.index, Mat.Turf);
const N = 32, D = 0.55;
for (let k = 0; k < N; k++) {
  const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
  const x0 = cup.x + Math.cos(a0) * cup.r, z0 = cup.z + Math.sin(a0) * cup.r;
  const x1 = cup.x + Math.cos(a1) * cup.r, z1 = cup.z + Math.sin(a1) * cup.r;
  tb.addTri(x0, 0, z0, x1, 0, z1, x1, -D, z1, Mat.Cup);
  tb.addTri(x0, 0, z0, x1, -D, z1, x0, -D, z0, Mat.Cup);
  tb.addTri(cup.x, -D, cup.z, x0, -D, z0, x1, -D, z1, Mat.Cup);
}
const world = new PhysicsWorld(tb.build(1));
world.cup = { x: cup.x, y: 0, z: cup.z, r: cup.r, depth: D };
world.waterY = -10;
world.cupAssist = +(process.argv[4] ?? 0);
const b = new Ball();
const off = +(process.argv[2] ?? 0.3), sp = +(process.argv[3] ?? 14);
b.set(off, BALL_R, -10.8);
b.launch(0, -1, sp);
let t = 0;
const ev = { holed: () => console.log('HOLED at', t.toFixed(3)), impact: (s: number, m: number, g: boolean, x: number, y: number, z: number) => console.log(`  impact ${s.toFixed(2)} mat ${m} ground ${g} t=${t.toFixed(3)} contact ${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)} ball ${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)} v ${b.vx.toFixed(2)},${b.vy.toFixed(2)},${b.vz.toFixed(2)}`) };
let k = 0;
while (!b.atRest && t < 5) {
  world.step(b, t, PHYS_DT, ev);
  t += PHYS_DT;
  if (k++ % 6 === 0 && Math.abs(b.z + 12) < 1.5) console.log(`t=${t.toFixed(3)} p=${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)} v=${b.vx.toFixed(2)},${b.vy.toFixed(2)},${b.vz.toFixed(2)} g=${b.grounded}`);
}
console.log('end', b.x.toFixed(3), b.y.toFixed(3), b.z.toFixed(3), 'holed', b.holed);
