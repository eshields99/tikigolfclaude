// Lightweight CPU-simulated particle system rendered as instanced camera-facing quads (single draw call).
import * as THREE from 'three';

export interface EmitOpts {
  count: number;
  pos: THREE.Vector3;
  spread?: number; // positional jitter radius
  vel?: THREE.Vector3;
  velSpread?: number;
  up?: number; // extra upward speed (random 0..up)
  life?: [number, number];
  size?: [number, number];
  grow?: number; // size multiplier at end of life
  colors?: THREE.ColorRepresentation[];
  gravity?: number;
  drag?: number;
  shape?: 0 | 1 | 2; // 0 soft round, 1 confetti rect, 2 spark (stretched)
  additive?: boolean;
  alpha?: number;
}

const MAX = 1400;

export class Particles {
  mesh: THREE.Mesh;
  meshAdd: THREE.Mesh;
  private n = 0;
  private px = new Float32Array(MAX); private py = new Float32Array(MAX); private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX); private vy = new Float32Array(MAX); private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX); private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX); private grow = new Float32Array(MAX);
  private grav = new Float32Array(MAX); private drag = new Float32Array(MAX);
  private rot = new Float32Array(MAX); private rotV = new Float32Array(MAX);
  private shape = new Uint8Array(MAX); private add = new Uint8Array(MAX); private alpha = new Float32Array(MAX);
  private cr = new Float32Array(MAX); private cg = new Float32Array(MAX); private cb = new Float32Array(MAX);
  private geoN: THREE.InstancedBufferGeometry;
  private geoA: THREE.InstancedBufferGeometry;

  constructor() {
    const mk = (additive: boolean) => {
      const base = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute('position', base.getAttribute('position'));
      g.setAttribute('uv', base.getAttribute('uv'));
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount = 0;
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: /* glsl */ `
          attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iMisc;
          varying vec2 vUv; varying vec4 vCol; varying float vShape;
          void main(){
            vUv = uv; vCol = iCol; vShape = iMisc.y;
            vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
            float c = cos(iMisc.x), s = sin(iMisc.x);
            vec2 q = position.xy;
            if (iMisc.y > 1.5) {
              // spark: stretch along screen-space velocity direction (iMisc.zw)
              vec2 d = normalize(iMisc.zw + vec2(1e-5));
              vec2 nrm = vec2(-d.y, d.x);
              q = d * q.y * (1.0 + length(iMisc.zw) * 0.25) + nrm * q.x * 0.35;
            } else {
              if (iMisc.y > 0.5) q.x *= 0.6;
              q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
            }
            mv.xy += q * iPos.w;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec4 vCol; varying float vShape;
          void main(){
            float a;
            if (vShape > 0.5 && vShape < 1.5) a = 1.0;
            else { float d = length(vUv - 0.5) * 2.0; a = pow(max(0.0, 1.0 - d), vShape > 1.5 ? 1.2 : 1.6); }
            a *= vCol.a;
            if (a < 0.003) discard;
            gl_FragColor = vec4(vCol.rgb * a, a);
          }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      return { g, mesh };
    };
    const a = mk(false), b = mk(true);
    this.geoN = a.g;
    this.mesh = a.mesh;
    this.geoA = b.g;
    this.meshAdd = b.mesh;
  }

  emit(o: EmitOpts) {
    const cols = (o.colors ?? [0xffffff]).map((c) => new THREE.Color(c));
    for (let k = 0; k < o.count; k++) {
      if (this.n >= MAX) return;
      const i = this.n++;
      const sp = o.spread ?? 0;
      this.px[i] = o.pos.x + (Math.random() - 0.5) * 2 * sp;
      this.py[i] = o.pos.y + (Math.random() - 0.5) * 2 * sp * 0.5;
      this.pz[i] = o.pos.z + (Math.random() - 0.5) * 2 * sp;
      const vs = o.velSpread ?? 1;
      // random direction in sphere
      let rx = 0, ry = 0, rz = 0;
      do { rx = Math.random() * 2 - 1; ry = Math.random() * 2 - 1; rz = Math.random() * 2 - 1; } while (rx * rx + ry * ry + rz * rz > 1);
      this.vx[i] = (o.vel?.x ?? 0) + rx * vs;
      this.vy[i] = (o.vel?.y ?? 0) + ry * vs + Math.random() * (o.up ?? 0);
      this.vz[i] = (o.vel?.z ?? 0) + rz * vs;
      const [l0, l1] = o.life ?? [0.6, 1.2];
      this.maxLife[i] = this.life[i] = l0 + Math.random() * (l1 - l0);
      const [s0, s1] = o.size ?? [0.1, 0.2];
      this.size[i] = s0 + Math.random() * (s1 - s0);
      this.grow[i] = o.grow ?? 1;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
      this.rot[i] = Math.random() * 6.28;
      this.rotV[i] = (Math.random() - 0.5) * 12;
      this.shape[i] = o.shape ?? 0;
      this.add[i] = o.additive ? 1 : 0;
      this.alpha[i] = o.alpha ?? 1;
      const c = cols[Math.floor(Math.random() * cols.length)];
      this.cr[i] = c.r; this.cg[i] = c.g; this.cb[i] = c.b;
    }
  }

  update(dt: number, camera: THREE.Camera) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      // compact
      if (w !== i) this.copy(i, w);
      const k = Math.max(0, 1 - this.drag[w] * dt);
      this.vx[w] *= k; this.vy[w] *= k; this.vz[w] *= k;
      this.vy[w] -= this.grav[w] * dt;
      this.px[w] += this.vx[w] * dt; this.py[w] += this.vy[w] * dt; this.pz[w] += this.vz[w] * dt;
      this.rot[w] += this.rotV[w] * dt;
      w++;
    }
    this.n = w;
    // write instance buffers split by blend mode
    const view = camera.matrixWorldInverse;
    const writeTo = (g: THREE.InstancedBufferGeometry, additive: number) => {
      const P = g.getAttribute('iPos') as THREE.InstancedBufferAttribute;
      const C = g.getAttribute('iCol') as THREE.InstancedBufferAttribute;
      const Mi = g.getAttribute('iMisc') as THREE.InstancedBufferAttribute;
      const pa = P.array as Float32Array, ca = C.array as Float32Array, ma = Mi.array as Float32Array;
      let c = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.add[i] !== additive) continue;
        const t = 1 - this.life[i] / this.maxLife[i];
        const fadeIn = Math.min(1, t * 8);
        const fadeOut = Math.min(1, (this.life[i] / this.maxLife[i]) * 2.5);
        pa[c * 4] = this.px[i]; pa[c * 4 + 1] = this.py[i]; pa[c * 4 + 2] = this.pz[i];
        pa[c * 4 + 3] = this.size[i] * (1 + (this.grow[i] - 1) * t);
        ca[c * 4] = this.cr[i]; ca[c * 4 + 1] = this.cg[i]; ca[c * 4 + 2] = this.cb[i];
        ca[c * 4 + 3] = this.alpha[i] * fadeIn * fadeOut;
        ma[c * 4] = this.rot[i];
        ma[c * 4 + 1] = this.shape[i];
        if (this.shape[i] === 2) {
          // screen-space velocity direction
          const e = view.elements;
          const sx = e[0] * this.vx[i] + e[4] * this.vy[i] + e[8] * this.vz[i];
          const sy = e[1] * this.vx[i] + e[5] * this.vy[i] + e[9] * this.vz[i];
          ma[c * 4 + 2] = sx; ma[c * 4 + 3] = sy;
        }
        c++;
      }
      g.instanceCount = c;
      P.needsUpdate = C.needsUpdate = Mi.needsUpdate = true;
    };
    writeTo(this.geoN, 0);
    writeTo(this.geoA, 1);
  }

  private copy(i: number, w: number) {
    this.px[w] = this.px[i]; this.py[w] = this.py[i]; this.pz[w] = this.pz[i];
    this.vx[w] = this.vx[i]; this.vy[w] = this.vy[i]; this.vz[w] = this.vz[i];
    this.life[w] = this.life[i]; this.maxLife[w] = this.maxLife[i];
    this.size[w] = this.size[i]; this.grow[w] = this.grow[i];
    this.grav[w] = this.grav[i]; this.drag[w] = this.drag[i];
    this.rot[w] = this.rot[i]; this.rotV[w] = this.rotV[i];
    this.shape[w] = this.shape[i]; this.add[w] = this.add[i]; this.alpha[w] = this.alpha[i];
    this.cr[w] = this.cr[i]; this.cg[w] = this.cg[i]; this.cb[w] = this.cb[i];
  }

  clear() {
    this.n = 0;
  }
}
