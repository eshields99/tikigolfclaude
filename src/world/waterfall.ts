// Waterfall: an arcing animated sheet of water with a foaming splash pool and drifting mist.
import * as THREE from 'three';
import { sharedUniforms } from '../render/materials';
import { foamTexture } from '../render/textures';
import type { Particles } from '../render/particles';

export class Waterfall {
  group = new THREE.Group();
  private mist = 0;
  private bottom: THREE.Vector3;
  private width: number;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(top: THREE.Vector3, bottom: THREE.Vector3, width: number, dirAngle: number, private particles: Particles | null) {
    this.bottom = bottom.clone();
    this.width = width;
    const dx = Math.cos(dirAngle), dz = Math.sin(dirAngle);
    const px = -dz, pz = dx;
    const H = top.y - bottom.y;
    const run = Math.hypot(bottom.x - top.x, bottom.z - top.z);
    const NA = 28, NW = 10;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NA; i++) {
      const t = i / NA;
      // projectile-like arc: quick horizontal travel at the lip then mostly vertical
      const hz = run * (1 - Math.pow(1 - t, 3)) * 0.9 + t * run * 0.1;
      const y = top.y - H * Math.pow(t, 1.6);
      const spread = 1 + t * 0.35;
      for (let j = 0; j <= NW; j++) {
        const s = (j / NW - 0.5) * width * spread;
        const wob = Math.sin(j * 1.7 + i * 0.3) * 0.04 * t;
        pos.push(top.x + dx * hz + px * s + dx * wob, y, top.z + dz * hz + pz * s + dz * wob);
        uv.push(j / NW, t);
      }
    }
    for (let i = 0; i < NA; i++)
      for (let j = 0; j < NW; j++) {
        const a = i * (NW + 1) + j, b = a + 1, c = a + NW + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: sharedUniforms.uTime, tFoam: { value: foamTexture() }, uLen: { value: H / width } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D tFoam; uniform float uLen; varying vec2 vUv; varying vec3 vW;
        void main(){
          float v = vUv.y;
          float s1 = texture2D(tFoam, vec2(vUv.x * 1.4, v * uLen * 0.35 - uTime * 1.25)).g;
          float s2 = texture2D(tFoam, vec2(vUv.x * 2.3 + 0.3, v * uLen * 0.6 - uTime * 1.9)).b;
          float streak = smoothstep(0.45, 0.85, s1 * 0.6 + s2 * 0.6);
          vec3 deep = vec3(0.18, 0.62, 0.68);
          vec3 col = mix(deep, vec3(0.95, 1.0, 1.0), streak * 0.85 + v * 0.25);
          col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, v));
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float a = edge * mix(0.75, 0.95, streak) * smoothstep(0.0, 0.03, v);
          gl_FragColor = vec4(col * 1.1, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sheet = new THREE.Mesh(geo, mat);
    sheet.renderOrder = 3;
    this.group.add(sheet);
    this.geos.push(geo);
    this.mats.push(mat);

    // foam pool at the base
    const fg = new THREE.CircleGeometry(width * 1.1, 40);
    fg.rotateX(-Math.PI / 2);
    const fm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: sharedUniforms.uTime, tFoam: { value: foamTexture() } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D tFoam; varying vec2 vP;
        void main(){
          float r = length(vP);
          float R = ${(width * 1.1).toFixed(2)};
          float ang = atan(vP.y, vP.x);
          float n = texture2D(tFoam, vec2(ang * 0.6, r * 0.5 - uTime * 0.6)).g;
          float rings = smoothstep(0.4, 0.9, sin(r * 5.0 - uTime * 4.0) * 0.5 + 0.5) * 0.4;
          float a = (1.0 - smoothstep(R * 0.35, R, r + (n - 0.5) * 0.8)) * 0.9 + rings * (1.0 - r / R);
          gl_FragColor = vec4(vec3(1.0), clamp(a, 0.0, 0.95));
        }`,
    });
    const foam = new THREE.Mesh(fg, fm);
    foam.position.set(bottom.x, bottom.y + 0.03, bottom.z);
    foam.renderOrder = 4;
    this.group.add(foam);
    this.geos.push(fg);
    this.mats.push(fm);
  }

  update(dt: number) {
    if (!this.particles) return;
    this.mist += dt;
    while (this.mist > 0.06) {
      this.mist -= 0.06;
      const p = this.bottom.clone();
      p.x += (Math.random() - 0.5) * this.width;
      p.z += (Math.random() - 0.5) * this.width * 0.5;
      this.particles.emit({ count: 1, pos: p, spread: 0.2, velSpread: 0.6, up: 1.4, life: [1.2, 2.2], size: [0.6, 1.1], grow: 2.4, colors: [0xffffff, 0xeefcff], gravity: -0.2, drag: 0.8, alpha: 0.28 });
      if (Math.random() < 0.5)
        this.particles.emit({ count: 2, pos: p, spread: 0.1, velSpread: 1.4, up: 2.6, life: [0.4, 0.8], size: [0.05, 0.1], colors: [0xffffff], gravity: 9, drag: 0.4 });
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
