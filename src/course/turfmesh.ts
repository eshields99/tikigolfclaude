// Marching squares over a 2D SDF -> watertight turf surface mesh + oriented boundary loops.
// A high resolution annulus patch is stitched in around the cup so the hole is perfectly round.
import type { SDF } from '../core/sdf';
import type { P2 } from '../core/math';

export type HeightFn = (x: number, z: number) => number;

export interface TurfMesh {
  positions: Float32Array;
  normals: Float32Array;
  index: Uint32Array;
  /** Boundary loops of the region, oriented with the inside on the LEFT. */
  loops: P2[][];
  /** Cup rim ring vertices (for reference), empty if no cup. */
  cupRing: P2[];
}

export interface CupCut {
  x: number;
  z: number;
  r: number;
  segments?: number;
}

export function heightNormal(h: HeightFn, x: number, z: number, e = 0.02): [number, number, number] {
  const dx = (h(x + e, z) - h(x - e, z)) / (2 * e);
  const dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  return [-dx / l, 1 / l, -dz / l];
}

export function buildTurfMesh(sdf: SDF, height: HeightFn, cell: number, cup?: CupCut): TurfMesh {
  const pad = cell * 2;
  const x0 = Math.floor((sdf.b[0] - pad) / cell) * cell;
  const z0 = Math.floor((sdf.b[1] - pad) / cell) * cell;
  const nx = Math.ceil((sdf.b[2] + pad - x0) / cell) + 1;
  const nz = Math.ceil((sdf.b[3] + pad - z0) / cell) + 1;
  const val = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let v = sdf.f(x0 + i * cell, z0 + j * cell);
      if (Math.abs(v) < 1e-7) v = 1e-7;
      val[j * nx + i] = v;
    }
  }

  const px: number[] = [];
  const pz: number[] = [];
  const nodeIdx = new Int32Array(nx * nz).fill(-1);
  const hIdx = new Int32Array(nx * nz).fill(-1); // edge (i,j)-(i+1,j)
  const vIdx = new Int32Array(nx * nz).fill(-1); // edge (i,j)-(i,j+1)
  const tris: number[] = [];

  const node = (i: number, j: number) => {
    const k = j * nx + i;
    if (nodeIdx[k] < 0) {
      nodeIdx[k] = px.length;
      px.push(x0 + i * cell);
      pz.push(z0 + j * cell);
    }
    return nodeIdx[k];
  };
  const crossing = (a: number, b: number, ax: number, az: number, bx: number, bz: number) => {
    const t = a / (a - b);
    let x = ax + (bx - ax) * t;
    let z = az + (bz - az) * t;
    // refine onto the true zero level with a couple of Newton steps along the edge
    for (let it = 0; it < 2; it++) {
      const v = sdf.f(x, z);
      const e = 1e-3;
      const ex = bx - ax, ez = bz - az;
      const L = Math.hypot(ex, ez);
      const ux = ex / L, uz = ez / L;
      const dv = (sdf.f(x + ux * e, z + uz * e) - sdf.f(x - ux * e, z - uz * e)) / (2 * e);
      if (Math.abs(dv) < 1e-6) break;
      let s = -v / dv;
      // keep within the edge
      const cur = (x - ax) * ux + (z - az) * uz;
      const ns = Math.max(0, Math.min(L, cur + s));
      s = ns - cur;
      x += ux * s;
      z += uz * s;
    }
    px.push(x);
    pz.push(z);
    return px.length - 1;
  };
  const hEdge = (i: number, j: number) => {
    const k = j * nx + i;
    if (hIdx[k] < 0) hIdx[k] = crossing(val[k], val[k + 1], x0 + i * cell, z0 + j * cell, x0 + (i + 1) * cell, z0 + j * cell);
    return hIdx[k];
  };
  const vEdge = (i: number, j: number) => {
    const k = j * nx + i;
    if (vIdx[k] < 0) vIdx[k] = crossing(val[k], val[k + nx], x0 + i * cell, z0 + j * cell, x0 + i * cell, z0 + (j + 1) * cell);
    return vIdx[k];
  };

  // cup patch cell range
  let ci0 = -1, ci1 = -1, cj0 = -1, cj1 = -1;
  if (cup) {
    const P = cup.r + Math.max(0.35, cell * 1.5);
    ci0 = Math.floor((cup.x - P - x0) / cell);
    ci1 = Math.ceil((cup.x + P - x0) / cell);
    cj0 = Math.floor((cup.z - P - z0) / cell);
    cj1 = Math.ceil((cup.z + P - z0) / cell);
    for (let j = cj0; j <= cj1; j++)
      for (let i = ci0; i <= ci1; i++)
        if (val[j * nx + i] > 0) throw new Error('Cup too close to the turf edge at ' + cup.x + ',' + cup.z);
  }

  // segments of the iso line: from (exit crossing) to (entry crossing) — inside on the left
  const segFrom: number[] = [];
  const segTo: number[] = [];

  const poly: number[] = [];
  const emitPoly = () => {
    for (let k = 1; k + 1 < poly.length; k++) tris.push(poly[0], poly[k], poly[k + 1]);
  };

  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (cup && i >= ci0 && i < ci1 && j >= cj0 && j < cj1) continue;
      const a = val[j * nx + i], b = val[j * nx + i + 1], c = val[(j + 1) * nx + i + 1], d = val[(j + 1) * nx + i];
      const ina = a < 0, inb = b < 0, inc = c < 0, ind = d < 0;
      const mask = (ina ? 1 : 0) | (inb ? 2 : 0) | (inc ? 4 : 0) | (ind ? 8 : 0);
      if (mask === 0) continue;
      if (mask === 15) {
        const A = node(i, j), B = node(i + 1, j), C = node(i + 1, j + 1), D = node(i, j + 1);
        // choose diagonal consistently
        tris.push(A, B, C, A, C, D);
        continue;
      }
      // saddle handling
      if (mask === 5 || mask === 10) {
        const center = sdf.f(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
        if (center >= 0) {
          if (mask === 5) {
            // a and c inside, separate
            const A = node(i, j), eab = hEdge(i, j), eda = vEdge(i, j);
            tris.push(A, eab, eda);
            segFrom.push(eab); segTo.push(eda);
            const C = node(i + 1, j + 1), ebc = vEdge(i + 1, j), ecd = hEdge(i, j + 1);
            tris.push(C, ecd, ebc);
            segFrom.push(ecd); segTo.push(ebc);
          } else {
            const B = node(i + 1, j), eab = hEdge(i, j), ebc = vEdge(i + 1, j);
            tris.push(B, ebc, eab);
            segFrom.push(ebc); segTo.push(eab);
            const D = node(i, j + 1), ecd = hEdge(i, j + 1), eda = vEdge(i, j);
            tris.push(D, eda, ecd);
            segFrom.push(eda); segTo.push(ecd);
          }
          continue;
        }
      }
      // generic: walk corners CCW a(i,j) -> b(i+1,j) -> c(i+1,j+1) -> d(i,j+1)
      poly.length = 0;
      const corners = [ina, inb, inc, ind];
      let pendingExit = -1;
      let firstEntryPending = -1; // entry crossing seen before any exit (wraps around)
      for (let k = 0; k < 4; k++) {
        const inside = corners[k];
        if (inside) {
          poly.push(k === 0 ? node(i, j) : k === 1 ? node(i + 1, j) : k === 2 ? node(i + 1, j + 1) : node(i, j + 1));
        }
        const nextInside = corners[(k + 1) & 3];
        if (inside !== nextInside) {
          const e = k === 0 ? hEdge(i, j) : k === 1 ? vEdge(i + 1, j) : k === 2 ? hEdge(i, j + 1) : vEdge(i, j);
          poly.push(e);
          if (inside) pendingExit = e;
          else {
            // entry
            if (pendingExit >= 0) {
              segFrom.push(pendingExit);
              segTo.push(e);
              pendingExit = -1;
            } else firstEntryPending = e;
          }
        }
      }
      if (pendingExit >= 0 && firstEntryPending >= 0) {
        segFrom.push(pendingExit);
        segTo.push(firstEntryPending);
      }
      emitPoly();
    }
  }

  // ---- cup annulus patch ----
  const cupRing: P2[] = [];
  if (cup) {
    const outer: number[] = [];
    for (let i = ci0; i < ci1; i++) outer.push(node(i, cj0));
    for (let j = cj0; j < cj1; j++) outer.push(node(ci1, j));
    for (let i = ci1; i > ci0; i--) outer.push(node(i, cj1));
    for (let j = cj1; j > cj0; j--) outer.push(node(ci0, j));
    const N = cup.segments ?? 48;
    const inner: number[] = [];
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2;
      const x = cup.x + Math.cos(ang) * cup.r;
      const z = cup.z + Math.sin(ang) * cup.r;
      px.push(x);
      pz.push(z);
      inner.push(px.length - 1);
      cupRing.push([x, z]);
    }
    const angOf = (idx: number) => {
      let a = Math.atan2(pz[idx] - cup.z, px[idx] - cup.x);
      if (a < 0) a += Math.PI * 2;
      return a;
    };
    // rotate outer so it starts at the smallest angle
    let start = 0, minA = Infinity;
    for (let k = 0; k < outer.length; k++) {
      const a = angOf(outer[k]);
      if (a < minA) { minA = a; start = k; }
    }
    const O = outer.slice(start).concat(outer.slice(0, start));
    const oa = O.map(angOf);
    // ensure increasing angles (outer loop is CCW in x,z => increasing atan2(z,x))
    for (let k = 1; k < oa.length; k++) while (oa[k] < oa[k - 1]) oa[k] += Math.PI * 2;
    const ia = inner.map((_, k) => (k / N) * Math.PI * 2);
    let io = 0, ii = 0;
    const No = O.length;
    while (io < No || ii < N) {
      const curO = O[io % No], curI = inner[ii % N];
      const nextOA = io < No ? oa[(io + 1) % No] + (io + 1 >= No ? Math.PI * 2 : 0) : Infinity;
      const nextIA = ii < N ? (ii + 1 < N ? ia[ii + 1] : Math.PI * 2) : Infinity;
      if ((nextOA <= nextIA && io < No) || ii >= N) {
        tris.push(curO, O[(io + 1) % No], curI);
        io++;
      } else {
        tris.push(curO, inner[(ii + 1) % N], curI);
        ii++;
      }
    }
  }

  // ---- fix winding so every triangle faces +Y ----
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ux = px[b] - px[a], uz = pz[b] - pz[a];
    const vx = px[c] - px[a], vz = pz[c] - pz[a];
    const ny = uz * vx - ux * vz;
    if (ny < 0) { tris[t + 1] = c; tris[t + 2] = b; }
  }
  // drop degenerate slivers
  const clean: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    if (a === b || b === c || a === c) continue;
    const ux = px[b] - px[a], uz = pz[b] - pz[a];
    const vx = px[c] - px[a], vz = pz[c] - pz[a];
    if (Math.abs(uz * vx - ux * vz) < 1e-9) continue;
    clean.push(a, b, c);
  }

  // ---- vertex arrays ----
  const nv = px.length;
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const x = px[v], z = pz[v];
    positions[v * 3] = x;
    positions[v * 3 + 1] = height(x, z);
    positions[v * 3 + 2] = z;
    const n = heightNormal(height, x, z);
    normals[v * 3] = n[0];
    normals[v * 3 + 1] = n[1];
    normals[v * 3 + 2] = n[2];
  }

  // ---- chain loops ----
  const next = new Map<number, number>();
  for (let s = 0; s < segFrom.length; s++) if (segFrom[s] !== segTo[s]) next.set(segFrom[s], segTo[s]);
  const visited = new Set<number>();
  const loops: P2[][] = [];
  for (const startIdx of next.keys()) {
    if (visited.has(startIdx)) continue;
    const loop: P2[] = [];
    let cur: number | undefined = startIdx;
    let guard = 0;
    while (cur !== undefined && !visited.has(cur) && guard++ < 1e6) {
      visited.add(cur);
      loop.push([px[cur], pz[cur]]);
      cur = next.get(cur);
    }
    // remove nearly duplicate consecutive points
    const dedup: P2[] = [];
    for (const p of loop) {
      const l = dedup[dedup.length - 1];
      if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1e-4) dedup.push(p);
    }
    if (dedup.length >= 3) loops.push(dedup);
  }

  return { positions, normals, index: new Uint32Array(clean), loops, cupRing };
}

/** Signed area of a loop in the XZ plane (positive = CCW with z up). */
export function loopArea(loop: P2[]) {
  let a = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) a += (loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1]);
  return a * 0.5;
}
