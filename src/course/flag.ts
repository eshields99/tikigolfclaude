// Animated golf flag + pole that lifts out when the ball is holed.
import * as THREE from 'three';
import { sharedUniforms } from '../render/materials';

export class Flag {
  group = new THREE.Group();
  private pole: THREE.Mesh;
  private cloth: THREE.Mesh;
  private lift = 0;
  private liftTarget = 0;
  private baseY: number;
  private fade = 1;
  private fadeTarget = 1;
  private mats: THREE.Material[] = [];

  constructor(x: number, y: number, z: number, color: THREE.ColorRepresentation = 0xe0242c) {
    this.baseY = y;
    this.group.position.set(x, y, z);
    // striped pole via vertex colors
    const poleH = 2.3;
    const pg = new THREE.CylinderGeometry(0.035, 0.035, poleH, 10, 12);
    const cols: number[] = [];
    const p = pg.getAttribute('position') as THREE.BufferAttribute;
    const red = new THREE.Color(0xd8262e), white = new THREE.Color(0xf7f4ec);
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i) + poleH / 2;
      const c = Math.floor(yy / 0.19) % 2 ? red : white;
      cols.push(c.r, c.g, c.b);
    }
    pg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, transparent: true });
    this.pole = new THREE.Mesh(pg, poleMat);
    this.pole.position.y = poleH / 2 - 0.45;
    this.pole.castShadow = true;
    this.group.add(this.pole);
    // gold knob
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.25, metalness: 0.7, transparent: true });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), knobMat);
    knob.position.y = poleH - 0.45 + 0.04;
    this.group.add(knob);
    // cloth (pennant) with waving vertex shader
    const cg = new THREE.PlaneGeometry(0.95, 0.62, 16, 8);
    cg.translate(0.475, 0, 0);
    const clothMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide, transparent: true });
    clothMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = sharedUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float w = position.x / 0.95;
          float wave = sin(position.x * 7.0 - uTime * 6.5) * 0.09 + sin(position.x * 13.0 - uTime * 9.0 + position.y * 4.0) * 0.03;
          transformed.z += wave * w;
          transformed.y -= w * w * 0.06;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          float dw = cos(position.x * 7.0 - uTime * 6.5) * 0.09 * 7.0 * (position.x / 0.95);
          objectNormal = normalize(vec3(-dw, 0.0, 1.0));`,
        );
    };
    this.cloth = new THREE.Mesh(cg, clothMat);
    this.cloth.position.set(0.02, poleH - 0.45 - 0.38, 0);
    this.cloth.castShadow = true;
    this.group.add(this.cloth);
    this.mats = [poleMat, knobMat, clothMat];
  }

  /** Face the cloth so it reads well from a camera direction. */
  faceYaw(yaw: number) {
    this.group.rotation.y = yaw;
  }

  setLifted(l: boolean) {
    this.liftTarget = l ? 1 : 0;
  }

  setFaded(f: boolean) {
    this.fadeTarget = f ? 0.25 : 1;
  }

  update(dt: number) {
    this.lift += (this.liftTarget - this.lift) * Math.min(1, dt * 4);
    this.group.position.y = this.baseY + this.lift * 0.75;
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 6);
    for (const m of this.mats) {
      m.opacity = this.fade;
      m.depthWrite = this.fade > 0.95;
    }
  }
}
