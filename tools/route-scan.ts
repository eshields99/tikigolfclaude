// Scan tee shots on a hole and tally where they go: which tunnel / geyser they use, aces, hazards.
// Usage: npx tsx tools/route-scan.ts <holeId> [x z]
import { COURSES } from '../src/course/courses';
import { buildHole } from '../src/course/builder';
import { NavField, simulateShot } from '../src/game/ai';

const [id, sx, sz] = process.argv.slice(2);
const def = COURSES.flatMap((c) => c.holes.map((h) => ({ c, h }))).find((x) => x.h.id === id)!;
const hole = buildHole(def.h, def.c.style);
hole.world.terrainHeight = null;
const nav = new NavField(hole);
const x = sx !== undefined ? +sx : hole.tee.x, z = sz !== undefined ? +sz : hole.tee.z;
const y = hole.surfaceY(x, z) + 0.2;
const tally = new Map<string, { n: number; aces: number; hz: number; dsum: number; ex: string }>();
// tag the route by intercepting events through a wrapped world.step
let tag = '';
const orig = hole.world.step.bind(hole.world);
hole.world.step = (b, t, dt, ev) => orig(b, t, dt, {
  ...(ev ?? {}),
  tunnel: (p: string, i: number) => { if (p === 'in') tag = (tag ? tag + '+' : '') + 'tunnel' + i; },
  geyser: (i: number) => { tag = (tag ? tag + '+' : '') + 'geyser' + i; },
  water: () => { if (!tag.includes('creek')) tag = (tag ? tag + '+' : '') + 'creek'; },
});
for (let a = 0; a < 360; a += 1)
  for (let sp = 2; sp <= 18.5; sp += 0.5) {
    tag = '';
    const r = simulateShot(hole.world, x, y, z, Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), sp, 0, 14, 1 / 120);
    const k = tag || 'direct';
    let e = tally.get(k);
    if (!e) tally.set(k, (e = { n: 0, aces: 0, hz: 0, dsum: 0, ex: '' }));
    e.n++;
    if (r.holed) { e.aces++; if (!e.ex) e.ex = `a=${a} sp=${sp}`; }
    else if (r.hazard) e.hz++;
    else e.dsum += Math.min(60, nav.at(r.x, r.z));
  }
for (const [k, e] of [...tally].sort((p, q) => q[1].n - p[1].n))
  console.log(`${k.padEnd(22)} shots ${String(e.n).padStart(5)}  aces ${String(e.aces).padStart(4)}  hazards ${String(e.hz).padStart(4)}  avg nav left ${(e.dsum / Math.max(1, e.n - e.aces - e.hz)).toFixed(1)}  ${e.ex}`);
