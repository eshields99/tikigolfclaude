// Pointer input, Golf Battle style: touch your ball and pull back to aim, swipe anywhere else to look
// around the hole. Pinch / wheel zoom, two-finger / right-drag orbit, middle-drag pan.
// With `aimAnywhere` on, any one-finger drag aims (the classic scheme) and two fingers pan instead.

export interface AimState {
  active: boolean;
  /** Drag vector in CSS pixels (current - start). */
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export interface InputHandlers {
  canAim(): boolean;
  /** Whether a press at this screen point grabs the player's ball. */
  isOnBall(x: number, y: number): boolean;
  onAimStart(a: AimState): void;
  onAimMove(a: AimState): void;
  onAimEnd(a: AimState, cancelled: boolean): void;
  onOrbit(dxPx: number, dyPx: number): void;
  /** Look-around drag in CSS pixels since the last call ("grab the ground"). */
  onPan(dxPx: number, dyPx: number): void;
  /** Look-around finger lifted, with its release velocity in CSS px per second. */
  onPanEnd(vxPx: number, vyPx: number): void;
  onRecenter(): void;
  onZoom(factor: number): void;
  onTap(x: number, y: number): void;
}

type Gesture = 'none' | 'aim' | 'pan' | 'orbit' | 'two';

/** Held keys that pan the view: screen direction the view moves in. */
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0],
  ArrowUp: [0, -1], w: [0, -1],
  ArrowDown: [0, 1], s: [0, 1],
};

export class Input {
  aim: AimState = { active: false, dx: 0, dy: 0, startX: 0, startY: 0, x: 0, y: 0 };
  /** Classic scheme: a one-finger drag anywhere aims; two fingers pan. */
  aimAnywhere = false;
  /** Held arrow / WASD keys as a view direction on screen (-1..1 per axis; y < 0 is forward). */
  keyPan = { x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number; button: number }>();
  private gesture: Gesture = 'none';
  private aimId = -1;
  private panId = -1;
  private panSamples: { t: number; x: number; y: number }[] = [];
  private pinchDist = 0;
  private twistAngle = 0;
  private twistAcc = 0;
  private held = new Set<string>();
  private downTime = 0;
  private downX = 0;
  private downY = 0;
  enabled = true;

  /** Some finger or button is down. */
  get pressed() {
    return this.pointers.size > 0;
  }

