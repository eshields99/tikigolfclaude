// Static triangle soup with a uniform XZ grid broadphase.

export class TriMeshBuilder {
  pos: number[] = [];
  mat: number[] = [];

  addTri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, m: number) {
    // Skip degenerate triangles
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) return;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.mat.push(m);
  }

  /** Add indexed geometry (positions xyz array + index array), optionally transformed by a 4x4 column-major matrix. */
  addIndexed(positions: ArrayLike<number>, index: ArrayLike<number> | null, m: number, matrix?: ArrayLike<number>) {
    const P = (i: number, out: number[]) => {
      let x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      if (matrix) {
        const e = matrix;
        const nx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const ny = e[1] * x + e[5] * y + e[9] * z + e[13];
        const nz = e[2] * x + e[6] * y + e[10] * z + e[14];
        x = nx; y = ny; z = nz;
      }
      out[0] = x; out[1] = y; out[2] = z;
    };
    const a: number[] = [0, 0, 0], b: number[] = [0, 0, 0], c: number[] = [0, 0, 0];
    const count = index ? index.length : positions.length / 3;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index[i] : i, ib = index ? index[i + 1] : i + 1, ic = index ? index[i + 2] : i + 2;
      P(ia, a); P(ib, b); P(ic, c);
      this.addTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], m);
    }
  }

  build(cellSize = 1): TriMesh {
    return new TriMesh(new Float32Array(this.pos), new Uint8Array(this.mat), cellSize);
  }
}

export class TriMesh {
  readonly count: number;
  readonly tri: Float32Array; // 9 per tri
  readonly nrm: Float32Array; // 3 per tri (unit face normal)
  readonly aabb: Float32Array; // 6 per tri: minX,minY,minZ,maxX,maxY,maxZ
  readonly mat: Uint8Array;
  // grid
  readonly cell: number;
  minX = 0; minZ = 0; nx = 1; nz = 1;
  cellStart: Int32Array = new Int32Array(2);
  cellItems: Int32Array = new Int32Array(0);
  // bounding box of whole mesh
  bmin = [0, 0, 0];
  bmax = [0, 0, 0];
  private stamp: Uint32Array;
  private stampId = 1;

  constructor(tri: Float32Array, mat: Uint8Array, cellSize = 1) {
    this.tri = tri;
    this.mat = mat;
    this.count = mat.length;
    this.cell = cellSize;
    this.nrm = new Float32Array(this.count * 3);
    this.aabb = new Float32Array(this.count * 6);
    this.stamp = new Uint32Array(this.count);
    let bminX = Infinity, bminY = Infinity, bminZ = Infinity, bmaxX = -Infinity, bmaxY = -Infinity, bmaxZ = -Infinity;
    for (let t = 0; t < this.count; t++) {
      const o = t * 9;
      const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
      const bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5];
      const cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      this.nrm[t * 3] = nx; this.nrm[t * 3 + 1] = ny; this.nrm[t * 3 + 2] = nz;
      const a = t * 6;
      this.aabb[a] = Math.min(ax, bx, cx); this.aabb[a + 1] = Math.min(ay, by, cy); this.aabb[a + 2] = Math.min(az, bz, cz);
      this.aabb[a + 3] = Math.max(ax, bx, cx); this.aabb[a + 4] = Math.max(ay, by, cy); this.aabb[a + 5] = Math.max(az, bz, cz);
      bminX = Math.min(bminX, this.aabb[a]); bminY = Math.min(bminY, this.aabb[a + 1]); bminZ = Math.min(bminZ, this.aabb[a + 2]);
      bmaxX = Math.max(bmaxX, this.aabb[a + 3]); bmaxY = Math.max(bmaxY, this.aabb[a + 4]); bmaxZ = Math.max(bmaxZ, this.aabb[a + 5]);
    }
    if (this.count === 0) { bminX = bminY = bminZ = 0; bmaxX = bmaxY = bmaxZ = 0; }
    this.bmin = [bminX, bminY, bminZ];
    this.bmax = [bmaxX, bmaxY, bmaxZ];
    this.buildGrid();
  }

  private buildGrid() {
    const c = this.cell;
    this.minX = Math.floor(this.bmin[0] / c) * c - c;
    this.minZ = Math.floor(this.bmin[2] / c) * c - c;
    this.nx = Math.max(1, Math.ceil((this.bmax[0] - this.minX) / c) + 2);
    this.nz = Math.max(1, Math.ceil((this.bmax[2] - this.minZ) / c) + 2);
    const ncell = this.nx * this.nz;
    const counts = new Int32Array(ncell + 1);
    const eps = 0.01;
    const forCells = (t: number, cb: (ci: number) => void) => {
      const a = t * 6;
      const i0 = Math.floor((this.aabb[a] - eps - this.minX) / c), i1 = Math.floor((this.aabb[a + 3] + eps - this.minX) / c);
      const j0 = Math.floor((this.aabb[a + 2] - eps - this.minZ) / c), j1 = Math.floor((this.aabb[a + 5] + eps - this.minZ) / c);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cb(j * this.nx + i);
    };
    for (let t = 0; t < this.count; t++) forCells(t, (ci) => counts[ci + 1]++);
    for (let i = 0; i < ncell; i++) counts[i + 1] += counts[i];
    this.cellStart = counts;
    this.cellItems = new Int32Array(counts[ncell]);
    const fill = counts.slice(0, ncell);
    for (let t = 0; t < this.count; t++) forCells(t, (ci) => { this.cellItems[fill[ci]++] = t; });
  }

  /** Collect unique triangle ids whose AABB overlaps the query box. Returns count written into out. */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Int32Array): number {
    const c = this.cell;
    let i0 = Math.floor((minX - this.minX) / c), i1 = Math.floor((maxX - this.minX) / c);
    let j0 = Math.floor((minZ - this.minZ) / c), j1 = Math.floor((maxZ - this.minZ) / c);
    if (i1 < 0 || j1 < 0 || i0 >= this.nx || j0 >= this.nz) return 0;
    if (i0 < 0) i0 = 0;
    if (j0 < 0) j0 = 0;
    if (i1 >= this.nx) i1 = this.nx - 1;
    if (j1 >= this.nz) j1 = this.nz - 1;
    const sid = ++this.stampId;
    if (sid > 0xfffffff0) { this.stamp.fill(0); this.stampId = 1; }
    let n = 0;
    const aabb = this.aabb;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const ci = j * this.nx + i;
        for (let k = this.cellStart[ci], e = this.cellStart[ci + 1]; k < e; k++) {
          const t = this.cellItems[k];
          if (this.stamp[t] === this.stampId) continue;
          this.stamp[t] = this.stampId;
          const a = t * 6;
          if (aabb[a] > maxX || aabb[a + 3] < minX || aabb[a + 1] > maxY || aabb[a + 4] < minY || aabb[a + 2] > maxZ || aabb[a + 5] < minZ) continue;
          if (n < out.length) out[n++] = t;
        }
      }
    }
    return n;
  }
}

