// AI shot planning: simulate candidate shots with the real physics and score the resting spot with a
// navigation distance field (geodesic distance to the cup over the course). Time-sliced for the browser.
import { Ball, PhysicsWorld, PHYS_DT, BALL_R } from '../physics/world';
import type { HoleBuild } from '../course/builder';
import type { HoleDef } from '../course/types';
import { Rng } from '../core/math';
import { applyPowerup, type PowerUp } from './powerups';

export const SPEED_MIN = 0.9;
export const SPEED_MAX = 18.5;

// ----------------------------------------------------------------------------------- nav field
export class NavField {
  x0: number; z0: number; nx: number; nz: number; cell: number;
  dist: Float64Array;
  height: Float32Array;
  walk: Uint8Array;

  constructor(hole: { def: HoleDef; pieces: { shape: { f(x: number, z: number): number }; h(x: number, z: number): number }[]; cup: { x: number; z: number }; bounds: { min: { x: number; z: number }; max: { x: number; z: number } } }, cell = 0.5) {
    this.cell = cell;
    this.x0 = hole.bounds.min.x - 1;
    this.z0 = hole.bounds.min.z - 1;
    this.nx = Math.ceil((hole.bounds.max.x + 1 - this.x0) / cell) + 1;
    this.nz = Math.ceil((hole.bounds.max.z + 1 - this.z0) / cell) + 1;
    const N = this.nx * this.nz;
    this.dist = new Float64Array(N).fill(Infinity);
    this.height = new Float32Array(N).fill(-99);
    this.walk = new Uint8Array(N);
    const margin = BALL_R + 0.12;
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const x = this.x0 + i * cell, z = this.z0 + j * cell;
        let best = -Infinity;
        for (const p of hole.pieces) if (p.shape.f(x, z) < -margin) best = Math.max(best, p.h(x, z));
        if (best > -Infinity) {
          this.walk[j * this.nx + i] = 1;
          this.height[j * this.nx + i] = best;
        }
      }
    // obstacles block (approx) - rocks/tikis/bumpers/spinner posts
    for (const o of hole.def.obstacles ?? []) {
      let r = 0;
      if (o.type === 'rock') r = o.r * 0.9;
      else if (o.type === 'tiki') r = 0.7 * (o.scale ?? 1);
      else if (o.type === 'bumper') r = (o.r ?? 0.45);
      else if (o.type === 'spinner') r = 0.35;
      else if (o.type === 'planter') r = o.r;
      if (!r || !('at' in o)) continue;
      const [ox, oz] = o.at;
      this.forCells(ox, oz, r + BALL_R, (k) => (this.walk[k] = 0));
    }
    // links (jumps): ramps launch the ball forward over gaps
    const links: [number, number, number][] = [];
    for (const o of hole.def.obstacles ?? []) {
      if (o.type !== 'ramp') continue;
      const dx = Math.cos(o.dir), dz = Math.sin(o.dir);
      const sx = o.at[0], sz = o.at[1];
      const from = this.idx(sx - dx * 1.0, sz - dz * 1.0);
      if (from < 0) continue;
      for (let d = o.len + 3; d < o.len + 16; d += 0.5) {
        const k = this.idx(sx + dx * d, sz + dz * d);
        if (k >= 0 && this.walk[k]) links.push([from, k, d * 1.15]);
      }
    }
    // dijkstra from cup
    const start = this.idx(hole.cup.x, hole.cup.z);
    if (start < 0) return;
    const heap = new MinHeap();
    this.dist[start] = 0;
    heap.push(start, 0);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    // reverse links: we search from the cup backwards, so a link from A->B lets B reach A
    const rev = new Map<number, [number, number][]>();
    for (const [a, b, c] of links) {
      if (!rev.has(b)) rev.set(b, []);
      rev.get(b)!.push([a, c]);
    }
    while (heap.size) {
      const [k, d] = heap.pop()!;
      if (d > this.dist[k]) continue;
      const i = k % this.nx, j = (k / this.nx) | 0;
      for (const [di, dj, w] of nb) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        const kk = jj * this.nx + ii;
        if (!this.walk[kk]) continue;
        const dh = this.height[kk] - this.height[k];
        if (Math.abs(dh) > 0.25 * w) continue;
        // uphill (towards the cup going down means the ball must climb): mild extra cost
        const nd = d + w * cell * (1 + Math.max(0, -dh) * 0.6);
        if (nd < this.dist[kk]) {
          this.dist[kk] = nd;
          heap.push(kk, nd);
        }
      }
      const r = rev.get(k);
      if (r) for (const [a, c] of r) {
        const nd = d + c;
        if (nd < this.dist[a]) {
          this.dist[a] = nd;
          heap.push(a, nd);
        }
      }
    }
  }

  idx(x: number, z: number) {
    const i = Math.round((x - this.x0) / this.cell), j = Math.round((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  private forCells(x: number, z: number, r: number, cb: (k: number) => void) {
    const c = this.cell;
    for (let j = Math.floor((z - r - this.z0) / c); j <= Math.ceil((z + r - this.z0) / c); j++)
      for (let i = Math.floor((x - r - this.x0) / c); i <= Math.ceil((x + r - this.x0) / c); i++) {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        if (Math.hypot(this.x0 + i * c - x, this.z0 + j * c - z) <= r) cb(j * this.nx + i);
      }
  }

  /** Distance to the cup from a position (min over the 4 nearest cells), Infinity if unreachable. */
  at(x: number, z: number) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    let best = Infinity;
    for (let dj = 0; dj <= 1; dj++)
      for (let di = 0; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        const k = jj * this.nx + ii;
        const d = this.dist[k] + Math.hypot(this.x0 + ii * this.cell - x, this.z0 + jj * this.cell - z);
        if (d < best) best = d;
      }
    return best;
  }
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    this.k.push(key);
    this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.v[p] <= this.v[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    if (!this.k.length) return undefined;
    const r: [number, number] = [this.k[0], this.v[0]];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, rr = l + 1;
        let m = i;
        if (l < this.k.length && this.v[l] < this.v[m]) m = l;
        if (rr < this.k.length && this.v[rr] < this.v[m]) m = rr;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return r;
  }
  private swap(a: number, b: number) {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}

// ----------------------------------------------------------------------------------- simulation
export interface SimResult {
  x: number; y: number; z: number;
  holed: boolean;
  hazard: boolean;
  time: number;
}

const simBall = new Ball();
export function simulateShot(world: PhysicsWorld, sx: number, sy: number, sz: number, dx: number, dz: number, speed: number, t0: number, maxTime = 14, dt = PHYS_DT, pu: PowerUp | null = null): SimResult {
  const b = simBall;
  b.set(sx, sy, sz);
  const l = applyPowerup(b, pu, speed);
  b.launch(dx, dz, l.speed, l.vy);
  if (!l.vy) b.grounded = true;
  let hazard = false;
  let holed = false;
  const ev = { hazard: () => { hazard = true; }, holed: () => { holed = true; } };
  let t = 0;
  while (!b.atRest && t < maxTime && !hazard) {
    world.step(b, t0 + t, dt, ev);
    t += dt;
    if (holed && t > 0.05) break;
  }
  return { x: b.x, y: b.y, z: b.z, holed, hazard, time: t };
}

export interface Plan { dx: number; dz: number; speed: number; score: number; result: SimResult; pu?: PowerUp | null }

/** Score a result (lower is better). */
export function scoreResult(nav: NavField, r: SimResult, from: number, cup?: { x: number; z: number }) {
  if (r.holed) return -1000;
  if (r.hazard) return 5000 + (isFinite(from) ? from : 0);
  const d = nav.at(r.x, r.z);
  if (!isFinite(d)) return 3000 + (cup ? Math.hypot(r.x - cup.x, r.z - cup.z) : 0);
  return d;
}

/** Rough expected strokes still needed after a shot result (holed = 0). */
export function strokesLeft(nav: NavField, r: SimResult, fromD: number) {
  if (r.holed) return 0;
  if (r.hazard) return 2 + (isFinite(fromD) ? Math.min(4, fromD / 11) : 2);
  const d = nav.at(r.x, r.z);
  if (!isFinite(d)) return 4.5;
  return 1 + Math.min(4, d / 11) + (d > 2.5 ? 0.2 : 0);
}

export interface Noise { angSd: number; spSd: number; samples: number; rng: Rng }

/** Shot noise used by rivals of a given skill (also used to stress-test plans). */
export function noiseFor(skill: number, rng: Rng, samples = 5): Noise {
  return { angSd: (1 - skill) * 0.07 + 0.006, spSd: (1 - skill) * 0.08 + 0.015, samples, rng };
}

/**
 * Incremental planner: call step() repeatedly until done; candidates are evaluated a few at a time.
 * With `noise`, the best candidates are re-simulated under aim/power error and the plan with the
 * lowest expected strokes wins (robust shots instead of knife-edge ones).
 */
export class ShotSearch {
  private queue: { dx: number; dz: number; speed: number; ang: number; p: number }[] = [];
  best: Plan | null = null;
  done = false;
  private phase = 0;
  private top: Plan[] = [];
  private fromD: number;

  private robust: { plan: Plan; sum: number; n: number }[] = [];
  private robustQueue: { idx: number; dx: number; dz: number; speed: number }[] = [];

  constructor(private world: PhysicsWorld, private nav: NavField, private sx: number, private sy: number, private sz: number, private t0: number, private coarse = { angles: 40, powers: 9 }, private pu: PowerUp | null = null, private noise: Noise | null = null) {
    this.fromD = nav.at(sx, sz);
    const { angles, powers } = coarse;
    for (let a = 0; a < angles; a++) {
      const ang = (a / angles) * Math.PI * 2;
      for (let p = 0; p < powers; p++) {
        const pw = (p + 1) / powers;
        this.queue.push({ ang, p: pw, dx: Math.cos(ang), dz: Math.sin(ang), speed: SPEED_MIN + Math.pow(pw, 1.08) * (SPEED_MAX - SPEED_MIN) });
      }
    }
  }

  /** Evaluate up to n candidates. */
  step(n: number) {
    if (this.phase === 2) {
      this.stepRobust(n);
      return;
    }
    while (n-- > 0 && this.queue.length) {
      const c = this.queue.pop()!;
      // coarse pass at half resolution, refinement at the game's exact resolution
      const r = simulateShot(this.world, this.sx, this.sy, this.sz, c.dx, c.dz, c.speed, this.t0, 14, this.phase === 0 ? PHYS_DT * 2 : PHYS_DT, this.pu);
      const score = scoreResult(this.nav, r, this.fromD);
      const plan: Plan = { dx: c.dx, dz: c.dz, speed: c.speed, score, result: r, pu: this.pu };
      if (!this.best || score < this.best.score) this.best = plan;
      this.top.push(Object.assign(plan, { ang: c.ang, p: c.p }));
    }
    if (this.queue.length) return;
    if (this.phase === 0) {
      // refine around the best few candidates
      this.phase = 1;
      const sorted = (this.top as (Plan & { ang: number; p: number })[]).sort((a, b) => a.score - b.score).slice(0, 4);
      this.top = [];
      this.best = null; // re-evaluate at full resolution
      for (const t of sorted) this.queue.push({ ang: t.ang, p: t.p, dx: t.dx, dz: t.dz, speed: t.speed });
      const da = (Math.PI * 2) / this.coarse.angles;
      const dp = 1 / this.coarse.powers;
      for (const t of sorted) {
        for (let i = -2; i <= 2; i++)
          for (let j = -2; j <= 2; j++) {
            if (!i && !j) continue;
            const ang = t.ang + (i * da) / 2.5;
            const pw = Math.min(1, Math.max(0.03, t.p + (j * dp) / 2.5));
            this.queue.push({ ang, p: pw, dx: Math.cos(ang), dz: Math.sin(ang), speed: SPEED_MIN + Math.pow(pw, 1.08) * (SPEED_MAX - SPEED_MIN) });
          }
      }
      if (!this.queue.length) this.done = true;
    } else if (this.phase === 1) {
      if (!this.noise) {
        this.done = true;
        return;
      }
      // robust phase: stress-test the most promising distinct plans under shot noise
      this.phase = 2;
      const cands = (this.top as Plan[]).sort((a, b) => a.score - b.score);
      const picked: Plan[] = [];
      for (const c of cands) {
        if (picked.length >= 6) break;
        if (picked.some((p) => Math.abs(Math.atan2(p.dz, p.dx) - Math.atan2(c.dz, c.dx)) < 0.02 && Math.abs(p.speed - c.speed) < 0.4)) continue;
        picked.push(c);
      }
      const nz = this.noise;
      picked.forEach((plan, idx) => {
        this.robust.push({ plan, sum: 0, n: 0 });
        for (let k = 0; k < nz.samples; k++) {
          const a = Math.atan2(plan.dz, plan.dx) + nz.rng.gauss(0, nz.angSd);
          const sp = Math.max(SPEED_MIN, Math.min(SPEED_MAX, plan.speed * (1 + nz.rng.gauss(0, nz.spSd))));
          this.robustQueue.push({ idx, dx: Math.cos(a), dz: Math.sin(a), speed: sp });
        }
      });
      if (!this.robustQueue.length) this.done = true;
    }
  }

  private stepRobust(n: number) {
    while (n-- > 0 && this.robustQueue.length) {
      const c = this.robustQueue.pop()!;
      const r = simulateShot(this.world, this.sx, this.sy, this.sz, c.dx, c.dz, c.speed, this.t0, 14, PHYS_DT * 2, this.pu);
      const e = this.robust[c.idx];
      e.sum += strokesLeft(this.nav, r, this.fromD);
      e.n++;
    }
    if (this.robustQueue.length) return;
    let bestMean = Infinity;
    for (const e of this.robust) {
      // the un-jittered outcome counts as one more sample
      const mean = (e.sum + strokesLeft(this.nav, e.plan.result, this.fromD)) / (e.n + 1);
      if (mean < bestMean) {
        bestMean = mean;
        this.best = e.plan;
      }
    }
    this.done = true;
  }
}

/** Apply human-like error to a plan based on skill (0..1). */
export function jitterPlan(p: { dx: number; dz: number; speed: number; pu?: PowerUp | null }, skill: number, rng: Rng) {
  const angErr = rng.gauss(0, (1 - skill) * 0.07 + 0.004);
  const spErr = rng.gauss(0, (1 - skill) * 0.08 + 0.01);
  const a = Math.atan2(p.dz, p.dx) + angErr;
  return { dx: Math.cos(a), dz: Math.sin(a), speed: Math.max(SPEED_MIN, Math.min(SPEED_MAX, p.speed * (1 + spErr))), pu: p.pu ?? null };
}

export type { HoleBuild };
