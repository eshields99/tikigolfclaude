// Application flow: loading, menus, game modes (Tour, Battle, Rush, Practice), rewards & settings.
import { Game, type RivalSpec, scoreName } from './game/game';
import { UI, el } from './ui/ui';
import { Save, starsFor, coinsFor, type Settings } from './game/save';
import { COURSES } from './course/courses';
import { SKINS } from './game/ballview';
import type { HoleSession, GameMode } from './game/session';
import type { Quality } from './render/renderer';
import { audio } from './audio/audio';
import { Rng } from './core/math';
import { STAR } from './ui/icons';
import { loadFonts } from './ui/fonts';

const UNLOCK_STARS = [0, 4, 10];
const RIVALS = [
  { name: 'Kai', color: 0x2fd6c8 },
  { name: 'Leilani', color: 0xff4f6d },
  { name: 'Makoa', color: 0xf5a21f },
  { name: 'Nalu', color: 0x5b7cff },
  { name: 'Moana', color: 0x5cc84a },
  { name: 'Pua', color: 0xff7a2e },
  { name: 'Keoni', color: 0x9b6cff },
  { name: 'Iolana', color: 0xff6fa8 },
];

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function detectQuality(): Quality {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  return mobile ? 'medium' : 'high';
}

export class App {
  save = new Save();
  ui = new UI();
  game!: Game;
  mode: GameMode | 'menu' = 'menu';
  courseIdx = 0;
  scores: (number | null)[] = [];
  coinsRun = 0;
  rivals: RivalSpec[] = [];
  totals: Record<string, number> = {};
  rushTimes: Record<string, number> = {};
  battleHole = 0;
  private closePause: (() => void) | null = null;
  private fps = { frames: 0, t: 0, checked: false };

