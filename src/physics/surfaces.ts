// Surface materials for the golf ball physics. Indexed by material id stored per triangle.

export const Mat = {
  Turf: 0,
  Sand: 1,
  Wood: 2,
  Stone: 3,
  WoodWall: 4,
  Rock: 5,
  Bumper: 6,
  Cup: 7,
  OOB: 8,
  Lava: 9,
  Metal: 10,
  Glide: 11,
  Rubber: 12,
  Bed: 13,
} as const;
export type MatId = (typeof Mat)[keyof typeof Mat];

export type SoundKind = 'turf' | 'sand' | 'wood' | 'stone' | 'rock' | 'bumper' | 'cup' | 'metal' | 'rubber' | 'water' | 'none';

export interface Surface {
  name: string;
  /** Constant rolling deceleration (units/s^2) on flat ground. */
  rollDecel: number;
  /** Speed-proportional drag while rolling (1/s). */
  rollDrag: number;
  /** Coefficient of restitution for impacts. */
  restitution: number;
  /** Tangential friction factor applied on impacts (Coulomb-like). */
  friction: number;
  /** Minimum normal impact speed needed to bounce at all. */
  bounceMin: number;
  /** Bumpers guarantee an outgoing normal speed. */
  kick?: number;
  hazard?: 'oob' | 'lava' | 'water';
  sound: SoundKind;
}

export const SURFACES: Surface[] = [];
SURFACES[Mat.Turf] = { name: 'turf', rollDecel: 3.1, rollDrag: 0.24, restitution: 0.32, friction: 0.12, bounceMin: 1.4, sound: 'turf' };
SURFACES[Mat.Sand] = { name: 'sand', rollDecel: 13.0, rollDrag: 1.6, restitution: 0.05, friction: 0.5, bounceMin: 3.5, sound: 'sand' };
SURFACES[Mat.Wood] = { name: 'wood', rollDecel: 2.6, rollDrag: 0.2, restitution: 0.38, friction: 0.1, bounceMin: 1.4, sound: 'wood' };
SURFACES[Mat.Stone] = { name: 'stone', rollDecel: 2.8, rollDrag: 0.2, restitution: 0.74, friction: 0.08, bounceMin: 0.25, sound: 'stone' };
SURFACES[Mat.WoodWall] = { name: 'woodwall', rollDecel: 2.6, rollDrag: 0.2, restitution: 0.66, friction: 0.08, bounceMin: 0.25, sound: 'wood' };
SURFACES[Mat.Rock] = { name: 'rock', rollDecel: 3.0, rollDrag: 0.25, restitution: 0.62, friction: 0.12, bounceMin: 0.3, sound: 'rock' };
SURFACES[Mat.Bumper] = { name: 'bumper', rollDecel: 3, rollDrag: 0.2, restitution: 1.15, friction: 0.02, bounceMin: 0.1, kick: 7.5, sound: 'bumper' };
SURFACES[Mat.Cup] = { name: 'cup', rollDecel: 6, rollDrag: 1.0, restitution: 0.3, friction: 0.05, bounceMin: 0.6, sound: 'cup' };
SURFACES[Mat.OOB] = { name: 'oob', rollDecel: 8, rollDrag: 1.2, restitution: 0.3, friction: 0.3, bounceMin: 1.0, hazard: 'oob', sound: 'sand' };
SURFACES[Mat.Lava] = { name: 'lava', rollDecel: 20, rollDrag: 3, restitution: 0.0, friction: 0.5, bounceMin: 99, hazard: 'lava', sound: 'none' };
SURFACES[Mat.Metal] = { name: 'metal', rollDecel: 2.4, rollDrag: 0.18, restitution: 0.6, friction: 0.06, bounceMin: 0.3, sound: 'metal' };
SURFACES[Mat.Glide] = { name: 'glide', rollDecel: 0.8, rollDrag: 0.08, restitution: 0.4, friction: 0.04, bounceMin: 1.4, sound: 'turf' };
// creek bed under the water: soft and draggy, the current does the carrying
SURFACES[Mat.Bed] = { name: 'water', rollDecel: 4.2, rollDrag: 0.9, restitution: 0.08, friction: 0.35, bounceMin: 2.5, sound: 'water' };
SURFACES[Mat.Rubber] = { name: 'rubber', rollDecel: 3, rollDrag: 0.3, restitution: 0.85, friction: 0.15, bounceMin: 0.2, sound: 'rubber' };
