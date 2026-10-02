// Aim visuals: dotted guide line hugging the ground, arrow head, and a power ring around the ball.
import * as THREE from 'three';
import { sharedUniforms } from '../render/materials';

const MAX_DOTS = 22;

export function powerColor(p: number, out = new THREE.Color()) {
  // green -> yellow -> orange -> red
  const stops = [new THREE.Color(0x7dff6a), new THREE.Color(0xffe14a), new THREE.Color(0xff9a2e), new THREE.Color(0xff3b30)];
  const t = Math.min(0.999, Math.max(0, p)) * (stops.length - 1);
  const i = Math.floor(t);
  return out.copy(stops[i]).lerp(stops[i + 1], t - i);
}

export class AimView {
  group = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private arrow: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringMat: THREE.ShaderMaterial;
  private arrowMat: THREE.MeshBasicMaterial;
  private tmpM = new THREE.Matrix4();
  private tmpC = new THREE.Color();
  private visibleT = 0;
  /** Override colour while a power-up is armed. */
  tint: THREE.Color | null = null;

  constructor() {
    const dotGeo = new THREE.CircleGeometry(0.075, 14);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.dots = new THREE.InstancedMesh(dotGeo, dotMat, MAX_DOTS);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 7;
    this.group.add(this.dots);

    const shape = new THREE.Shape();
    shape.moveTo(0, 0.42);
    shape.lineTo(0.3, -0.05);
    shape.lineTo(0.1, -0.02);
    shape.lineTo(0.0, 0.1);
    shape.lineTo(-0.1, -0.02);
    shape.lineTo(-0.3, -0.05);
    shape.closePath();
    const ag = new THREE.ShapeGeometry(shape);
    ag.rotateX(-Math.PI / 2);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.arrow = new THREE.Mesh(ag, this.arrowMat);
    this.arrow.renderOrder = 7;
    this.group.add(this.arrow);

    const rg = new THREE.RingGeometry(0.3, 0.4, 64, 1);
    rg.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: { uPower: { value: 0 }, uColor: { value: new THREE.Color() }, uAngle: { value: 0 }, uTime: sharedUniforms.uTime, uAlpha: { value: 1 } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uPower; uniform vec3 uColor; uniform float uAngle; uniform float uTime; uniform float uAlpha;
        varying vec3 vP;
        void main(){
          float a = atan(vP.x, -vP.z) - uAngle;           // 0 at aim direction
          a = mod(a + 3.14159265 + 6.2831853, 6.2831853) - 3.14159265; // -pi..pi
          float frac = abs(a) / 3.14159265;                // 0 front .. 1 back
          float fill = step(frac, uPower);
          float r = length(vP.xz);
          float edge = smoothstep(0.3, 0.315, r) * smoothstep(0.4, 0.385, r);
          vec3 col = mix(vec3(1.0), uColor, fill);
          float alpha = edge * mix(0.28, 0.95, fill) * uAlpha;
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.renderOrder = 7;
    this.group.add(this.ring);
    this.group.visible = false;
  }

  /**
   * Update the guide for a ball at `ball` aiming along (dx,dz) with power 0..1.
   * groundY(x,z,fromY) returns the surface height (or -Infinity).
   */
  update(ball: THREE.Vector3, dx: number, dz: number, power: number, groundY: (x: number, z: number, fromY: number) => number, ballR: number) {
    this.group.visible = true;
    const col = this.tint ? this.tmpC.copy(this.tint) : powerColor(power, this.tmpC);
    const len = 0.7 + power * 4.6;
    const spacing = 0.3;
    const phase = (sharedUniforms.uTime.value * 1.2) % 1;
    let count = 0;
    let lastY = ball.y - ballR;
    let stopAt = len;
    // march to find walls / drops
    for (let s = 0.35; s <= len; s += 0.1) {
      const x = ball.x + dx * s, z = ball.z + dz * s;
      const y = groundY(x, z, lastY + 0.6);
      if (y === -Infinity || y > lastY + 0.22) { stopAt = s - 0.1; break; }
      lastY = y;
    }
    lastY = ball.y - ballR;
    for (let k = 0; k < MAX_DOTS; k++) {
      const s = 0.45 + (k + phase) * spacing;
      if (s > stopAt - 0.25) break;
      const x = ball.x + dx * s, z = ball.z + dz * s;
      let y = groundY(x, z, lastY + 0.6);
      if (y === -Infinity) y = lastY;
      lastY = y;
      const t = s / Math.max(0.5, stopAt);
      const sc = 1 - t * 0.35;
      this.tmpM.makeScale(sc, 1, sc).setPosition(x, y + 0.02, z);
      this.dots.setMatrixAt(count, this.tmpM);
      const c = new THREE.Color(0xffffff).lerp(col, Math.min(1, t * 1.4));
      this.dots.setColorAt(count, c);
      count++;
    }
    this.dots.count = count;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    // arrow head at the end
    const ex = ball.x + dx * Math.max(0.6, stopAt - 0.1), ez = ball.z + dz * Math.max(0.6, stopAt - 0.1);
    let ey = groundY(ex, ez, lastY + 0.6);
    if (ey === -Infinity) ey = lastY;
    this.arrow.position.set(ex, ey + 0.025, ez);
    this.arrow.rotation.set(0, Math.atan2(dx, dz) + Math.PI, 0);
    const as = 0.8 + power * 0.6;
    this.arrow.scale.set(as, 1, as);
    this.arrowMat.color.copy(col);
    // power ring
    const gy = groundY(ball.x, ball.z, ball.y + 0.1);
    this.ring.position.set(ball.x, (gy === -Infinity ? ball.y - ballR : gy) + 0.015, ball.z);
    this.ringMat.uniforms.uPower.value = power;
    this.ringMat.uniforms.uColor.value.copy(col);
    this.ringMat.uniforms.uAngle.value = Math.atan2(dx, -dz);
    this.visibleT = 1;
  }

  /** Idle ring shown under a resting ball (no drag). */
  idle(ball: THREE.Vector3, groundY: (x: number, z: number, fromY: number) => number, ballR: number, dt: number) {
    this.group.visible = true;
    this.dots.count = 0;
    this.arrow.visible = false;
    const gy = groundY(ball.x, ball.z, ball.y + 0.1);
    this.ring.position.set(ball.x, (gy === -Infinity ? ball.y - ballR : gy) + 0.015, ball.z);
    this.ringMat.uniforms.uPower.value = 0;
    const pulse = 0.55 + Math.sin(sharedUniforms.uTime.value * 3.2) * 0.25;
    this.ringMat.uniforms.uAlpha.value = pulse;
    this.visibleT = Math.max(0, this.visibleT - dt);
  }

  show(aiming: boolean) {
    this.arrow.visible = aiming;
    if (aiming) this.ringMat.uniforms.uAlpha.value = 1;
  }

  hide() {
    this.group.visible = false;
  }
}
