// Camera rig: intro flyby, aim view behind the ball, follow while rolling, celebration orbit, overview.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, smootherstep, type P2 } from '../core/math';

export type CamMode = 'intro' | 'aim' | 'follow' | 'celebrate' | 'overview' | 'menu';

export const fwd = (yaw: number) => new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, -dz);

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

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
  }

  setAspect(aspect: number) {
    this.portrait = aspect < 1;
    // keep a pleasant horizontal coverage in portrait, tighter vertical in landscape
    this.cam.fov = this.portrait ? clamp(58 / Math.max(0.45, aspect * 1.25), 52, 70) : 46;
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
    this.yaw = this.routeYaw(ball, cup);
  }

  skipIntro() {
    if (this.mode === 'intro') this.introT = this.introDur;
  }

  get introDone() {
    return this.mode !== 'intro' || this.introT >= this.introDur;
  }

  beginShot(aimYaw: number) {
    this.shotYaw = aimYaw;
    this.mode = 'follow';
  }

  setAim(snapTo?: number) {
    this.mode = 'aim';
    if (snapTo !== undefined) this.yaw = snapTo;
  }

  celebrate() {
    this.mode = 'celebrate';
    this.celebrateT = 0;
  }

  overview(center: THREE.Vector3, radius: number) {
    this.mode = 'overview';
    this.overviewCenter.copy(center);
    this.overviewDist = radius * (this.portrait ? 2.1 : 1.4) + 6;
  }

  addShake(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }

  orbit(dxPx: number, dyPx: number) {
    this.userYaw = wrapAngle(this.userYaw - dxPx * 0.006);
    this.userPitch = clamp(this.userPitch + dyPx * 0.004, -0.35, 0.6);
  }

  zoomBy(f: number) {
    this.zoom = clamp(this.zoom * f, 0.55, 1.9);
  }

  update(dt: number, c: CamContext) {
    let tgt = new THREE.Vector3();
    let yaw = this.yaw, pitch = this.pitch, dist = this.dist;
    let lambda = 4.5;
    const baseDist = this.portrait ? 8.6 : 7.4;
    const basePitch = this.portrait ? 0.66 : 0.52;
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
        if (u > 0.85) tgt.lerp(c.ball.clone().add(fwd(aimYaw).multiplyScalar(2.5)), (u - 0.85) / 0.15);
        lambda = 7;
        this.yaw = yaw;
        if (this.introT >= this.introDur) this.mode = 'aim';
        break;
      }
      case 'aim': {
        const want = this.routeYaw(c.ball, c.cup);
        this.yaw = dampAngle(this.yaw, want, 3, dt);
        yaw = this.yaw + this.userYaw;
        tgt.copy(c.ball).add(fwd(yaw).multiplyScalar(2.6));
        tgt.y = c.ball.y;
        pitch = basePitch + this.userPitch + (c.aiming ? c.aimPower * 0.08 : 0);
        dist = baseDist * this.zoom * (1 + (c.aiming ? c.aimPower * 0.18 : 0));
        lambda = 4;
        break;
      }
      case 'follow': {
        yaw = this.shotYaw + this.userYaw;
        this.yaw = this.shotYaw;
        tgt.copy(c.ball);
        const ahead = Math.min(3, c.ballSpeed * 0.18);
        tgt.add(fwd(yaw).multiplyScalar(ahead));
        pitch = basePitch + this.userPitch + (c.airborne ? 0.12 : 0) + Math.min(0.1, c.ballSpeed * 0.006);
        dist = baseDist * this.zoom * (1 + Math.min(0.35, c.ballSpeed * 0.02));
        lambda = 3.2;
        break;
      }
      case 'celebrate': {
        this.celebrateT += dt;
        this.yaw += dt * 0.32;
        yaw = this.yaw;
        tgt.copy(c.cup);
        pitch = 0.42;
        dist = 5.2;
        lambda = 2.2;
        break;
      }
      case 'overview': {
        tgt.copy(this.overviewCenter);
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
