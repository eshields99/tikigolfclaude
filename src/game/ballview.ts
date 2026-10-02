// Visual golf ball: glossy dimpled ball with skins, rolling rotation and a trail ribbon.
import * as THREE from 'three';
import { ballDimpleNormal } from '../render/textures';
import { BALL_R } from '../physics/world';
import { glowTexture } from '../render/textures';

export const POWER_COLORS: Record<string, [number, number]> = {
  fire: [0xffb02e, 0xff3d0a],
  glide: [0xbff8ff, 0x3fd2ff],
  bounce: [0xc6ff6a, 0x4fd14a],
};

export interface BallSkin {
  id: string;
  name: string;
  base: number;
  stripe?: number;
  pattern?: 'stripe' | 'dots' | 'half' | 'swirl' | 'none';
  emissive?: number;
  trail: [number, number];
  price: number;
}

export const SKINS: BallSkin[] = [
  { id: 'classic', name: 'Classic', base: 0xf7f5ef, pattern: 'none', trail: [0xffffff, 0x9fe8ff], price: 0 },
  { id: 'coconut', name: 'Coconut', base: 0x8a5a32, stripe: 0xf4ead2, pattern: 'half', trail: [0xffe2a8, 0xb07a40], price: 150 },
  { id: 'hibiscus', name: 'Hibiscus', base: 0xff4f6d, stripe: 0xffd23f, pattern: 'dots', trail: [0xff7aa0, 0xffd23f], price: 250 },
  { id: 'lagoon', name: 'Lagoon', base: 0x2fd6c8, stripe: 0xffffff, pattern: 'swirl', trail: [0x6ff7e8, 0x2a8cff], price: 350 },
  { id: 'tiki', name: 'Tiki Torch', base: 0xf3b23a, stripe: 0xc0392b, pattern: 'stripe', trail: [0xffc040, 0xff4a1a], price: 500 },
  { id: 'lava', name: 'Lava Rock', base: 0x2b2224, stripe: 0xff5a1f, pattern: 'swirl', emissive: 0xff4a10, trail: [0xff8a2a, 0xff2a00], price: 800 },
  { id: 'pineapple', name: 'Pineapple', base: 0xffd84a, stripe: 0x6dbb3a, pattern: 'stripe', trail: [0xfff07a, 0x7ad04a], price: 650 },
  { id: 'pearl', name: 'Black Pearl', base: 0x1d2330, stripe: 0x9fd8ff, pattern: 'dots', trail: [0xbfe8ff, 0x8a7cff], price: 1000 },
];

