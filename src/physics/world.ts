// Golf ball physics: a single sphere against static triangle meshes, kinematic obstacles,
// an analytic terrain (out of bounds), hazard zones, boost pads, currents and a real cup.
import { Mat, SURFACES } from './surfaces';
import { TriMesh, closestPointOnTri } from './trimesh';

export const BALL_R = 0.2;
export const GRAVITY = 18;
export const PHYS_DT = 1 / 240;
export const MAX_SPEED = 42;
const ROLL_FACTOR = 5 / 7; // solid sphere rolling down an incline

export class Ball {
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  /** Angular velocity, used for visual rolling. */
  wx = 0; wy = 0; wz = 0;
  grounded = false;
  gnx = 0; gny = 1; gnz = 0;
  gmat = 0;
  gvx = 0; gvy = 0; gvz = 0;
  restTime = 0;
  atRest = true;
  holed = false;
  inCupZone = false;
  airTime = 0;
  moveTime = 0;
  boostCooldown = 0;
  teleCooldown = 0;
  lastBoost = -1;
  /** Highest speed seen since launch (used for camera / effects). */
  peakSpeed = 0;
  /** Shot modifiers (power-ups); reset when the ball is placed. */
  rollMul = 1;
  bouncy = false;
  sandProof = false;

  set(x: number, y: number, z: number) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.wx = this.wy = this.wz = 0;
    this.atRest = true;
    this.holed = false;
    this.inCupZone = false;
    this.grounded = true;
    this.gnx = 0; this.gny = 1; this.gnz = 0;
    this.gmat = 0;
    this.gvx = this.gvy = this.gvz = 0;
    this.restTime = 0;
    this.moveTime = 0;
    this.airTime = 0;
    this.boostCooldown = 0;
    this.teleCooldown = 0;
    this.lastBoost = -1;
    this.clearMods();
  }

  clearMods() {
    this.rollMul = 1;
    this.bouncy = false;
    this.sandProof = false;
  }

  launch(dx: number, dz: number, speed: number, vy = 0) {
    const l = Math.hypot(dx, dz) || 1;
    this.vx = (dx / l) * speed;
    this.vz = (dz / l) * speed;
    this.vy = vy;
    if (vy > 0) this.grounded = false;
    this.atRest = false;
    this.restTime = 0;
    this.moveTime = 0;
    this.peakSpeed = speed;
    this.lastBoost = -1;
  }

  copyFrom(o: Ball) {
    Object.assign(this, o);
  }

  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }
}

export interface Pose {
  x: number; y: number; z: number;
  /** Row-major 3x3 rotation: world = R * local + p */
  m: Float64Array;
}

export function makePose(): Pose {
  const m = new Float64Array(9);
  m[0] = m[4] = m[8] = 1;
  return { x: 0, y: 0, z: 0, m };
}

/** Rotation about a unit axis (Rodrigues), written row-major into m. */
export function rotAxis(m: Float64Array, ax: number, ay: number, az: number, ang: number) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  m[0] = t * ax * ax + c; m[1] = t * ax * ay - s * az; m[2] = t * ax * az + s * ay;
  m[3] = t * ax * ay + s * az; m[4] = t * ay * ay + c; m[5] = t * ay * az - s * ax;
  m[6] = t * ax * az - s * ay; m[7] = t * ay * az + s * ax; m[8] = t * az * az + c;
}

export interface Kinematic {
  mesh: TriMesh; // local space
  /** Bounding sphere in local space. */
  cx: number; cy: number; cz: number; radius: number;
  poseAt(t: number, out: Pose): void;
  /** Material override (otherwise from mesh). */
  id: string;
}

export function makeKinematic(id: string, mesh: TriMesh, poseAt: (t: number, out: Pose) => void): Kinematic {
  const cx = (mesh.bmin[0] + mesh.bmax[0]) / 2, cy = (mesh.bmin[1] + mesh.bmax[1]) / 2, cz = (mesh.bmin[2] + mesh.bmax[2]) / 2;
  const radius = Math.hypot(mesh.bmax[0] - cx, mesh.bmax[1] - cy, mesh.bmax[2] - cz);
  return { id, mesh, cx, cy, cz, radius, poseAt };
}