  constructor(private el: HTMLElement, private h: InputHandlers) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up, { passive: false });
    window.addEventListener('pointercancel', this.cancel, { passive: false });
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.key);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', () => {
      this.held.clear();
      this.updateKeyPan();
    });
  }

  private keyName(e: KeyboardEvent) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  private key = (e: KeyboardEvent) => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = this.keyName(e);
    if (k === 'q') this.h.onOrbit(-40, 0);
    if (k === 'e') this.h.onOrbit(40, 0);
    if (k === 'c' && !e.repeat) this.h.onRecenter();
    if (k === 'Escape' && this.aim.active) this.endAim(true);
    if (PAN_KEYS[k]) {
      e.preventDefault();
      this.held.add(k);
      this.updateKeyPan();
    }
  };

  private keyUp = (e: KeyboardEvent) => {
    if (this.held.delete(this.keyName(e))) this.updateKeyPan();
  };

  private updateKeyPan() {
    let x = 0, y = 0;
    for (const k of this.held) {
      x += PAN_KEYS[k][0];
      y += PAN_KEYS[k][1];
    }
    this.keyPan.x = Math.sign(x);
    this.keyPan.y = Math.sign(y);
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    this.downTime = performance.now();
    this.downX = e.clientX;
    this.downY = e.clientY;
    if (this.pointers.size >= 2) {
      // second finger: drop the aim or pan, switch to two-finger camera gestures
      if (this.aim.active) this.endAim(true);
      this.panId = -1;
      this.gesture = 'two';
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.twistAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.twistAcc = 0;
      return;
    }
    if (e.button === 2) {
      this.gesture = 'orbit';
      return;
    }
    if (e.button === 0 && this.h.canAim() && (this.aimAnywhere || this.h.isOnBall(e.clientX, e.clientY))) {
      this.gesture = 'aim';
      this.aimId = e.pointerId;
      this.aim = { active: true, dx: 0, dy: 0, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
      this.h.onAimStart(this.aim);
      return;
    }
    // anything else looks around
    this.gesture = 'pan';
    this.panId = e.pointerId;
    this.panSamples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
    this.h.onPan(0, 0); // catch a gliding view
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const px = p.x, py = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    switch (this.gesture) {
      case 'two': {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0 && d > 0) this.h.onZoom(this.pinchDist / d);
        this.pinchDist = d;
        // the midpoint moves by half of this finger's step
        const mx = (e.clientX - px) * 0.5, my = (e.clientY - py) * 0.5;
        if (this.aimAnywhere) {
          this.h.onPan(mx, my);
          // twist rotates the view once it is clearly intended
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          let da = ang - this.twistAngle;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          this.twistAngle = ang;
          if (Math.abs(this.twistAcc) < 0.12) {
            this.twistAcc += da;
            if (Math.abs(this.twistAcc) >= 0.12) da = this.twistAcc;
            else da = 0;
          }
          if (da) this.h.onOrbit(da / 0.006, 0);
        } else this.h.onOrbit(mx, my);
        return;
      }
      case 'orbit':
        this.h.onOrbit(e.clientX - px, e.clientY - py);
        return;
      case 'pan': {
        if (e.pointerId !== this.panId) return;
        this.h.onPan(e.clientX - px, e.clientY - py);
        // event timestamps, so a janky frame doesn't distort the release velocity
        const t = e.timeStamp;
        this.panSamples.push({ t, x: e.clientX, y: e.clientY });
        while (this.panSamples.length > 2 && t - this.panSamples[0].t > 120) this.panSamples.shift();
        return;
      }
      case 'aim':
        if (e.pointerId === this.aimId && this.aim.active) {
          this.aim.x = e.clientX;
          this.aim.y = e.clientY;
          this.aim.dx = e.clientX - this.aim.startX;
          this.aim.dy = e.clientY - this.aim.startY;
          this.h.onAimMove(this.aim);
        }
        return;
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const quick = performance.now() - this.downTime < 250 && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 10;
    if (e.pointerId === this.aimId && this.aim.active) {
      this.endAim(false);
      if (quick) this.h.onTap(e.clientX, e.clientY);
    } else if (e.pointerId === this.panId) {
      this.panId = -1;
      if (quick) this.h.onTap(e.clientX, e.clientY);
      else this.fling(e);
    } else if (quick && this.gesture !== 'two' && this.gesture !== 'orbit') this.h.onTap(e.clientX, e.clientY);
    if (this.pointers.size === 0) this.gesture = 'none';
  };

  /** Release velocity from the last ~100 ms of the pan finger (zero if it paused before lifting). */
  private fling(e: PointerEvent) {
    const t = e.timeStamp;
    const s = this.panSamples;
    const last = s[s.length - 1];
    if (!last || t - last.t > 60) return this.h.onPanEnd(0, 0);
    const first = s.find((p) => t - p.t <= 100) ?? last;
    const dt = Math.max(16, t - first.t) / 1000;
    this.h.onPanEnd((e.clientX - first.x) / dt, (e.clientY - first.y) / dt);
  }

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.aimId && this.aim.active) this.endAim(true);
    if (e.pointerId === this.panId) this.panId = -1;
    if (this.pointers.size === 0) this.gesture = 'none';
  };

  private wheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.h.onZoom(Math.exp(e.deltaY * 0.0012));
  };

  cancelAim() {
    if (this.aim.active) this.endAim(true);
  }

  private endAim(cancelled: boolean) {
    this.aim.active = false;
    this.aimId = -1;
    this.h.onAimEnd(this.aim, cancelled);
  }
}
