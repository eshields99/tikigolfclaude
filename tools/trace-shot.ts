// Trace a single shot on a hole: prints events and where the ball comes to rest.
// Usage: npx tsx tools/trace-shot.ts <holeId> <dirDeg> <speed> [x z] [t0]
import { COURSES } from '../src/course/courses';
import { buildHole } from '../src/course/builder';
import { Ball, PHYS_DT } from '../src/physics/world';

const [id, dirDeg, speed, sx, sz, t0s] = process.argv.slice(2);
const def = COURSES.flatMap((c) => c.holes.map((h) => ({ c, h }))).find((x) => x.h.id === id);
if (!def) throw new Error('no hole ' + id);
const hole = buildHole(def.h, def.c.style);
hole.world.terrainHeight = null;
const b = new Ball();
const x = sx !== undefined ? +sx : hole.tee.x, z = sz !== undefined ? +sz : hole.tee.z;
b.set(x, hole.surfaceY(x, z) + 0.2, z);
const a = (+dirDeg * Math.PI) / 180;
b.launch(Math.cos(a), Math.sin(a), +speed);
b.grounded = true;
let t = 0;
const t0 = +(t0s ?? 0);
const log = (s: string) => console.log(`${t.toFixed(2)}s ${s} @ (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)})`);
const ev = {
  hazard: (k: string) => log('HAZARD ' + k),
  holed: () => log('HOLED'),
  tunnel: (p: string, i: number) => log(`tunnel ${i} ${p}`),
  geyser: (i: number) => log(`geyser ${i} launch`),
  water: () => log('splash into creek'),
};
let next = 1;
while (!b.atRest && t < 30) {
  hole.world.step(b, t0 + t, PHYS_DT, ev);
  t += PHYS_DT;
  if (t > next) { log(`speed ${b.speed.toFixed(1)}${b.inFlow ? ' (in current)' : ''}`); next += 1; }
}
log(b.holed ? 'end (holed)' : 'rest');
