// Power-up shot modifiers, shared by real shots and the AI planner's simulations.
import type { Ball } from '../physics/world';

export type PowerUp = 'fire' | 'glide' | 'bounce';

export const SPEED_MIN = 0.9;
export const SPEED_RANGE = 17.6;

/** Launch speed for a pull-back power in 0..1. */
export const speedFor = (power: number) => SPEED_MIN + Math.pow(power, 1.08) * SPEED_RANGE;
/** Inverse of speedFor. */
export const powerFor = (speed: number) => Math.min(1, Math.pow(Math.max(0, (speed - SPEED_MIN) / SPEED_RANGE), 1 / 1.08));

/** Set the ball's modifiers for a shot and return the actual launch speed and loft. */
export function applyPowerup(b: Ball, pu: PowerUp | null, baseSpeed: number): { speed: number; vy: number } {
  b.clearMods();
  let speed = baseSpeed, vy = 0;
  if (pu === 'fire') {
    speed = Math.min(26, speed * 1.38);
    b.sandProof = true;
    b.rollMul = 0.8;
  } else if (pu === 'glide') {
    b.rollMul = 0.32;
    b.sandProof = true;
  } else if (pu === 'bounce') {
    speed *= 0.92;
    vy = 3.6 + powerFor(baseSpeed) * 3.2;
    b.bouncy = true;
  }
  return { speed, vy };
}
