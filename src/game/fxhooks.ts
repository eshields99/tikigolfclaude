// Visual effect bursts used by the game (splashes, sand puffs, confetti, sparks...).
import * as THREE from 'three';
import type { Particles } from '../render/particles';

interface Ripple { mesh: THREE.Mesh; age: number; life: number; size: number }

export class Effects {
  private ripples: Ripple[] = [];
  private ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  constructor(private p: Particles, private scene: THREE.Object3D) {
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  ripple(pos: THREE.Vector3, size: number, color = 0xffffff, life = 1.3) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(pos);
    m.renderOrder = 9;
    this.scene.add(m);
    this.ripples.push({ mesh: m, age: 0, life, size });
  }

  update(dt: number) {
    this.ripples = this.ripples.filter((r) => {
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      const s = 0.2 + (1 - Math.pow(1 - t, 2.2)) * r.size;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      return true;
    });
  }

  hit(pos: THREE.Vector3, power: number, color: number) {
    this.p.emit({ count: 8 + Math.round(power * 14), pos, spread: 0.08, velSpread: 1.2 + power * 2.5, up: 1.2, life: [0.25, 0.55], size: [0.05, 0.11], colors: [0xffffff, color], gravity: 6, drag: 3, shape: 2, additive: true });
    this.p.emit({ count: 4, pos: pos.clone().setY(pos.y - 0.15), spread: 0.15, velSpread: 0.6, up: 0.5, life: [0.4, 0.7], size: [0.15, 0.3], grow: 2, colors: [0x8fd45a, 0x6cbf3a], gravity: 2, drag: 4, alpha: 0.6 });
  }

  wallHit(pos: THREE.Vector3, speed: number) {
    if (speed < 2.5) return;
    this.p.emit({ count: Math.min(14, Math.round(speed * 1.2)), pos, spread: 0.05, velSpread: 1.5 + speed * 0.15, life: [0.15, 0.35], size: [0.03, 0.07], colors: [0xfff4c2, 0xffffff], gravity: 4, drag: 4, shape: 2, additive: true });
  }

  landPuff(pos: THREE.Vector3, speed: number) {
    const n = Math.min(14, Math.round(speed * 1.5));
    this.p.emit({ count: n, pos, spread: 0.1, velSpread: 0.9 + speed * 0.08, up: 1.4, life: [0.35, 0.7], size: [0.04, 0.08], colors: [0x7ccf45, 0x5cb83a, 0xa8e070], gravity: 9, drag: 1.5, shape: 1 });
  }

  sandPuff(pos: THREE.Vector3) {
    this.p.emit({ count: 14, pos, spread: 0.15, velSpread: 1.2, up: 1.6, life: [0.5, 1.0], size: [0.12, 0.28], grow: 2.2, colors: [0xf3dba2, 0xe8c98a], gravity: 3, drag: 3, alpha: 0.8 });
  }

  splash(pos: THREE.Vector3, y = 0.05) {
    const p = pos.clone().setY(y);
    this.p.emit({ count: 46, pos: p, spread: 0.12, velSpread: 1.6, up: 6.5, life: [0.6, 1.2], size: [0.08, 0.2], colors: [0xffffff, 0xe6fdff, 0xaaf0f2], gravity: 15, drag: 0.5 });
    this.p.emit({ count: 14, pos: p, spread: 0.06, velSpread: 0.4, up: 8.5, life: [0.35, 0.6], size: [0.1, 0.18], colors: [0xffffff], gravity: 16, drag: 0.4, shape: 2 });
    this.p.emit({ count: 12, pos: p, spread: 0.45, velSpread: 0.6, up: 0.6, life: [0.7, 1.3], size: [0.45, 0.8], grow: 2.6, colors: [0xffffff], gravity: 0, drag: 2, alpha: 0.5 });
    this.ripple(p.clone().setY(y + 0.04), 2.2, 0xffffff, 1.4);
    setTimeout(() => this.ripple(p.clone().setY(y + 0.04), 1.4, 0xe6fdff, 1.2), 220);
  }

