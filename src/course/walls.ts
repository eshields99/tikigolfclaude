// Wall runs along turf boundary loops: collision geometry + placement data for decorative stone blocks.
import type { P2 } from '../core/math';
import type { HeightFn } from './turfmesh';
import { TriMeshBuilder } from '../physics/trimesh';

export interface WallRun {
  pts: P2[]; // polyline along the turf edge (inside on the left)
  closed: boolean;
  height: number;
  thickness: number;
  style: string;
}

/** Split a closed loop into runs of consecutive "walled" vertices. */
export function splitRuns(loop: P2[], walled: boolean[]): { pts: P2[]; closed: boolean }[] {
  const n = loop.length;
  if (walled.every((w) => w)) return [{ pts: loop.slice(), closed: true }];
  if (walled.every((w) => !w)) return [];
  // find a start index that is not walled followed by walled
  let start = 0;
  for (let i = 0; i < n; i++) if (!walled[i] && walled[(i + 1) % n]) { start = (i + 1) % n; break; }
  const runs: { pts: P2[]; closed: boolean }[] = [];
  let cur: P2[] | null = null;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (walled[i]) {
      if (!cur) cur = [];
      cur.push(loop[i]);
    } else if (cur) {
      // extend the wall half a step into the gap so walls end neatly
      const prev = loop[(i - 1 + n) % n];
      const p = loop[i];
      cur.push([(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2]);
      runs.push({ pts: cur, closed: false });
      cur = null;
    }
  }
  if (cur) runs.push({ pts: cur, closed: false });
  // prepend half steps at the start of each run
  for (const r of runs) {
    const first = r.pts[0];
    const idx = loop.indexOf(first);
    if (idx >= 0) {
      const prev = loop[(idx - 1 + n) % n];
      r.pts.unshift([(prev[0] + first[0]) / 2, (prev[1] + first[1]) / 2]);
    }
  }
  return runs.filter((r) => r.pts.length >= 2);
}

/** Outward (right side) unit normals at each polyline vertex (mitered average). */
export function outwardNormals(pts: P2[], closed: boolean): P2[] {
  const n = pts.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let d1x = b[0] - a[0], d1z = b[1] - a[1];
    let d2x = c[0] - b[0], d2z = c[1] - b[1];
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    if (l1 > 1e-9) { d1x /= l1; d1z /= l1; } else { d1x = d2x / (l2 || 1); d1z = d2z / (l2 || 1); }
    if (l2 > 1e-9) { d2x /= l2; d2z /= l2; } else { d2x = d1x; d2z = d1z; }
    // right normals
    const n1x = d1z, n1z = -d1x, n2x = d2z, n2z = -d2x;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
    // miter length clamp
    const cos = mx * n1x + mz * n1z;
    const k = 1 / Math.max(0.5, cos);
    out.push([mx * k, mz * k]);
  }
  return out;
}

/** Add wall collision triangles for a run. */
export function addWallCollider(tb: TriMeshBuilder, run: WallRun, height: HeightFn, mat: number) {
  const { pts, closed } = run;
  const H = run.height, T = run.thickness;
  const nrm = outwardNormals(pts, closed);
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const base = (i: number) => height(pts[i][0], pts[i][1]);
  for (let s = 0; s < segs; s++) {
    const i = s, j = (s + 1) % n;
    const a = pts[i], b = pts[j];
    const ha = base(i), hb = base(j);
    const ab = ha - 0.35, bb = hb - 0.35, at = ha + H, bt = hb + H;
    // inner face (facing inward/left). Two-sided collision, winding irrelevant.
    tb.addTri(a[0], ab, a[1], b[0], bb, b[1], b[0], bt, b[1], mat);
    tb.addTri(a[0], ab, a[1], b[0], bt, b[1], a[0], at, a[1], mat);
    // top face
    const ao: P2 = [a[0] + nrm[i][0] * T, a[1] + nrm[i][1] * T];
    const bo: P2 = [b[0] + nrm[j][0] * T, b[1] + nrm[j][1] * T];
    tb.addTri(a[0], at, a[1], b[0], bt, b[1], bo[0], bt, bo[1], mat);
    tb.addTri(a[0], at, a[1], bo[0], bt, bo[1], ao[0], at, ao[1], mat);
    // outer face
    tb.addTri(ao[0], ab, ao[1], bo[0], bt, bo[1], bo[0], bb, bo[1], mat);
    tb.addTri(ao[0], ab, ao[1], ao[0], at, ao[1], bo[0], bt, bo[1], mat);
  }
  if (!closed) {
    // end caps
    for (const i of [0, n - 1]) {
      const a = pts[i];
      const h = base(i);
      const o: P2 = [a[0] + nrm[i][0] * T, a[1] + nrm[i][1] * T];
      tb.addTri(a[0], h - 0.35, a[1], o[0], h - 0.35, o[1], o[0], h + H, o[1], mat);
      tb.addTri(a[0], h - 0.35, a[1], o[0], h + H, o[1], a[0], h + H, a[1], mat);
    }
  }
}
