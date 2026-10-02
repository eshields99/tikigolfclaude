// Course 1: Coconut Cove — sunny beach island, gentle introduction.
import type { HoleDef } from '../types';
import { path, circle, union, subtract, box, ellipse } from '../../core/sdf';
import { smoothstep } from '../../core/math';
import { ramp, sum, bowl } from '../helpers';

export const welcomeWave: HoleDef = {
  id: 'cc1',
  name: 'Welcome Wave',
  par: 2,
  tee: [0, 14],
  cup: [1.5, -13],
  tip: 'Follow the curve — bank off the walls!',
  route: [
    [0, 14],
    [0, 9],
    [-2.5, 2],
    [1, -5],
    [1.5, -13],
  ],
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
      height: (_x, z) => 1.2 + smoothstep(-6, 10, z) * 0.5,
    },
  ],
  obstacles: [{ type: 'rock', at: [-1.0, -3.6], r: 0.55 }],
  decor: [
    { type: 'tiki', at: [-3.6, 15.2], rot: 0.35, scale: 1.25 },
    { type: 'tiki', at: [3.6, 15.4], rot: -0.35, scale: 1.25, variant: 2 },
    { type: 'tiki', at: [6.2, -12.5], rot: -1.2, scale: 1.4, variant: 1 },
    { type: 'palm', at: [-7, 5] },
    { type: 'palm', at: [-8.5, 9] },
    { type: 'palm', at: [6.5, 2], scale: 1.1 },
    { type: 'palm', at: [-4.5, -12] },
    { type: 'hut', at: [-12, 13], rot: 0.7 },
    { type: 'torch', at: [-2.9, -15.6] },
    { type: 'torch', at: [5.4, -15.2] },
  ],
  island: { margin: 6, land: [circle(-12, 10, 7), circle(10, -8, 6)], mounds: [[-16, -16, 9, 3.5]] },
};

export const coconutCorner: HoleDef = {
  id: 'cc2',
  name: 'Coconut Corner',
  par: 3,
  tee: [0, 14.5],
  cup: [18.2, -3.2],
  tip: 'Cut the corner — but mind the sand trap!',
  route: [
    [0, 14.5],
    [0, 1],
    [2.5, -2.5],
    [10, -2.5],
    [18.2, -3.2],
  ],
  pieces: [
    {
      shape: subtract(
        union(
          box(0, 14.6, 2.6, 2.8, 0, 1.0),
          box(0, 6.5, 2.2, 8.5),
          box(2.2, -2.5, 4.8, 4.6, 0, 2.2),
          box(9.5, -2.5, 6.2, 2.2),
          circle(18.2, -3.0, 3.9),
        ),
        circle(4.4, -0.4, 1.15),
      ),
      height: sum(ramp([13.2, -3], [15.6, -3], 1.2, 1.45), bowl(12.2, -3.6, 1.9, 0.12)),
      sand: [ellipse(12.2, -3.6, 1.9, 1.0)],
    },
  ],
  obstacles: [
    { type: 'planter', at: [4.4, -0.4], r: 1.15 },
    { type: 'bumper', at: [8.6, -1.7] },
    { type: 'bumper', at: [20.6, -0.4], r: 0.4 },
  ],
  decor: [
    { type: 'tiki', at: [-3.8, 15.5], rot: 0.4, scale: 1.2 },
    { type: 'torch', at: [3.3, 16.8] },
    { type: 'torch', at: [-3.3, 16.8] },
    { type: 'palm', at: [-6, 4] },
    { type: 'palm', at: [8, 6], scale: 1.15 },
    { type: 'palm', at: [14, 4] },
    { type: 'palm', at: [23.5, -6] },
    { type: 'hut', at: [-9, -6], rot: -0.6 },
    { type: 'tiki', at: [22.8, -1.5], rot: -1.4, scale: 1.3, variant: 2 },
  ],
  island: { margin: 6, land: [circle(10, 8, 7), circle(-6, -8, 6)] },
};

const lagoonH = (_x: number, z: number) => 1.2 + 0.4 * smoothstep(-3, 6, z);

export const lagoonLeap: HoleDef = {
  id: 'cc3',
  name: 'Lagoon Leap',
  par: 3,
  tee: [0, 12.6],
  cup: [0, -9],
  tip: 'Brave the ramp for glory, or take the bridge.',
  route: [
    [0, 12.6],
    [0, 3],
    [0, -9],
  ],
  pieces: [
    {
      shape: union(
        box(0, 12.6, 2.6, 2.6, 0, 1.0),
        box(0, 7.6, 2.0, 4.6),
        path(
          [
            [2, 11.5],
            [7.5, 10.5],
            [9, 7],
            [9, -3],
            [7, -6.5],
            [3.5, -7.6],
          ],
          3.6,
        ),
        box(0, -8, 3.8, 5.4, 0, 1.6),
      ),
      height: lagoonH,
      open: [box(0, 3.0, 2.3, 0.4), box(0, -2.6, 3.0, 0.4)],
      bridges: [{ from: [9, 4.6], to: [9, -3.2], width: 3.6 }],
    },
  ],
  obstacles: [{ type: 'ramp', at: [0, 5.5], dir: -Math.PI / 2, len: 2.5, width: 2.6, height: 0.85, kicker: true }],
  decor: [
    { type: 'tiki', at: [-3.6, 13.6], rot: 0.5, scale: 1.2, variant: 1 },
    { type: 'torch', at: [-2.9, 4.3] },
    { type: 'torch', at: [-4.4, -2.4] },
    { type: 'torch', at: [4.4, -2.4] },
    { type: 'palm', at: [-7, 9] },
    { type: 'palm', at: [14, 8], scale: 1.15 },
    { type: 'palm', at: [-6.5, -9] },
    { type: 'palm', at: [13.5, -8] },
    { type: 'hut', at: [-10.5, 13.5], rot: 0.9 },
    { type: 'rock', at: [4.5, 0.6], r: 1.0, y: -0.4 },
    { type: 'rock', at: [-5.5, 0.2], r: 1.3, y: -0.5 },
  ],
  island: { margin: 6, water: [box(2, 0.25, 22, 2.35)], land: [circle(-10, 12, 6), circle(13, -9, 6)] },
};

export const coconutCove = [welcomeWave, coconutCorner, lagoonLeap];
