// Game orchestrator: owns the stage, camera rig, input, particles and runs hole sessions.
import * as THREE from 'three';
import { Stage } from './stage';
import { CameraRig, fwd, yawOf } from './camera';
import { Input } from './input';
import { AimView } from './aim';
import { Particles } from '../render/particles';
import { Effects } from './fxhooks';
import { HoleSession, type SessionRules, type SessionHooks } from './session';
import { Golfer } from './golfer';
import { SKINS } from './ballview';
import type { HoleDef } from '../course/types';
import type { CourseStyle } from '../course/builder';
import type { Theme } from '../world/decor';
import { Mat } from '../physics/surfaces';
import { BALL_R } from '../physics/world';
import type { Quality } from '../render/renderer';

export interface CourseInfo {
  id: string;
  name: string;
  env: string;
  theme: Theme;
  style: CourseStyle;
  holes: HoleDef[];
}

export interface GameUI {
  hudStrokes(strokes: number, par: number): void;
  hudHole(info: { num: number; count: number; name: string; par: number; course: string }): void;
  toast(text: string, kind?: string): void;
  callout(text: string, sub?: string, color?: string): void;
  hint(text: string | null): void;
  power(p: number | null, x?: number, y?: number): void;
  timer(seconds: number | null): void;
  holeFinished(s: HoleSession, onNext: () => void): void;
}

export class Game {
  stage: Stage;
  rig: CameraRig;
  input: Input;
  aim: AimView;
  particles: Particles;
  fx: Effects;
  session: HoleSession | null = null;
  course: CourseInfo | null = null;
  holeIndex = 0;
  ui: GameUI;
  private last = performance.now();
  private golfers: Golfer[] = [];
  private aimStartYaw = 0;
  paused = false;
  private sparkleT = 0;

