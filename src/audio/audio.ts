// Fully synthesized audio: SFX, ambience and a procedural tropical soundtrack (WebAudio, no assets).
import { Rng } from '../core/math';

type Ctx = AudioContext;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: Ctx | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  /** Final output node (after the limiter), for metering. */
  out: AudioNode | null = null;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private pluckCache = new Map<number, AudioBuffer>();
  music: Music | null = null;
  private rollSrc: AudioBufferSourceNode | null = null;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private ambient: { gain: GainNode; stop(): void } | null = null;
  private wfGain: GainNode | null = null;
  private birdT = 3;
  private crackleT = 0;
  sfxVol = 0.85;
  musicVol = 0.6;
  /** Music on/off switch (independent of the volume slider). */
  musicEnabled = true;
  unlocked = false;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    // brick-wall style limiter so stacked hits and jingles never clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    this.master = ctx.createGain();
    this.master.gain.value = 0.78;
    this.master.connect(this.comp).connect(limiter).connect(ctx.destination);
    this.out = limiter;
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.musicBus.gain.value = this.musicVol * 0.68;
    this.ambBus.gain.value = this.sfxVol * 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(2, len, ctx.sampleRate);
    const w = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    for (let c = 0; c < 2; c++) {
      const b = this.brown.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
    }
    // small plate reverb
    this.reverb = ctx.createConvolver();
    const rl = ctx.sampleRate * 1.6;
    const ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < rl; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb).connect(this.master);
    // rolling loop
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 400;
    this.rollSrc = ctx.createBufferSource();
    this.rollSrc.buffer = this.brown;
    this.rollSrc.loop = true;
    this.rollSrc.connect(this.rollFilter).connect(this.rollGain).connect(this.sfxBus);
    this.rollSrc.start();
    this.music = new Music(this, ctx, this.musicBus, this.reverbSend);
    this.unlocked = true;
  }

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    if (!this.music) return;
    if (on) this.music.resume();
    else this.music.stop();
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(sfx * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.68, t, 0.05);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ------------------------------------------------------------------ primitives
  private noiseSrc(t: number, dur: number, buf?: AudioBuffer) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf ?? this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  private gainEnv(t: number, a: number, peak: number, d: number, dest: AudioNode) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }
  tone(type: OscillatorType, f0: number, f1: number, t: number, a: number, d: number, peak: number, dest: AudioNode = this.sfxBus, pan = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d);
    let out: AudioNode = dest;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(dest);
      out = p;
    }
    o.connect(this.gainEnv(t, a, peak, d, out));
    o.start(t);
    o.stop(t + a + d + 0.05);
  }
  burst(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1, dest: AudioNode = this.sfxBus, freqEnd?: number) {
    if (!this.ctx) return;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    this.noiseSrc(t, dur).connect(f).connect(this.gainEnv(t, 0.002, peak, dur, dest));
  }
  pluckBuffer(midi: number) {
    let b = this.pluckCache.get(midi);
    if (b) return b;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const f = mtof(midi);
    const len = Math.floor(sr * 1.6);
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = Math.random() * 2 - 1;
    // soften the excitation (nylon string)
    for (let k = 0; k < 2; k++) for (let i = 1; i < N; i++) buf[i] = (buf[i] + buf[i - 1]) * 0.5;
    let idx = 0;
    const decay = 0.9965;
    for (let i = 0; i < len; i++) {
      const cur = buf[idx];
      const nxt = buf[(idx + 1) % N];
      const v = (cur + nxt) * 0.5 * decay;
      buf[idx] = v;
      d[i] = cur;
      idx = (idx + 1) % N;
    }
    this.pluckCache.set(midi, b);
    return b;
  }
  pluck(midi: number, t: number, vol: number, dest: AudioNode, pan = 0) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.pluckBuffer(midi);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(dest);
    s.start(t);
    s.stop(t + 1.6);
  }

  // ------------------------------------------------------------------ game sfx
  putt(power: number) {
    if (!this.ctx) return;
    const t = this.now;
    const v = 0.35 + power * 0.65;
    this.burst(t, 0.03, 0.6 * v, 'bandpass', 2600, 1.2);
    this.tone('sine', 1250, 620, t, 0.002, 0.07, 0.55 * v);
    this.tone('triangle', 330, 220, t, 0.002, 0.06, 0.4 * v);
    if (power > 0.75) this.burst(t + 0.01, 0.18, 0.12 * v, 'bandpass', 1200, 0.8, this.sfxBus, 400);
  }
  impact(speed: number, kind: string) {
    if (!this.ctx) return;
    const t = this.now;
    const v = Math.min(1, speed / 12);
    if (v < 0.04) return;
    switch (kind) {
      case 'stone':
      case 'rock':
        this.tone('sine', 190, 95, t, 0.002, 0.09, 0.7 * v);
        this.burst(t, 0.035, 0.45 * v, 'bandpass', 1500 + Math.random() * 400, 1.5);
        break;
      case 'wood':
        this.tone('triangle', 520, 470, t, 0.001, 0.07, 0.5 * v);
        this.tone('sine', 860, 800, t, 0.001, 0.05, 0.3 * v);
        this.burst(t, 0.02, 0.3 * v, 'highpass', 2500);
        break;
      case 'bumper':
        this.tone('sine', 260, 640, t, 0.005, 0.12, 0.45);
        this.tone('sine', 640, 300, t + 0.1, 0.005, 0.16, 0.35);
        this.tone('sine', 110, 60, t, 0.002, 0.14, 0.55);
        break;
      case 'cup':
        this.burst(t, 0.025, 0.4 * v, 'bandpass', 3200, 2);
        this.tone('sine', 1800, 1700, t, 0.001, 0.04, 0.2 * v);
        break;
      case 'metal':
        this.tone('sine', 1900, 1850, t, 0.001, 0.2, 0.3 * v);
        this.tone('sine', 3100, 3050, t, 0.001, 0.12, 0.15 * v);
        break;
      case 'sand':
        this.burst(t, 0.18, 0.35 * v, 'bandpass', 3500, 0.7, this.sfxBus, 1500);
        break;
      case 'water':
        this.tone('sine', 700, 300, t, 0.002, 0.08, 0.25 * v);
        this.burst(t, 0.1, 0.15 * v, 'lowpass', 1500, 0.8);
        break;
      default:
        this.tone('sine', 140, 90, t, 0.002, 0.07, 0.4 * v);
        this.burst(t, 0.03, 0.15 * v, 'lowpass', 900);
    }
  }
  roll(speed: number, grounded: boolean, surface: string) {
    if (!this.ctx) return;
    const t = this.now;
    const target = grounded ? Math.min(0.5, speed * 0.045) * (surface === 'sand' ? 1.4 : surface === 'wood' ? 1.6 : 1) : 0;
    this.rollGain.gain.setTargetAtTime(target, t, 0.05);
    const fc = surface === 'sand' ? 2200 : surface === 'wood' ? 380 + speed * 30 : 180 + speed * 55;
    this.rollFilter.frequency.setTargetAtTime(fc, t, 0.05);
  }
  holeIn(ace: boolean) {
    if (!this.ctx) return;
    const t = this.now;
    // plunk + rattle
    this.tone('sine', 330, 190, t, 0.002, 0.16, 0.6);
    this.burst(t, 0.05, 0.4, 'bandpass', 2400, 2);
    let tt = t + 0.08;
    let gap = 0.075;
    for (let i = 0; i < 6; i++) {
      this.burst(tt, 0.02, 0.32 * (1 - i / 7), 'bandpass', 2800 + Math.random() * 800, 3);
      tt += gap;
      gap *= 0.72;
    }
    // jingle
    const notes = ace ? [72, 76, 79, 84, 88, 91] : [72, 76, 79, 84];
    notes.forEach((n, i) => this.steel(n, t + 0.32 + i * 0.09, 0.35, this.sfxBus));
    if (ace) {
      [60, 64, 67, 72].forEach((n) => this.steel(n, t + 0.95, 0.3, this.sfxBus));
      this.applause(t + 0.3, 2.6, 1);
    } else this.applause(t + 0.35, 1.4, 0.45);
  }
  steel(midi: number, t: number, vol: number, dest: AudioNode) {
    if (!this.ctx) return;
    const f = mtof(midi);
    const partials: [number, number, number][] = [[1, 1, 0.9], [2.0, 0.45, 0.45], [3.02, 0.22, 0.25], [4.16, 0.1, 0.15]];
    for (const [m, a, d] of partials) this.tone('sine', f * m, f * m, t, 0.004, d * 1.2, vol * a, dest);
    this.reverbTap(dest === this.sfxBus ? 0.15 : 0);
  }
  private reverbTap(_v: number) {}
  applause(t: number, dur: number, amount: number) {
    if (!this.ctx) return;
    const claps = Math.round(dur * 26 * amount);
    for (let i = 0; i < claps; i++) {
      const tt = t + Math.random() * dur * (0.6 + Math.random() * 0.4);
      this.burst(tt, 0.03, 0.1 + Math.random() * 0.12, 'bandpass', 1100 + Math.random() * 1400, 1.2);
    }
    // crowd "woo" wash
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09 * amount, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.noiseSrc(t, dur, this.brown).connect(f).connect(g).connect(this.sfxBus);
  }
  splash() {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 0.6, 0.7, 'lowpass', 4000, 0.7, this.sfxBus, 300);
    this.tone('sine', 140, 60, t, 0.005, 0.2, 0.5);
    for (let i = 0; i < 7; i++) {
      const tt = t + 0.1 + Math.random() * 0.5;
      const f = 400 + Math.random() * 500;
      this.tone('sine', f, f * 2.2, tt, 0.004, 0.06, 0.12);
    }
  }
  sizzle() {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 1.1, 0.4, 'highpass', 3000, 0.7);
    for (let i = 0; i < 14; i++) this.burst(t + Math.random() * 0.9, 0.015, 0.25, 'highpass', 5000);
    this.tone('sine', 80, 40, t, 0.01, 0.5, 0.5);
  }
  poof() {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 0.3, 0.4, 'bandpass', 900, 0.8, this.sfxBus, 300);
  }
  boost() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('sawtooth', 180, 900, t, 0.01, 0.32, 0.12);
    this.tone('sine', 360, 1500, t, 0.01, 0.3, 0.25);
    this.burst(t, 0.35, 0.3, 'bandpass', 600, 1.5, this.sfxBus, 4000);
  }
  /** A tiki tunnel gulps the ball down, then a sparkle while it travels. */
  tunnelIn(v = 1) {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('sine', 520, 110, t, 0.004, 0.22, 0.5 * v);
    this.tone('triangle', 180, 60, t + 0.02, 0.004, 0.2, 0.35 * v);
    this.burst(t, 0.18, 0.18 * v, 'bandpass', 900, 1.5, this.sfxBus, 250);
    [84, 88, 91, 96].forEach((n, i) => this.tone('sine', mtof(n), mtof(n), t + 0.14 + i * 0.07, 0.01, 0.3, 0.06 * v));
  }
  /** ...and the exit tiki spits it out. */
  tunnelOut(v = 1) {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('sine', 180, 720, t, 0.004, 0.14, 0.45 * v);
    this.burst(t, 0.12, 0.25 * v, 'bandpass', 1400, 1.2, this.sfxBus, 3200);
    this.tone('sine', 1320, 1320, t + 0.05, 0.004, 0.2, 0.07 * v);
  }
  /** Blowhole eruption: a roar, a hiss of spray and a deep thump. */
  geyserBlast(v = 1) {
    if (!this.ctx || v < 0.03) return;
    const t = this.now;
    this.burst(t, 1.1, 0.5 * v, 'lowpass', 500, 0.7, this.sfxBus, 2600);
    this.burst(t + 0.05, 1.3, 0.22 * v, 'highpass', 3000, 0.7);
    this.tone('sine', 70, 45, t, 0.02, 0.6, 0.4 * v);
  }
  /** Bubbling in a vent that is about to blow. */
  gurgle(v = 1) {
    if (!this.ctx || v < 0.03) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const f = 260 + Math.random() * 380;
      this.tone('sine', f, f * 1.8, t + i * 0.05 + Math.random() * 0.04, 0.004, 0.05, 0.1 * v, this.ambBus);
    }
  }
  /** A gust of wind sweeping past. */
  gust(v = 1) {
    if (!this.ctx || v < 0.03) return;
    const ctx = this.ctx;
    const t = this.now;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(950, t + 0.6);
    f.frequency.linearRampToValueAtTime(380, t + 1.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.48 * v, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    this.noiseSrc(t, 2.2).connect(f).connect(g).connect(this.ambBus);
    this.tone('sine', 880, 1180, t + 0.2, 0.4, 1.0, 0.02 * v, this.ambBus);
  }
  /** The ball drops into water. */
  plop(v = 1) {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('sine', 950, 260, t, 0.002, 0.12, 0.35 * v);
    this.burst(t, 0.15, 0.2 * v, 'lowpass', 1800, 0.8, this.sfxBus, 500);
  }
  powerFire() {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 0.6, 0.5, 'bandpass', 400, 0.9, this.sfxBus, 2600);
    this.tone('sawtooth', 90, 320, t, 0.02, 0.45, 0.14);
    for (let i = 0; i < 10; i++) this.burst(t + 0.05 + Math.random() * 0.5, 0.012, 0.18, 'highpass', 4000);
  }
  powerGlide() {
    if (!this.ctx) return;
    const t = this.now;
    [76, 79, 83, 88].forEach((n, i) => this.tone('sine', 440 * Math.pow(2, (n - 69) / 12), 440 * Math.pow(2, (n - 69) / 12), t + i * 0.05, 0.01, 0.35, 0.12));
    this.burst(t, 0.5, 0.12, 'highpass', 6000);
  }
  boing(v = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.28);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 28;
    const vg = this.ctx.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(o.frequency);
    o.connect(this.gainEnv(t, 0.005, 0.4 * v, 0.32, this.sfxBus));
    o.start(t);
    vib.start(t);
    o.stop(t + 0.4);
    vib.stop(t + 0.4);
  }
  penalty() {
    if (!this.ctx) return;
    const t = this.now + 0.25;
    const wah = (f: number, tt: number, d: number) => {
      const o = this.ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, tt);
      o.frequency.linearRampToValueAtTime(f * 0.94, tt + d);
      const fl = this.ctx!.createBiquadFilter();
      fl.type = 'bandpass';
      fl.Q.value = 3;
      fl.frequency.setValueAtTime(400, tt);
      fl.frequency.linearRampToValueAtTime(1200, tt + d * 0.4);
      fl.frequency.linearRampToValueAtTime(350, tt + d);
      o.connect(fl).connect(this.gainEnv(tt, 0.02, 0.22, d, this.sfxBus));
      o.start(tt);
      o.stop(tt + d + 0.1);
    };
    wah(311, t, 0.28);
    wah(277, t + 0.3, 0.6);
  }
  click() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('sine', 620, 980, t, 0.001, 0.05, 0.25);
    this.burst(t, 0.01, 0.1, 'highpass', 4000);
  }
  whoosh() {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 0.45, 0.22, 'bandpass', 300, 1.2, this.sfxBus, 2500);
  }
  coin(n = 1) {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < Math.min(6, n); i++) {
      this.tone('square', 988, 988, t + i * 0.08, 0.002, 0.06, 0.06);
      this.tone('square', 1319, 1319, t + i * 0.08 + 0.06, 0.002, 0.16, 0.06);
    }
  }
  star(i: number) {
    if (!this.ctx) return;
    const t = this.now;
    this.steel(79 + i * 4, t, 0.3, this.sfxBus);
  }
  tick(urgent: boolean) {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('triangle', urgent ? 1400 : 1000, urgent ? 1300 : 950, t, 0.001, 0.05, 0.25);
  }
  rumble(big = false) {
    if (!this.ctx) return;
    const t = this.now;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = big ? 220 : 140;
    const g = this.gainEnv(t, 0.15, big ? 0.9 : 0.5, big ? 2.2 : 1.4, this.ambBus);
    this.noiseSrc(t, 2.5, this.brown).connect(f).connect(g);
    if (big) this.tone('sine', 55, 32, t, 0.05, 1.2, 0.7, this.ambBus);
  }
  fanfare(win: boolean) {
    if (!this.ctx) return;
    const t = this.now;
    const seq = win ? [67, 72, 76, 79, 76, 79, 84] : [64, 67, 72, 71, 72];
    seq.forEach((n, i) => {
      this.steel(n, t + i * 0.13, 0.32, this.sfxBus);
      this.pluck(n - 12, t + i * 0.13, 0.25, this.sfxBus);
    });
    if (win) this.applause(t + 0.4, 2.4, 0.9);
  }

  // ------------------------------------------------------------------ ambience
  startAmbience(kind: 'beach' | 'jungle' | 'volcano' | 'lagoon') {
    if (!this.ctx) return;
    this.stopAmbience();
    const ctx = this.ctx;
    const t = this.now;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 2);
    gain.connect(this.ambBus);
    const nodes: AudioScheduledSourceNode[] = [];
    // ocean waves: brown noise, slow swells, stereo
    for (let c = 0; c < 2; c++) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = kind === 'volcano' ? 380 : kind === 'lagoon' ? 480 : 650;
      const g = ctx.createGain();
      g.gain.value = 0.1;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09 + c * 0.035;
      const lg = ctx.createGain();
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      const p = ctx.createStereoPanner();
      p.pan.value = c ? 0.6 : -0.6;
      src.connect(f).connect(g).connect(p).connect(gain);
      src.start(t, Math.random());
      lfo.start(t);
      nodes.push(src, lfo);
    }
    // wind
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this.noise;
    wsrc.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 500;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = kind === 'volcano' ? 0.03 : kind === 'lagoon' ? 0.011 : 0.018;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.05;
    const wlg = ctx.createGain();
    wlg.gain.value = 250;
    wl.connect(wlg).connect(wf.frequency);
    wsrc.connect(wf).connect(wg).connect(gain);
    wsrc.start(t);
    wl.start(t);
    nodes.push(wsrc, wl);
    // waterfall bed (gain controlled by distance)
    const fsrc = ctx.createBufferSource();
    fsrc.buffer = this.noise;
    fsrc.loop = true;
    const ff = ctx.createBiquadFilter();
    ff.type = 'lowpass';
    ff.frequency.value = 1400;
    const fg = ctx.createGain();
    fg.gain.value = 0;
    fsrc.connect(ff).connect(fg).connect(gain);
    fsrc.start(t);
    nodes.push(fsrc);
    this.wfGain = fg;
    this.ambKind = kind;
    this.ambient = {
      gain,
      stop: () => {
        const tt = this.now;
        gain.gain.setTargetAtTime(0, tt, 0.4);
        setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 2000);
      },
    };
  }
  private ambKind: 'beach' | 'jungle' | 'volcano' | 'lagoon' = 'beach';
  private cricketT = 0.5;
  private frogT = 2;
  stopAmbience() {
    this.ambient?.stop();
    this.ambient = null;
    this.wfGain = null;
  }
  /** Night chorus: crickets chirping in threes, and the odd tree frog. */
  private nightCritters(dt: number, t: number) {
    this.cricketT -= dt;
    if (this.cricketT <= 0) {
      this.cricketT = 0.35 + Math.random() * 0.9;
      const pan = Math.random() * 1.6 - 0.8;
      const f = 4300 + Math.random() * 600;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone('sine', f, f * 0.98, t + i * 0.055, 0.004, 0.03, 0.014, this.ambBus, pan);
    }
    this.frogT -= dt;
    if (this.frogT <= 0) {
      this.frogT = 1.8 + Math.random() * 4;
      const pan = Math.random() * 1.4 - 0.7;
      const f = 150 + Math.random() * 90;
      const k = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < k; i++) {
        const tt = t + i * 0.22;
        this.tone('square', f, f * 0.82, tt, 0.01, 0.11, 0.022, this.ambBus, pan);
        this.tone('sine', f * 2, f * 1.7, tt, 0.01, 0.1, 0.03, this.ambBus, pan);
      }
    }
  }

  /** Per-frame ambience: birds, torch crackle, waterfall distance. */
  updateAmbience(dt: number, waterfallDist: number, torchDist: number) {
    if (!this.ctx || !this.ambient) return;
    const t = this.now;
    if (this.wfGain) this.wfGain.gain.setTargetAtTime(waterfallDist < 60 ? Math.min(0.22, 3.2 / Math.max(6, waterfallDist)) : 0, t, 0.3);
    if (this.ambKind === 'lagoon') this.nightCritters(dt, t);
    this.birdT -= dt;
    if (this.birdT <= 0 && this.ambKind !== 'volcano' && this.ambKind !== 'lagoon') {
      this.birdT = 2.5 + Math.random() * 6;
      const pan = Math.random() * 1.6 - 0.8;
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + Math.random() * 0.05);
        this.tone('sine', base * (1 + Math.random() * 0.2), base * (0.75 + Math.random() * 0.5), tt, 0.005, 0.06, 0.035, this.ambBus, pan);
      }
    }
    this.crackleT -= dt;
    if (this.crackleT <= 0 && torchDist < 14) {
      this.crackleT = 0.03 + Math.random() * 0.18;
      const v = Math.min(0.12, 1.2 / Math.max(3, torchDist * torchDist * 0.4));
      this.burst(t, 0.008 + Math.random() * 0.01, v, 'highpass', 2500 + Math.random() * 3000, 1, this.ambBus);
    }
  }
}

