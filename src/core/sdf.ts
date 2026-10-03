// 2D signed distance fields in the XZ plane (negative = inside).
// Used to author course shapes, generate turf meshes, walls, terrain and decor placement.
import { catmullRom2, type P2 } from './math';

export type Bounds = [number, number, number, number]; // minX, minZ, maxX, maxZ

export interface SDF {
  f: (x: number, z: number) => number;
  b: Bounds;
}

const unionBounds = (a: Bounds, b: Bounds): Bounds => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];
const growBounds = (a: Bounds, r: number): Bounds => [a[0] - r, a[1] - r, a[2] + r, a[3] + r];

export function circle(cx: number, cz: number, r: number): SDF {
  return {
    f: (x, z) => {
      const dx = x - cx, dz = z - cz;
      return Math.sqrt(dx * dx + dz * dz) - r;
    },
    b: [cx - r, cz - r, cx + r, cz + r],
  };
}

/** Ellipse approximation (not an exact distance, good enough for gentle shapes). */
export function ellipse(cx: number, cz: number, rx: number, rz: number, angle = 0): SDF {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = Math.min(rx, rz);
  const R = Math.max(rx, rz);
  return {
    f: (x, z) => {
      const dx = x - cx, dz = z - cz;
      const lx = (dx * c + dz * s) / rx;
      const lz = (-dx * s + dz * c) / rz;
      const k = Math.hypot(lx, lz);
      return (k - 1) * m;
    },
    b: [cx - R, cz - R, cx + R, cz + R],
  };
}

/** Rounded box centered at (cx, cz) with half extents (hw, hd), rotated by angle (radians, around Y). */
export function box(cx: number, cz: number, hw: number, hd: number, angle = 0, round = 0): SDF {
  const c = Math.cos(angle), s = Math.sin(angle);
  const R = Math.hypot(hw, hd);
  return {
    f: (x, z) => {
      const dx = x - cx, dz = z - cz;
      const lx = Math.abs(dx * c + dz * s) - (hw - round);
      const lz = Math.abs(-dx * s + dz * c) - (hd - round);
      const ox = lx > 0 ? lx : 0, oz = lz > 0 ? lz : 0;
      return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(lx, lz), 0) - round;
    },
    b: [cx - R, cz - R, cx + R, cz + R],
  };
}

export function segmentDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const px = x - ax, pz = z - az, ex = bx - ax, ez = bz - az;
  const l2 = ex * ex + ez * ez;
  let h = l2 > 0 ? (px * ex + pz * ez) / l2 : 0;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const qx = px - ex * h, qz = pz - ez * h;
  return Math.sqrt(qx * qx + qz * qz);
}

export function capsule(ax: number, az: number, bx: number, bz: number, r: number): SDF {
  return {
    f: (x, z) => segmentDist(x, z, ax, az, bx, bz) - r,
    b: [Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r],
  };
}

/**
 * A path of given width following a polyline (or a smooth spline through control points).
 * widths may be a single number (full width) or per-control-point widths.
 */
export function path(points: P2[], width: number | number[], opts: { smooth?: boolean; samples?: number } = {}): SDF {
  const smooth = opts.smooth ?? true;
  let pts: P2[];
  let ws: number[];
  if (smooth && points.length > 2) {
    const spp = opts.samples ?? 10;
    pts = catmullRom2(points, spp);
    if (Array.isArray(width)) {
      ws = [];
      for (let s = 0; s < points.length - 1; s++)
        for (let k = 0; k < spp; k++) {
          const t = k / spp;
          const tt = t * t * (3 - 2 * t);
          ws.push(width[s] + (width[s + 1] - width[s]) * tt);
        }
      ws.push(width[width.length - 1]);
    } else ws = pts.map(() => width);
  } else {
    pts = points;
    ws = Array.isArray(width) ? width : pts.map(() => width as number);
  }
  const n = pts.length;
  const ax = new Float64Array(n), az = new Float64Array(n), hr = new Float64Array(n);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, maxR = 0;
  for (let i = 0; i < n; i++) {
    ax[i] = pts[i][0];
    az[i] = pts[i][1];
    hr[i] = ws[i] * 0.5;
    maxR = Math.max(maxR, hr[i]);
    minX = Math.min(minX, ax[i]); maxX = Math.max(maxX, ax[i]);
    minZ = Math.min(minZ, az[i]); maxZ = Math.max(maxZ, az[i]);
  }
  // per-segment constants, so evaluation is a tight loop (this runs millions of times per hole)
  const sx = new Float64Array(n), sz = new Float64Array(n), il2 = new Float64Array(n), rmax = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    sx[i] = ax[i + 1] - ax[i];
    sz[i] = az[i + 1] - az[i];
    const l2 = sx[i] * sx[i] + sz[i] * sz[i];
    il2[i] = l2 > 0 ? 1 / l2 : 0;
    rmax[i] = Math.max(hr[i], hr[i + 1]);
  }
  return {
    f: (x, z) => {
      let best = Infinity;
      for (let i = 0; i < n - 1; i++) {
        const px = x - ax[i], pz = z - az[i];
        const ex = sx[i], ez = sz[i];
        let h = (px * ex + pz * ez) * il2[i];
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        const qx = px - ex * h, qz = pz - ez * h;
        const d2 = qx * qx + qz * qz;
        // skip the square root when this segment can't beat the best so far
        const lim = best + rmax[i];
        if (lim > 0 && d2 >= lim * lim) continue;
        const d = Math.sqrt(d2) - (hr[i] + (hr[i + 1] - hr[i]) * h);
        if (d < best) best = d;
      }
      return best;
    },
    b: [minX - maxR, minZ - maxR, maxX + maxR, maxZ + maxR],
  };
}

