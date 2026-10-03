// Ambient life: circling seagulls (or bats at night, instanced, flapping in the vertex shader) and
// drifting fireflies / embers.
import * as THREE from 'three';
import { sharedUniforms } from '../render/materials';
import type { Particles } from '../render/particles';
import type { Theme } from './decor';

export class Critters {
  group = new THREE.Group();
  private birds: THREE.InstancedMesh;
  private params: { r: number; h: number; speed: number; phase: number; cx: number; cz: number }[] = [];
  private t = 0;
  private emitT = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(private particles: Particles, private kind: Theme, center: THREE.Vector3) {
    const bats = kind === 'lagoon';
    // seagull: two-segment wings + body as a small triangle fan
    const g = new THREE.BufferGeometry();
    const v = [
      // body
      0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3,
      // left wing (inner, outer)
      0, 0, 0.12, -0.55, 0.06, 0.0, 0, 0, -0.12,
      -0.55, 0.06, 0.0, -1.0, -0.05, -0.12, -0.55, 0.06, -0.14,
      // right wing
      0, 0, 0.12, 0, 0, -0.12, 0.55, 0.06, 0.0,
      0.55, 0.06, 0.0, 0.55, 0.06, -0.14, 1.0, -0.05, -0.12,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: kind === 'volcano' ? 0x3a3236 : bats ? 0x15131c : 0xf4f4f0, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = sharedUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
          float flap = sin(uTime * ${bats ? '15.0' : '7.0'} + ph) * (${bats ? '0.6' : '0.35'} + 0.15 * sin(uTime * 0.7 + ph));
          float ax = abs(position.x);
          transformed.y += flap * ax * ax * 0.9 + flap * ax * 0.25;`,
        );
    };
    mat.customProgramCacheKey = () => (bats ? 'bat' : 'gull');
    const n = kind === 'volcano' ? 3 : bats ? 5 : 6;
    this.birds = new THREE.InstancedMesh(g, mat, n);
    this.birds.frustumCulled = false;
    this.birds.castShadow = false;
    for (let i = 0; i < n; i++) {
      if (bats) this.params.push({ r: 7 + Math.random() * 10, h: 6 + Math.random() * 6, speed: (0.35 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6.28, cx: center.x + (Math.random() - 0.5) * 16, cz: center.z + (Math.random() - 0.5) * 16 });
      else this.params.push({ r: 14 + Math.random() * 22, h: 12 + Math.random() * 12, speed: (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6.28, cx: center.x + (Math.random() - 0.5) * 20, cz: center.z + (Math.random() - 0.5) * 20 });
    }
    this.group.add(this.birds);
  }

  update(dt: number, focus: THREE.Vector3) {
    this.t += dt;
    this.params.forEach((p, i) => {
      const a = p.phase + this.t * p.speed;
      // bats flit about erratically
      const flit = this.kind === 'lagoon' ? Math.sin(this.t * 3.1 + i * 1.7) * 1.2 : 0;
      const x = p.cx + Math.cos(a) * (p.r + flit), z = p.cz + Math.sin(a) * (p.r + flit);
      const y = p.h + Math.sin(this.t * 0.5 + i) * 1.5 + (this.kind === 'lagoon' ? Math.sin(this.t * 2.3 + i) * 0.6 : 0);
      // heading along the circle tangent
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(p.speed), Math.cos(a) * Math.sign(p.speed));
      this.e.set(0, yaw, Math.sign(p.speed) * 0.35);
      this.q.setFromEuler(this.e);
      const sc = this.kind === 'lagoon' ? 0.55 : 0.9;
      this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sc, sc, sc));
      this.birds.setMatrixAt(i, this.m);
    });
    this.birds.instanceMatrix.needsUpdate = true;
    // fireflies (jungle/volcano) drifting around the focus
    if (this.kind !== 'beach') {
      this.emitT += dt;
      const rate = this.kind === 'volcano' ? 0.09 : this.kind === 'lagoon' ? 0.06 : 0.16;
      while (this.emitT > rate) {
        this.emitT -= rate;
        const p = focus.clone().add(new THREE.Vector3((Math.random() - 0.5) * 22, Math.random() * 2.5 + 0.3, (Math.random() - 0.5) * 22));
        if (this.kind === 'volcano')
          this.particles.emit({ count: 1, pos: p, velSpread: 0.25, up: 0.6, life: [2.5, 4.5], size: [0.04, 0.08], colors: [0xffb347, 0xff7a1a], gravity: -0.15, drag: 0.4, additive: true, alpha: 0.9 });
        else if (this.kind === 'lagoon')
          this.particles.emit({ count: 1, pos: p, velSpread: 0.35, up: 0.25, life: [2.5, 5], size: [0.06, 0.11], colors: [0xfff3a0, 0xd8ff8a, 0xb6ff9a], gravity: 0, drag: 0.5, additive: true, alpha: 0.95 });
        else this.particles.emit({ count: 1, pos: p, velSpread: 0.3, up: 0.2, life: [2, 4], size: [0.05, 0.09], colors: [0xfff3a0, 0xd8ff8a], gravity: 0, drag: 0.6, additive: true, alpha: 0.75 });
      }
    }
  }

  dispose() {
    this.birds.geometry.dispose();
    (this.birds.material as THREE.Material).dispose();
  }
}
