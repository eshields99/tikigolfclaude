// DOM user interface: menus, HUD, banners, callouts, scorecards, settings and shop.
import './styles.css';
import { ICON, STAR, COIN, TROPHY, TIKI_MARK } from './icons';
import { courseArt } from './art';
import type { CourseInfo } from '../game/game';
import type { Save, Settings } from '../game/save';
import { SKINS, type BallSkin } from '../game/ballview';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function scoreClass(strokes: number, par: number) {
  if (strokes === 1) return 'ace';
  const d = strokes - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'worse';
}

function starsHtml(n: number, max = 3) {
  let s = '';
  for (let i = 0; i < max; i++) s += STAR.replace('<svg', `<svg class="${i < n ? 'on' : ''}"`);
  return s;
}

export interface PlayerRow {
  id: string;
  name: string;
  color: number;
  strokes: number;
  done: boolean;
  me: boolean;
}

export interface UISounds {
  click(): void;
}

export class UI {
  root: HTMLElement;
  private hud: HTMLElement | null = null;
  private hudEls: Record<string, HTMLElement> = {};
  private callTimer = 0;
  private bannerEl: HTMLElement | null = null;
  private powerEl: HTMLElement | null = null;
  private fader: HTMLElement;
  sounds: UISounds = { click: () => {} };
  onPause: () => void = () => {};
  onOverview: () => void = () => {};

  constructor() {
    this.root = el('div');
    this.root.id = 'ui';
    document.body.appendChild(this.root);
    this.fader = el('div', 'fader', `<div class="spinwrap"><div class="tikispin">${TIKI_MARK}</div><div class="outline">Paddling over…</div></div>`);
    document.body.appendChild(this.fader);
  }