export interface Zone2D {
  /** Signed distance (inside < 0). */
  sdf: (x: number, z: number) => number;
  yMin: number;
  yMax: number;
}
export interface BoostZone extends Zone2D { dx: number; dz: number; speed: number; id: number }
export interface FlowZone extends Zone2D { fx: number; fz: number; strength: number }
export interface HazardZone { sdf: (x: number, z: number) => number; y: number; kind: 'water' | 'lava' }
export interface Teleporter { x: number; y: number; z: number; r: number; tx: number; ty: number; tz: number; dx: number; dz: number; keep: number; minSpeed: number }

export interface Cup { x: number; y: number; z: number; r: number; depth: number }

export type HazardKind = 'water' | 'lava' | 'oob';

export interface PhysEvents {
  impact?(speed: number, mat: number, ground: boolean, x: number, y: number, z: number): void;
  hazard?(kind: HazardKind, x: number, y: number, z: number): void;
  holed?(): void;
  boost?(id: number): void;
  bumper?(x: number, y: number, z: number): void;
  teleport?(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): void;
  rimHit?(): void;
}

const _cp = new Float64Array(3);
const _cand = new Int32Array(1024);
const _kcand = new Int32Array(512);

interface Contact {
  pen: number;
  nx: number; ny: number; nz: number;
  mat: number;
  vsx: number; vsy: number; vsz: number;
  px: number; py: number; pz: number;
}

export class PhysicsWorld {
  static: TriMesh;
  kinematics: Kinematic[] = [];
  terrainHeight: ((x: number, z: number) => number) | null = null;
  waterY = 0;
  killY = -6;
  hazards: HazardZone[] = [];
  boosts: BoostZone[] = [];
  flows: FlowZone[] = [];
  teleporters: Teleporter[] = [];
  cup: Cup | null = null;
  /** Extra downward pull inside the cup radius (makes the cup a bit more forgiving). */
  cupAssist = 0.25;

  private best: Contact = { pen: 0, nx: 0, ny: 0, nz: 0, mat: 0, vsx: 0, vsy: 0, vsz: 0, px: 0, py: 0, pz: 0 };
  private kPoses: { cur: Pose; prev: Pose }[] = [];

  constructor(staticMesh: TriMesh) {
    this.static = staticMesh;
  }

  addKinematic(k: Kinematic) {
    this.kinematics.push(k);
    this.kPoses.push({ cur: makePose(), prev: makePose() });
  }

  /** True if a resting ball is touched by a moving obstacle at time t (so it should be woken up). */
  touchedByKinematic(b: Ball, t: number): boolean {
    if (!this.kinematics.length) return false;
    const r = BALL_R + 0.01;
    const pose = this.kPoses[0]?.cur;
    for (let ki = 0; ki < this.kinematics.length; ki++) {
      const k = this.kinematics[ki];
      const P = this.kPoses[ki].cur;
      k.poseAt(t, P);
      const R = P.m;
      const wx = b.x - P.x, wy = b.y - P.y, wz = b.z - P.z;
      const lx = R[0] * wx + R[3] * wy + R[6] * wz;
      const ly = R[1] * wx + R[4] * wy + R[7] * wz;
      const lz = R[2] * wx + R[5] * wy + R[8] * wz;
      if (Math.hypot(lx - k.cx, ly - k.cy, lz - k.cz) > k.radius + r) continue;
      const n = k.mesh.query(lx - r, ly - r, lz - r, lx + r, ly + r, lz + r, _kcand);
      for (let i = 0; i < n; i++) {
        closestPointOnTri(k.mesh.tri, _kcand[i], lx, ly, lz, _cp);
        if ((lx - _cp[0]) ** 2 + (ly - _cp[1]) ** 2 + (lz - _cp[2]) ** 2 < r * r) return true;
      }
    }
    void pose;
    return false;
  }

