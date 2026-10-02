import type { HoleDef } from '../types';
import { path, circle, union } from '../../core/sdf';
import { smoothstep } from '../../core/math';

// S-curve fairway from the tee to a round green (inspired by the concept art).
export const testHole: HoleDef = {
  id: 'test',
  name: 'Welcome Wave',
  par: 2,
  tee: [0, 14],
  cup: [1.5, -13],
  pieces: [
    {
      shape: union(
        path(
          [
            [0, 16],
            [0, 9],
            [-2.5, 2],
            [1.0, -5],
            [1.5, -10],
          ],
          4.2,
        ),
        circle(1.5, -12.5, 3.4),
      ),
      height: (_x, z) => 1.2 + smoothstep(4, -6, z) * 0.6,
      checker: { size: 1.0, angle: 0 },
    },
  ],
  obstacles: [{ type: 'rock', at: [-1.2, -3.5], r: 0.6 }],
  decor: [
    { type: 'tiki', at: [-4.2, 13], rot: 0.5, scale: 1.1 },
    { type: 'tiki', at: [4.5, 6], rot: -0.7, scale: 0.9, variant: 1 },
    { type: 'palm', at: [-6, 3] },
    { type: 'palm', at: [6, -8] },
    { type: 'torch', at: [-3.2, -10] },
    { type: 'torch', at: [4.8, -12] },
  ],
  island: { margin: 5, mounds: [[-14, -14, 10, 4]] },
};
