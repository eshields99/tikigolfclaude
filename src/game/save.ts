// Persistent progress & settings (localStorage, failure tolerant).
import type { Quality } from '../render/renderer';

export interface Settings {
  music: number; // 0..1
  /** Soundtrack on/off (the volume slider is kept separately). */
  musicOn: boolean;
  sfx: number;
  quality: Quality | 'auto';
  haptics: boolean;
  guide: boolean;
  /** Classic controls: drag anywhere to aim, two fingers to look around. */
  aimAnywhere: boolean;
}

export interface SaveData {
  version: number;
  coins: number;
  trophies: number;
  ball: string;
  ownedBalls: string[];
  best: Record<string, number>; // hole id -> best strokes
  stars: Record<string, number>; // hole id -> best stars
  courseBest: Record<string, number>; // course id -> best total
  stats: { holes: number; aces: number; battles: number; wins: number; rushBest: number };
  settings: Settings;
  tutorialDone: boolean;
}

const KEY = 'tikigolf.save.v1';

const defaults = (): SaveData => ({
  version: 1,
  coins: 120,
  trophies: 0,
  ball: 'classic',
  ownedBalls: ['classic'],
  best: {},
  stars: {},
  courseBest: {},
  stats: { holes: 0, aces: 0, battles: 0, wins: 0, rushBest: 0 },
  settings: { music: 0.6, musicOn: true, sfx: 0.85, quality: 'auto', haptics: true, guide: true, aimAnywhere: false },
  tutorialDone: false,
});

export class Save {
  data: SaveData;
  constructor() {
    let d: SaveData | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) d = JSON.parse(raw);
    } catch {
      d = null;
    }
    const def = defaults();
    this.data = d ? { ...def, ...d, settings: { ...def.settings, ...(d.settings ?? {}) }, stats: { ...def.stats, ...(d.stats ?? {}) } } : def;
  }
  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
  }
  starsFor(holeIds: string[]) {
    return holeIds.reduce((s, id) => s + (this.data.stars[id] ?? 0), 0);
  }
  get totalStars() {
    return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
  }
  recordHole(id: string, strokes: number, stars: number) {
    const d = this.data;
    d.best[id] = Math.min(d.best[id] ?? 99, strokes);
    d.stars[id] = Math.max(d.stars[id] ?? 0, stars);
    d.stats.holes++;
    if (strokes === 1) d.stats.aces++;
    this.persist();
  }
  reset() {
    this.data = defaults();
    this.persist();
  }
}

export function starsFor(strokes: number, par: number) {
  if (strokes === 1) return 3;
  const d = strokes - par;
  if (d <= -1) return 3;
  if (d === 0) return 2;
  if (d <= 2) return 1;
  return 0;
}

export function coinsFor(strokes: number, par: number) {
  if (strokes === 1) return 100;
  const d = strokes - par;
  if (d <= -2) return 60;
  if (d === -1) return 40;
  if (d === 0) return 25;
  if (d === 1) return 12;
  return 5;
}
