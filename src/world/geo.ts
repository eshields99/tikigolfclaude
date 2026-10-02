// Geometry assembly helpers: merge transformed primitives with vertex colors and wind weights.
import * as THREE from 'three';

export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  wind: number[] = [];
  idx: number[] = [];

  /**
   * Append geometry transformed by matrix. color: constant or per-vertex function (given world-space point/normal).
   * wind: constant or function of local (transformed) position.
   */
  add(
    geo: THREE.BufferGeometry,
    matrix: THREE.Matrix4 | null,
    color: THREE.ColorRepresentation | ColorFn,
    wind: number | ((p: THREE.Vector3) => number) = 0,
  ) {
    const g = geo.index ? geo : geo;
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    let N = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!N) {
      g.computeVertexNormals();
      N = g.getAttribute('normal') as THREE.BufferAttribute;
    }
    const base = this.pos.length / 3;
    if (matrix) _nm.getNormalMatrix(matrix);
    const cconst = typeof color === 'function' ? null : new THREE.Color(color);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      if (matrix) {
        _p.applyMatrix4(matrix);
        _n.applyMatrix3(_nm).normalize();
      }
      this.pos.push(_p.x, _p.y, _p.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      const c = cconst ?? (color as ColorFn)(_p, _n);
      this.col.push(c.r, c.g, c.b);
      this.wind.push(typeof wind === 'function' ? wind(_p) : wind);
    }
    if (g.index) {
      const I = g.index;
      for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
    } else {
      for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    }
    return this;
  }

  /** Add a raw triangle list (positions xyz per vertex, flat normals computed). */
  addTriangles(verts: number[], color: THREE.ColorRepresentation | ((i: number) => THREE.Color), wind: number | ((i: number, x: number, y: number, z: number) => number) = 0, smoothNormals?: number[]) {
    const base = this.pos.length / 3;
    const cc = typeof color === 'function' ? null : new THREE.Color(color);
    for (let i = 0; i < verts.length; i += 9) {
      const ax = verts[i], ay = verts[i + 1], az = verts[i + 2];
      const bx = verts[i + 3], by = verts[i + 4], bz = verts[i + 5];
      const cx = verts[i + 6], cy = verts[i + 7], cz = verts[i + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) {
        const vi = i / 3 + k;
        const x = verts[i + k * 3], y = verts[i + k * 3 + 1], z = verts[i + k * 3 + 2];
        this.pos.push(x, y, z);
        if (smoothNormals) this.nrm.push(smoothNormals[vi * 3], smoothNormals[vi * 3 + 1], smoothNormals[vi * 3 + 2]);
        else this.nrm.push(nx, ny, nz);
        const c = cc ?? (color as (i: number) => THREE.Color)(vi);
        this.col.push(c.r, c.g, c.b);
        this.wind.push(typeof wind === 'function' ? wind(vi, x, y, z) : wind);
        this.idx.push(base + vi);
      }
    }
    return this;
  }

  build(withWind = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withWind) g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 1));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const M = {
  compose(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    return m;
  },
};

export function col(hex: THREE.ColorRepresentation) {
  return new THREE.Color(hex);
}

/** Color with small random variation in HSL. */
export function jitterColor(hex: THREE.ColorRepresentation, rnd: () => number, h = 0.02, s = 0.06, l = 0.06) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h + (rnd() - 0.5) * h, THREE.MathUtils.clamp(hsl.s + (rnd() - 0.5) * s, 0, 1), THREE.MathUtils.clamp(hsl.l + (rnd() - 0.5) * l, 0, 1));
  return c;
}
