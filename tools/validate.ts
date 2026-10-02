// Headless hole validation: builds each hole, then plays it with the AI planner (no noise) to find
// a plausible minimum number of strokes, and reports hole-in-one possibilities.
import { COURSES } from '../src/course/courses';
import { buildHole } from '../src/course/builder';
import { NavField, ShotSearch, simulateShot } from '../src/game/ai';
import { BALL_R } from '../src/physics/world';

const only = process.argv[2];
for (const c of COURSES) {
  for (const def of c.holes) {
    if (only && def.id !== only) continue;
    const t0 = performance.now();
    const hole = buildHole(def, c.style);
    hole.world.terrainHeight = null;
    const nav = new NavField(hole);
    const tb = performance.now() - t0;
    let pos = { x: hole.tee.x, y: hole.tee.y, z: hole.tee.z };
    let strokes = 0;
    let holed = false;
    const log: string[] = [];
    let tSim = 0;
    while (strokes < 8 && !holed) {
      const s = new ShotSearch(hole.world, nav, pos.x, pos.y, pos.z, tSim, { angles: 72, powers: 14 });
      while (!s.done) s.step(1000);
      const p = s.best!;
      strokes++;
      // replay at full resolution
      const r = simulateShot(hole.world, pos.x, pos.y, pos.z, p.dx, p.dz, p.speed, tSim);
      log.push(`  shot ${strokes}: speed ${p.speed.toFixed(1)} dir ${(Math.atan2(p.dz, p.dx) * 180 / Math.PI).toFixed(0)} -> ${r.holed ? 'HOLED' : r.hazard ? 'HAZARD' : `(${r.x.toFixed(1)},${r.z.toFixed(1)}) d=${nav.at(r.x, r.z).toFixed(1)}`} [planned score ${p.score.toFixed(1)}]`);
      tSim += r.time + 3;
      if (r.hazard) continue;
      if (r.holed) holed = true;
      else pos = { x: r.x, y: r.y, z: r.z };
    }
    // ace scan: how many tee shots hole out
    let aces = 0, total = 0;
    for (let a = 0; a < 360; a += 1)
      for (let sp = 2; sp <= 18.5; sp += 0.5) {
        total++;
        const r = simulateShot(hole.world, hole.tee.x, hole.tee.y, hole.tee.z, Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), sp, 0, 14, 1 / 120);
        if (r.holed) aces++;
      }
    console.log(`${c.name} / ${def.name} (par ${def.par}) built ${tb.toFixed(0)}ms, tris ${hole.staticMesh.count}, bot strokes ${holed ? strokes : 'FAILED'}, ace shots ${aces}/${total}, tee-to-cup nav ${nav.at(hole.tee.x, hole.tee.z).toFixed(1)}`);
    console.log(log.join('\n'));
    void BALL_R;
  }
}