  private button(label: string, cls: string, onClick: () => void, icon?: string) {
    const b = el('button', 'btn ' + cls, `${icon ?? ''}${label ? `<span>${label}</span>` : ''}`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sounds.click();
      onClick();
    });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    return b;
  }

  clear() {
    this.root.innerHTML = '';
    this.hud = null;
    this.hudEls = {};
    this.bannerEl = null;
    this.powerEl = null;
  }

  fade(on: boolean, label = 'Paddling over…') {
    (this.fader.querySelector('.outline') as HTMLElement).textContent = label;
    this.fader.classList.toggle('on', on);
  }

  // ------------------------------------------------------------------------ loading
  showLoading() {
    const l = el(
      'div',
      'loading',
      `<div class="sun"></div>
       <div class="logo"><div class="mark">${TIKI_MARK}</div><div class="word">TIKI GOLF</div><div class="ribbon">ISLAND ADVENTURES</div></div>
       <div class="loadbar"><i></i></div>
       <div class="tip outline">Carving tiki statues…</div>`,
    );
    document.body.appendChild(l);
    const bar = l.querySelector('.loadbar i') as HTMLElement;
    const tip = l.querySelector('.tip') as HTMLElement;
    return {
      progress(p: number, text?: string) {
        bar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
        if (text) tip.textContent = text;
      },
      done() {
        l.classList.add('out');
        setTimeout(() => l.remove(), 700);
      },
    };
  }

  // ------------------------------------------------------------------------ main menu
  showMenu(save: Save, h: { tour(): void; battle(): void; rush(): void; practice(): void; shop(): void; settings(): void; help(): void }) {
    this.clear();
    const d = save.data;
    const m = el('div', 'menu');
    const top = el('div', 'topbar');
    const wallet = el('div', 'wallet', `<div class="chip">${COIN}<span>${d.coins}</span></div><div class="chip star">${STAR}<span>${save.totalStars}</span></div><div class="chip">${TROPHY}<span>${d.trophies}</span></div>`);
    const tr = el('div', 'wallet');
    tr.append(this.button('', 'round glass', h.settings, ICON.gear));
    top.append(wallet, tr);
    const center = el('div', 'center', `<div class="logo"><div class="mark">${TIKI_MARK}</div><div class="word">TIKI GOLF</div><div class="ribbon">ISLAND ADVENTURES</div></div>`);
    const bottom = el('div', 'center');
    const modes = el('div', 'modes');
    const tour = this.button('ISLAND TOUR', 'big', h.tour, ICON.play);
    const battle = this.button('', 'pink mode-btn', h.battle);
    battle.innerHTML = `<span style="display:flex;gap:8px;align-items:center">${ICON.swords}TIKI BATTLE</span><small>vs 3 island rivals</small>`;
    const rush = this.button('', 'teal mode-btn', h.rush);
    rush.innerHTML = `<span style="display:flex;gap:8px;align-items:center">${ICON.bolt}RUSH</span><small>race to the cup</small>`;
    const practice = this.button('', 'green mode-btn', h.practice);
    practice.innerHTML = `<span style="display:flex;gap:8px;align-items:center">${ICON.target}PRACTICE</span><small>any hole, no pressure</small>`;
    const shop = this.button('', 'purple mode-btn', h.shop);
    shop.innerHTML = `<span style="display:flex;gap:8px;align-items:center">${ICON.ball}BALLS</span><small>trails & skins</small>`;
    modes.append(tour, battle, rush, practice, shop);
    const footer = el('div', 'footer');
    footer.append(this.button('How to play', 'small glass', h.help, ICON.help));
    bottom.append(modes, footer);
    m.append(top, center, bottom);
    this.root.append(m);
  }

  // ------------------------------------------------------------------------ course select
  showCourses(courses: CourseInfo[], save: Save, title: string, unlocked: (i: number) => { ok: boolean; need: string }, onPick: (i: number) => void, onBack: () => void) {
    this.clear();
    const s = el('div', 'screen');
    const head = el('div', 'head');
    head.append(this.button('', 'round glass', onBack, ICON.back), el('h2', 'outline', title), el('div', 'wallet', `<div class="chip star">${STAR}<span>${save.totalStars}</span></div>`));
    const cards = el('div', 'cards');
    courses.forEach((c, i) => {
      const u = unlocked(i);
      const ids = c.holes.map((x) => x.id);
      const stars = save.starsFor(ids);
      const card = el('div', 'card' + (u.ok ? '' : ' locked'));
      const holes = c.holes
        .map((hd, k) => `<div class="hole-pill">HOLE ${k + 1}<b>${save.data.best[hd.id] ?? '–'}</b>par ${hd.par}</div>`)
        .join('');
      card.innerHTML = `<div class="art">${courseArt(c.id)}</div>
        <div class="body">
          <div class="name">${c.name}</div>
          <div class="sub">${c.subtitle}</div>
          <div class="meta"><span class="stars">${starsHtml(Math.round((stars / (ids.length * 3)) * 3))}</span><span>${stars}/${ids.length * 3} ★</span></div>
          <div class="holes-row">${holes}</div>
        </div>`;
      const body = card.querySelector('.body')!;
      if (u.ok) body.append(this.button('PLAY', 'teal wide', () => onPick(i), ICON.play));
      else body.append(el('div', 'lockmsg', `${ICON.lock}<span>${u.need}</span>`));
      cards.append(card);
    });
    s.append(head, cards);
    this.root.append(s);
  }

  showHoleSelect(course: CourseInfo, save: Save, onPick: (i: number) => void, onBack: () => void) {
    this.clear();
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">${course.name}</div>`);
    const close = this.button('', 'round pink close', onBack, ICON.close);
    const list = el('div', 'btn-col');
    list.style.marginTop = '18px';
    course.holes.forEach((h, i) => {
      const best = save.data.best[h.id];
      const b = this.button('', 'wood wide', () => onPick(i));
      b.innerHTML = `<span style="flex:1;text-align:left">${i + 1}. ${h.name}</span><span style="font-size:16px;opacity:.95">PAR ${h.par}${best ? ` · BEST ${best}` : ''}</span>`;
      list.append(b);
    });
    sheet.append(close, list);
    back.append(sheet);
    this.root.append(back);
  }

  // ------------------------------------------------------------------------ HUD
  showHud(opts: { battle: boolean; timer: boolean }) {
    this.clear();
    const hud = el('div', 'hud');
    const top = el('div', 'hud-top');
    const card = el(
      'div',
      'holecard',
      `<div class="num">1</div><div class="txt"><div class="course"></div><div class="hname"></div></div>
       <div class="par-strokes"><div class="ps"><span>PAR</span><b class="par">3</b></div><div class="ps strokes"><span>STROKES</span><b class="st">0</b></div></div>`,
    );
    const btns = el('div', 'hud-buttons');
    btns.append(this.button('', 'round glass', () => this.onPause(), ICON.pause), this.button('', 'round glass', () => this.onOverview(), ICON.map));
    top.append(card, btns);
    hud.append(top);
    if (opts.timer) {
      const t = el('div', 'timer', `${ICON.clock}<span>1:30</span>`);
      hud.append(t);
      this.hudEls.timer = t;
    }
    if (opts.battle) {
      const p = el('div', 'players');
      hud.append(p);
      this.hudEls.players = p;
    }
    this.root.append(hud);
    this.hud = hud;
    this.hudEls.num = card.querySelector('.num')!;
    this.hudEls.course = card.querySelector('.course')!;
    this.hudEls.hname = card.querySelector('.hname')!;
    this.hudEls.par = card.querySelector('.par')!;
    this.hudEls.st = card.querySelector('.st')!;
  }

  hudHole(i: { num: number; count: number; name: string; par: number; course: string }) {
    if (!this.hud) return;
    this.hudEls.num.textContent = String(i.num).padStart(2, '0');
    this.hudEls.course.textContent = `${i.course} · ${i.num}/${i.count}`;
    this.hudEls.hname.textContent = i.name;
    this.hudEls.par.textContent = String(i.par);
  }

  hudStrokes(strokes: number, par: number) {
    const e = this.hudEls.st;
    if (!e) return;
    const changed = e.textContent !== String(strokes);
    e.textContent = String(strokes);
    e.classList.toggle('under', strokes > 0 && strokes < par);
    if (changed) {
      e.classList.remove('bump');
      void (e as HTMLElement).offsetWidth;
      e.classList.add('bump');
    }
  }

  timer(seconds: number | null) {
    const t = this.hudEls.timer;
    if (!t) return;
    if (seconds === null) {
      t.classList.add('hidden');
      return;
    }
    t.classList.remove('hidden');
    const s = Math.max(0, Math.ceil(seconds));
    (t.querySelector('span') as HTMLElement).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    t.classList.toggle('warn', s <= 10);
  }

  players(rows: PlayerRow[]) {
    const p = this.hudEls.players;
    if (!p) return;
    const html = rows
      .map(
        (r) =>
          `<div class="player${r.me ? ' me' : ''}${r.done ? ' done' : ''}"><div class="av" style="background:${hex(r.color)}">${r.name[0]}</div><span class="nm">${r.name}</span><span class="sc">${r.done ? '✓ ' : ''}${r.strokes}</span></div>`,
      )
      .join('');
    if (p.innerHTML !== html) p.innerHTML = html;
  }

  hint(text: string | null) {
    this.hud?.querySelector('.hint')?.remove();
    if (!text || !this.hud) return;
    const [t1, t2] = text.split('|');
    const h = el('div', 'hint', `<div class="hand">${ICON.hand}</div><div><b>${t1}</b>${t2 ? `<small>${t2}</small>` : ''}</div>`);
    this.hud.append(h);
  }

  power(p: number | null, x = 0, y = 0, color = '#fff') {
    if (p === null) {
      if (this.powerEl) this.powerEl.style.opacity = '0';
      return;
    }
    if (!this.powerEl) {
      this.powerEl = el(
        'div',
        'power',
        `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.25)" stroke-width="9"/><circle class="arc" cx="50" cy="50" r="40" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg><div class="pct">0%</div>`,
      );
      this.root.append(this.powerEl);
    }
    const e = this.powerEl;
    e.style.opacity = '1';
    const side = x > window.innerWidth / 2 ? -1 : 1;
    e.style.left = `${Math.min(window.innerWidth - 50, Math.max(50, x + side * 78))}px`;
    e.style.top = `${Math.max(60, y - 30)}px`;
    const arc = e.querySelector('.arc') as SVGCircleElement;
    arc.setAttribute('stroke-dashoffset', String(251.3 * (1 - p)));
    arc.setAttribute('stroke', color);
    (e.querySelector('.pct') as HTMLElement).textContent = `${Math.round(p * 100)}%`;
  }

  banner(info: { num: number; name: string; par: number; tip?: string; mode?: string }) {
    this.bannerEl?.remove();
    if (!this.hud) return;
    const b = el(
      'div',
      'banner',
      `<div class="tag">${info.mode ? info.mode + ' · ' : ''}HOLE ${info.num}</div><div class="title outline">${info.name}</div><div class="parbadge">PAR ${info.par}</div>${info.tip ? `<div class="tipline">${info.tip}</div>` : ''}`,
    );
    const skip = el('div', 'skip', 'Tap to skip');
    this.hud.append(b, skip);
    this.bannerEl = b;
    const bb = b;
    return () => {
      bb.classList.add('out');
      skip.remove();
      setTimeout(() => bb.remove(), 500);
      if (this.bannerEl === bb) this.bannerEl = null;
    };
  }

  callout(text: string, sub?: string, color = '#fff', coins?: number, rays = false) {
    this.hud?.querySelector('.callout')?.remove();
    if (!this.hud) return;
    const c = el(
      'div',
      'callout',
      `${rays ? '<div class="rays"></div>' : ''}<div class="big outline" style="color:${color}">${text}</div>${sub ? `<div class="small outline">${sub}</div>` : ''}${coins ? `<div class="coins outline">${COIN}+${coins}</div>` : ''}`,
    );
    this.hud.append(c);
    window.clearTimeout(this.callTimer);
    this.callTimer = window.setTimeout(() => {
      c.classList.add('out');
      setTimeout(() => c.remove(), 450);
    }, 2300);
  }

  toast(text: string, kind = 'bad') {
    if (!this.hud) return;
    this.hud.querySelector('.toast')?.remove();
    const t = el('div', 'toast outline ' + kind, text);
    this.hud.append(t);
    setTimeout(() => t.remove(), 2300);
  }

  // ------------------------------------------------------------------------ results
  holeResult(data: {
    course: CourseInfo;
    index: number;
    scores: (number | null)[];
    strokes: number;
    stars: number;
    coins: number;
    isLast: boolean;
    title: string;
    titleColor: string;
  }, h: { next(): void; retry(): void; menu(): void }) {
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">Hole ${data.index + 1} Complete</div>`);
    const par = data.course.holes[data.index].par;
    const rows = data.course.holes
      .map((hd, i) => {
        const s = data.scores[i];
        return `<tr class="${i === data.index ? 'cur' : ''}"><td>${i + 1}. ${hd.name}</td><td>${hd.par}</td><td>${s == null ? '<span class="sbadge none">–</span>' : `<span class="sbadge ${scoreClass(s, hd.par)}">${s}</span>`}</td></tr>`;
      })
      .join('');
    const total = data.scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    const parTotal = data.course.holes.reduce((a, b, i) => a + (data.scores[i] != null ? b.par : 0), 0);
    const diff = total - parTotal;
    sheet.insertAdjacentHTML(
      'beforeend',
      `<div class="result-head"><div class="big" style="color:${data.titleColor === '#ffffff' ? 'var(--wood)' : data.titleColor};filter:drop-shadow(0 2px 0 rgba(0,0,0,.2))">${data.title}</div><div class="sub">${data.strokes} stroke${data.strokes === 1 ? '' : 's'} on a par ${par}</div></div>
       <div class="result-stars">${starsHtml(data.stars)}</div>
       <div class="reward"><div class="chip">${COIN}<span>+${data.coins}</span></div><div class="chip">Total ${total} <span style="opacity:.75">(${diff === 0 ? 'E' : diff > 0 ? '+' + diff : diff})</span></div></div>
       <table class="scorecard"><tr><th style="text-align:left;padding-left:12px">HOLE</th><th>PAR</th><th>YOU</th></tr>${rows}</table>`,
    );
    const btns = el('div', 'btn-row');
    btns.style.marginTop = '14px';
    btns.append(this.button('', 'round wood', h.menu, ICON.home), this.button('', 'round blue', h.retry, ICON.restart), this.button(data.isLast ? 'FINISH' : 'NEXT HOLE', 'green', h.next, ICON.next));
    sheet.append(btns);
    back.append(sheet);
    this.root.append(back);
  }

  courseResult(data: { course: CourseInfo; scores: number[]; stars: number; coins: number; best: boolean; nextUnlocked?: string }, h: { again(): void; next?: () => void; menu(): void }) {
    this.clear();
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">${data.course.name}</div>`);
    const total = data.scores.reduce((a, b) => a + b, 0);
    const par = data.course.holes.reduce((a, b) => a + b.par, 0);
    const diff = total - par;
    const maxStars = data.course.holes.length * 3;
    const rating = Math.round((data.stars / maxStars) * 3);
    sheet.insertAdjacentHTML(
      'beforeend',
      `<div class="result-head"><div class="big">${diff < 0 ? 'Island Champion!' : diff === 0 ? 'Right on Par!' : 'Island Complete!'}</div><div class="sub">${total} strokes · ${diff === 0 ? 'even par' : diff > 0 ? `+${diff} over par` : `${-diff} under par`}${data.best ? ' · NEW BEST!' : ''}</div></div>
       <div class="result-stars">${starsHtml(rating)}</div>
       <div class="reward"><div class="chip star">${STAR}<span>${data.stars}/${maxStars}</span></div><div class="chip">${COIN}<span>+${data.coins}</span></div></div>
       <table class="scorecard"><tr><th style="text-align:left;padding-left:12px">HOLE</th><th>PAR</th><th>YOU</th></tr>${data.course.holes
         .map((hd, i) => `<tr><td>${i + 1}. ${hd.name}</td><td>${hd.par}</td><td><span class="sbadge ${scoreClass(data.scores[i], hd.par)}">${data.scores[i]}</span></td></tr>`)
         .join('')}</table>
       ${data.nextUnlocked ? `<div class="toast good" style="position:relative;left:auto;top:auto;transform:none;margin:14px auto 0;display:table;animation:popIn .5s .4s both">${data.nextUnlocked} unlocked!</div>` : ''}`,
    );
    const col = el('div', 'btn-col');
    col.style.marginTop = '16px';
    if (h.next) col.append(this.button('NEXT ISLAND', 'green wide', h.next, ICON.next));
    const row = el('div', 'btn-row');
    row.append(this.button('MENU', 'wood', h.menu, ICON.home), this.button('AGAIN', 'blue', h.again, ICON.restart));
    col.append(row);
    sheet.append(col);
    back.append(sheet);
    this.root.append(back);
  }

  // ------------------------------------------------------------------------ battle
  matchmaking(rivals: { name: string; color: number }[], myColor: number, done: () => void, title = 'Finding rivals') {
    this.clear();
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">${title}</div>`);
    const slots = el('div', 'match');
    const me = el('div', 'slot found', `<div class="av" style="background:${hex(myColor)}">Y</div><span>You</span>`);
    slots.append(me);
    const rs = rivals.map(() => {
      const s = el('div', 'slot wait', `<div class="av">?</div><span>…</span>`);
      slots.append(s);
      return s;
    });
    const status = el('div', '', '<div class="spinner"></div>');
    status.style.textAlign = 'center';
    sheet.append(slots, status);
    back.append(sheet);
    this.root.append(back);
    rivals.forEach((r, i) => {
      setTimeout(() => {
        rs[i].className = 'slot found';
        rs[i].innerHTML = `<div class="av" style="background:${hex(r.color)}">${r.name[0]}</div><span>${r.name}</span>`;
        if (i === rivals.length - 1) {
          status.innerHTML = '<div class="display" style="font-size:24px;color:var(--wood)">Let’s battle!</div>';
          setTimeout(done, 900);
        }
      }, 650 + i * 520 + Math.random() * 300);
    });
  }

  battleResult(data: { title: string; ranking: { name: string; color: number; total: number; me: boolean }[]; trophies: number; coins: number; myRank: number }, h: { again(): void; menu(): void }) {
    this.clear();
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">${data.title}</div>`);
    const r = data.ranking;
    const spot = (i: number, cls: string) =>
      r[i] ? `<div class="spot ${cls}"><div class="av" style="background:${hex(r[i].color)}">${r[i].name[0]}</div><div class="nm">${r[i].me ? 'You' : r[i].name}</div><div class="block">${i + 1}</div></div>` : '';
    const rankWord = ['1st', '2nd', '3rd', '4th'][data.myRank] ?? `${data.myRank + 1}th`;
    sheet.insertAdjacentHTML(
      'beforeend',
      `<div class="result-head"><div class="big">${data.myRank === 0 ? 'Victory!' : `You placed ${rankWord}`}</div><div class="sub">${data.myRank === 0 ? 'Chief of the island!' : 'So close — go again!'}</div></div>
      <div class="podium">${spot(1, 'p2')}${spot(0, 'p1')}${spot(2, 'p3')}</div>
      <table class="scorecard"><tr><th style="text-align:left;padding-left:12px">GOLFER</th><th>STROKES</th></tr>${r
        .map((p, i) => `<tr class="${p.me ? 'cur' : ''}"><td>${i + 1}. ${p.me ? 'You' : p.name}</td><td><b>${p.total}</b></td></tr>`)
        .join('')}</table>
      <div class="reward"><div class="chip">${TROPHY}<span>${data.trophies >= 0 ? '+' : ''}${data.trophies}</span></div><div class="chip">${COIN}<span>+${data.coins}</span></div></div>`,
    );
    const row = el('div', 'btn-row');
    row.append(this.button('MENU', 'wood', h.menu, ICON.home), this.button('REMATCH', 'pink', h.again, ICON.swords));
    sheet.append(row);
    back.append(sheet);
    this.root.append(back);
  }

  // ------------------------------------------------------------------------ pause / settings / shop / help
  pauseMenu(h: { resume(): void; restart(): void; settings(): void; quit(): void }) {
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">Paused</div>`);
    const col = el('div', 'btn-col');
    col.style.marginTop = '20px';
    const close = () => back.remove();
    col.append(
      this.button('RESUME', 'green wide', () => { close(); h.resume(); }, ICON.play),
      this.button('RESTART HOLE', 'blue wide', () => { close(); h.restart(); }, ICON.restart),
      this.button('SETTINGS', 'wood wide', () => { h.settings(); }, ICON.gear),
      this.button('QUIT TO MENU', 'pink wide', () => { close(); h.quit(); }, ICON.home),
    );
    sheet.append(col);
    back.append(sheet);
    this.root.append(back);
    return close;
  }

  settings(s: Settings, onChange: (s: Settings) => void, onReset: () => void, onClose?: () => void) {
    const back = el('div', 'sheet-backdrop');
    back.style.zIndex = '40';
    const sheet = el('div', 'sheet panel', `<div class="plank">Settings</div>`);
    const close = this.button('', 'round pink close', () => { back.remove(); onClose?.(); }, ICON.close);
    const body = el('div');
    body.style.marginTop = '14px';
    const slider = (label: string, icon: string, key: 'music' | 'sfx') => {
      const row = el('div', 'setting', `<div class="lbl">${icon}<span>${label}</span></div>`);
      const r = el('input') as HTMLInputElement;
      r.type = 'range';
      r.min = '0';
      r.max = '100';
      r.value = String(Math.round(s[key] * 100));
      r.style.setProperty('--v', r.value + '%');
      r.addEventListener('input', () => {
        s[key] = +r.value / 100;
        r.style.setProperty('--v', r.value + '%');
        onChange(s);
      });
      row.append(r);
      return row;
    };
    const seg = el('div', 'seg');
    (['auto', 'low', 'medium', 'high'] as const).forEach((q) => {
      const b = el('button', s.quality === q ? 'on' : '', q === 'medium' ? 'Med' : q[0].toUpperCase() + q.slice(1));
      b.addEventListener('click', () => {
        s.quality = q;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.sounds.click();
        onChange(s);
      });
      seg.append(b);
    });
    const gfx = el('div', 'setting', `<div class="lbl">${ICON.eye}<span>Graphics</span></div>`);
    gfx.append(seg);
    const toggle = (label: string, icon: string, key: 'haptics' | 'guide') => {
      const row = el('div', 'setting', `<div class="lbl">${icon}<span>${label}</span></div>`);
      const t = el('div', 'toggle' + (s[key] ? ' on' : ''));
      t.addEventListener('click', () => {
        s[key] = !s[key];
        t.classList.toggle('on', s[key]);
        this.sounds.click();
        onChange(s);
      });
      row.append(t);
      return row;
    };
    const reset = el('div', 'setting', `<div class="lbl">${ICON.restart}<span>Progress</span></div>`);
    reset.append(this.button('RESET', 'pink small', () => {
      if (confirm('Reset all progress, coins and balls?')) onReset();
    }));
    body.append(slider('Music', ICON.music, 'music'), slider('Sound FX', ICON.sound, 'sfx'), gfx, toggle('Vibration', ICON.bolt, 'haptics'), toggle('Aim guide', ICON.target, 'guide'), reset);
    sheet.append(close, body);
    back.append(sheet);
    this.root.append(back);
  }

  shop(save: Save, onEquip: (skin: BallSkin) => void, onClose: () => void) {
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel wide', `<div class="plank">Ball Collection</div>`);
    const close = this.button('', 'round pink close', () => { back.remove(); onClose(); }, ICON.close);
    const wallet = el('div', 'reward', `<div class="chip">${COIN}<span class="coinv">${save.data.coins}</span></div>`);
    wallet.style.marginTop = '14px';
    const grid = el('div', 'shop-grid');
    const render = () => {
      grid.innerHTML = '';
      (wallet.querySelector('.coinv') as HTMLElement).textContent = String(save.data.coins);
      for (const sk of SKINS) {
        const owned = save.data.ownedBalls.includes(sk.id);
        const eq = save.data.ball === sk.id;
        const c = el('div', 'ballcard' + (eq ? ' eq' : ''));
        c.innerHTML = `<div class="ball3d" style="${ballCss(sk)}"></div><div class="bn">${sk.name}</div>${eq ? '<div class="tagok">EQUIPPED</div>' : owned ? '<div class="tagok" style="color:var(--ink2)">TAP TO EQUIP</div>' : `<div class="price">${COIN}${sk.price}</div>`}`;
        c.addEventListener('click', () => {
          this.sounds.click();
          if (owned) {
            save.data.ball = sk.id;
            save.persist();
            onEquip(sk);
            render();
          } else if (save.data.coins >= sk.price) {
            save.data.coins -= sk.price;
            save.data.ownedBalls.push(sk.id);
            save.data.ball = sk.id;
            save.persist();
            onEquip(sk);
            render();
          } else {
            c.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
          }
        });
        grid.append(c);
      }
    };
    render();
    sheet.append(close, wallet, grid);
    back.append(sheet);
    this.root.append(back);
  }

  howTo(onClose: () => void) {
    const back = el('div', 'sheet-backdrop');
    const sheet = el('div', 'sheet panel', `<div class="plank">How to Play</div>`);
    const close = this.button('', 'round pink close', () => { back.remove(); onClose(); }, ICON.close);
    const rows = [
      ['#f5a21f', ICON.hand, 'Pull back & release', 'Drag anywhere on the screen away from where you want to shoot. Pull further for more power, let go to putt.'],
      ['#12a593', ICON.flag, 'Sink it in few strokes', 'Beat par for stars and coins. A hole-in-one pays big!'],
      ['#2a8de0', ICON.map, 'Look around', 'Tap the map button for an overview. Two-finger drag (or right-drag / Q & E) rotates the camera.'],
      ['#f0365a', ICON.bolt, 'Ramps, boosts & bumpers', 'Ramps launch you over water and lava. Boost pads add speed. Tiki drums bounce you back hard.'],
      ['#7a52e0', ICON.swords, 'Tiki Battle', 'Play the same holes at the same time as 3 rivals. Fewest strokes wins — ties go to the fastest.'],
    ];
    const list = el('div', 'howto');
    list.style.marginTop = '14px';
    list.innerHTML = rows.map(([c, ic, t, p]) => `<div class="row"><div class="ic" style="background:${c}">${ic}</div><div><b>${t}</b><p>${p}</p></div></div>`).join('');
    sheet.append(close, list);
    back.append(sheet);
    this.root.append(back);
  }
}

export function ballCss(sk: BallSkin) {
  const base = hex(sk.base);
  const st = sk.stripe !== undefined ? hex(sk.stripe) : '#fff';
  let bg = `radial-gradient(circle at 35% 30%, #ffffff 0%, ${base} 32%, ${base} 100%)`;
  switch (sk.pattern) {
    case 'stripe':
      bg = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.75) 0%, rgba(255,255,255,0) 35%), linear-gradient(180deg, ${base} 0 40%, ${st} 40% 60%, ${base} 60%)`;
      break;
    case 'half':
      bg = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.75) 0%, rgba(255,255,255,0) 35%), linear-gradient(180deg, ${st} 0 50%, ${base} 50%)`;
      break;
    case 'dots':
      bg = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle, ${st} 0 4px, transparent 5px) 0 0/16px 16px, ${base}`;
      break;
    case 'swirl':
      bg = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 35%), repeating-linear-gradient(135deg, ${base} 0 9px, ${st} 9px 15px)`;
      break;
  }
  return `background:${bg};${sk.emissive ? `box-shadow: 0 0 18px ${hex(sk.emissive)}, inset -9px -11px 0 rgba(0,0,0,.2);` : ''}`;
}
