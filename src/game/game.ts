// Game orchestrator: owns the stage, camera rig, input, effects and runs hole sessions for every mode.
import * as THREE from 'three';
import { Stage, type Backdrop } from './stage';
import { CameraRig, fwd } from './camera';
import { Input } from './input';
import { AimView, powerColor } from './aim';
import type { Particles } from '../render/particles';
import { Effects } from './fxhooks';
import { HoleSession, type SessionRules, type SessionHooks, type AIPlanner, type PowerUp } from './session';
import { Golfer, type AIProfile } from './golfer';
import { SKINS, POWER_COLORS, type BallSkin } from './ballview';
import type { HoleDef } from '../course/types';
import type { CourseStyle } from '../course/builder';
import type { Theme } from '../world/decor';
import { Mat, SURFACES } from '../physics/surfaces';
import { BALL_R } from '../physics/world';
import type { Quality } from '../render/renderer';
import { NavField, ShotSearch, jitterPlan, noiseFor } from './ai';
import AIWorker from './ai.worker?worker&inline';
import type { WorkerPlanMsg, WorkerPlanResult } from './ai.worker';
import { Rng } from '../core/math';
import type { UI } from '../ui/ui';
import { audio } from '../audio/audio';

export interface CourseInfo {
  id: string;
  name: string;
  subtitle: string;
  env: string;
  theme: Theme;
  style: CourseStyle;
  holes: HoleDef[];
  backdrop?: Backdrop;
  color: string;
}

export interface RivalSpec {
  id: string;
  name: string;
  color: number;
  skin: BallSkin;
  ai: AIProfile;
  /** Power-up charges for the whole match (mutated as they are used). */
  powerups?: Record<PowerUp, number>;
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
  private last = performance.now();
  golfers: Golfer[] = [];
  private aimStartYaw = 0;
  paused = false;
  private sparkleT = 0;
  playerSkin: BallSkin = SKINS[0];
  haptics = true;
  showGuide = true;
  private overviewOn = false;
  private closeBanner: (() => void) | null = null;
  private labels = new Map<Golfer, HTMLElement>();
  private planner = new Planner();
  private speed = 1;
  onHoleFinished: ((s: HoleSession) => void) | null = null;
  menuMode = false;
  private shake = 0;
  /** Remaining power-up charges for the current round, and the one armed for the next shot. */
  powerups: Record<PowerUp, number> = { fire: 0, glide: 0, bounce: 0 };
  armed: PowerUp | null = null;
  onPowerupUsed: ((p: PowerUp) => void) | null = null;
  /** Show the ghost-hand tutorial until the first shot. */
  tutorial = false;
  onTutorialDone: (() => void) | null = null;
  private puT = 0;