  /** Advance the ball by dt starting at time t. Returns false if the ball is inactive. */
  step(b: Ball, t: number, dt: number, ev: PhysEvents | null): boolean {
    if (b.atRest) return false;
    const r = BALL_R;
    const G = GRAVITY;

    b.moveTime += dt;
    if (b.boostCooldown > 0) b.boostCooldown -= dt;
    if (b.teleCooldown > 0) b.teleCooldown -= dt;

    // ---- forces ---------------------------------------------------------
    let ax = 0, ay = -G, az = 0;
    if (b.grounded) {
      const nx = b.gnx, ny = b.gny, nz = b.gnz;
      const gn = -G * ny; // g . n
      // tangent component of gravity
      const tx = -gn * nx, ty = -G - gn * ny, tz = -gn * nz;
      ax = gn * nx + tx * ROLL_FACTOR;
      ay = gn * ny + ty * ROLL_FACTOR;
      az = gn * nz + tz * ROLL_FACTOR;
    }
    // cup assist: a little extra pull down & to the center once over the hole
    const cup = this.cup;
    if (cup) {
      const dxc = b.x - cup.x, dzc = b.z - cup.z;
      const dh = Math.hypot(dxc, dzc);
      b.inCupZone = dh < cup.r;
      if (b.inCupZone && b.y < cup.y + r * 1.2) {
        ay -= G * 0.9 * this.cupAssist;
        const pull = 6 * this.cupAssist;
        ax -= dxc * pull;
        az -= dzc * pull;
      }
    }
    b.vx += ax * dt;
    b.vy += ay * dt;
    b.vz += az * dt;

    // ---- rolling resistance ------------------------------------------------
    if (b.grounded) {
      let s = SURFACES[b.gmat] ?? SURFACES[Mat.Turf];
      if (b.sandProof && b.gmat === Mat.Sand) s = SURFACES[Mat.Turf];
      const nx = b.gnx, ny = b.gny, nz = b.gnz;
      let rvx = b.vx - b.gvx, rvy = b.vy - b.gvy, rvz = b.vz - b.gvz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      let tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz;
      const sp = Math.hypot(tx, ty, tz);
      if (sp > 0) {
        const dec = (s.rollDecel * ny + s.rollDrag * sp) * b.rollMul * dt;
        const k = dec >= sp ? 0 : 1 - dec / sp;
        tx *= k; ty *= k; tz *= k;
      }
      rvx = tx + vn * nx; rvy = ty + vn * ny; rvz = tz + vn * nz;
      b.vx = rvx + b.gvx; b.vy = rvy + b.gvy; b.vz = rvz + b.gvz;
    } else {
      const k = 1 - 0.03 * dt;
      b.vx *= k; b.vz *= k;
    }

    // ---- currents -----------------------------------------------------------
    for (const f of this.flows) {
      if (b.y < f.yMin || b.y > f.yMax) continue;
      if (f.sdf(b.x, b.z) > 0) continue;
      const k = Math.min(1, f.strength * dt);
      b.vx += (f.fx - b.vx) * k;
      b.vz += (f.fz - b.vz) * k;
    }

    // clamp speed
    const spd = Math.hypot(b.vx, b.vy, b.vz);
    if (spd > MAX_SPEED) {
      const k = MAX_SPEED / spd;
      b.vx *= k; b.vy *= k; b.vz *= k;
    }

    // ---- integrate -------------------------------------------------------------
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    // ---- collisions --------------------------------------------------------------
    // update kinematic poses
    for (let i = 0; i < this.kinematics.length; i++) {
      const k = this.kinematics[i];
      const kp = this.kPoses[i];
      k.poseAt(t, kp.prev);
      k.poseAt(t + dt, kp.cur);
    }

    let grounded = false;
    let gnx = 0, gny = 0, gnz = 0, gmat: number = Mat.Turf, gvx = 0, gvy = 0, gvz = 0, gweight = 0;
    const m = this.static;
    const q = r + 0.05;
    const ncand = m.query(b.x - q, b.y - q, b.z - q, b.x + q, b.y + q, b.z + q, _cand);

    for (let iter = 0; iter < 5; iter++) {
      const c = this.best;
      c.pen = 0;
      // static
      for (let i = 0; i < ncand; i++) {
        const tri = _cand[i];
        closestPointOnTri(m.tri, tri, b.x, b.y, b.z, _cp);
        const dx = b.x - _cp[0], dy = b.y - _cp[1], dz = b.z - _cp[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        const pen = r - d;
        if (pen <= c.pen) continue;
        c.pen = pen;
        if (d > 1e-7) { c.nx = dx / d; c.ny = dy / d; c.nz = dz / d; }
        else { c.nx = m.nrm[tri * 3]; c.ny = m.nrm[tri * 3 + 1]; c.nz = m.nrm[tri * 3 + 2]; }
        c.mat = m.mat[tri];
        c.vsx = c.vsy = c.vsz = 0;
        c.px = _cp[0]; c.py = _cp[1]; c.pz = _cp[2];
      }
      // kinematic
      for (let ki = 0; ki < this.kinematics.length; ki++) {
        const k = this.kinematics[ki];
        const { cur, prev } = this.kPoses[ki];
        const R = cur.m;
        // to local: R^T (p - pos)
        const wx = b.x - cur.x, wy = b.y - cur.y, wz = b.z - cur.z;
        const lx = R[0] * wx + R[3] * wy + R[6] * wz;
        const ly = R[1] * wx + R[4] * wy + R[7] * wz;
        const lz = R[2] * wx + R[5] * wy + R[8] * wz;
        if (Math.hypot(lx - k.cx, ly - k.cy, lz - k.cz) > k.radius + r) continue;
        const km = k.mesh;
        const nk = km.query(lx - q, ly - q, lz - q, lx + q, ly + q, lz + q, _kcand);
        for (let i = 0; i < nk; i++) {
          const tri = _kcand[i];
          closestPointOnTri(km.tri, tri, lx, ly, lz, _cp);
          const dx = lx - _cp[0], dy = ly - _cp[1], dz = lz - _cp[2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          const pen = r - d;
          if (pen <= c.pen) continue;
          let nlx, nly, nlz;
          if (d > 1e-7) { nlx = dx / d; nly = dy / d; nlz = dz / d; }
          else { nlx = km.nrm[tri * 3]; nly = km.nrm[tri * 3 + 1]; nlz = km.nrm[tri * 3 + 2]; }
          c.pen = pen;
          c.nx = R[0] * nlx + R[1] * nly + R[2] * nlz;
          c.ny = R[3] * nlx + R[4] * nly + R[5] * nlz;
          c.nz = R[6] * nlx + R[7] * nly + R[8] * nlz;
          c.mat = km.mat[tri];
          // contact point in world, current and previous
          const cx = _cp[0], cy = _cp[1], cz = _cp[2];
          const pwx = R[0] * cx + R[1] * cy + R[2] * cz + cur.x;
          const pwy = R[3] * cx + R[4] * cy + R[5] * cz + cur.y;
          const pwz = R[6] * cx + R[7] * cy + R[8] * cz + cur.z;
          const P = prev.m;
          const ppx = P[0] * cx + P[1] * cy + P[2] * cz + prev.x;
          const ppy = P[3] * cx + P[4] * cy + P[5] * cz + prev.y;
          const ppz = P[6] * cx + P[7] * cy + P[8] * cz + prev.z;
          c.vsx = (pwx - ppx) / dt; c.vsy = (pwy - ppy) / dt; c.vsz = (pwz - ppz) / dt;
          c.px = pwx; c.py = pwy; c.pz = pwz;
        }
      }
      if (c.pen <= 0) break;
      // ---- resolve ----
      b.x += c.nx * c.pen;
      b.y += c.ny * c.pen;
      b.z += c.nz * c.pen;
      const s = SURFACES[c.mat] ?? SURFACES[Mat.Turf];
      let rvx = b.vx - c.vsx, rvy = b.vy - c.vsy, rvz = b.vz - c.vsz;
      const vn = rvx * c.nx + rvy * c.ny + rvz * c.nz;
      const isGround = c.ny > 0.6;
      if (vn < 0) {
        const impactSpeed = -vn;
        let e = impactSpeed > s.bounceMin ? s.restitution : 0;
        if (b.bouncy && isGround && impactSpeed > 1.6 && !s.hazard) e = Math.max(e, 0.68);
        const jn = -(1 + e) * vn;
        rvx += c.nx * jn; rvy += c.ny * jn; rvz += c.nz * jn;
        // impact friction for walls and hard landings
        if (!isGround || impactSpeed > 1.2) {
          const vn2 = rvx * c.nx + rvy * c.ny + rvz * c.nz;
          const tx = rvx - vn2 * c.nx, ty = rvy - vn2 * c.ny, tz = rvz - vn2 * c.nz;
          const tl = Math.hypot(tx, ty, tz);
          if (tl > 1e-6) {
            const dvt = Math.min(tl, s.friction * jn);
            rvx -= (tx / tl) * dvt; rvy -= (ty / tl) * dvt; rvz -= (tz / tl) * dvt;
          }
        }
        if (s.kick) {
          const out = rvx * c.nx + rvy * c.ny + rvz * c.nz;
          if (out < s.kick) {
            const add = s.kick - out;
            rvx += c.nx * add; rvy += c.ny * add; rvz += c.nz * add;
          }
          ev?.bumper?.(c.px, c.py, c.pz);
        }
        if (ev?.impact && (impactSpeed > (isGround ? 1.0 : 0.35))) ev.impact(impactSpeed, c.mat, isGround, c.px, c.py, c.pz);
        b.vx = rvx + c.vsx; b.vy = rvy + c.vsy; b.vz = rvz + c.vsz;
      }
      if (isGround) {
        grounded = true;
        const w = c.pen + 1e-4;
        gnx += c.nx * w; gny += c.ny * w; gnz += c.nz * w;
        if (w > gweight) { gweight = w; gmat = c.mat; gvx = c.vsx; gvy = c.vsy; gvz = c.vsz; }
      }
      const hz = s.hazard;
      if (hz && ev?.hazard) ev.hazard(hz, b.x, b.y, b.z);
      if (hz) { b.atRest = true; return false; }
    }

    // ground stickiness: if we were grounded last step and a ground surface with nearly the same slope is
    // just below (tessellation creases), stay in contact instead of hopping.
    if (!grounded && b.grounded && b.vy <= 0.5 && spd < 9) {
      const probe = 0.035;
      const nc2 = m.query(b.x - q, b.y - q - probe, b.z - q, b.x + q, b.y + q, b.z + q, _cand);
      let bestD = r + probe;
      let found = -1;
      for (let i = 0; i < nc2; i++) {
        const tri = _cand[i];
        if (m.nrm[tri * 3 + 1] < 0.6) continue;
        const dotPrev = m.nrm[tri * 3] * b.gnx + m.nrm[tri * 3 + 1] * b.gny + m.nrm[tri * 3 + 2] * b.gnz;
        if (dotPrev < 0.985) continue;
        // only snap onto face interiors; never get pulled over an edge (e.g. the cup lip)
        if (closestPointOnTri(m.tri, tri, b.x, b.y, b.z, _cp) !== 0) continue;
        const d = Math.hypot(b.x - _cp[0], b.y - _cp[1], b.z - _cp[2]);
        if (d < bestD) { bestD = d; found = tri; }
      }
      if (found >= 0) {
        // snap down along face normal
        const nx = m.nrm[found * 3], ny = m.nrm[found * 3 + 1], nz = m.nrm[found * 3 + 2];
        const delta = bestD - r;
        b.x -= nx * delta; b.y -= ny * delta; b.z -= nz * delta;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn > 0) { b.vx -= vn * nx; b.vy -= vn * ny; b.vz -= vn * nz; }
        grounded = true;
        gnx = nx; gny = ny; gnz = nz; gmat = m.mat[found]; gvx = gvy = gvz = 0;
      }
    }

    // ---- analytic terrain (out of bounds ground) ------------------------------------
    if (this.terrainHeight) {
      const h = this.terrainHeight(b.x, b.z);
      if (b.y - r < h) {
        b.y = h + r;
        if (b.vy < 0) b.vy = -b.vy * 0.3;
        ev?.hazard?.('oob', b.x, b.y, b.z);
        b.atRest = true;
        return false;
      }
    }

    // ---- hazards ------------------------------------------------------------------------
    if (b.y < this.waterY + 0.02) {
      ev?.hazard?.('water', b.x, this.waterY, b.z);
      b.atRest = true;
      return false;
    }
    for (const hz of this.hazards) {
      if (b.y < hz.y + 0.02 && hz.sdf(b.x, b.z) < 0) {
        ev?.hazard?.(hz.kind, b.x, hz.y, b.z);
        b.atRest = true;
        return false;
      }
    }
    if (b.y < this.killY) {
      ev?.hazard?.('oob', b.x, b.y, b.z);
      b.atRest = true;
      return false;
    }

    // ---- ground state ------------------------------------------------------------------------
    if (grounded) {
      const l = Math.hypot(gnx, gny, gnz) || 1;
      b.gnx = gnx / l; b.gny = gny / l; b.gnz = gnz / l;
      b.gmat = gmat; b.gvx = gvx; b.gvy = gvy; b.gvz = gvz;
      b.airTime = 0;
    } else {
      b.airTime += dt;
      b.gvx = b.gvy = b.gvz = 0;
    }
    b.grounded = grounded;

    // ---- boosts --------------------------------------------------------------------------------
    if (grounded) {
      for (const bz of this.boosts) {
        if (b.y < bz.yMin || b.y > bz.yMax || bz.sdf(b.x, b.z) > 0) continue;
        const along = b.vx * bz.dx + b.vz * bz.dz;
        if (along < bz.speed) {
          // keep a little of the lateral component, redirect most along the pad
          const latx = b.vx - along * bz.dx, latz = b.vz - along * bz.dz;
          b.vx = bz.dx * bz.speed + latx * 0.35;
          b.vz = bz.dz * bz.speed + latz * 0.35;
          if (b.lastBoost !== bz.id || b.boostCooldown <= 0) ev?.boost?.(bz.id);
          b.lastBoost = bz.id;
          b.boostCooldown = 0.4;
        }
      }
    }

    // ---- teleporters -----------------------------------------------------------------------------
    if (b.teleCooldown <= 0) {
      for (const tp of this.teleporters) {
        if (Math.hypot(b.x - tp.x, b.y - tp.y, b.z - tp.z) < tp.r) {
          const sp = Math.max(tp.minSpeed, Math.hypot(b.vx, b.vz) * tp.keep);
          const fx = b.x, fy = b.y, fz = b.z;
          b.x = tp.tx; b.y = tp.ty; b.z = tp.tz;
          b.vx = tp.dx * sp; b.vz = tp.dz * sp; b.vy = 0;
          b.teleCooldown = 0.6;
          ev?.teleport?.(fx, fy, fz, tp.tx, tp.ty, tp.tz);
          break;
        }
      }
    }

    // ---- cup ---------------------------------------------------------------------------------------------
    if (cup && !b.holed) {
      const dh = Math.hypot(b.x - cup.x, b.z - cup.z);
      if (dh < cup.r && b.y < cup.y - r * 0.55) {
        b.holed = true;
        ev?.holed?.();
      }
    }

    // ---- visual spin ---------------------------------------------------------------------------------------------
    if (grounded) {
      const rvx = b.vx - b.gvx, rvy = b.vy - b.gvy, rvz = b.vz - b.gvz;
      // w = n x v / r
      b.wx = (b.gny * rvz - b.gnz * rvy) / r;
      b.wy = (b.gnz * rvx - b.gnx * rvz) / r;
      b.wz = (b.gnx * rvy - b.gny * rvx) / r;
    }

    // ---- rest detection -----------------------------------------------------------------------------------------
    const rs = Math.hypot(b.vx - b.gvx, b.vy - b.gvy, b.vz - b.gvz);
    const groundMoving = Math.abs(b.gvx) + Math.abs(b.gvy) + Math.abs(b.gvz) > 0.01;
    if (grounded && !groundMoving && rs < 0.14) {
      const s = SURFACES[b.gmat] ?? SURFACES[Mat.Turf];
      const slopePull = GRAVITY * Math.sqrt(Math.max(0, 1 - b.gny * b.gny)) * ROLL_FACTOR;
      if (slopePull < s.rollDecel * b.rollMul * b.gny * 0.92 || rs < 0.025) {
        b.restTime += dt;
        if (b.restTime > 0.12) {
          b.atRest = true;
          b.vx = b.vy = b.vz = 0;
          b.wx = b.wy = b.wz = 0;
          return false;
        }
      } else b.restTime = 0;
    } else b.restTime = 0;
    if (b.moveTime > 30) {
      // safety net: never let a shot run forever
      b.atRest = true;
      b.vx = b.vy = b.vz = 0;
      return false;
    }
    return true;
  }
}
