// Pointer input: Golf Battle style "drag anywhere, pull back and release" aiming,
// plus secondary camera gestures (two-finger / right-drag orbit, wheel / pinch zoom).

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
  onAimStart(a: AimState): void;
  onAimMove(a: AimState): void;
  onAimEnd(a: AimState, cancelled: boolean): void;
  onOrbit(dxPx: number, dyPx: number): void;
  onZoom(factor: number): void;
  onTap(x: number, y: number): void;
}

export class Input {
  aim: AimState = { active: false, dx: 0, dy: 0, startX: 0, startY: 0, x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number; button: number }>();
  private aimId = -1;
  private orbitMode = false;
  private pinchDist = 0;
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
  }

  private key = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.key === 'q' || e.key === 'Q') this.h.onOrbit(-40, 0);
    if (e.key === 'e' || e.key === 'E') this.h.onOrbit(40, 0);
    if (e.key === 'Escape' && this.aim.active) this.endAim(true);
  };

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    this.downTime = performance.now();
    this.downX = e.clientX;
    this.downY = e.clientY;
    if (this.pointers.size >= 2) {
      // second finger: cancel aim, switch to camera gestures
      if (this.aim.active) this.endAim(true);
      this.orbitMode = true;
      const pts = [...this.pointers.values()];
      this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      return;
    }
    if (e.button === 2 || e.button === 1) {
      this.orbitMode = true;
      return;
    }
    if (this.h.canAim()) {
      this.aimId = e.pointerId;
      this.aim = { active: true, dx: 0, dy: 0, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
      this.h.onAimStart(this.aim);
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const px = p.x, py = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.orbitMode) {
      if (this.pointers.size >= 2) {
        const pts = [...this.pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchDist > 0) this.h.onZoom(this.pinchDist / d);
        this.pinchDist = d;
        this.h.onOrbit((e.clientX - px) * 0.5, (e.clientY - py) * 0.5);
      } else this.h.onOrbit(e.clientX - px, e.clientY - py);
      return;
    }
    if (e.pointerId === this.aimId && this.aim.active) {
      this.aim.x = e.clientX;
      this.aim.y = e.clientY;
      this.aim.dx = e.clientX - this.aim.startX;
      this.aim.dy = e.clientY - this.aim.startY;
      this.h.onAimMove(this.aim);
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const quick = performance.now() - this.downTime < 250 && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 10;
    if (e.pointerId === this.aimId && this.aim.active) {
      this.endAim(false);
      if (quick) this.h.onTap(e.clientX, e.clientY);
    } else if (quick && !this.orbitMode) this.h.onTap(e.clientX, e.clientY);
    if (this.pointers.size === 0) this.orbitMode = false;
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.aimId && this.aim.active) this.endAim(true);
    if (this.pointers.size === 0) this.orbitMode = false;
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