// ------------------------------------------------------------------------------------ music
type Mood = 'menu' | 'play' | 'battle' | 'volcano' | 'night';

const CHORDS: Record<string, number[]> = {
  C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Dm: [50, 53, 57], Em: [52, 55, 59], E7: [52, 56, 59], Bb: [58, 62, 65],
};
// ukulele voicings (G4 C4 E4 A4 strings) as midi notes
const UKE: Record<string, number[]> = {
  C: [67, 60, 64, 72], Am: [69, 60, 64, 69], F: [69, 60, 65, 69], G: [67, 62, 67, 71], Dm: [69, 62, 65, 69], Em: [67, 64, 67, 71], E7: [68, 62, 64, 71], Bb: [70, 62, 65, 70],
};
const PROG_A = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'];
const PROG_B = ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'];
const PROG_V = ['Am', 'F', 'G', 'Em', 'Am', 'F', 'E7', 'E7'];
const PROG_N = ['F', 'C', 'Dm', 'Am', 'Bb', 'F', 'Bb', 'C'];

class Music {
  private timer = 0;
  private nextT = 0;
  private step = 0; // 16th steps
  private bpm = 104;
  private mood: Mood = 'menu';
  private playing = false;
  private gain: GainNode;
  private rng = new Rng(7);
  private melody: (number | null)[] = [];
  private section = 0;

