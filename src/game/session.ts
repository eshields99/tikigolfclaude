// One hole being played: the human and any AI rivals play simultaneously (Golf Battle style).
import * as THREE from 'three';
import type { HoleBuild } from '../course/builder';
import { PHYS_DT, BALL_R, type HazardKind } from '../physics/world';
import { Golfer } from './golfer';
import { Route, yawOf } from './camera';
import type { P2 } from '../core/math';

export type GameMode = 'tour' | 'battle' | 'rush' | 'practice';
export type PowerUp = 'fire' | 'glide' | 'bounce';

export interface SessionRules {
  mode: GameMode;
  maxStrokes: number;
  timeLimit: number; // seconds, 0 = none
}

export interface SessionHooks {
  hit(g: Golfer, power: number, pu: PowerUp | null): void;
  impact(g: Golfer, speed: number, mat: number, ground: boolean, pos: THREE.Vector3): void;
  hazard(g: Golfer, kind: HazardKind, pos: THREE.Vector3): void;
  reset(g: Golfer): void;
  holed(g: Golfer): void;
  boost(g: Golfer): void;
  bumper(g: Golfer, pos: THREE.Vector3): void;
  out(g: Golfer): void;
  rested(g: Golfer): void;
  finished(s: HoleSession): void;
  timeWarning?(secondsLeft: number): void;
}

export interface AIPlanner {
  request(g: Golfer, s: HoleSession): void;
  update(budgetMs: number): void;
  cancel(g: Golfer): void;
}

export class HoleSession {
  simTime = 0;
  private acc = 0;
  phase: 'intro' | 'play' | 'ending' | 'finished' = 'intro';
  timeLeft: number;
  elapsed = 0;
  endTimer = 0;
  route: Route;
  human: Golfer;
  aiming = false;
  aimDX = 0;
  aimDZ = -1;
  aimPower = 0;
  private lastWarn = 99;
  ai: AIPlanner | null = null;

  constructor(
    public hole: HoleBuild,
    public golfers: Golfer[],
    public rules: SessionRules,
    public hooks: SessionHooks,
  ) {
    this.human = golfers.find((g) => g.human)!;
    this.timeLeft = rules.timeLimit;
    const r: P2[] = hole.def.route ? hole.def.route.map((p) => [p[0], p[1]] as P2) : [];
    if (!r.length || Math.hypot(r[0][0] - hole.tee.x, r[0][1] - hole.tee.z) > 0.5) r.unshift([hole.tee.x, hole.tee.z]);
    const last = r[r.length - 1];
    if (Math.hypot(last[0] - hole.cup.x, last[1] - hole.cup.z) > 0.5) r.push([hole.cup.x, hole.cup.z]);
    this.route = new Route(r);
    for (const g of golfers) {
      g.strokes = 0;
      g.penalties = 0;
      g.holedAt = -1;
      g.state = 'waiting';
      g.aiPlan = null;
      g.aiThinking = false;
      g.placeAt(hole.tee);
      g.shotYaw = yawOf(hole.cup.x - hole.tee.x, hole.cup.z - hole.tee.z);
    }
  }

  start() {
    this.phase = 'play';
    for (const g of this.golfers) {
      g.state = 'ready';
      if (!g.human) g.aiTimer = this.aiDelay(g, true);
    }
  }

  private aiDelay(g: Golfer, first = false) {
    const [a, b] = g.ai?.thinkTime ?? [1.5, 3.5];
    return a + Math.random() * (b - a) + (first ? 0.8 : 0);
  }

  canAim() {
    return this.phase === 'play' && this.human.state === 'ready';
  }

  setAim(dx: number, dz: number, power: number) {
    const l = Math.hypot(dx, dz) || 1;
    this.aimDX = dx / l;
    this.aimDZ = dz / l;
    this.aimPower = power;
    this.aiming = true;
  }

  cancelAim() {
    this.aiming = false;
    this.aimPower = 0;
  }

  static speedFor(power: number) {
    return 0.9 + Math.pow(power, 1.08) * 17.6;
  }

  shoot(g: Golfer, dx: number, dz: number, power: number, pu: PowerUp | null = null) {
    if (g.state !== 'ready' || this.phase !== 'play') return;
    let speed = HoleSession.speedFor(power);
    let vy = 0;
    const b = g.ball;
    b.clearMods();
    if (pu === 'fire') {
      speed = Math.min(26, speed * 1.38);
      b.sandProof = true;
      b.rollMul = 0.8;
    } else if (pu === 'glide') {
      b.rollMul = 0.32;
      b.sandProof = true;
    } else if (pu === 'bounce') {
      speed *= 0.92;
      vy = 3.6 + power * 3.2;
      b.bouncy = true;
    }
    g.lastRest.set(b.x, b.y, b.z);
    b.launch(dx, dz, speed, vy);
    if (!vy) b.grounded = true;
    g.strokes++;
    g.state = 'rolling';
    g.shotYaw = yawOf(dx, dz);
    g.power = pu;
    g.view.resetTrail();
    g.view.setPower(pu);
    if (g.human) this.aiming = false;
    this.hooks.hit(g, power, pu);
  }

  /** Start AI planning for golfers that are ready. */
  private updateAI(dt: number) {
    for (const g of this.golfers) {
      if (g.human || g.state !== 'ready' || this.phase !== 'play') continue;
      if (!g.aiThinking && !g.aiPlan) {
        g.aiThinking = true;
        this.ai?.request(g, this);
      }
      g.aiTimer -= dt;
      if (g.aiPlan && g.aiTimer <= 0) {
        const p = g.aiPlan;
        g.aiPlan = null;
        g.aiThinking = false;
        this.shootSpeed(g, p.dx, p.dz, p.speed);
        g.aiTimer = this.aiDelay(g);
      }
    }
  }

