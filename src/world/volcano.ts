// Distant volcano backdrop with glowing lava streams, crater glow, smoke plume and eruptions.
import * as THREE from 'three';
import { Noise } from '../core/math';
import { sharedUniforms } from '../render/materials';
import { puffTexture } from '../render/textures';
import type { Particles } from '../render/particles';

const nz = new Noise(77);

export class Volcano {
  group = new THREE.Group();
  private smoke: THREE.InstancedMesh;
  private puffs: { p: THREE.Vector3; v: THREE.Vector3; s: number; age: number; life: number }[] = [];
  private crater: THREE.Vector3;
  private eruptT = 6;
  private emitT = 0;
  onErupt: (() => void) | null = null;
  private disposables: { dispose(): void }[] = [];

  constructor(pos: THREE.Vector3, height: number, radius: number, private particles: Particles | null, private lavaAmount = 1) {
    // lathe profile with crater
    const prof: THREE.Vector2[] = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = radius * (1 - Math.pow(t, 0.72) * 0.84);
      prof.push(new THREE.Vector2(r, height * t));
    }
    prof.push(new THREE.Vector2(radius * 0.13, height * 0.93));
    prof.push(new THREE.Vector2(radius * 0.05, height * 0.86));
    const geo = new THREE.LatheGeometry(prof, 72);
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const cols: number[] = [];
    const lava: number[] = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const a = Math.atan2(z, x);
      const t = y / height;
      const ridge = nz.fbm2(a * 3.2, t * 4, 4) * radius * 0.09 * (1 - t * 0.5) + Math.abs(Math.sin(a * 9 + nz.noise2(t * 3, a) * 2)) * radius * 0.025;
      const k = 1 + ridge / Math.max(1, Math.hypot(x, z));
      P.setXYZ(i, x * k, y + nz.noise2(a * 2, t * 3) * height * 0.015, z * k);
      const ash = 0.2 + nz.fbm2(a * 4, t * 6, 3) * 0.05 + t * 0.07;
      const c = new THREE.Color(ash * 1.12, ash * 0.92, ash * 0.92);
      // jungle on the lower slopes
      const veg = THREE.MathUtils.smoothstep(0.32 - nz.noise2(a * 6, 1) * 0.08, 0.05, t);
      c.lerp(new THREE.Color(0x3d6a34), veg * 0.85);
      cols.push(c.r, c.g, c.b);
      // lava rivers: narrow bands at a few angles starting near the top
      let lv = 0;
      for (const la of [0.6, 2.4, 4.1]) {
        const d = Math.abs(Math.atan2(Math.sin(a - la - Math.sin(t * 7) * 0.12), Math.cos(a - la - Math.sin(t * 7) * 0.12)));
        lv = Math.max(lv, (1 - THREE.MathUtils.smoothstep(d, 0.01, 0.07)) * THREE.MathUtils.smoothstep(t, 0.2, 0.9));
      }
      lava.push(lv * this.lavaAmount);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setAttribute('aLava', new THREE.Float32BufferAttribute(lava, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = sharedUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLava;\nvarying float vLava;\nvarying float vY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLava = aLava;\nvY = position.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vLava;\nvarying float vY;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float pulse = 0.75 + 0.25 * sin(uTime * 1.3 - vY * 0.15);
          totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * vLava * 3.2 * pulse;`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    // crater glow
    this.crater = pos.clone().add(new THREE.Vector3(0, height * 0.9, 0));
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.3, 0.25), transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.13, 32), glowMat);
    disk.rotation.x = -Math.PI / 2;
    disk.position.copy(this.crater).add(new THREE.Vector3(0, -height * 0.02, 0));
    this.group.add(disk);
    this.disposables.push(disk.geometry, glowMat);

    // smoke plume
    const sg = new THREE.PlaneGeometry(1, 1);
    const sm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { tPuff: { value: puffTexture() } },
      vertexShader: `
        attribute vec4 iCol; varying vec4 vCol; varying vec2 vUv;
        void main(){ vUv = uv; vCol = iCol;
          vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = length(instanceMatrix[0].xyz);
          c.xy += position.xy * s;
          gl_Position = projectionMatrix * c; }`,
      fragmentShader: `
        uniform sampler2D tPuff; varying vec4 vCol; varying vec2 vUv;
        void main(){ float a = texture2D(tPuff, vUv).a * vCol.a; gl_FragColor = vec4(vCol.rgb, a); }`,
    });
    const MAXP = 60;
    this.smoke = new THREE.InstancedMesh(sg, sm, MAXP);
    this.smoke.geometry.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4));
    this.smoke.frustumCulled = false;
    this.smoke.count = 0;
    this.group.add(this.smoke);
    this.disposables.push(sg, sm);
    for (let i = 0; i < 40; i++) this.spawnPuff(Math.random() * 18);
  }

  private spawnPuff(age = 0) {
    const life = 22 + Math.random() * 8;
    const v = new THREE.Vector3((Math.random() - 0.5) * 1.2 + 3.4, 2.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2 + 0.6);
    const p = this.crater.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
    const puff = { p, v, s: 12 + Math.random() * 8, age: 0, life };
    for (let t = 0; t < age; t += 0.5) this.stepPuff(puff, 0.5);
    this.puffs.push(puff);
  }

  private stepPuff(q: { p: THREE.Vector3; v: THREE.Vector3; age: number }, dt: number) {
    q.age += dt;
    q.p.addScaledVector(q.v, dt);
    q.v.y *= 1 - dt * 0.04;
    q.v.x += dt * 0.12;
  }

  update(dt: number, camera: THREE.Camera) {
    this.emitT += dt;
    if (this.emitT > 0.45) {
      this.emitT = 0;
      if (this.puffs.length < 56) this.spawnPuff();
    }
    const m = new THREE.Matrix4();
    const col = this.smoke.geometry.getAttribute('iCol') as THREE.InstancedBufferAttribute;
    let n = 0;
    this.puffs = this.puffs.filter((q) => q.age < q.life);
    // sort back to front relative to camera
    this.puffs.sort((a, b) => b.p.distanceToSquared(camera.position) - a.p.distanceToSquared(camera.position));
    for (const q of this.puffs) {
      this.stepPuff(q, dt);
      const t = q.age / q.life;
      const s = q.s * (1 + t * 3.2);
      m.makeScale(s, s, s).setPosition(q.p);
      this.smoke.setMatrixAt(n, m);
      const base = 0.3 + t * 0.35;
      const glow = Math.max(0, 1 - t * 3.2);
      col.setXYZW(n, base * 0.95 + glow * 0.7, base * 0.82 + glow * 0.25, base * 0.86, Math.min(1, t * 5) * Math.pow(1 - t, 0.6) * 0.95);
      n++;
    }
    this.smoke.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
    // eruptions
    this.eruptT -= dt;
    if (this.eruptT <= 0) {
      this.eruptT = 9 + Math.random() * 10;
      this.erupt();
    }
  }

  erupt() {
    if (this.particles) {
      this.particles.emit({ count: 70, pos: this.crater, spread: 3, velSpread: 9, up: 26, life: [2.5, 4.0], size: [0.9, 1.8], colors: [0xffd04a, 0xff7a1a, 0xff3a0a], gravity: 14, drag: 0.15, shape: 2, additive: true });
      this.particles.emit({ count: 14, pos: this.crater, spread: 4, velSpread: 3, up: 8, life: [3, 5], size: [10, 16], grow: 2, colors: [0x4a3a36, 0x6a5048], gravity: -1, drag: 0.6, alpha: 0.5 });
    }
    this.onErupt?.();
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