  constructor(private a: AudioEngine, private ctx: AudioContext, out: GainNode, rev: GainNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    this.gain.connect(rev);
  }

  private stopTimer = 0;
  /** Mood requested by the game, remembered while music is switched off. */
  private wanted: Mood = 'menu';

  private level(m: Mood) {
    return m === 'play' || m === 'volcano' || m === 'night' ? 0.75 : 1;
  }

  play(mood: Mood) {
    this.wanted = mood;
    if (!this.a.musicEnabled) return;
    if (this.stopTimer) {
      // a fade-out was in progress: cancel it and keep the scheduler running
      window.clearTimeout(this.stopTimer);
      this.stopTimer = 0;
    } else if (this.playing && mood === this.mood) return;
    this.mood = mood;
    this.bpm = mood === 'battle' ? 118 : mood === 'volcano' ? 96 : mood === 'night' ? 88 : mood === 'menu' ? 104 : 100;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(this.level(mood), t, 0.6);
    if (!this.playing) {
      this.playing = true;
      this.step = 0;
      this.nextT = t + 0.1;
      this.newMelody();
      this.timer = window.setInterval(() => this.schedule(), 30);
    }
  }

  /** Restart whatever the game last asked for (after music is switched back on). */
  resume() {
    this.play(this.wanted);
  }

