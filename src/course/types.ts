import type { SDF } from '../core/sdf';
import type { HeightFn } from './turfmesh';

export type V2 = [number, number];
export type V3 = [number, number, number];

export interface BridgeDef {
  from: V2;
  to: V2;
  width: number;
}

export interface PieceDef {
  shape: SDF;
  height?: number | HeightFn;
  /** Boundary zones without walls (edges you can roll off). */
  open?: SDF[];
  sand?: SDF[];
  glide?: SDF[];
  bridges?: BridgeDef[];
  /** Zones where the boundary walls are wooden curbs instead of stone. */
  woodWalls?: SDF[];
  /** Zones without the rock base below the turf. */
  noBase?: SDF[];
  wallHeight?: number;
  wallThickness?: number;
  baseBottom?: number;
  checker?: { size?: number; angle?: number };
}

export type ObstacleDef =
  | { type: 'rock'; at: V2; r: number; h?: number; seed?: number }
  | { type: 'tiki'; at: V2; rot?: number; scale?: number; variant?: number }
  | { type: 'bumper'; at: V2; r?: number }
  | { type: 'boost'; at: V2; dir: number; len?: number; width?: number; speed?: number }
  | { type: 'ramp'; at: V2; dir: number; len: number; width: number; height: number; kicker?: boolean }
  | { type: 'spinner'; at: V2; len: number; speed: number; phase?: number; arms?: number }
  | { type: 'slider'; from: V2; to: V2; size: V2; height?: number; period: number; phase?: number }
  | { type: 'planter'; at: V2; r: number; palm?: boolean };

export type DecorDef =
  | { type: 'palm'; at: V2; rot?: number; scale?: number; lean?: number; y?: number }
  | { type: 'tiki'; at: V2; rot?: number; scale?: number; variant?: number; y?: number }
  | { type: 'torch'; at: V2; h?: number; y?: number }
  | { type: 'hut'; at: V2; rot?: number; scale?: number; y?: number }
  | { type: 'rock'; at: V2; r: number; seed?: number; y?: number; h?: number }
  | { type: 'fern'; at: V2; scale?: number; y?: number }
  | { type: 'flowers'; at: V2; scale?: number; y?: number }
  | { type: 'boat'; at: V2; rot?: number }
  | { type: 'dock'; from: V2; to: V2; width?: number; y?: number };

export interface IslandDef {
  /** Extra land masses (union). */
  land?: SDF[];
  /** Carve-outs (lagoons, channels). */
  water?: SDF[];
  /** Land margin around the course footprint. */
  margin?: number;
  /** Land height (sand beaches start at ~0.15). */
  height?: number;
  hills?: number;
  /** Extra hills/cliffs: [x, z, radius, height]. */
  mounds?: [number, number, number, number][];
  jungle?: number; // 0..1 vegetation density
  /** Lower the terrain inside these regions to at most y (for lava pits / pools). */
  carve?: { shape: SDF; y: number }[];
}

export interface LiquidDef {
  shape: SDF;
  y: number;
  flow?: V2;
}

export interface HoleDef {
  id: string;
  name: string;
  par: number;
  tee: V2;
  cup: V2;
  pieces: PieceDef[];
  obstacles?: ObstacleDef[];
  decor?: DecorDef[];
  hazards?: { kind: 'water' | 'lava'; shape: SDF; y: number }[];
  lava?: LiquidDef[];
  pools?: LiquidDef[];
  waterfalls?: { top: V3; bottom: V3; width: number; dir: number }[];
  island?: IslandDef;
  /** Initial camera look direction override (radians, 0 = toward -Z). */
  aimYaw?: number;
  /** Optional camera hint points along the intended route (for the flyby). */
  route?: V2[];
  tip?: string;
  seed?: number;
}