  shootSpeed(g: Golfer, dx: number, dz: number, speed: number) {
    // invert speedFor
    const p = Math.pow(Math.max(0, (speed - 0.9) / 17.6), 1 / 1.08);
    this.shoot(g, dx, dz, Math.min(1, p));
  }

  update(dt: number) {
    if (this.phase === 'finished') return;
    if (this.phase === 'play' || this.phase === 'ending') {
      this.elapsed += dt;
      if (this.rules.timeLimit > 0 && this.phase === 'play') {
        this.timeLeft -= dt;
        const s = Math.ceil(this.timeLeft);
        if (s <= 10 && s !== this.lastWarn && s > 0) {
          this.lastWarn = s;
          this.hooks.timeWarning?.(s);
        }
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          for (const g of this.golfers) if (!g.done) this.markOut(g);
        }
      }
      this.updateAI(dt);
    }
    // physics
    this.acc += Math.min(dt, 0.1);
    const world = this.hole.world;
    let steps = 0;
    while (this.acc >= PHYS_DT && steps < 30) {
      for (const g of this.golfers) {
        const b = g.ball;
        if (g.state === 'ready' && b.atRest && world.touchedByKinematic(b, this.simTime)) {
          b.atRest = false;
          g.state = 'rolling';
        }
        if (!b.atRest) {
          world.step(b, this.simTime, PHYS_DT, this.eventsFor(g));
          if (b.atRest && (g.state === 'rolling' || g.state === 'holed')) this.onRest(g);
        }
      }
      this.simTime += PHYS_DT;
      this.acc -= PHYS_DT;
      steps++;
    }
    // hazards & visuals
    for (const g of this.golfers) {
      if (g.state === 'hazard') {
        g.hazardTimer -= dt;
        if (g.hazardTimer <= 0) {
          g.power = null;
          g.view.setPower(null);
          g.placeAt(g.lastRest);
          g.strokes++;
          g.penalties++;
          g.state = 'ready';
          g.view.setVisible(true);
          g.view.mesh.scale.setScalar(1);
          this.hooks.reset(g);
          if (g.strokes >= this.rules.maxStrokes) this.markOut(g);
        }
      }
      const b = g.ball;
      g.view.sync(b.x, b.y, b.z, b.wx, b.wy, b.wz, dt);
      g.view.updateSquash(dt);
      g.view.setGround(g.state === 'holed' && b.y < this.hole.cup.y - 0.1 ? -Infinity : this.hole.surfaceY(b.x, b.z, b.y + 0.05));
      g.view.updateTrail(g.state === 'rolling' || (g.state === 'holed' && !b.atRest), dt, b.speed);
    }
    // end conditions
    if (this.phase === 'play') {
      const humanDone = this.human.done;
      const allDone = this.golfers.every((g) => g.done);
      const end = this.rules.mode === 'battle' ? allDone : this.rules.mode === 'rush' ? humanDone || allDone : humanDone;
      if (end) {
        this.phase = 'ending';
        this.endTimer = this.human.state === 'holed' ? 2.6 : 1.4;
      }
    } else if (this.phase === 'ending') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.phase = 'finished';
        this.hooks.finished(this);
      }
    }
  }

  private markOut(g: Golfer) {
    if (g.done) return;
    g.state = 'out';
    g.strokes = Math.max(g.strokes, this.rules.maxStrokes);
    g.ball.atRest = true;
    this.ai?.cancel(g);
    this.hooks.out(g);
  }

  private onRest(g: Golfer) {
    g.power = null;
    g.view.setPower(null);
    if (g.state === 'holed') return; // settled in cup
    g.state = 'ready';
    if (g.strokes >= this.rules.maxStrokes) {
      this.markOut(g);
      return;
    }
    this.hooks.rested(g);
  }

  private evCache = new Map<Golfer, object>();
  private eventsFor(g: Golfer) {
    let ev = this.evCache.get(g);
    if (!ev) {
      const v = new THREE.Vector3();
      ev = {
        impact: (speed: number, mat: number, ground: boolean, x: number, y: number, z: number) => this.hooks.impact(g, speed, mat, ground, v.set(x, y, z)),
        hazard: (kind: HazardKind, x: number, y: number, z: number) => {
          if (g.state === 'hazard' || g.done) return;
          g.state = 'hazard';
          g.hazardTimer = 1.5;
          this.hooks.hazard(g, kind, new THREE.Vector3(x, y, z));
        },
        holed: () => {
          if (g.done) return;
          g.state = 'holed';
          g.holedAt = this.elapsed;
          this.hooks.holed(g);
        },
        boost: () => this.hooks.boost(g),
        bumper: (x: number, y: number, z: number) => this.hooks.bumper(g, v.set(x, y, z)),
      };
      this.evCache.set(g, ev);
    }
    return ev;
  }

  /** Ranking for battle/rush: holed first by strokes then time. */
  ranking() {
    return [...this.golfers].sort((a, b) => {
      if (this.rules.mode === 'rush') {
        const ah = a.state === 'holed' ? a.holedAt : 1e9, bh = b.state === 'holed' ? b.holedAt : 1e9;
        if (ah !== bh) return ah - bh;
      }
      if (a.strokes !== b.strokes) return a.strokes - b.strokes;
      return (a.holedAt < 0 ? 1e9 : a.holedAt) - (b.holedAt < 0 ? 1e9 : b.holedAt);
    });
  }

  ballRadius() {
    return BALL_R;
  }
}
