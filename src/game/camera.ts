// Camera rig: intro flyby, aim view behind the ball, follow while rolling, celebration orbit, overview,
// plus a Golf Battle style look-around pan (swipe to scout other lanes) on the aim view and the map.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, smoothstep, smootherstep, type P2 } from '../core/math';

export type CamMode = 'intro' | 'aim' | 'follow' | 'celebrate' | 'overview' | 'menu';

export const fwd = (yaw: number) => new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, -dz);

/** Ground samples around a panned view's target (centre plus a 2.5 m cross). */
const GROUND_TAPS: [number, number][] = [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]];

/** Move `cur` by `d` without pushing it further outside [lo, hi] (it may always move back inside). */
const limit = (cur: number, d: number, lo: number, hi: number) =>
  d > 0 ? Math.max(cur, Math.min(cur + d, hi)) : Math.min(cur, Math.max(cur + d, lo));

export class Route {
  pts: P2[];
  cum: number[] = [0];
  constructor(pts: P2[]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  get length() {
    return this.cum[this.cum.length - 1];
  }
  closestS(x: number, z: number) {
    let best = Infinity, bs = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez || 1e-9;
      const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1);
      const px = a[0] + ex * t, pz = a[1] + ez * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best) { best = d; bs = this.cum[i] + Math.sqrt(l2) * t; }
    }
    return bs;
  }
  at(s: number): P2 {
    s = clamp(s, 0, this.length);
    for (let i = 0; i < this.pts.length - 1; i++) {
      if (s <= this.cum[i + 1] || i === this.pts.length - 2) {
        const seg = this.cum[i + 1] - this.cum[i] || 1e-9;
        const t = clamp((s - this.cum[i]) / seg, 0, 1);
        const a = this.pts[i], b = this.pts[i + 1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    return this.pts[this.pts.length - 1];
  }
}

export interface CamContext {
  ball: THREE.Vector3;
  ballVel?: THREE.Vector3;
  cup: THREE.Vector3;
  aiming: boolean;
  aimPower: number;
  ballSpeed: number;
  airborne: boolean;
  groundY: (x: number, z: number) => number;
}

export class CameraRig {
  cam: THREE.PerspectiveCamera;
  mode: CamMode = 'aim';
  yaw = 0;
  pitch = 0.62;
  dist = 8;
  userYaw = 0;
  userPitch = 0;
  zoom = 1;
  target = new THREE.Vector3();
  pos = new THREE.Vector3();
  private shotYaw = 0;
  private introT = 0;
  private introDur = 3.2;
  private introRoute: Route | null = null;
  private introStart = new THREE.Vector3();
  private celebrateT = 0;
  private overviewCenter = new THREE.Vector3();
  private overviewDist = 30;
  private shake = 0;
  route: Route | null = null;
  portrait = true;
  /** Look-around offset of the view from its automatic target (world XZ). */
  pan = new THREE.Vector3();
  private panVel = new THREE.Vector3();
  private panBase = new THREE.Vector3();
  private bounds: THREE.Box3 | null = null;
  /** Where a view left looking at (x, z) should settle: the nearest bit of course, or null when it is
   *  already over the course. Lets a drag cross water to another lane without resting over the sea. */
  courseSnap: ((x: number, z: number) => [number, number] | null) | null = null;
  /** A finger or button is down on the view (a held view never drifts). */
  holding = false;
  private panIdle = 0;
  private settleChecked = true;
  private settle: THREE.Vector3 | null = null;
  private viewH = 800;
  /** Aim-view zoom kept aside while the overview map uses its own. */
  private aimZoom = 1;

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
  }

  setAspect(aspect: number, viewH = this.viewH) {
    this.viewH = Math.max(1, viewH);
    this.portrait = aspect < 1;
    // keep a pleasant horizontal coverage in portrait, tighter vertical in landscape
    this.cam.fov = this.portrait ? clamp(58 / Math.max(0.45, aspect * 1.25), 52, 70) : 50;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }

  /** Desired yaw at a ball position: look a few units ahead along the route (or at the cup when close). */
  routeYaw(ball: THREE.Vector3, cup: THREE.Vector3) {
    const dc = Math.hypot(cup.x - ball.x, cup.z - ball.z);
    if (!this.route || dc < 4.5) return yawOf(cup.x - ball.x, cup.z - ball.z);
    const s = this.route.closestS(ball.x, ball.z);
    const ahead = this.route.at(s + 6);
    const dx = ahead[0] - ball.x, dz = ahead[1] - ball.z;
    if (Math.hypot(dx, dz) < 1) return yawOf(cup.x - ball.x, cup.z - ball.z);
    return yawOf(dx, dz);
  }

  startIntro(route: Route, cup: THREE.Vector3, ball: THREE.Vector3) {
    this.mode = 'intro';
    this.introT = 0;
    this.introRoute = route;
    this.introDur = clamp(2.2 + route.length * 0.05, 2.6, 4.2);
    this.introStart.copy(cup);
    this.userYaw = 0;
    this.userPitch = 0;
    this.zoom = 1;
    this.recenter();
    this.yaw = this.routeYaw(ball, cup);
  }

  skipIntro() {
    if (this.mode === 'intro') this.introT = this.introDur;
  }

  get introDone() {
    return this.mode !== 'intro' || this.introT >= this.introDur;
  }

  beginShot(aimYaw: number) {
    this.leaveOverview();
    this.shotYaw = aimYaw;
    // any manual rotation or scouting was only for lining up the putt; follow from behind the ball
    this.userYaw = 0;
    this.recenter();
    this.zoom = Math.min(this.zoom, 1.9);
    this.mode = 'follow';
  }

  setAim(snapTo?: number) {
    this.leaveOverview();
    this.mode = 'aim';
    if (snapTo !== undefined) this.yaw = snapTo;
  }

  celebrate() {
    this.leaveOverview();
    this.mode = 'celebrate';
    this.celebrateT = 0;
  }

  overview(center: THREE.Vector3, radius: number) {
    if (this.mode !== 'overview') {
      this.aimZoom = this.zoom;
      this.zoom = 1;
    }
    this.recenter();
    this.mode = 'overview';
    this.overviewCenter.copy(center);
    this.overviewDist = radius * (this.portrait ? 2.1 : 1.4) + 6;
  }

  /** Leaving the map restores the aim view's zoom. */
  private leaveOverview() {
    if (this.mode !== 'overview') return;
    this.zoom = this.aimZoom;
    this.recenter();
  }

  /** Clamp look-around panning to the hole's footprint (plus a small margin). */
  setBounds(b: THREE.Box3) {
    this.bounds = b.clone().expandByVector(new THREE.Vector3(2, 0, 2));
  }

  get canPan() {
    return this.mode === 'aim' || this.mode === 'overview';
  }

  /** The view has been dragged away from the ball. */
  get panned() {
    return this.pan.lengthSq() > 0.36;
  }

  /** Panned, turned well round or zoomed out to scout: worth offering a way back. */
  get lookingAround() {
    return this.panned || Math.abs(this.userYaw) > 0.6 || this.zoom > 1.95;
  }

  /** Look-around drag ("grab the ground"): the point under the finger follows it. */
  panBy(dxPx: number, dyPx: number) {
    if (!this.canPan) return;
    this.panVel.set(0, 0, 0);
    this.panIdle = 0;
    this.settleChecked = false;
    this.settle = null;
    if (dxPx || dyPx) this.applyPan(this.pxToWorld(dxPx, dyPx));
  }

  /** Let the view glide on after a swipe (release velocity in CSS px per second). */
  fling(vxPx: number, vyPx: number) {
    if (!this.canPan) return;
    this.panIdle = 0;
    this.settleChecked = false;
    this.settle = null;
    this.panVel.copy(this.pxToWorld(vxPx, vyPx));
    const sp = this.panVel.length();
    if (sp > 45) this.panVel.multiplyScalar(45 / sp);
  }

  /** Drop the look-around offset; the view glides back to the ball. */
  recenter() {
    this.pan.set(0, 0, 0);
    this.panVel.set(0, 0, 0);
    this.settle = null;
  }

  /** Recenter and undo manual rotation and zoom: the default view behind the ball. */
  resetView() {
    this.recenter();
    this.userYaw = 0;
    this.userPitch = 0;
    this.zoom = 1;
  }

  /** World XZ movement of the view for a screen drag, measured at the ground being looked at. */
  private pxToWorld(dxPx: number, dyPx: number) {
    const off = this.pos.clone().sub(this.target);
    const dist = Math.max(1, off.length());
    const sinEl = clamp(off.y / dist, 0.3, 1);
    const k = (2 * dist * Math.tan((this.cam.fov * Math.PI) / 360)) / this.viewH;
    const flat = Math.hypot(off.x, off.z);
    const f = fwd(flat > 0.05 ? yawOf(-off.x, -off.z) : this.yaw + this.userYaw);
    // screen right is (-f.z, f.x): dragging right moves the view left, dragging down moves it forward
    const a = dxPx * k, b = (dyPx * k) / sinEl;
    return new THREE.Vector3(f.z * a + f.x * b, 0, -f.x * a + f.z * b);
  }

  /** Shift the view, clamped to the bounds; the camera moves with it so nothing lags the finger. */
  private applyPan(d: THREE.Vector3): [number, number] {
    const ox = this.pan.x, oz = this.pan.z;
    const bx = this.panBase.x, bz = this.panBase.z;
    let nx = ox + d.x, nz = oz + d.z;
    const b = this.bounds;
    if (b) {
      nx = limit(ox, d.x, b.min.x - bx, b.max.x - bx);
      nz = limit(oz, d.z, b.min.z - bz, b.max.z - bz);
    }
    this.pan.x = nx;
    this.pan.z = nz;
    const ax = nx - ox, az = nz - oz;
    this.target.x += ax;
    this.target.z += az;
    this.pos.x += ax;
    this.pos.z += az;
    return [ax, az];
  }

  addShake(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }

  orbit(dxPx: number, dyPx: number) {
    this.userYaw = wrapAngle(this.userYaw - dxPx * 0.006);
    this.userPitch = clamp(this.userPitch + dyPx * 0.004, -0.35, 0.6);
  }

  zoomBy(f: number) {
    // the aim view can pull well back to scout far lanes; the map has its own range
    const [lo, hi] = this.mode === 'overview' ? [0.4, 1.5] : [0.55, 2.5];
    this.zoom = clamp(this.zoom * f, lo, hi);
  }

  /** How far ahead of the ball the aim view looks. Landscape screens are short, so the ball sits higher
   *  there, leaving room below it to pull back to full power from the ball. */
  private get aimAhead() {
    return this.portrait ? 2.6 : 1.5;
  }

  /** Zooming out also tilts the view down a little so distant lanes stay readable. */
  private get zoomTilt() {
    return Math.max(0, this.zoom - 1) * 0.15;
  }

  update(dt: number, c: CamContext) {
    let tgt = new THREE.Vector3();
    let yaw = this.yaw, pitch = this.pitch, dist = this.dist;
    let lambda = 4.5;
    const baseDist = this.portrait ? 8.8 : 8.0;
    const basePitch = this.portrait ? 0.6 : 0.42;
    // a swipe's glide
    if (this.panVel.lengthSq() > 0) {
      if (this.canPan) {
        const wx = this.panVel.x * dt, wz = this.panVel.z * dt;
        const [ax, az] = this.applyPan(new THREE.Vector3(wx, 0, wz));
        if (Math.abs(ax) < Math.abs(wx) * 0.5) this.panVel.x = 0;
        if (Math.abs(az) < Math.abs(wz) * 0.5) this.panVel.z = 0;
        this.panVel.multiplyScalar(Math.exp(-4 * dt));
        if (this.panVel.lengthSq() < 0.04) this.panVel.set(0, 0, 0);
      } else this.panVel.set(0, 0, 0);
    }
    // a view left looking at water or sand drifts back onto the nearest bit of course
    if (this.mode === 'aim' && this.panned && this.panVel.lengthSq() === 0 && !this.holding) {
      this.panIdle += dt;
      if (!this.settleChecked && this.panIdle > 0.25 && this.courseSnap) {
        this.settleChecked = true;
        const p = this.courseSnap(this.panBase.x + this.pan.x, this.panBase.z + this.pan.z);
        if (p) this.settle = new THREE.Vector3(p[0] - this.panBase.x, 0, p[1] - this.panBase.z);
      }
      if (this.settle) {
        const k = 1 - Math.exp(-5 * dt);
        this.applyPan(new THREE.Vector3((this.settle.x - this.pan.x) * k, 0, (this.settle.z - this.pan.z) * k));
        if (Math.hypot(this.settle.x - this.pan.x, this.settle.z - this.pan.z) < 0.05) this.settle = null;
      }
    }
    switch (this.mode) {
      case 'intro': {
        this.introT += dt;
        const u = smootherstep(0, 1, this.introT / this.introDur);
        const r = this.introRoute!;
        // fly from cup back to the tee along the route
        const s = r.length * (1 - u);
        const p = r.at(s);
        const ahead = r.at(Math.min(r.length, s + 6));
        const gy = c.groundY(p[0], p[1]);
        tgt.set(p[0], (gy === -Infinity ? c.ball.y : gy) + 0.2, p[1]);
        tgt.lerp(c.cup.clone().setY(c.cup.y), Math.max(0, 1 - u * 3) * 0.6);
        const aimYaw = this.routeYaw(c.ball, c.cup);
        const flyYaw = yawOf(ahead[0] - p[0], ahead[1] - p[1]);
        yaw = u > 0.75 ? lerpAngle(flyYaw, aimYaw, (u - 0.75) / 0.25) : flyYaw;
        if (r.length < 1) yaw = aimYaw;
        pitch = basePitch + (1 - u) * 0.45;
        dist = baseDist * (1.25 + (1 - u) * 0.6);
        if (u > 0.85) tgt.lerp(c.ball.clone().add(fwd(aimYaw).multiplyScalar(this.aimAhead)), (u - 0.85) / 0.15);
        lambda = 7;
        this.yaw = yaw;
        if (this.introT >= this.introDur) this.mode = 'aim';
        break;
      }
      case 'aim': {
        const want = this.routeYaw(c.ball, c.cup);
        // hold the heading while looking around so the view doesn't turn under the finger
        if (!this.panned) this.yaw = dampAngle(this.yaw, want, 3, dt);
        yaw = this.yaw + this.userYaw;
        tgt.copy(c.ball).add(fwd(yaw).multiplyScalar(this.aimAhead));
        tgt.y = c.ball.y;
        this.panBase.copy(tgt);
        tgt.x += this.pan.x;
        tgt.z += this.pan.z;
        const pl = Math.hypot(this.pan.x, this.pan.z);
        if (pl > 0.3) {
          // frame raised ledges and sunken pools at the height of the ground being looked at; the median
          // of a few samples ignores the tops of statues and posts
          const gys: number[] = [];
          for (const [ox, oz] of GROUND_TAPS) {
            const g = c.groundY(tgt.x + ox, tgt.z + oz);
            if (g !== -Infinity) gys.push(g);
          }
          if (gys.length) {
            gys.sort((a, b) => a - b);
            tgt.y += clamp(gys[gys.length >> 1] - c.ball.y, -1.5, 5) * smoothstep(0.3, 3, pl);
          }
        }
        // scouting further away rises into a higher, more top-down view that sees over the props
        const scout = smoothstep(0.6, 8, pl);
        pitch = basePitch + this.userPitch + this.zoomTilt + scout * 0.3 + (c.aiming ? c.aimPower * 0.08 : 0);
        dist = baseDist * this.zoom * (1 + scout * 0.12 + (c.aiming ? c.aimPower * 0.18 : 0));
        lambda = 4;
        break;
      }
      case 'follow': {
        // gently swing around bends when the ball keeps travelling forward-ish
        if (c.ballSpeed > 2.5 && c.ballVel) {
          const vy = yawOf(c.ballVel.x, c.ballVel.z);
          if (Math.abs(wrapAngle(vy - this.shotYaw)) < 1.6) this.shotYaw = dampAngle(this.shotYaw, vy, 0.9, dt);
        }
        yaw = this.shotYaw + this.userYaw;
        this.yaw = this.shotYaw;
        tgt.copy(c.ball);
        const ahead = Math.min(3, c.ballSpeed * 0.18);
        tgt.add(fwd(yaw).multiplyScalar(ahead));
        pitch = basePitch + this.userPitch + this.zoomTilt + (c.airborne ? 0.12 : 0) + Math.min(0.1, c.ballSpeed * 0.006);
        dist = baseDist * this.zoom * (1 + Math.min(0.35, c.ballSpeed * 0.02));
        lambda = 3.2;
        break;
      }
      case 'celebrate': {
        this.celebrateT += dt;
        this.yaw += dt * 0.32;
        yaw = this.yaw;
        tgt.copy(c.cup);
        tgt.y += 0.4;
        pitch = 0.5;
        dist = 7.2;
        lambda = 2.2;
        break;
      }
      case 'overview': {
        tgt.copy(this.overviewCenter);
        this.panBase.copy(tgt);
        tgt.x += this.pan.x;
        tgt.z += this.pan.z;
        yaw = this.yaw + this.userYaw;
        pitch = 1.05;
        dist = this.overviewDist * this.zoom;
        lambda = 3;
        break;
      }
      case 'menu': {
        this.yaw += dt * 0.06;
        yaw = this.yaw;
        tgt.copy(this.overviewCenter);
        pitch = 0.5;
        dist = this.overviewDist;
        lambda = 1.5;
        break;
      }
    }
    // smooth
    if (this.pos.lengthSq() === 0) {
      this.target.copy(tgt);
    }
    this.target.x = damp(this.target.x, tgt.x, lambda * 1.3, dt);
    this.target.y = damp(this.target.y, tgt.y, lambda * 1.3, dt);
    this.target.z = damp(this.target.z, tgt.z, lambda * 1.3, dt);
    const f = fwd(yaw);
    const desired = this.target.clone().addScaledVector(f, -Math.cos(pitch) * dist);
    desired.y += Math.sin(pitch) * dist;
    // keep above ground
    const gy = c.groundY(desired.x, desired.z);
    if (gy !== -Infinity) desired.y = Math.max(desired.y, gy + 1.4);
    if (this.pos.lengthSq() === 0) this.pos.copy(desired);
    this.pos.x = damp(this.pos.x, desired.x, lambda, dt);
    this.pos.y = damp(this.pos.y, desired.y, lambda, dt);
    this.pos.z = damp(this.pos.z, desired.z, lambda, dt);
    this.cam.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.25;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.cam.lookAt(this.target);
  }

  setMenuOrbit(center: THREE.Vector3, radius: number) {
    this.mode = 'menu';
    this.overviewCenter.copy(center);
    this.overviewDist = radius;
  }

  snap() {
    this.pos.set(0, 0, 0);
  }
}

function lerpAngle(a: number, b: number, t: number) {
  return a + wrapAngle(b - a) * clamp(t, 0, 1);
}
