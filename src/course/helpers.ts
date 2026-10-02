// Authoring helpers for hole heights.
import { clamp, smoothstep, type P2 } from '../core/math';
import type { HeightFn } from './turfmesh';

/** Smooth ramp: height goes h0 -> h1 when moving from point a to point b (projected), constant outside. */
export function ramp(a: P2, b: P2, h0: number, h1: number, smooth = true): HeightFn {
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const l2 = ex * ex + ez * ez;
  return (x, z) => {
    const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1);
    const k = smooth ? t * t * (3 - 2 * t) : t;
    return h0 + (h1 - h0) * k;
  };
}

/** Height that follows a route: heights given at each route point, interpolated by arc length (smoothed). */
export function routeHeight(points: P2[], heights: number[]): HeightFn {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return (x, z) => {
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez || 1e-9;
      const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1);
      const d = (a[0] + ex * t - x) ** 2 + (a[1] + ez * t - z) ** 2;
      if (d < best) { best = d; bi = i; bt = t; }
    }
    const k = bt * bt * (3 - 2 * bt);
    return heights[bi] + (heights[bi + 1] - heights[bi]) * k;
  };
}

/** Bowl / funnel: depth at center, 0 at radius R (smooth). */
export function bowl(cx: number, cz: number, R: number, depth: number): HeightFn {
  return (x, z) => {
    const r = Math.hypot(x - cx, z - cz) / R;
    if (r >= 1) return 0;
    return -depth * (1 - r * r) * (1 - r * r * 0.35);
  };
}

/** Gaussian hump. */
export function hump(cx: number, cz: number, R: number, h: number): HeightFn {
  return (x, z) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (R * R));
}

export function sum(...fs: (HeightFn | number)[]): HeightFn {
  return (x, z) => {
    let s = 0;
    for (const f of fs) s += typeof f === 'number' ? f : f(x, z);
    return s;
  };
}

/** Blend between two height functions by a 1D smoothstep along the z (or x) axis. */
export function blendZ(z0: number, z1: number, a: HeightFn, b: HeightFn): HeightFn {
  return (x, z) => {
    const t = smoothstep(z0, z1, z);
    return a(x, z) * (1 - t) + b(x, z) * t;
  };
}
