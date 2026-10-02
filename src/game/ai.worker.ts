// AI planning off the main thread: the worker rebuilds the hole's physics from the course data and
// answers shot requests with full-speed simulation, so rivals never cost frames.
import { COURSES } from '../course/courses';
import { buildHole } from '../course/builder';
import { NavField, ShotSearch, noiseFor } from './ai';
import { Rng } from '../core/math';
import type { PhysicsWorld } from '../physics/world';
import type { PowerUp } from './powerups';

export interface WorkerHoleMsg { type: 'hole'; course: string; index: number }
export interface WorkerPlanMsg {
  type: 'plan';
  id: number;
  hole: string;
  x: number; y: number; z: number;
  t0: number;
  angles: number;
  powers: number;
  pu: PowerUp | null;
  skill: number;
  seed: number;
}
export interface WorkerPlanResult { type: 'plan'; id: number; ok: boolean; dx: number; dz: number; speed: number; pu: PowerUp | null }

const ctx = self as unknown as Worker;
let current: { key: string; world: PhysicsWorld; nav: NavField } | null = null;

function load(course: string, index: number) {
  const key = `${course}:${index}`;
  if (current?.key === key) return current;
  const c = COURSES.find((x) => x.id === course);
  if (!c) return null;
  const hole = buildHole(c.holes[index], c.style);
  hole.world.terrainHeight = null; // off-course balls fall into the water instead
  current = { key, world: hole.world, nav: new NavField(hole) };
  return current;
}

ctx.onmessage = (e: MessageEvent<WorkerHoleMsg | WorkerPlanMsg>) => {
  const m = e.data;
  if (m.type === 'hole') {
    load(m.course, m.index);
    return;
  }
  if (m.type === 'plan') {
    const [course, idx] = m.hole.split(':');
    const h = load(course, +idx);
    if (!h) {
      ctx.postMessage({ type: 'plan', id: m.id, ok: false, dx: 0, dz: -1, speed: 1, pu: null } satisfies WorkerPlanResult);
      return;
    }
    const search = new ShotSearch(h.world, h.nav, m.x, m.y, m.z, m.t0, { angles: m.angles, powers: m.powers }, m.pu, noiseFor(m.skill, new Rng(m.seed), 4));
    while (!search.done) search.step(64);
    const b = search.best;
    ctx.postMessage({ type: 'plan', id: m.id, ok: !!b, dx: b?.dx ?? 0, dz: b?.dz ?? -1, speed: b?.speed ?? 1, pu: b?.pu ?? null } satisfies WorkerPlanResult);
  }
};