  lava(pos: THREE.Vector3) {
    this.ripple(pos.clone().setY(pos.y + 0.06), 1.6, 0xffa040, 1.0);
    this.p.emit({ count: 30, pos, spread: 0.12, velSpread: 1.5, up: 4, life: [0.5, 1.2], size: [0.05, 0.12], colors: [0xffd04a, 0xff7a1a, 0xff3a0a], gravity: 10, drag: 0.8, shape: 2, additive: true });
    this.p.emit({ count: 12, pos, spread: 0.3, velSpread: 0.4, up: 1.5, life: [1.0, 1.8], size: [0.4, 0.8], grow: 2.5, colors: [0x3a3030, 0x5a4a44], gravity: -1.5, drag: 1.5, alpha: 0.6 });
  }

  poof(pos: THREE.Vector3) {
    this.p.emit({ count: 16, pos, spread: 0.2, velSpread: 1.0, up: 1.2, life: [0.4, 0.8], size: [0.2, 0.4], grow: 2.2, colors: [0xffffff, 0xf3dba2], gravity: 1, drag: 3, alpha: 0.75 });
  }

  boost(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.p.emit({ count: 20, pos, spread: 0.2, vel: dir.clone().multiplyScalar(-2), velSpread: 1.5, up: 1.5, life: [0.3, 0.6], size: [0.05, 0.12], colors: [0xffe14a, 0xff8a2a, 0xffffff], gravity: 3, drag: 2, shape: 2, additive: true });
  }

  trailSparkle(pos: THREE.Vector3, color: number) {
    this.p.emit({ count: 1, pos, spread: 0.08, velSpread: 0.3, up: 0.3, life: [0.3, 0.6], size: [0.04, 0.08], colors: [color, 0xffffff], gravity: -0.5, drag: 1, additive: true });
  }

  cupBurst(pos: THREE.Vector3, big: boolean) {
    const p = pos.clone().setY(pos.y + 0.1);
    this.p.emit({ count: big ? 120 : 60, pos: p, spread: 0.2, velSpread: big ? 3.2 : 2.2, up: big ? 7 : 5, life: [1.2, 2.4], size: [0.07, 0.14], colors: [0xff4f6d, 0xffd23f, 0x2fd6c8, 0x7dff6a, 0xff8a2e, 0xffffff, 0x8a7cff], gravity: 7, drag: 1.4, shape: 1 });
    this.p.emit({ count: 26, pos: p, spread: 0.1, velSpread: 2.5, up: 3.5, life: [0.4, 0.9], size: [0.06, 0.12], colors: [0xfff3b0, 0xffffff], gravity: 3, drag: 2, shape: 2, additive: true });
  }

  private fireAcc = 0;
  private glideAcc = 0;

  fireBurst(pos: THREE.Vector3) {
    this.p.emit({ count: 26, pos, spread: 0.1, velSpread: 2.2, up: 1.5, life: [0.3, 0.7], size: [0.08, 0.18], colors: [0xffd04a, 0xff7a1a, 0xff3a0a], gravity: -1, drag: 2.5, additive: true });
  }

  fireTrail(pos: THREE.Vector3, dt: number) {
    this.fireAcc += dt;
    while (this.fireAcc > 0.012) {
      this.fireAcc -= 0.012;
      this.p.emit({ count: 1, pos, spread: 0.07, velSpread: 0.35, up: 1.1, life: [0.25, 0.5], size: [0.16, 0.3], grow: 0.3, colors: [0xffc43a, 0xff6a14, 0xff3a0a], gravity: -2.5, drag: 2, additive: true });
      if (Math.random() < 0.25) this.p.emit({ count: 1, pos, spread: 0.05, velSpread: 0.6, up: 1.8, life: [0.5, 0.9], size: [0.03, 0.06], colors: [0xffe9a0], gravity: 2, drag: 1, shape: 2, additive: true });
    }
  }

  glideTrail(pos: THREE.Vector3, dt: number) {
    this.glideAcc += dt;
    while (this.glideAcc > 0.05) {
      this.glideAcc -= 0.05;
      this.p.emit({ count: 1, pos: pos.clone().setY(pos.y + 0.1), spread: 0.18, velSpread: 0.25, up: 0.5, life: [0.6, 1.1], size: [0.07, 0.12], colors: [0xffffff, 0xbff8ff, 0x7fe3ff], gravity: 0.6, drag: 1.5, shape: 1, additive: true, alpha: 0.9 });
    }
  }

  bumper(pos: THREE.Vector3) {
    this.p.emit({ count: 14, pos, spread: 0.1, velSpread: 2.2, up: 1, life: [0.2, 0.45], size: [0.05, 0.1], colors: [0xffd23f, 0xffffff], gravity: 2, drag: 3, shape: 2, additive: true });
  }
}
