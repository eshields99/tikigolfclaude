// Flames (instanced billboards with procedural fire), glows, and a light pool for nearby torches.
import * as THREE from 'three';
import { sharedUniforms } from './materials';

const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

export class FlameField {
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  positions: THREE.Vector3[];
  constructor(points: { p: THREE.Vector3; s: number }[]) {
    this.positions = points.map((q) => q.p.clone());
    const n = Math.max(1, points.length);
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const off = new Float32Array(n * 4);
    points.forEach((q, i) => {
      off[i * 4] = q.p.x;
      off[i * 4 + 1] = q.p.y;
      off[i * 4 + 2] = q.p.z;
      off[i * 4 + 3] = q.s;
    });
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 4));
    geo.instanceCount = points.length;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      uniforms: { uTime: sharedUniforms.uTime },
      vertexShader: /* glsl */ `
        attribute vec4 aOffset;
        varying vec2 vUv;
        varying float vSeed;
        void main(){
          vUv = uv;
          vSeed = fract(sin(dot(aOffset.xz, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 right = normalize(vec3(camR.x, 0.0, camR.z));
          vec3 w = aOffset.xyz + right * (position.x * 0.75 * aOffset.w) + vec3(0.0, 1.0, 0.0) * ((position.y * 1.25 - 0.08) * aOffset.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        ${NOISE_GLSL}
        void main(){
          vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
          float t = uTime + vSeed * 10.0;
          float n = fbm2(vec2(p.x * 2.2 + vSeed * 7.0, p.y * 3.0 - t * 4.2));
          float n2 = fbm2(vec2(p.x * 4.0 - 2.0, p.y * 5.0 - t * 6.0));
          float y = p.y;
          float r = 1.55 * pow(y + 0.04, 0.5) * pow(max(0.0, 1.0 - y), 1.15);
          float dx = abs(p.x + (n - 0.5) * 0.75 * y);
          float shape = 1.0 - smoothstep(r * 0.55, r, dx);
          shape *= 1.0 - smoothstep(0.5, 1.0, y + (n2 - 0.5) * 0.45);
          float core = (1.0 - smoothstep(0.0, r * 0.5, dx)) * (1.0 - smoothstep(0.1, 0.62, y));
          vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.55, 0.08), smoothstep(0.15, 0.85, shape));
          col = mix(col, vec3(1.0, 0.88, 0.45), core);
          float a = clamp(shape, 0.0, 1.0);
          gl_FragColor = vec4(col * a * (1.0 + core * 2.2), a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;

    // glow sprites (soft halo around each flame)
    const gbase = new THREE.PlaneGeometry(1, 1);
    const ggeo = new THREE.InstancedBufferGeometry();
    ggeo.index = gbase.index;
    ggeo.setAttribute('position', gbase.getAttribute('position'));
    ggeo.setAttribute('uv', gbase.getAttribute('uv'));
    ggeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off.slice(), 4));
    ggeo.instanceCount = points.length;
    const gmat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: sharedUniforms.uTime },
      vertexShader: /* glsl */ `
        attribute vec4 aOffset;
        varying vec2 vUv;
        varying float vF;
        uniform float uTime;
        void main(){
          vUv = uv;
          float seed = fract(sin(dot(aOffset.xz, vec2(12.9898, 78.233))) * 43758.5453);
          vF = 0.85 + 0.15 * sin(uTime * 13.0 + seed * 30.0) * sin(uTime * 7.3 + seed * 11.0);
          vec4 mv = viewMatrix * vec4(aOffset.xyz + vec3(0.0, 0.35 * aOffset.w, 0.0), 1.0);
          mv.xy += position.xy * 2.2 * aOffset.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vF;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float a = pow(max(0.0, 1.0 - d), 2.4) * 0.35 * vF;
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a, a);
        }`,
    });
    this.glow = new THREE.Mesh(ggeo, gmat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 4;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
  }
}

/** A small pool of point lights that follow the torches closest to a focus point. */
export class TorchLights {
  lights: THREE.PointLight[] = [];
  group = new THREE.Group();
  private t = 0;
  constructor(count: number, private positions: THREE.Vector3[], private boost: number) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 9, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
  }
  update(focus: THREE.Vector3, dt: number) {
    this.t += dt;
    const sorted = this.positions
      .map((p, i) => ({ p, i, d: p.distanceToSquared(focus) }))
      .sort((a, b) => a.d - b.d);
    this.lights.forEach((l, k) => {
      const s = sorted[k];
      if (!s) { l.intensity = 0; return; }
      l.position.copy(s.p).add(new THREE.Vector3(0, 0.45, 0));
      const flick = 0.85 + Math.sin(this.t * 17 + s.i * 3.1) * 0.08 + Math.sin(this.t * 7.3 + s.i) * 0.07;
      l.intensity = 6.5 * this.boost * flick;
    });
  }
}