/**
 * Closest point on triangle t of mesh to point (px,py,pz). Writes result into out[0..2] and
 * returns the feature region: 0 = face interior, 1 = edge, 2 = vertex.
 */
export function closestPointOnTri(tri: Float32Array, t: number, px: number, py: number, pz: number, out: Float64Array): number {
  const o = t * 9;
  const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
  const bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5];
  const cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return 2; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return 2; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + abx * v; out[1] = ay + aby * v; out[2] = az + abz * v;
    return 1;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return 2; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + acx * w; out[1] = ay + acy * w; out[2] = az + acz * w;
    return 1;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out[0] = bx + (cx - bx) * w; out[1] = by + (cy - by) * w; out[2] = bz + (cz - bz) * w;
    return 1;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  out[0] = ax + abx * v + acx * w;
  out[1] = ay + aby * v + acy * w;
  out[2] = az + abz * v + acz * w;
  return 0;
}

const _rq = new Int32Array(2048);
/**
 * Cast a vertical ray down from (x, yStart, z). Returns the hit height or -Infinity.
 * Optionally only considers triangles whose normal.y >= minNy (walkable).
 */
export function raycastDown(m: TriMesh, x: number, z: number, yStart: number, minNy = -1, outInfo?: { tri: number; mat: number; nx: number; ny: number; nz: number }): number {
  const n = m.query(x - 0.001, -1e6, z - 0.001, x + 0.001, yStart, z + 0.001, _rq);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const t = _rq[i];
    const ny = m.nrm[t * 3 + 1];
    if (ny < minNy || Math.abs(ny) < 1e-6) continue;
    const o = t * 9;
    const ax = m.tri[o], ay = m.tri[o + 1], az = m.tri[o + 2];
    const bx = m.tri[o + 3], by = m.tri[o + 4], bz = m.tri[o + 5];
    const cx = m.tri[o + 6], cy = m.tri[o + 7], cz = m.tri[o + 8];
    // barycentric in XZ
    const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = x - ax, v2z = z - az;
    const den = v0x * v1z - v1x * v0z;
    if (Math.abs(den) < 1e-12) continue;
    const v = (v2x * v1z - v1x * v2z) / den;
    const w = (v0x * v2z - v2x * v0z) / den;
    const u = 1 - v - w;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const y = ay * u + by * v + cy * w;
    if (y <= yStart && y > best) {
      best = y;
      if (outInfo) {
        outInfo.tri = t;
        outInfo.mat = m.mat[t];
        outInfo.nx = m.nrm[t * 3]; outInfo.ny = ny; outInfo.nz = m.nrm[t * 3 + 2];
      }
    }
  }
  return best;
}
