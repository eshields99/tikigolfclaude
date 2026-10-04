// Pointer input, Golf Battle style: a drag that starts inside an invisible ring around your ball is a
// shot (pull back and release); a drag that starts anywhere else swings the camera around the ball.
// Pinch / wheel zoom, two-finger / right-drag orbit. With `aimAnywhere` on, any one-finger drag aims
// (the classic scheme) and two fingers turn the camera.

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
  /** Whether a press at this screen point is inside the shot ring around the player's ball. */
  inShotRing(x: number, y: number): boolean;
  onAimStart(a: AimState): void;
  onAimMove(a: AimState): void;
  onAimEnd(a: AimState, cancelled: boolean): void;
  onOrbit(dxPx: number, dyPx: number): void;
  /** One-finger drag that started outside the shot ring: swing the camera around the ball. */
  onTurn(dxPx: number): void;
  onResetView(): void;
  onZoom(factor: number): void;
  onTap(x: number, y: number): void;
}

type Gesture = 'none' | 'aim' | 'turn' | 'orbit' | 'two';

/** Held keys that turn the camera around the ball. */
const TURN_KEYS: Record<string, number> = { ArrowLeft: -1, a: -1, ArrowRight: 1, d: 1 };

export class Input {
  aim: AimState = { active: false, dx: 0, dy: 0, startX: 0, startY: 0, x: 0, y: 0 };
  /** Classic scheme: a one-finger drag anywhere aims; two fingers turn the camera. */
  aimAnywhere = false;
  /** Held ← / → (A / D): -1, 0 or 1. */
  keyTurn = 0;
  private pointers = new Map<number, { x: number; y: number; button: number }>();
  private gesture: Gesture = 'none';
  private aimId = -1;
  private pinchDist = 0;
  private held = new Set<string>();
  private downTime = 0;
  private downX = 0;
  private downY = 0;
  enabled = true;

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
      this.updateKeyTurn();
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
    if (k === 'c' && !e.repeat) this.h.onResetView();
    if (k === 'Escape' && this.aim.active) this.endAim(true);
    if (k in TURN_KEYS) {
      e.preventDefault();
      this.held.add(k);
      this.updateKeyTurn();
    }
  };

  private keyUp = (e: KeyboardEvent) => {
    if (this.held.delete(this.keyName(e))) this.updateKeyTurn();
  };

  private updateKeyTurn() {
    let t = 0;
    for (const k of this.held) t += TURN_KEYS[k];
    this.keyTurn = Math.sign(t);
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
      // second finger: cancel the aim, switch to two-finger camera gestures
      if (this.aim.active) this.endAim(true);
      this.gesture = 'two';
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    if (e.button === 2 || e.button === 1) {
      this.gesture = 'orbit';
      return;
    }
    if (e.button === 0 && this.h.canAim() && (this.aimAnywhere || this.h.inShotRing(e.clientX, e.clientY))) {
      this.gesture = 'aim';
      this.aimId = e.pointerId;
      this.aim = { active: true, dx: 0, dy: 0, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
      this.h.onAimStart(this.aim);
      return;
    }
    // anything else swings the camera around the ball
    this.gesture = 'turn';
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
        this.h.onOrbit((e.clientX - px) * 0.5, (e.clientY - py) * 0.5);
        return;
      }
      case 'orbit':
        this.h.onOrbit(e.clientX - px, e.clientY - py);
        return;
      case 'turn':
        // like Golf Battle, a one-finger drag only turns the camera; its tilt and height stay put
        this.h.onTurn(e.clientX - px);
        return;
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
    } else if (quick && this.gesture !== 'two' && this.gesture !== 'orbit') this.h.onTap(e.clientX, e.clientY);
    if (this.pointers.size === 0) this.gesture = 'none';
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.aimId && this.aim.active) this.endAim(true);
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