function skinTexture(s: BallSkin) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(s.base);
  g.fillRect(0, 0, W, H);
  const st = s.stripe !== undefined ? hex(s.stripe) : '#ffffff';
  g.fillStyle = st;
  switch (s.pattern) {
    case 'stripe':
      g.fillRect(0, H * 0.4, W, H * 0.2);
      break;
    case 'half':
      g.fillRect(0, 0, W, H * 0.5);
      break;
    case 'dots':
      for (let i = 0; i < 26; i++) {
        const x = (i * 97) % W, y = 30 + ((i * 53) % (H - 60));
        g.beginPath();
        g.arc(x, y, 16, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'swirl':
      g.lineWidth = 22;
      g.strokeStyle = st;
      g.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 4) * H * 0.22;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class BallView {
  static depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  group = new THREE.Group();
  mesh: THREE.Mesh;
  private mat: THREE.MeshPhysicalMaterial;
  private trail: Trail;
  private blob: THREE.Mesh;
  private aura: THREE.Sprite;
  private power: string | null = null;
  private squashAmt = 0;
  private squashVel = 0;
  skin: BallSkin = SKINS[0];

  constructor(scene: THREE.Object3D) {
    const geo = new THREE.SphereGeometry(BALL_R, 40, 24);
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.42,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.35,
      normalMap: ballDimpleNormal(),
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    // Own depth material: three's shared shadow material copies a caster's `map`, which would keep a
    // disposed skin texture alive (and re-uploaded) after this ball is gone.
    this.mesh.customDepthMaterial = BallView.depthMat;
    this.group.add(this.mesh);
    this.trail = new Trail();
    // soft contact shadow
    const bc = document.createElement('canvas');
    bc.width = bc.height = 64;
    const bg = bc.getContext('2d')!;
    const grd = bg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = grd;
    bg.fillRect(0, 0, 64, 64);
    const bt = new THREE.CanvasTexture(bc);
    const bgeo = new THREE.PlaneGeometry(1, 1);
    bgeo.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(bgeo, new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.blob.renderOrder = 2;
    this.blob.visible = false;
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.scale.setScalar(1.3);
    this.aura.visible = false;
    this.aura.renderOrder = 7;
    this.group.add(this.aura);
    scene.add(this.group, this.trail.mesh, this.blob);
    this.setSkin(SKINS[0]);
  }

  /** Place the contact shadow on the ground below the ball (groundY = -Infinity hides it). */
  setGround(groundY: number) {
    const p = this.group.position;
    if (groundY === -Infinity || !this.group.visible) {
      this.blob.visible = false;
      return;
    }
    const h = Math.max(0, p.y - BALL_R - groundY);
    const k = Math.max(0, 1 - h / 2.2);
    this.blob.visible = k > 0.02;
    this.blob.position.set(p.x, groundY + 0.006, p.z);
    const s = BALL_R * 3.2 * (1 + h * 0.35);
    this.blob.scale.set(s, 1, s);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = k * 0.9;
  }

  /** Show / hide the power-up aura and switch trail colours. */
  setPower(p: string | null) {
    this.power = p;
    this.aura.visible = !!p;
    if (p) {
      const [a, b] = POWER_COLORS[p];
      (this.aura.material as THREE.SpriteMaterial).color.set(b);
      this.trail.setColors(a, b);
    } else this.trail.setColors(this.skin.trail[0], this.skin.trail[1]);
  }

  /** Kick the squash-and-stretch spring (hard landings). */
  squash(amount: number) {
    this.squashVel -= amount * 14;
  }

  /** Damped spring for squash & stretch; call every frame. */
  updateSquash(dt: number) {
    const k = 260, c = 16;
    this.squashVel += (-k * this.squashAmt - c * this.squashVel) * dt;
    this.squashAmt += this.squashVel * dt;
    if (Math.abs(this.squashAmt) < 1e-4 && Math.abs(this.squashVel) < 1e-3) {
      this.squashAmt = this.squashVel = 0;
    }
    const s = Math.max(-0.3, Math.min(0.3, this.squashAmt));
    this.group.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
  }

  /** Per-frame aura flicker. */
  pulse(t: number) {
    if (!this.power) return;
    const k = this.power === 'fire' ? 1.25 + Math.sin(t * 31) * 0.12 + Math.sin(t * 17) * 0.08 : 1.15 + Math.sin(t * 6) * 0.1;
    this.aura.scale.setScalar(k);
  }

  setSkin(s: BallSkin) {
    this.skin = s;
    this.mat.map?.dispose();
    this.mat.map = skinTexture(s);
    this.mat.emissive.set(s.emissive ?? 0x000000);
    this.mat.emissiveIntensity = s.emissive ? 0.6 : 0;
    this.mat.emissiveMap = s.emissive ? this.mat.map : null;
    this.mat.needsUpdate = true;
    if (!this.power) this.trail.setColors(s.trail[0], s.trail[1]);
  }

  /** Apply physics position and integrate visual spin. */
  sync(x: number, y: number, z: number, wx: number, wy: number, wz: number, dt: number) {
    this.group.position.set(x, y, z);
    const w = Math.hypot(wx, wy, wz);
    if (w > 1e-4) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(wx / w, wy / w, wz / w), w * dt);
      this.mesh.quaternion.premultiply(q);
    }
  }

  updateTrail(active: boolean, dt: number, speed: number) {
    this.trail.update(this.group.position, active, dt, speed);
  }

  resetTrail() {
    this.trail.reset(this.group.position);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
    this.trail.mesh.visible = v;
    if (!v) this.blob.visible = false;
  }

  setOpacity(o: number) {
    this.mat.transparent = o < 1;
    this.mat.opacity = o;
    this.mat.depthWrite = o >= 1;
  }

  dispose(scene: THREE.Object3D) {
    scene.remove(this.group, this.trail.mesh, this.blob);
    (this.aura.material as THREE.Material).dispose();
    this.blob.geometry.dispose();
    (this.blob.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.blob.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
    this.trail.dispose();
  }
}

/** Camera-facing ribbon trail behind the ball. */
class Trail {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  private geo: THREE.BufferGeometry;
  private max = 48;
  private mat: THREE.ShaderMaterial;
  private fade = 0;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    const n = this.max;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n * 2), 1));
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(n * 2), 1));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uA: { value: new THREE.Color(0xffffff) }, uB: { value: new THREE.Color(0x9fe8ff) }, uFade: { value: 0 } },
      vertexShader: `attribute float aT; attribute float aSide; varying float vT; varying float vS;
        void main(){ vT = aT; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uA; uniform vec3 uB; uniform float uFade; varying float vT; varying float vS;
        void main(){ float a = (1.0 - vT) * (1.0 - abs(vS)) * uFade; vec3 c = mix(uA, uB, vT); gl_FragColor = vec4(c * a * 1.4, a); }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }

  setColors(a: number, b: number) {
    this.mat.uniforms.uA.value.set(a);
    this.mat.uniforms.uB.value.set(b);
  }

  reset(p: THREE.Vector3) {
    this.pts = [p.clone()];
    this.ages = [0];
  }

  update(p: THREE.Vector3, active: boolean, dt: number, speed: number) {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    if (active) {
      const last = this.pts[0];
      if (!last || last.distanceToSquared(p) > 0.0225) {
        this.pts.unshift(p.clone());
        this.ages.unshift(0);
      } else this.pts[0].copy(p);
    }
    while (this.pts.length > this.max || (this.ages.length && this.ages[this.ages.length - 1] > 0.9)) {
      this.pts.pop();
      this.ages.pop();
    }
    const target = active && speed > 1.5 ? 1 : 0;
    this.fade += (target - this.fade) * Math.min(1, dt * (target ? 8 : 3));
    this.mat.uniforms.uFade.value = this.fade;
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const at = this.geo.getAttribute('aT') as THREE.BufferAttribute;
    const as = this.geo.getAttribute('aSide') as THREE.BufferAttribute;
    const n = this.pts.length;
    const width = 0.16;
    for (let i = 0; i < this.max; i++) {
      const pi = Math.min(i, Math.max(0, n - 1));
      const cur = this.pts[pi] ?? p;
      const nxt = this.pts[Math.min(pi + 1, n - 1)] ?? cur;
      const prv = this.pts[Math.max(pi - 1, 0)] ?? cur;
      const dir = new THREE.Vector3().subVectors(prv, nxt);
      if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const t = n > 1 ? pi / (n - 1) : 1;
      const w = width * (1 - t * 0.7);
      pos.setXYZ(i * 2, cur.x + side.x * w, cur.y + 0.02, cur.z + side.z * w);
      pos.setXYZ(i * 2 + 1, cur.x - side.x * w, cur.y + 0.02, cur.z - side.z * w);
      at.setX(i * 2, t);
      at.setX(i * 2 + 1, t);
      as.setX(i * 2, -1);
      as.setX(i * 2 + 1, 1);
    }
    pos.needsUpdate = true;
    at.needsUpdate = true;
    as.needsUpdate = true;
  }
}
