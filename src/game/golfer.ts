// A participant on a hole (the human player or an AI rival) with its own ball.
import * as THREE from 'three';
import { Ball } from '../physics/world';
import { BallView, type BallSkin } from './ballview';
import type { PowerUp } from './powerups';

export type GolferState = 'waiting' | 'ready' | 'rolling' | 'hazard' | 'holed' | 'out';

export interface AIProfile {
  skill: number; // 0..1
  thinkTime: [number, number];
  style?: 'safe' | 'aggressive';
}

export class Golfer {
  ball = new Ball();
  view: BallView;
  strokes = 0;
  penalties = 0;
  state: GolferState = 'waiting';
  holedAt = -1;
  hazardTimer = 0;
  lastRest = new THREE.Vector3();
  /** total strokes across the round */
  total = 0;
  totalTime = 0;
  label: HTMLElement | null = null;
  shotYaw = 0;
  aiTimer = 0;
  aiPlan: { dx: number; dz: number; speed: number; pu?: PowerUp | null } | null = null;
  /** Rival power-up charges (shared across a match's holes). */
  aiPowerups: Record<PowerUp, number> | null = null;
  aiThinking = false;
  /** Power-up active on the current shot. */
  power: PowerUp | null = null;

  constructor(
    public id: string,
    public name: string,
    public human: boolean,
    public color: number,
    skin: BallSkin,
    scene: THREE.Object3D,
    public ai?: AIProfile,
  ) {
    this.view = new BallView(scene);
    this.view.setSkin(skin);
  }

  placeAt(p: THREE.Vector3) {
    this.ball.set(p.x, p.y, p.z);
    this.lastRest.copy(p);
    this.view.sync(p.x, p.y, p.z, 0, 0, 0, 0);
    this.view.resetTrail();
  }

  get pos() {
    return new THREE.Vector3(this.ball.x, this.ball.y, this.ball.z);
  }

  get done() {
    return this.state === 'holed' || this.state === 'out';
  }

  dispose(scene: THREE.Object3D) {
    this.view.dispose(scene);
    this.label?.remove();
  }
}