/** Exact signed distance to a simple polygon. */
export function polygon(points: P2[]): SDF {
  const n = points.length;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
  }
  return {
    f: (x, z) => {
      let d = (x - points[0][0]) ** 2 + (z - points[0][1]) ** 2;
      let s = 1;
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const vi = points[i], vj = points[j];
        const ex = vj[0] - vi[0], ez = vj[1] - vi[1];
        const wx = x - vi[0], wz = z - vi[1];
        const h = Math.max(0, Math.min(1, (wx * ex + wz * ez) / (ex * ex + ez * ez)));
        const bx = wx - ex * h, bz = wz - ez * h;
        d = Math.min(d, bx * bx + bz * bz);
        const c1 = z >= vi[1], c2 = z < vj[1], c3 = ex * wz > ez * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * Math.sqrt(d);
    },
    b: [minX, minZ, maxX, maxZ],
  };
}

export function union(...s: SDF[]): SDF {
  if (s.length === 1) return s[0];
  const fs = s.map((x) => x.f);
  let b = s[0].b;
  for (let i = 1; i < s.length; i++) b = unionBounds(b, s[i].b);
  return {
    f: (x, z) => {
      let m = Infinity;
      for (let i = 0; i < fs.length; i++) {
        const v = fs[i](x, z);
        if (v < m) m = v;
      }
      return m;
    },
    b,
  };
}

/** Polynomial smooth union, k = blend radius. */
export function smoothUnion(k: number, ...s: SDF[]): SDF {
  const fs = s.map((x) => x.f);
  let b = s[0].b;
  for (let i = 1; i < s.length; i++) b = unionBounds(b, s[i].b);
  return {
    f: (x, z) => {
      let d = fs[0](x, z);
      for (let i = 1; i < fs.length; i++) {
        const d2 = fs[i](x, z);
        const h = Math.max(k - Math.abs(d - d2), 0) / k;
        d = Math.min(d, d2) - h * h * k * 0.25;
      }
      return d;
    },
    b,
  };
}

export function subtract(a: SDF, ...cut: SDF[]): SDF {
  const cf = cut.map((c) => c.f);
  return {
    f: (x, z) => {
      let d = a.f(x, z);
      for (let i = 0; i < cf.length; i++) {
        const c = -cf[i](x, z);
        if (c > d) d = c;
      }
      return d;
    },
    b: a.b,
  };
}

export function intersect(a: SDF, b: SDF): SDF {
  return { f: (x, z) => Math.max(a.f(x, z), b.f(x, z)), b: a.b };
}

export function offset(a: SDF, r: number): SDF {
  return { f: (x, z) => a.f(x, z) - r, b: growBounds(a.b, Math.max(0, r)) };
}

/** Numerical gradient of an SDF (unnormalized central difference, normalized). */
export function sdfGradient(s: SDF, x: number, z: number, e = 0.01): [number, number] {
  const gx = s.f(x + e, z) - s.f(x - e, z);
  const gz = s.f(x, z + e) - s.f(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

/**
 * Cache an SDF on a grid for fast repeated lookup (bilinear).
 * Outside the baked area returns a conservative distance estimate (distance to the bake box + border value)
 * unless exactOutside is set.
 */
export function bakeSDF(s: SDF, cell = 0.25, pad = 4, exactOutside = false): SDF {
  const [x0, z0, x1, z1] = growBounds(s.b, pad);
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;
  const data = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = s.f(x0 + i * cell, z0 + j * cell);
  const maxX = x0 + (nx - 1) * cell, maxZ = z0 + (nz - 1) * cell;
  return {
    f: (x, z) => {
      const fx = (x - x0) / cell, fz = (z - z0) / cell;
      if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) {
        if (exactOutside) return s.f(x, z);
        const cxp = Math.min(Math.max(x, x0), maxX), czp = Math.min(Math.max(z, z0), maxZ);
        return Math.hypot(x - cxp, z - czp) + pad;
      }
      const i = Math.floor(fx), j = Math.floor(fz);
      const tx = fx - i, tz = fz - j;
      const a = data[j * nx + i], b = data[j * nx + i + 1], c = data[(j + 1) * nx + i], d = data[(j + 1) * nx + i + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    },
    b: s.b,
  };
}

/** Two-level baked SDF: fine near the shape, coarse further out (for large terrains). */
export function bakeSDFMulti(s: SDF, fineCell = 0.25, finePad = 6, coarseCell = 1.0, coarsePad = 80): SDF {
  const fine = bakeSDF(s, fineCell, finePad, false);
  const coarse = bakeSDF(s, coarseCell, coarsePad, false);
  const [fx0, fz0, fx1, fz1] = growBounds(s.b, finePad - fineCell * 2);
  return {
    f: (x, z) => (x > fx0 && x < fx1 && z > fz0 && z < fz1 ? fine.f(x, z) : coarse.f(x, z)),
    b: s.b,
  };
}