  async boot() {
    const ld = this.ui.showLoading();
    await loadFonts();
    ld.progress(0.15, 'Raking the sand traps…');
    await nextFrame();
    const canvas = el('canvas', 'game');
    document.body.prepend(canvas);
    const s = this.save.data.settings;
    const q = s.quality === 'auto' ? detectQuality() : s.quality;
    this.game = new Game(canvas, this.ui, q);
    this.applySettings(s);
    const eq = SKINS.find((k) => k.id === this.save.data.ball) ?? SKINS[0];
    this.game.setSkin(eq);
    this.ui.sounds = { click: () => audio.click() };
    ld.progress(0.45, 'Lighting the tiki torches…');
    await nextFrame();
    const params = new URLSearchParams(location.search);
    if (params.get('unlock') === '1') for (const c of COURSES) for (const h of c.holes) this.save.data.stars[h.id] = Math.max(this.save.data.stars[h.id] ?? 0, 2);
    const showIdx = this.highestUnlocked();
    this.game.showcase(COURSES[showIdx], 0);
    ld.progress(0.8, 'Waxing the surfboards…');
    await nextFrame();
    await nextFrame();
    ld.progress(1, 'Aloha!');
    await new Promise((r) => setTimeout(r, 350));
    ld.done();
    this.ui.onPause = () => this.pause();
    this.game.onHoleFinished = (s) => this.holeFinished(s);
    this.game.tutorial = !this.save.data.tutorialDone;
    this.game.onTutorialDone = () => {
      this.save.data.tutorialDone = true;
      this.save.persist();
    };
    // audio needs a gesture
    const unlock = () => {
      audio.unlock();
      audio.setVolumes(this.save.data.settings.sfx, this.save.data.settings.music);
      audio.music?.play(this.mode === 'menu' ? 'menu' : 'play');
      if (this.game.course) audio.startAmbience(this.game.course.theme);
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode !== 'menu' && !this.game.paused) this.pause();
      if (audio.ctx) document.hidden ? audio.ctx.suspend() : audio.ctx.resume();
    });
    this.watchFps();
    const direct = params.get('play');
    if (direct) {
      const [c, h] = direct.split(',').map(Number);
      this.startTour(c || 0, h || 0);
    } else this.showMenu();
  }

  private watchFps() {
    const loop = (t: number) => {
      if (!this.fps.checked && this.mode !== 'menu' && this.save.data.settings.quality === 'auto') {
        if (!this.fps.t) this.fps.t = t;
        this.fps.frames++;
        if (t - this.fps.t > 6000) {
          const f = (this.fps.frames * 1000) / (t - this.fps.t);
          this.fps.checked = true;
          const cur = this.game.stage.renderer.quality;
          if (f < 32 && cur !== 'low') this.game.stage.setQuality(cur === 'high' ? 'medium' : 'low');
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Flip the soundtrack on/off, persist it and return the new state. */
  private toggleMusic() {
    const s = this.save.data.settings;
    s.musicOn = !s.musicOn;
    this.save.persist();
    audio.setMusicEnabled(s.musicOn);
    return s.musicOn;
  }

  private applySettings(s: Settings) {
    audio.setMusicEnabled(s.musicOn !== false);
    audio.setVolumes(s.sfx, s.music);
    this.game.haptics = s.haptics;
    this.game.showGuide = s.guide;
    const q = s.quality === 'auto' ? detectQuality() : s.quality;
    if (this.game.stage.renderer.quality !== q) this.game.stage.setQuality(q);
  }

  private givePowerups(mode: 'round' | 'practice') {
    this.game.setPowerups(mode === 'practice' ? { fire: 99, glide: 99, bounce: 99 } : { fire: 1, glide: 1, bounce: 1 });
  }

  private highestUnlocked() {
    let best = 0;
    COURSES.forEach((_, i) => {
      if (this.unlocked(i).ok) best = i;
    });
    return best;
  }

  unlocked(i: number) {
    const need = UNLOCK_STARS[i] ?? 0;
    const have = this.save.totalStars;
    return { ok: have >= need, need: `Earn ${need} ★ to unlock (${have}/${need})` };
  }

  // ------------------------------------------------------------------------------ menu
  showMenu() {
    this.mode = 'menu';
    this.game.removeLabels();
    if (!this.game.menuMode) this.game.showcase(COURSES[this.highestUnlocked()], 0);
    audio.music?.play('menu');
    this.ui.showMenu(this.save, {
      tour: () => this.ui.showCourses(COURSES, this.save, 'Island Tour', (i) => this.unlocked(i), (i) => this.startTour(i, 0), () => this.showMenu()),
      battle: () => this.startBattle('battle'),
      rush: () => this.startBattle('rush'),
      // practice is a sandbox: every island and hole is open regardless of stars
      practice: () =>
        this.ui.showCourses(COURSES, this.save, 'Practice', () => ({ ok: true, need: '' }), (i) =>
          this.ui.showHoleSelect(COURSES[i], this.save, (h) => this.startPractice(i, h), () => this.showMenu()), () => this.showMenu()),
      shop: () => this.ui.shop(this.save, (sk) => this.game.setSkin(sk), () => this.showMenu()),
      settings: () => this.openSettings(() => this.showMenu()),
      help: () => this.ui.howTo(() => {}),
      toggleMusic: () => this.toggleMusic(),
    });
  }

  private openSettings(after?: () => void) {
    this.ui.settings(
      this.save.data.settings,
      (s) => {
        this.save.data.settings = s;
        this.save.persist();
        this.applySettings(s);
      },
      () => {
        this.save.reset();
        location.reload();
      },
      after,
    );
  }

  private transition(label: string, fn: () => void) {
    this.ui.fade(true, label);
    setTimeout(() => {
      fn();
      setTimeout(() => this.ui.fade(false), 120);
    }, 380);
  }

  // ------------------------------------------------------------------------------ tour / practice
  startTour(courseIdx: number, holeIdx: number) {
    this.mode = 'tour';
    this.courseIdx = courseIdx;
    this.scores = COURSES[courseIdx].holes.map(() => null);
    this.coinsRun = 0;
    this.givePowerups('round');
    this.playTourHole(holeIdx);
  }

  private playTourHole(i: number) {
    const c = COURSES[this.courseIdx];
    this.transition(c.name, () => {
      this.ui.showHud({ battle: false, timer: false });
      this.game.loadCourse(c);
      this.game.playHole(i, { mode: 'tour', maxStrokes: 10, timeLimit: 0 });
    });
  }

  startPractice(courseIdx: number, holeIdx: number) {
    this.mode = 'practice';
    this.courseIdx = courseIdx;
    this.givePowerups('practice');
    const c = COURSES[courseIdx];
    this.transition('Practice', () => {
      this.ui.showHud({ battle: false, timer: false });
      this.game.loadCourse(c);
      this.game.playHole(holeIdx, { mode: 'practice', maxStrokes: 15, timeLimit: 0 });
    });
  }

  // ------------------------------------------------------------------------------ battle / rush
  startBattle(mode: 'battle' | 'rush') {
    this.mode = mode;
    const rng = new Rng((Date.now() & 0xfffffff) + 1);
    const pool = [...RIVALS];
    this.rivals = [];
    const trophies = this.save.data.trophies;
    const baseSkill = Math.min(0.88, 0.5 + trophies / 600);
    for (let i = 0; i < 3; i++) {
      const r = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      const skin = SKINS[rng.int(1, SKINS.length - 1)];
      this.rivals.push({
        id: 'ai' + i,
        name: r.name,
        color: r.color,
        skin,
        ai: { skill: Math.max(0.35, Math.min(0.95, baseSkill + rng.range(-0.15, 0.12))), thinkTime: mode === 'rush' ? [0.7, 1.6] : [1.6, 3.6] },
        powerups: { fire: 1, glide: 1, bounce: 0 },
      });
    }
    // pick an unlocked island at random
    const unlockedList = COURSES.map((_, i) => i).filter((i) => this.unlocked(i).ok);
    this.courseIdx = unlockedList[rng.int(0, unlockedList.length - 1)];
    this.totals = { you: 0 };
    this.rushTimes = { you: 0 };
    for (const r of this.rivals) {
      this.totals[r.id] = 0;
      this.rushTimes[r.id] = 0;
    }
    this.battleHole = 0;
    this.givePowerups('round');
    audio.music?.play('battle');
    this.ui.matchmaking(this.rivals, 0xffd23f, () => this.playBattleHole(), mode === 'rush' ? 'Rush Rivals' : 'Finding Rivals');
  }

  private battleRules(): { mode: GameMode; maxStrokes: number; timeLimit: number } {
    return this.mode === 'rush' ? { mode: 'rush', maxStrokes: 20, timeLimit: 75 } : { mode: 'battle', maxStrokes: 8, timeLimit: 100 };
  }

  private playBattleHole() {
    const c = COURSES[this.courseIdx];
    this.transition(c.name, () => {
      this.ui.showHud({ battle: true, timer: true });
      this.game.loadCourse(c);
      this.game.playHole(this.battleHole, this.battleRules(), this.rivals, this.totals);
    });
  }

  // ------------------------------------------------------------------------------ results
  private holeFinished(s: HoleSession) {
    const c = COURSES[this.courseIdx];
    const idx = this.game.holeIndex;
    const def = c.holes[idx];
    const me = s.human;
    if (this.mode === 'tour' || this.mode === 'practice') {
      const strokes = me.strokes;
      const stars = me.state === 'holed' ? starsFor(strokes, def.par) : 0;
      const coins = this.mode === 'tour' && me.state === 'holed' ? coinsFor(strokes, def.par) : 0;
      if (this.mode === 'tour') {
        this.scores[idx] = strokes;
        this.save.recordHole(def.id, strokes, stars);
        this.save.data.coins += coins;
        this.save.persist();
        this.coinsRun += coins;
      }
      const [title, , color] = me.state === 'holed' ? scoreName(strokes, def.par) : ['Out of strokes', '', '#ff6b6b'];
      if (coins) audio.coin(3);
      const isLast = this.mode === 'tour' ? this.scores.every((x) => x !== null) || idx === c.holes.length - 1 : false;
      this.ui.holeResult(
        { course: c, index: idx, scores: this.mode === 'tour' ? this.scores : c.holes.map((_, i) => (i === idx ? strokes : null)), strokes, stars, coins, isLast, title, titleColor: color },
        {
          next: () => {
            if (this.mode === 'practice') {
              this.startPractice(this.courseIdx, (idx + 1) % c.holes.length);
              return;
            }
            const nextIdx = this.scores.findIndex((x, i) => x === null && i > idx);
            const anyLeft = this.scores.findIndex((x) => x === null);
            if (nextIdx >= 0) this.playTourHole(nextIdx);
            else if (anyLeft >= 0) this.playTourHole(anyLeft);
            else this.finishTour();
          },
          retry: () => {
            if (this.mode === 'tour') this.scores[idx] = null;
            if (this.mode === 'practice') this.startPractice(this.courseIdx, idx);
            else this.playTourHole(idx);
          },
          menu: () => this.transition('Back to the beach', () => this.showMenu()),
        },
      );
      setTimeout(() => {
        for (let i = 0; i < stars; i++) setTimeout(() => audio.star(i), 200 + i * 150);
      }, 100);
      return;
    }
    // battle / rush: accumulate
    for (const g of s.golfers) {
      this.totals[g.id] = (this.totals[g.id] ?? 0) + g.strokes;
      // rivals still on the course when the race ends get an estimate from their distance to the cup
      const left = Math.hypot(g.ball.x - s.hole.cup.x, g.ball.z - s.hole.cup.z);
      const t = g.state === 'holed' ? g.holedAt : g.state === 'out' && s.timeLeft <= 0 ? s.rules.timeLimit + 10 : s.elapsed + 2.5 + left * 0.35;
      this.rushTimes[g.id] = (this.rushTimes[g.id] ?? 0) + t;
    }
    const last = this.battleHole >= c.holes.length - 1;
    const rows = s.golfers.map((g) => ({
      id: g.id,
      name: g.human ? 'You' : g.name,
      color: g.color,
      me: g.human,
      hole: g.state === 'holed' ? (this.mode === 'rush' ? `${g.holedAt.toFixed(1)}s` : String(g.strokes)) : 'DNF',
      total: this.mode === 'rush' ? this.rushTimes[g.id] : this.totals[g.id],
      time: this.rushTimes[g.id],
    }));
    // strokes first; ties go to whoever holed out sooner overall
    rows.sort((a, b) => a.total - b.total || a.time - b.time);
    if (last) {
      this.finishBattle(rows);
      return;
    }
    this.showStandings(rows, () => {
      this.battleHole++;
      this.playBattleHole();
    });
  }

  private showStandings(rows: { name: string; color: number; me: boolean; hole: string; total: number }[], next: () => void) {
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">Standings · Hole ${this.battleHole + 1}</div>`);
    const fmt = (t: number) => (this.mode === 'rush' ? `${t.toFixed(1)}s` : String(t));
    sheet.insertAdjacentHTML(
      'beforeend',
      `<table class="scorecard" style="margin-top:16px"><tr><th style="text-align:left;padding-left:12px">GOLFER</th><th>HOLE</th><th>TOTAL</th></tr>${rows
        .map((r, i) => `<tr class="${r.me ? 'cur' : ''}"><td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#${r.color.toString(16).padStart(6, '0')};margin-right:6px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2)"></span>${i + 1}. ${r.name}</td><td>${r.hole}</td><td><b>${fmt(r.total)}</b></td></tr>`)
        .join('')}</table>`,
    );
    const b = el('button', 'btn green wide', '<span>NEXT HOLE</span>');
    b.style.marginTop = '14px';
    b.addEventListener('click', () => {
      audio.click();
      back.remove();
      next();
    });
    sheet.append(b);
    back.append(sheet);
    this.ui.root.append(back);
  }

  private finishBattle(rows: { id: string; name: string; color: number; me: boolean; total: number }[]) {
    const myRank = rows.findIndex((r) => r.me);
    const trophies = [30, 15, -5, -10][myRank] ?? 0;
    const coins = [150, 80, 40, 20][myRank] ?? 10;
    const d = this.save.data;
    d.trophies = Math.max(0, d.trophies + trophies);
    d.coins += coins;
    d.stats.battles++;
    if (myRank === 0) d.stats.wins++;
    this.save.persist();
    audio.fanfare(myRank === 0);
    this.game.removeLabels();
    this.ui.battleResult(
      {
        title: this.mode === 'rush' ? 'Rush Results' : 'Battle Results',
        ranking: rows.map((r) => ({ name: r.name, color: r.color, total: Math.round(r.total * 10) / 10, me: r.me })),
        trophies,
        coins,
        myRank,
        timed: this.mode === 'rush',
      },
      {
        again: () => this.startBattle(this.mode as 'battle' | 'rush'),
        menu: () => this.transition('Back to the beach', () => this.showMenu()),
      },
    );
  }

  private finishTour() {
    const c = COURSES[this.courseIdx];
    const scores = this.scores as number[];
    const total = scores.reduce((a, b) => a + b, 0);
    const prevBest = this.save.data.courseBest[c.id];
    const best = prevBest === undefined || total < prevBest;
    if (best) this.save.data.courseBest[c.id] = total;
    const bonus = 50;
    this.save.data.coins += bonus;
    this.save.persist();
    const stars = c.holes.reduce((s, h, i) => s + starsFor(scores[i], h.par), 0);
    const nextIdx = this.courseIdx + 1;
    const nextOk = nextIdx < COURSES.length && this.unlocked(nextIdx).ok;
    audio.fanfare(true);
    this.game.removeLabels();
    this.ui.courseResult(
      { course: c, scores, stars, coins: this.coinsRun + bonus, best, nextUnlocked: nextOk ? COURSES[nextIdx].name : undefined },
      {
        again: () => this.startTour(this.courseIdx, 0),
        next: nextOk ? () => this.startTour(nextIdx, 0) : undefined,
        menu: () => this.transition('Back to the beach', () => this.showMenu()),
      },
    );
  }

  // ------------------------------------------------------------------------------ pause
  private pause() {
    if (this.game.paused || this.mode === 'menu') return;
    this.game.paused = true;
    this.game.input.enabled = false;
    audio.music?.duck(true);
    this.closePause = this.ui.pauseMenu({
      resume: () => this.resume(),
      restart: () => {
        this.resume();
        if (this.mode === 'tour') this.scores[this.game.holeIndex] = null;
        this.transition('Again!', () => {
          this.ui.showHud({ battle: this.mode === 'battle' || this.mode === 'rush', timer: this.mode === 'battle' || this.mode === 'rush' });
          this.game.restartHole();
        });
      },
      settings: (after) => this.openSettings(after),
      musicOn: () => this.save.data.settings.musicOn,
      toggleMusic: () => this.toggleMusic(),
      quit: () => {
        this.resume();
        this.transition('Back to the beach', () => this.showMenu());
      },
    });
  }

  private resume() {
    this.closePause?.();
    this.closePause = null;
    this.game.paused = false;
    this.game.input.enabled = true;
    audio.music?.duck(false);
  }
}

export { STAR };