  stop() {
    if (!this.playing || this.stopTimer) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.4);
    this.stopTimer = window.setTimeout(() => {
      window.clearInterval(this.timer);
      this.playing = false;
      this.stopTimer = 0;
    }, 1200);
  }

  duck(on: boolean) {
    if (!this.playing || this.stopTimer) return;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(on ? 0.25 : this.level(this.mood), t, 0.25);
  }

  private prog() {
    if (this.mood === 'volcano') return PROG_V;
    if (this.mood === 'night') return PROG_N;
    return this.section % 2 === 0 ? PROG_A : PROG_B;
  }

  private newMelody() {
    // 8 bars x 16 steps; pentatonic, chord-aware, with rests
    const pent = [0, 2, 4, 7, 9];
    const prog = this.prog();
    this.melody = [];
    let last = 76;
    for (let bar = 0; bar < 8; bar++) {
      const ch = CHORDS[prog[bar]];
      const rhythm = this.rng.pick([
        [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
        [1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
        [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
      ]);
      for (let s = 0; s < 16; s++) {
        if (!rhythm[s] || (bar % 4 === 3 && s > 8)) {
          this.melody.push(null);
          continue;
        }
        // strong beats prefer chord tones
        let n: number;
        if (s % 4 === 0) {
          const tones = ch.map((c) => c + 12).concat(ch.map((c) => c + 24));
          tones.sort((x, y) => Math.abs(x - last) - Math.abs(y - last));
          n = tones[this.rng.int(0, 1)];
        } else {
          const cands: number[] = [];
          for (let o = 60; o <= 88; o += 12) for (const p of pent) cands.push(o + p);
          const near = cands.filter((c) => Math.abs(c - last) <= 4 && c !== last);
          n = near.length ? this.rng.pick(near) : last;
        }
        n = Math.max(67, Math.min(86, n));
        last = n;
        this.melody.push(n);
      }
    }
  }

  private schedule() {
    const spb = 60 / this.bpm;
    const s16 = spb / 4;
    while (this.nextT < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextT, s16);
      this.nextT += s16;
      this.step++;
      if (this.step % 128 === 0) {
        this.section++;
        this.newMelody();
      }
    }
  }

  private playStep(step: number, t: number, s16: number) {
    const a = this.a;
    const g = this.gain;
    const bar = Math.floor(step / 16) % 8;
    const s = step % 16;
    const chordName = this.prog()[bar];
    const chord = CHORDS[chordName];
    const mood = this.mood;
    const full = mood === 'menu' || mood === 'battle';
    const calm = mood === 'night';
    // --- percussion
    if (calm ? s === 0 : s % 8 === 0) a.tone('sine', 120, 45, t, 0.002, 0.18, mood === 'battle' ? 0.55 : calm ? 0.3 : 0.4, g);
    if (s === 6 || s === 14) {
      // clave / woodblock
      a.tone('sine', 1650, 1600, t, 0.001, 0.04, 0.14, g);
      a.burst(t, 0.01, 0.06, 'highpass', 3000, 1, g);
    }
    // shaker 16ths with accents
    if (full || (calm ? s % 4 === 2 : s % 2 === 0)) a.burst(t, 0.035, s % 4 === 2 ? (calm ? 0.04 : 0.07) : 0.035, 'highpass', 7000, 0.8, g);
    // bongos on phrase ends
    if (bar % 4 === 3 && s >= 10 && s % 2 === 0) a.tone('sine', s % 4 === 0 ? 420 : 320, 200, t, 0.002, 0.09, 0.18, g);
    // --- bass (root on 1, syncopated 2&, 5th on 3)
    const root = chord[0] - 24;
    if (s === 0) this.bass(root, t, s16 * 3.5, 0.32);
    if (s === 6) this.bass(root, t, s16 * 1.5, 0.22);
    if (s === 8) this.bass(root + 7, t, s16 * 3, 0.26);
    if (s === 14 && full) this.bass(root + 12, t, s16 * 1.5, 0.18);
    // --- ukulele strum: D . D U . U D U (8ths)
    const pattern = [1, 0, 1, 1, 0, 1, 1, 1];
    const dirs = [1, 0, 1, -1, 0, -1, 1, -1];
    if (s % 2 === 0) {
      const e = s / 2;
      if (pattern[e]) {
        const voic = UKE[chordName];
        const order = dirs[e] > 0 ? voic : [...voic].reverse();
        const vel = (e === 0 ? 0.5 : dirs[e] > 0 ? 0.36 : 0.26) * (mood === 'play' ? 0.8 : 1);
        order.forEach((n, i) => a.pluck(n, t + i * 0.012, vel, g, (i - 1.5) * 0.15));
      }
    }
    // --- steel drum melody (sparser while playing a hole)
    const n = this.melody[(bar * 16 + s) % this.melody.length];
    if (n && (full || mood === 'volcano' ? true : this.section % 2 === 1 || bar >= 4)) a.steel(n, t, mood === 'play' ? 0.13 : 0.17, g);
  }

  private bass(midi: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.gain);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }
}

export const audio = new AudioEngine();
