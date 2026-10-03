// Headless checks for the Lantern Lagoon mechanics: tiki tunnels, blowholes, gusts and creek currents.
import { buildHole } from '../src/course/builder';
import type { HoleDef } from '../src/course/types';
import { box, path, union } from '../src/core/sdf';
import { funnel, sum } from '../src/course/helpers';
import { Ball, PHYS_DT, gustStrength } from '../src/physics/world';

const style = { turfA: 0x63c832, turfB: 0x4caf27, stone: 0x5b5754, plinth: 0x57514d, sand: 0xf1d9a0, wood: 0xa0703f, flag: 0xe0242c };
let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`);
  if (!ok) failed++;
};

function run(world: ReturnType<typeof buildHole>['world'], b: Ball, t0: number, maxT: number, ev: object = {}) {
  let t = 0;
  while (!b.atRest && t < maxT) {
    world.step(b, t0 + t, PHYS_DT, ev);
    t += PHYS_DT;
  }
  return t;
}

// ------------------------------------------------------------------ tunnel
{
  const def: HoleDef = {
    id: 'mt1', name: 'tunnel test', par: 2, tee: [0, 10], cup: [12, -8],
    pieces: [{ shape: union(box(0, 2, 3, 10), box(12, -4, 3, 7)), height: 1 }],
    obstacles: [{ type: 'tunnel', at: [0, -6], dir: -Math.PI / 2, to: [12, 3], toDir: -Math.PI / 2 }],
  };
  const h = buildHole(def, style);
  h.world.terrainHeight = null;
  const b = new Ball();
  b.set(0, 1.2, 8);
  b.launch(0, -1, 12);
  let tin = -1, tout = -1, tAt = 0;
  const ev = { tunnel: (p: string) => (p === 'in' ? (tin = tAt) : (tout = tAt)) };
  let t = 0;
  while (!b.atRest && t < 12) {
    tAt = t;
    h.world.step(b, t, PHYS_DT, ev);
    t += PHYS_DT;
  }
  const tf = h.tunnels[0];
  check('tunnel swallows a straight putt', tin > 0, `in at ${tin.toFixed(2)}s`);
  check('tunnel spits it out after the transit', tout > tin, `out at ${tout.toFixed(2)}s`);
  check('ball ends up past the exit, heading -z', b.z < tf.exit.z - 1 && Math.abs(b.x - 12) < 1.2, `rest (${b.x.toFixed(2)}, ${b.z.toFixed(2)}), exit z ${tf.exit.z.toFixed(2)}`);
  // a putt aimed at the cheek must bounce off, not enter
  const c = new Ball();
  c.set(0.95, 1.2, 0);
  c.launch(0, -1, 10);
  let swallowed = false;
  run(h.world, c, 0, 10, { tunnel: () => (swallowed = true) });
  check('putt into the cheek bounces off', !swallowed, `rest (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
}

// ------------------------------------------------------------------ geyser
{
  const vent: [number, number] = [0, 0];
  const def: HoleDef = {
    id: 'mt2', name: 'geyser test', par: 2, tee: [0, 8], cup: [0, -16],
    pieces: [
      { shape: box(0, 2, 3, 8), height: sum(1, funnel(vent[0], vent[1], 2.0, 0.6)) },
      { shape: box(0, -15, 3, 3.5), height: 4 },
    ],
    obstacles: [{ type: 'geyser', at: vent, target: [0, -14], apex: 8, period: 3.5, burst: 0.4 }],
  };
  const h = buildHole(def, style);
  h.world.terrainHeight = null;
  const b = new Ball();
  b.set(0, 1.2, 6);
  b.launch(0, -1, 6.5);
  let launched = -1, tAt = 0;
  let t = 0;
  while (!b.atRest && t < 14) {
    tAt = t;
    h.world.step(b, t, PHYS_DT, { geyser: () => (launched = tAt) });
    t += PHYS_DT;
  }
  check('ball settles in the vent and gets launched', launched > 0, `launch at ${launched.toFixed(2)}s`);
  check('blowhole lands it on the upper deck near the target', b.holed || (Math.abs(b.z + 14) < 2.6 && b.y > 4), `rest (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)})${b.holed ? ' (holed!)' : ''}`);
}

// ------------------------------------------------------------------ gust
{
  const zone = box(0, 0, 4, 4);
  const def: HoleDef = {
    id: 'mt3', name: 'gust test', par: 2, tee: [0, 10], cup: [0, -12],
    pieces: [{ shape: box(0, -1, 6, 13), height: 1 }],
    obstacles: [{ type: 'gust', shape: zone, dir: 0, strength: 2.4, period: 4, blow: 2.2, phase: 0 }],
  };
  const h = buildHole(def, style);
  h.world.terrainHeight = null;
  const g = h.world.gusts[0];
  check('gust blows at t=1 and is calm at t=3', gustStrength(g, 1) > 0.9 && gustStrength(g, 3) === 0);
  const roll = (t0: number, speed: number) => {
    const b = new Ball();
    b.set(0, 1.2, 3.9);
    b.launch(0, -1, speed);
    run(h.world, b, t0, 10);
    return b.x;
  };
  const slow = roll(0.3, 7), calm = roll(2.3, 7), fast = roll(0.3, 15);
  check('a putt through the gust is pushed downwind', slow > 0.5 && Math.abs(calm) < 0.05, `drift windy ${slow.toFixed(2)} / calm ${calm.toFixed(2)}`);
  check('a firm putt punches through with less drift', fast < slow && fast > 0, `drift ${fast.toFixed(2)}`);
}

// ------------------------------------------------------------------ creek
{
  const creek: [number, number][] = [
    [-8, 0],
    [0, 0],
    [6, -4],
  ];
  const surface = 0.7;
  const def: HoleDef = {
    id: 'mt4', name: 'creek test', par: 2, tee: [-8, 6], cup: [10, -10],
    pieces: [
      { shape: union(box(-8, 6, 2.5, 3), box(10, -9, 3, 3)), height: 1.4 },
      { shape: union(path(creek, 2.6), box(9, -5.5, 2.5, 1.6)), height: (x: number, z: number) => (x > 7 ? 0.45 + Math.min(0.9, (x - 7) * 0.4) : 0.45), bed: [path(creek, 2.6)], open: [box(9, -5.5, 2.6, 1.7)] },
    ],
    streams: [{ path: creek, width: 2.6, speed: 4, surface }],
  };
  const h = buildHole(def, style);
  h.world.terrainHeight = null;
  const b = new Ball();
  b.set(-6, 0.45 + 0.2, 0.3);
  b.launch(1, 0, 0.5);
  let splashed = false;
  const t = run(h.world, b, 0, 20, { water: () => (splashed = true) });
  check('current carries the ball downstream to the end', b.x > 6, `rest (${b.x.toFixed(2)}, ${b.z.toFixed(2)}) after ${t.toFixed(1)}s`);
  void splashed;
}

console.log(failed ? `${failed} check(s) failed` : 'all mechanics checks passed');
process.exit(failed ? 1 : 0);