  constructor(canvas: HTMLCanvasElement, ui: GameUI, quality: Quality) {
    this.ui = ui;
    this.stage = new Stage(canvas, quality);
    this.rig = new CameraRig(this.stage.camera);
    this.aim = new AimView();
    this.particles = new Particles();
    this.fx = new Effects(this.particles);
    this.stage.scene.add(this.aim.group, this.particles.mesh, this.particles.meshAdd);
    this.input = new Input(canvas, {
      canAim: () => !this.paused && !!this.session && this.session.canAim() && this.rig.introDone,
      onAimStart: () => {
        this.aimStartYaw = this.rig.yaw + this.rig.userYaw;
        this.aim.show(true);
      },
      onAimMove: (a) => this.updateAimFromDrag(a.dx, a.dy, a.x, a.y),
      onAimEnd: (a, cancelled) => this.endAim(a.dx, a.dy, cancelled),
      onOrbit: (dx, dy) => this.rig.orbit(dx, dy),
      onZoom: (f) => this.rig.zoomBy(f),
      onTap: () => {
        if (this.rig.mode === 'intro') this.rig.skipIntro();
      },
    });
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.stage.resize(w, h);
      this.rig.setAspect(w / h);
    };
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(this.frame);
  }

  private dragToShot(dx: number, dy: number) {
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const len = Math.hypot(dx, dy);
    const power = Math.min(1, len / (minDim * 0.36));
    // shot goes opposite to the drag, mapped through the camera's ground basis
    const f = fwd(this.aimStartYaw);
    const r = new THREE.Vector3(-f.z, 0, f.x); // camera right on ground
    const wx = -r.x * dx + f.x * dy;
    const wz = -r.z * dx + f.z * dy;
    const l = Math.hypot(wx, wz) || 1;
    return { dx: wx / l, dz: wz / l, power, len, minDim };
  }

  private updateAimFromDrag(dx: number, dy: number, x: number, y: number) {
    if (!this.session) return;
    const s = this.dragToShot(dx, dy);
    if (s.len < s.minDim * 0.03) {
      this.session.cancelAim();
      this.ui.power(null);
      return;
    }
    this.session.setAim(s.dx, s.dz, s.power);
    this.ui.power(s.power, x, y);
  }

  private endAim(dx: number, dy: number, cancelled: boolean) {
    this.ui.power(null);
    if (!this.session) return;
    const s = this.dragToShot(dx, dy);
    if (cancelled || s.len < s.minDim * 0.03 || !this.session.canAim()) {
      this.session.cancelAim();
      this.aim.show(false);
      return;
    }
    this.session.shoot(this.session.human, s.dx, s.dz, s.power);
  }

  loadCourse(c: CourseInfo) {
    this.course = c;
    this.stage.setEnvironment(c.env);
  }

  playHole(index: number, rules: SessionRules) {
    if (!this.course) return;
    this.holeIndex = index;
    const def = this.course.holes[index];
    for (const g of this.golfers) g.dispose(this.stage.scene);
    this.golfers = [];
    const hole = this.stage.loadHole(def, this.course.style, this.course.theme);
    this.golfers.push(new Golfer('you', 'You', true, 0xffffff, SKINS[0], this.stage.scene));
    this.session = new HoleSession(hole, this.golfers, rules, this.makeHooks());
    this.rig.route = this.session.route;
    this.rig.snap();
    this.rig.startIntro(this.session.route, hole.cup, hole.tee);
    this.ui.hudHole({ num: index + 1, count: this.course.holes.length, name: def.name, par: def.par, course: this.course.name });
    this.ui.hudStrokes(0, def.par);
    this.ui.hint(null);
    this.particles.clear();
  }

  private makeHooks(): SessionHooks {
    return {
      hit: (g, power) => {
        this.fx.hit(g.pos, power, g.view.skin.trail[0]);
        if (g.human) {
          this.rig.beginShot(g.shotYaw);
          this.aim.hide();
          this.ui.hint(null);
          this.ui.hudStrokes(g.strokes, this.session!.hole.def.par);
          if (power > 0.85) this.rig.addShake(0.25);
        }
      },
      impact: (g, speed, mat, ground, pos) => {
        if (!ground) this.fx.wallHit(pos, speed);
        if (mat === Mat.Sand && ground) this.fx.sandPuff(pos);
        if (g.human && !ground && speed > 6) this.rig.addShake(Math.min(0.3, speed * 0.02));
      },
      hazard: (g, kind, pos) => {
        if (kind === 'water') this.fx.splash(pos);
        else if (kind === 'lava') this.fx.lava(pos);
        else this.fx.poof(pos);
        g.view.setVisible(false);
        if (g.human) this.ui.toast(kind === 'water' ? 'Splash! +1' : kind === 'lava' ? 'Toasted! +1' : 'Out of bounds +1', 'bad');
      },
      reset: (g) => {
        if (g.human) {
          this.ui.hudStrokes(g.strokes, this.session!.hole.def.par);
          this.rig.setAim();
        }
      },
      holed: (g) => {
        const s = this.session!;
        this.fx.cupBurst(s.hole.cup, g.strokes === 1);
        if (g.human) {
          s.hole.flag.setLifted(true);
          this.rig.celebrate();
          this.ui.hudStrokes(g.strokes, s.hole.def.par);
          const [t, sub, color] = scoreName(g.strokes, s.hole.def.par);
          this.ui.callout(t, sub, color);
        }
      },
      boost: (g) => this.fx.boost(g.pos, new THREE.Vector3(g.ball.vx, 0, g.ball.vz).normalize()),
      bumper: (_g, pos) => this.fx.bumper(pos),
      out: (g) => {
        if (g.human) this.ui.toast('Max strokes reached', 'bad');
      },
      rested: (g) => {
        if (g.human) {
          this.rig.setAim();
          this.ui.hint(g.strokes === 0 ? 'Pull back & release to shoot' : null);
        }
      },
      finished: (s) => {
        this.ui.holeFinished(s, () => this.next());
      },
      timeWarning: () => {},
    };
  }

  next() {
    if (!this.course || !this.session) return;
    const rules = this.session.rules;
    const n = (this.holeIndex + 1) % this.course.holes.length;
    this.playHole(n, rules);
  }

  private frame = () => {
    requestAnimationFrame(this.frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) {
      this.stage.render(0);
      return;
    }
    this.tick(dt);
    this.stage.render(dt);
  };

  /** Debug/test helper: advance the game logic without rendering. */
  advance(seconds: number, step = 1 / 60) {
    for (let t = 0; t < seconds; t += step) this.tick(step);
  }

  tick(dt: number) {
    const s = this.session;
    if (s) {
      if (s.phase === 'intro' && this.rig.introDone) {
        s.start();
        this.rig.setAim();
        this.ui.hint('Pull back & release to shoot');
      }
      s.update(dt);
      const h = s.human;
      const hole = s.hole;
      const ballPos = h.pos;
      const groundY = (x: number, z: number) => {
        const a = hole.surfaceY(x, z, 60);
        const b = this.stage.island?.heightAt(x, z) ?? -Infinity;
        return Math.max(a, b);
      };
      this.rig.update(dt, {
        ball: ballPos,
        cup: hole.cup,
        aiming: s.aiming,
        aimPower: s.aimPower,
        ballSpeed: h.ball.speed,
        airborne: !h.ball.grounded && h.state === 'rolling',
        groundY,
      });
      this.stage.focus.copy(ballPos);
      // aim visuals
      if (h.state === 'ready' && s.phase === 'play' && this.rig.introDone) {
        const sy = (x: number, z: number, fromY: number) => hole.surfaceY(x, z, fromY);
        if (s.aiming && s.aimPower > 0) this.aim.update(ballPos, s.aimDX, s.aimDZ, s.aimPower, sy, BALL_R);
        else this.aim.idle(ballPos, sy, BALL_R, dt);
      } else this.aim.hide();
      // trail sparkles
      if (h.state === 'rolling' && h.ball.speed > 4) {
        this.sparkleT += dt;
        while (this.sparkleT > 0.03) {
          this.sparkleT -= 0.03;
          this.fx.trailSparkle(ballPos, h.view.skin.trail[0]);
        }
      }
      // flag fades when the camera is close
      const camD = this.stage.camera.position.distanceTo(hole.cup);
      hole.flag.setFaded(camD < 3.5 || (h.ball.speed > 0.5 && ballPos.distanceTo(hole.cup) < 1.6));
      void yawOf;
    }
    this.particles.update(dt, this.stage.camera);
    this.stage.update(dt, s ? s.simTime : 0);
  }
}

export function scoreName(strokes: number, par: number): [string, string, string] {
  if (strokes === 1) return ['HOLE IN ONE!', 'Legendary!', '#ffd23f'];
  const d = strokes - par;
  if (d <= -3) return ['ALBATROSS!', `${strokes} strokes`, '#c38bff'];
  if (d === -2) return ['EAGLE!', `${strokes} strokes`, '#4fd8ff'];
  if (d === -1) return ['BIRDIE!', `${strokes} strokes`, '#7dff6a'];
  if (d === 0) return ['PAR', `${strokes} strokes`, '#ffffff'];
  if (d === 1) return ['BOGEY', `${strokes} strokes`, '#ffb26b'];
  if (d === 2) return ['DOUBLE BOGEY', `${strokes} strokes`, '#ff8a6b'];
  return [`+${d}`, `${strokes} strokes`, '#ff6b6b'];
}
