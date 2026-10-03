// Measures average AI strokes per hole at several skill levels (with the same shot noise as in game).
import { COURSES } from '../src/course/courses';
import { buildHole } from '../src/course/builder';
import { NavField, ShotSearch, simulateShot, jitterPlan, noiseFor } from '../src/game/ai';
import { Rng } from '../src/core/math';

const skills = (process.argv[2] ?? '0.4,0.6,0.8').split(',').map(Number);
const runs = +(process.argv[3] ?? 4);
const only = process.argv[4];
const rng = new Rng(7);
for (const c of COURSES) {
  for (const def of c.holes) {
    if (only && !def.id.startsWith(only)) continue;
    const hole = buildHole(def, c.style);
    hole.world.terrainHeight = null;
    const nav = new NavField(hole);
    const row: string[] = [];
    for (const skill of skills) {
      let total = 0;
      for (let r = 0; r < runs; r++) {
        let pos = { x: hole.tee.x, y: hole.tee.y, z: hole.tee.z };
        let strokes = 0, t = 0;
        while (strokes < 10) {
          const quality = 0.35 + skill * 0.65;
          const s = new ShotSearch(hole.world, nav, pos.x, pos.y, pos.z, t, { angles: Math.round(20 + quality * 16), powers: Math.round(5 + quality * 4) }, null, process.env.NAIVE ? null : noiseFor(skill, rng, 4));
          while (!s.done) s.step(1000);
          const p = jitterPlan(s.best!, skill, rng);
          strokes++;
          const res = simulateShot(hole.world, pos.x, pos.y, pos.z, p.dx, p.dz, p.speed, t + p.lag);
          t += res.time + 2.5;
          if (res.holed) break;
          if (res.hazard) { strokes++; continue; }
          pos = { x: res.x, y: res.y, z: res.z };
        }
        total += strokes;
      }
      row.push(`skill ${skill}: ${(total / runs).toFixed(1)}`);
    }
    console.log(`${def.name.padEnd(18)} par ${def.par} | ${row.join(' | ')}`);
  }
}