  constructor(canvas: HTMLCanvasElement, public ui: UI, quality: Quality) {
    this.stage = new Stage(canvas, quality);
    this.rig = new CameraRig(this.stage.camera);
    this.aim = new AimView();
    this.particles = this.stage.particles;
    this.fx = new Effects(this.particles, this.stage.scene);
    this.stage.scene.add(this.aim.group);
    this.input = new Input(canvas, {
      canAim: () => !this.paused && !this.menuMode && !!this.session && this.session.canAim() && this.rig.introDone && !this.overviewOn,
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
        else if (this.overviewOn) this.toggleOverview();
      },
    });
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.stage.resize(w, h);
      this.rig.setAspect(w / h);
    };
    window.addEventListener('resize', resize);
    resize();
    this.ui.onOverview = () => this.toggleOverview();
    requestAnimationFrame(this.frame);
  }

  // --------------------------------------------------------------------------- aiming
  private dragToShot(dx: number, dy: number) {
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const len = Math.hypot(dx, dy);
    const power = Math.min(1, len / (minDim * 0.36));
    const f = fwd(this.aimStartYaw);
    const r = new THREE.Vector3(-f.z, 0, f.x);
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
    const prev = this.session.aimPower;
    this.session.setAim(s.dx, s.dz, s.power);
    this.ui.power(s.power, x, y, '#' + powerColor(s.power).getHexString());
    if (Math.floor(prev * 10) !== Math.floor(s.power * 10) && this.haptics) navigator.vibrate?.(4);
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
    const pu = this.armed && this.powerups[this.armed] > 0 ? this.armed : null;
    this.session.shoot(this.session.human, s.dx, s.dz, s.power, pu);
    if (pu) {
      this.powerups[pu]--;
      this.armed = null;
      this.aim.tint = null;
      this.onPowerupUsed?.(pu);
      this.refreshPowerups();
    }
  }

  setPowerups(counts: Record<PowerUp, number>) {
    this.powerups = { ...counts };
    this.armed = null;
    this.aim.tint = null;
    this.refreshPowerups();
  }

  togglePowerup(p: PowerUp) {
    this.armed = this.armed === p ? null : this.powerups[p] > 0 ? p : null;
    this.aim.tint = this.armed ? new THREE.Color(POWER_COLORS[this.armed][1]) : null;
    if (this.armed) audio.whoosh();
    this.refreshPowerups();
  }

  refreshPowerups() {
    if (this.menuMode) return;
    this.ui.powerups(this.powerups, this.armed, (p) => this.togglePowerup(p));
  }

  toggleOverview() {
    if (!this.session || this.menuMode) return;
    this.overviewOn = !this.overviewOn;
    if (this.overviewOn) {
      const b = this.session.hole.bounds;
      const c = b.getCenter(new THREE.Vector3());
      const s = b.getSize(new THREE.Vector3());
      c.y = this.session.hole.cup.y;
      this.rig.overview(c, Math.max(s.x, s.z) * 0.5);
      this.input.cancelAim();
    } else this.rig.setAim();
  }

  // --------------------------------------------------------------------------- course / holes
  loadCourse(c: CourseInfo) {
    this.course = c;
    this.stage.setEnvironment(c.env);
    this.stage.setBackdrop(c.backdrop);
    if (this.stage.volcano) this.stage.volcano.onErupt = () => {
      audio.rumble(false);
      this.rig.addShake(0.15);
    };
  }

  private clearGolfers() {
    for (const g of this.golfers) g.dispose(this.stage.scene);
    for (const l of this.labels.values()) l.remove();
    this.labels.clear();
    this.golfers = [];
  }

  /** Show a hole as an animated backdrop for menus (no session). */
  showcase(c: CourseInfo, index: number) {
    this.menuMode = true;
    this.session = null;
    this.clearGolfers();
    this.loadCourse(c);
    const hole = this.stage.loadHole(c.holes[index], c.style, c.theme);
    const b = hole.bounds;
    const center = b.getCenter(new THREE.Vector3());
    center.y = hole.cup.y;
    const s = b.getSize(new THREE.Vector3());
    this.rig.snap();
    this.rig.setMenuOrbit(center, Math.max(s.x, s.z) * (this.rig.portrait ? 1.25 : 0.85) + 8);
    this.aim.hide();
    this.stage.focus.copy(center);
    const g = new Golfer('you', 'You', true, 0xffffff, this.playerSkin, this.stage.scene);
    g.placeAt(hole.tee);
    this.golfers.push(g);
    audio.startAmbience(c.theme);
  }

  playHole(index: number, rules: SessionRules, rivals: RivalSpec[] = [], totals: Record<string, number> = {}) {
    if (!this.course) return;
    this.menuMode = false;
    this.overviewOn = false;
    this.speed = 1;
    this.holeIndex = index;
    const def = this.course.holes[index];
    this.clearGolfers();
    const hole = this.stage.loadHole(def, this.course.style, this.course.theme);
    const me = new Golfer('you', 'You', true, 0xffd23f, this.playerSkin, this.stage.scene);
    this.golfers.push(me);
    for (const r of rivals) {
      const g = new Golfer(r.id, r.name, false, r.color, r.skin, this.stage.scene, r.ai);
      g.aiPowerups = r.powerups ?? null;
      g.view.setOpacity(0.78);
      this.golfers.push(g);
      const lab = document.createElement('div');
      lab.className = 'rival-label';
      lab.textContent = r.name;
      lab.style.cssText = `position:fixed;left:0;top:0;transform:translate(-50%,-100%);padding:2px 8px 3px;border-radius:999px;font:600 12px Fredoka,sans-serif;color:#fff;background:#${r.color.toString(16).padStart(6, '0')};border:2px solid rgba(255,255,255,.8);box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:none;white-space:nowrap;z-index:5;transition:opacity .2s`;
      document.body.appendChild(lab);
      this.labels.set(g, lab);
    }
    for (const g of this.golfers) g.total = totals[g.id] ?? 0;
    this.session = new HoleSession(hole, this.golfers, rules, this.makeHooks());
    if (rivals.length) {
      this.planner.reset(hole, `${this.course.id}:${index}`);
      this.session.ai = this.planner;
    }
    this.rig.route = this.session.route;
    this.rig.snap();
    this.rig.startIntro(this.session.route, hole.cup, hole.tee);
    const modeName = rules.mode === 'battle' ? 'BATTLE' : rules.mode === 'rush' ? 'RUSH' : rules.mode === 'practice' ? 'PRACTICE' : '';
    this.ui.hudHole({ num: index + 1, count: this.course.holes.length, name: def.name, par: def.par, course: this.course.name });
    this.ui.hudStrokes(0, def.par);
    this.ui.hint(null);
    this.ui.timer(rules.timeLimit ? rules.timeLimit : null);
    this.closeBanner = this.ui.banner({ num: index + 1, name: def.name, par: def.par, tip: def.tip, mode: modeName }) ?? null;
    this.updatePlayersHud();
    this.armed = null;
    this.aim.tint = null;
    this.refreshPowerups();
    audio.startAmbience(this.course.theme);
    audio.music?.play(rules.mode === 'battle' || rules.mode === 'rush' ? 'battle' : this.course.theme === 'volcano' ? 'volcano' : 'play');
    audio.whoosh();
  }

  restartHole() {
    if (!this.session || !this.course) return;
    const rules = this.session.rules;
    const rivals: RivalSpec[] = this.golfers.filter((g) => !g.human).map((g) => ({ id: g.id, name: g.name, color: g.color, skin: g.view.skin, ai: g.ai!, powerups: g.aiPowerups ?? undefined }));
    const totals: Record<string, number> = {};
    for (const g of this.golfers) totals[g.id] = g.total;
    this.playHole(this.holeIndex, rules, rivals, totals);
  }

  private updatePlayersHud() {
    if (!this.session || this.golfers.length < 2) return;
    const rows = this.golfers.map((g) => ({ id: g.id, name: g.human ? 'You' : g.name, color: g.color, strokes: (g.total ?? 0) + g.strokes, done: g.done, me: g.human }));
    rows.sort((a, b) => a.strokes - b.strokes);
    this.ui.players(rows);
  }

  private makeHooks(): SessionHooks {
    return {
      hit: (g, power, pu) => {
        if (g.human && this.tutorial) {
          this.tutorial = false;
          this.ui.tutorialHand(null);
          this.onTutorialDone?.();
        }
        this.fx.hit(g.pos, power, pu ? POWER_COLORS[pu][0] : g.view.skin.trail[0]);
        if (pu === 'fire') this.fx.fireBurst(g.pos);
        if (g.human) {
          audio.putt(power);
          if (pu === 'fire') audio.powerFire();
          else if (pu === 'glide') audio.powerGlide();
          else if (pu === 'bounce') audio.boing(0.8);
          this.rig.beginShot(g.shotYaw);
          this.aim.hide();
          this.ui.hint(null);
          this.ui.hudStrokes(g.strokes, this.session!.hole.def.par);
          if (power > 0.85) this.rig.addShake(0.2);
          if (this.haptics) navigator.vibrate?.(power > 0.7 ? 25 : 12);
        } else {
          const d = g.pos.distanceTo(this.stage.camera.position);
          if (d < 18) audio.putt(power * 0.4);
          if (pu) this.ui.toast(`${g.name} used ${pu === 'fire' ? 'Fire' : pu === 'glide' ? 'Glide' : 'Bounce'}!`, 'info');
        }
        this.updatePlayersHud();
      },
      impact: (g, speed, mat, ground, pos) => {
        if (!ground) this.fx.wallHit(pos, speed);
        if (ground && speed > 2.6) {
          g.view.squash(Math.min(0.3, speed * 0.035));
          if (mat === Mat.Turf || mat === Mat.Glide) this.fx.landPuff(pos, speed);
        }
        if (g.power === 'bounce' && ground && speed > 1.6) {
          this.fx.ripple(pos.clone().setY(pos.y + 0.03), 0.9, POWER_COLORS.bounce[0], 0.6);
          if (g.human) audio.boing(Math.min(1, speed / 6));
        }
        if (mat === Mat.Sand && ground) this.fx.sandPuff(pos);
        const near = g.human || pos.distanceTo(this.stage.camera.position) < 14;
        if (near) audio.impact(g.human ? speed : speed * 0.5, SURFACES[mat]?.sound ?? 'turf');
        if (g.human && !ground && speed > 6) this.rig.addShake(Math.min(0.3, speed * 0.02));
        if (g.human && !ground && this.haptics && speed > 3) navigator.vibrate?.(8);
      },
      hazard: (g, kind, pos) => {
        if (kind === 'water') this.fx.splash(pos, pos.y);
        else if (kind === 'lava') this.fx.lava(pos);
        else this.fx.poof(pos);
        g.view.setVisible(false);
        if (g.human) {
          if (kind === 'water') audio.splash();
          else if (kind === 'lava') audio.sizzle();
          else audio.poof();
          audio.penalty();
          this.ui.toast(kind === 'water' ? 'Splash!  +1' : kind === 'lava' ? 'Toasted!  +1' : 'Out of bounds  +1', 'bad');
          if (this.haptics) navigator.vibrate?.([30, 40, 30]);
        }
      },
      reset: (g) => {
        if (g.human) {
          this.ui.hudStrokes(g.strokes, this.session!.hole.def.par);
          this.rig.setAim();
        }
        this.updatePlayersHud();
      },
      holed: (g) => {
        const s = this.session!;
        this.fx.cupBurst(s.hole.cup, g.strokes === 1);
        if (g.human) {
          s.hole.flag.setLifted(true);
          this.rig.celebrate();
          this.ui.hudStrokes(g.strokes, s.hole.def.par);
          const [t, sub, color] = scoreName(g.strokes, s.hole.def.par);
          const big = g.strokes === 1 || g.strokes < s.hole.def.par;
          this.ui.callout(t, sub, color, undefined, big);
          audio.holeIn(g.strokes === 1);
          audio.music?.duck(true);
          setTimeout(() => audio.music?.duck(false), 2500);
          if (this.haptics) navigator.vibrate?.(g.strokes === 1 ? [40, 60, 40, 60, 80] : [30, 50, 30]);
          if (this.course?.theme === 'volcano' && this.holeIndex === this.course.holes.length - 1) {
            this.stage.volcano?.erupt();
            audio.rumble(true);
            this.rig.addShake(0.5);
          }
          if (s.golfers.some((o) => !o.done) && s.rules.mode !== 'tour' && s.rules.mode !== 'practice') {
            setTimeout(() => {
              if (this.session === s && s.phase === 'play') this.ui.toast('Waiting for rivals…  ⏩', 'info');
            }, 2600);
          }
        } else {
          const d = g.pos.distanceTo(this.stage.camera.position);
          if (d < 20) audio.impact(4, 'cup');
          this.ui.toast(`${g.name} holed out in ${g.strokes}!`, 'info');
        }
        this.updatePlayersHud();
      },
      boost: (g) => {
        this.fx.boost(g.pos, new THREE.Vector3(g.ball.vx, 0, g.ball.vz).normalize());
        if (g.human) audio.boost();
      },
      bumper: (g, pos) => {
        this.fx.bumper(pos);
        const bump = this.findBumper(pos);
        if (bump) bump.pulse = 1;
        if (g.human) audio.impact(8, 'bumper');
      },
      out: (g) => {
        if (g.human) this.ui.toast(this.session?.timeLeft === 0 ? 'Time’s up!' : 'Max strokes reached', 'bad');
        this.updatePlayersHud();
      },
      rested: (g) => {
        if (g.human) {
          this.rig.setAim();
          this.ui.hint(g.strokes === 0 ? 'Pull back & release|Drag anywhere · pull further for power' : null);
        }
      },
      finished: (s) => {
        this.speed = 1;
        this.onHoleFinished?.(s);
      },
      timeWarning: (sec) => audio.tick(sec <= 5),
    };
  }

  private findBumper(pos: THREE.Vector3) {
    const list = this.stage.hole?.bumpers ?? [];
    let best = null, bd = 1.5;
    for (const b of list) {
      const d = Math.hypot(b.x - pos.x, b.z - pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  setSkin(s: BallSkin) {
    this.playerSkin = s;
    const me = this.golfers.find((g) => g.human);
    me?.view.setSkin(s);
  }

  // --------------------------------------------------------------------------- loop
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

  tick(dtReal: number) {
    const s = this.session;
    let dt = dtReal;
    if (s && !this.menuMode) {
      // fast forward while waiting for rivals
      const waiting = s.phase === 'play' && s.human.done && s.golfers.some((g) => !g.done);
      this.speed += ((waiting ? 3 : 1) - this.speed) * Math.min(1, dtReal * 2);
      dt = dtReal * this.speed;
      if (s.phase === 'intro' && this.rig.introDone) {
        s.start();
        this.rig.setAim();
        this.closeBanner?.();
        this.closeBanner = null;
        this.ui.hint('Pull back & release|Drag anywhere · pull further for power');
      }
      this.planner.update(waiting ? 8 : this.stage.renderer.quality === 'high' ? 4 : 2.5);
      s.update(dt);
      if (s.rules.timeLimit) this.ui.timer(s.timeLeft);
      const h = s.human;
      const hole = s.hole;
      const ballPos = h.pos;
      const groundY = (x: number, z: number) => {
        const a = hole.surfaceY(x, z, 60);
        const b = this.stage.island?.heightAt(x, z) ?? -Infinity;
        return Math.max(a, b);
      };
      // camera follows a rival while we wait
      let camBall = ballPos;
      if (h.done && s.phase === 'play') {
        const other = s.golfers.find((g) => !g.done && g.state === 'rolling') ?? s.golfers.find((g) => !g.done);
        if (other && this.rig.mode !== 'celebrate') camBall = other.pos;
      }
      this.rig.update(dtReal, {
        ball: camBall,
        ballVel: new THREE.Vector3(h.ball.vx, 0, h.ball.vz),
        cup: hole.cup,
        aiming: s.aiming,
        aimPower: s.aimPower,
        ballSpeed: h.ball.speed,
        airborne: !h.ball.grounded && h.state === 'rolling',
        groundY,
      });
      this.stage.focus.copy(ballPos);
      // aim visuals
      if (h.state === 'ready' && s.phase === 'play' && this.rig.introDone && !this.overviewOn) {
        const sy = (x: number, z: number, fromY: number) => hole.surfaceY(x, z, fromY);
        if (s.aiming && s.aimPower > 0) {
          if (this.showGuide) this.aim.update(ballPos, s.aimDX, s.aimDZ, s.aimPower, sy, BALL_R);
          else this.aim.idle(ballPos, sy, BALL_R, dt);
        } else this.aim.idle(ballPos, sy, BALL_R, dt);
      } else this.aim.hide();
      // first-shot tutorial hand at the ball
      if (this.tutorial && h.state === 'ready' && s.phase === 'play' && this.rig.introDone && !s.aiming && !this.overviewOn) {
        const v = ballPos.clone().project(this.stage.camera);
        this.ui.tutorialHand(((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight + 18);
      } else if (this.tutorial) this.ui.tutorialHand(null);
      // power-up aura & particles
      this.puT += dt;
      for (const g of s.golfers) {
        if (!g.power || g.state !== 'rolling') continue;
        g.view.pulse(this.stage.time);
        const p = g.pos;
        if (g.power === 'fire') this.fx.fireTrail(p, dt);
        else if (g.power === 'glide' && g.ball.speed > 1) this.fx.glideTrail(p, dt);
      }
      // trail sparkles + rolling audio
      if (h.state === 'rolling' && h.ball.speed > 4) {
        this.sparkleT += dt;
        while (this.sparkleT > 0.03) {
          this.sparkleT -= 0.03;
          this.fx.trailSparkle(ballPos, h.view.skin.trail[0]);
        }
      }
      audio.roll(h.state === 'rolling' || (h.state === 'holed' && !h.ball.atRest) ? h.ball.speed : 0, h.ball.grounded, SURFACES[h.ball.gmat]?.name ?? 'turf');
      // flag fades when the camera is close
      const camD = this.stage.camera.position.distanceTo(hole.cup);
      hole.flag.setFaded(camD < 3.5 || (h.ball.speed > 0.5 && ballPos.distanceTo(hole.cup) < 1.6));
      // rival labels
      this.updateLabels();
      // ambience
      const wf = this.stage.waterfalls.length ? hole.def.waterfalls![0].bottom : null;
      const wfd = wf ? this.stage.camera.position.distanceTo(new THREE.Vector3(...wf)) : 999;
      let td = 999;
      for (const p of this.stage.decor?.torchPositions ?? []) td = Math.min(td, p.distanceTo(this.stage.camera.position));
      audio.updateAmbience(dtReal, wfd, td);
    } else if (this.menuMode) {
      this.rig.update(dtReal, {
        ball: this.stage.focus,
        cup: this.stage.hole?.cup ?? this.stage.focus,
        aiming: false,
        aimPower: 0,
        ballSpeed: 0,
        airborne: false,
        groundY: (x, z) => this.stage.island?.heightAt(x, z) ?? -Infinity,
      });
      audio.updateAmbience(dtReal, 999, 999);
    }
    this.fx.update(dt);
    this.stage.update(dt, s ? s.simTime : this.stage.time);
    void this.shake;
  }

  private updateLabels() {
    const cam = this.stage.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    const placed: { x: number; y: number; lab: HTMLElement }[] = [];
    for (const [g, lab] of this.labels) {
      v.set(g.ball.x, g.ball.y + 0.55, g.ball.z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && g.state !== 'hazard' && !(g.state === 'holed' && g.ball.atRest);
      lab.style.opacity = vis ? '1' : '0';
      if (vis) placed.push({ x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, lab });
    }
    // nudge overlapping tags upwards so every name stays readable
    placed.sort((a, b) => b.y - a.y);
    for (let i = 0; i < placed.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = placed[i], b = placed[j];
        if (Math.abs(a.x - b.x) < 64 && Math.abs(a.y - b.y) < 22) a.y = b.y - 22;
      }
    }
    for (const p of placed) p.lab.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }

  removeLabels() {
    for (const l of this.labels.values()) l.remove();
    this.labels.clear();
  }
}

// ----------------------------------------------------------------------------------------------- AI planner
class Planner implements AIPlanner {
  private nav: NavField | null = null;
  private jobs: { g: Golfer; s: HoleSession; search: ShotSearch }[] = [];
  private rng = new Rng(Date.now() & 0xffff);
  private hole: unknown = null;
  private workers: Worker[] = [];
  private holeKey = '';
  private nextId = 1;
  private turn = 0;
  private pending = new Map<number, { g: Golfer; s: HoleSession }>();

  constructor() {
    // one planning worker per spare core (up to three rivals plan in parallel)
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new AIWorker();
        w.onmessage = (e: MessageEvent<WorkerPlanResult>) => this.onResult(e.data);
        w.onerror = () => this.dropWorkers();
        this.workers.push(w);
      }
    } catch {
      this.dropWorkers();
    }
  }

  private get worker() {
    return this.workers.length ? this.workers[this.turn++ % this.workers.length] : null;
  }

  private dropWorkers() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    // anything still waiting on a worker gets re-planned on the main thread
    for (const { g } of this.pending.values()) g.aiThinking = false;
    this.pending.clear();
  }

  reset(hole: { def: HoleDef; pieces: { shape: { f(x: number, z: number): number }; h(x: number, z: number): number }[]; cup: { x: number; z: number }; bounds: { min: { x: number; z: number }; max: { x: number; z: number } } }, holeKey = '') {
    this.jobs = [];
    this.pending.clear();
    this.holeKey = holeKey;
    if (this.hole !== hole) {
      this.nav = new NavField(hole);
      this.hole = hole;
    }
    if (holeKey) {
      const [course, index] = holeKey.split(':');
      for (const w of this.workers) w.postMessage({ type: 'hole', course, index: +index });
    }
  }

  request(g: Golfer, s: HoleSession) {
    if (!this.nav) return;
    this.jobs = this.jobs.filter((j) => j.g !== g);
    const b = g.ball;
    const t0 = s.simTime + Math.max(0.5, g.aiTimer);
    const skill = g.ai?.skill ?? 0.6;
    const quality = 0.35 + skill * 0.65;
    // rivals spend their power-ups on long approaches
    const left = this.nav.at(b.x, b.z);
    const pw = g.aiPowerups;
    let pu: PowerUp | null = null;
    if (pw && pw.fire > 0 && left > 24 && this.rng.next() < 0.5) pu = 'fire';
    else if (pw && pw.glide > 0 && left > 12 && left < 26 && this.rng.next() < 0.3) pu = 'glide';
    const angles = Math.round(20 + quality * 16), powers = Math.round(5 + quality * 4);
    const worker = this.holeKey ? this.worker : null;
    if (worker) {
      const id = this.nextId++;
      this.pending.set(id, { g, s });
      const msg: WorkerPlanMsg = { type: 'plan', id, hole: this.holeKey, x: b.x, y: b.y, z: b.z, t0, angles, powers, pu, skill, seed: (this.rng.next() * 1e9) | 0 };
      worker.postMessage(msg);
      return;
    }
    const search = new ShotSearch(s.hole.world, this.nav, b.x, b.y, b.z, t0, { angles, powers }, pu, noiseFor(skill, this.rng, 4));
    this.jobs.push({ g, s, search });
  }

  private onResult(r: WorkerPlanResult) {
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    const { g } = p;
    if (!r.ok || g.state !== 'ready') {
      g.aiThinking = false;
      return;
    }
    g.aiPlan = jitterPlan({ dx: r.dx, dz: r.dz, speed: r.speed, pu: r.pu }, g.ai?.skill ?? 0.6, this.rng);
  }

  cancel(g: Golfer) {
    this.jobs = this.jobs.filter((j) => j.g !== g);
    for (const [id, p] of this.pending) if (p.g === g) this.pending.delete(id);
  }

  update(budgetMs: number) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < budgetMs) {
      const j = this.jobs[0];
      j.search.step(3);
      if (j.search.done) {
        this.jobs.shift();
        const best = j.search.best;
        if (best && j.g.state === 'ready') {
          j.g.aiPlan = jitterPlan(best, j.g.ai?.skill ?? 0.6, this.rng);
        } else j.g.aiThinking = false;
      } else {
        // round robin
        this.jobs.push(this.jobs.shift()!);
      }
    }
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
