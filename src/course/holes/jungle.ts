// Course 2: Jungle Falls — lush jungle, waterfalls, rope bridges and tiki temples.
import type { HoleDef } from '../types';
import { path, circle, union, box } from '../../core/sdf';
import { ramp, routeHeight } from '../helpers';
import type { P2 } from '../../core/math';

const plankAng = Math.atan2(7.55 - 6.55, 5.6 - -3.6);

export const waterfallBend: HoleDef = {
  id: 'jf1',
  name: 'Waterfall Bend',
  par: 3,
  tee: [-6, 11.8],
  cup: [8.2, 10],
  tip: 'The plank is a shortcut… if your nerves hold.',
  route: [
    [-6, 11.8],
    [-6, 3],
    [-4, -4],
    [1, -7],
    [6, -4],
    [8, 2],
    [8.2, 10],
  ],
  pieces: [
    {
      shape: union(
        path(
          [
            [-6, 13.6],
            [-6, 3],
            [-4, -4],
            [1, -7],
            [6, -4],
            [8, 2],
            [8, 7.5],
          ],
          4.2,
        ),
        circle(8.1, 9.8, 3.3),
        path(
          [
            [-4.2, 6.5],
            [5.9, 7.6],
          ],
          1.5,
          { smooth: false },
        ),
      ),
      height: 1.3,
      bridges: [{ from: [-3.6, 6.55], to: [5.6, 7.55], width: 1.5 }],
      open: [box(1.0, 7.05, 4.0, 1.2, plankAng)],
    },
  ],
  obstacles: [
    { type: 'rock', at: [-3.2, -2.6], r: 0.6 },
    { type: 'bumper', at: [3.6, -6.4] },
  ],
  waterfalls: [{ top: [14.2, 6.4, 12.6], bottom: [13.0, 0.0, 10.4], width: 2.4, dir: Math.atan2(10.4 - 12.6, 13.0 - 14.2) }],
  decor: [
    { type: 'tiki', at: [-9.6, 12.4], rot: 0.8, scale: 1.4, variant: 2 },
    { type: 'tiki', at: [-2.6, 14.2], rot: -0.4, scale: 1.1 },
    { type: 'torch', at: [-9.0, 9] },
    { type: 'torch', at: [11.8, 6.6] },
    { type: 'torch', at: [4.6, 12.6] },
    { type: 'palm', at: [-11, 3] },
    { type: 'palm', at: [12, -5] },
    { type: 'palm', at: [-8, -9] },
    { type: 'palm', at: [3, 14.5] },
    { type: 'rock', at: [13.6, 8.4], r: 1.6 },
    { type: 'rock', at: [15.8, 10.2], r: 2.0 },
    { type: 'rock', at: [12.4, 13.6], r: 1.8 },
  ],
  island: {
    margin: 7,
    water: [circle(1, 2.6, 5.0), circle(13.6, 9.6, 2.5)],
    mounds: [
      [16.5, 14, 7, 6.5],
      [-14, -6, 8, 3],
    ],
    jungle: 1.2,
  },
};

export const tikiTemple: HoleDef = {
  id: 'jf2',
  name: 'Tiki Temple',
  par: 3,
  tee: [0, 13.2],
  cup: [0, -11.4],
  tip: 'Time your putt past the spinning totem.',
  route: [
    [0, 13.2],
    [0, 4],
    [0, -0.5],
    [0, -6],
    [0, -11.4],
  ],
  pieces: [
    {
      shape: union(
        box(0, 13.4, 2.5, 2.2, 0, 1),
        box(0, 8, 2.1, 4.6),
        box(0, -0.5, 5.6, 5.2, 0, 2.2),
        box(0, -7.2, 1.7, 2.6),
        box(0, -11.3, 3.8, 2.9, 0, 1.2),
      ),
      height: ramp([0, -5.3], [0, -8.5], 1.3, 2.15),
    },
  ],
  obstacles: [
    { type: 'spinner', at: [0, -0.5], len: 2.75, speed: 1.1, arms: 4 },
    { type: 'tiki', at: [-2.7, -9.1], rot: 0, scale: 0.75, variant: 0 },
    { type: 'tiki', at: [2.7, -9.1], rot: 0, scale: 0.75, variant: 1 },
    { type: 'bumper', at: [-4.3, 3.4] },
    { type: 'bumper', at: [4.3, 3.4] },
  ],
  decor: [
    { type: 'tiki', at: [-5.4, -13.8], rot: 0.5, scale: 1.8, variant: 2 },
    { type: 'tiki', at: [5.4, -13.8], rot: -0.5, scale: 1.8, variant: 2 },
    { type: 'torch', at: [-3.2, 15.4] },
    { type: 'torch', at: [3.2, 15.4] },
    { type: 'palm', at: [-9, 9] },
    { type: 'palm', at: [9.5, 7] },
    { type: 'palm', at: [-10, -6] },
    { type: 'palm', at: [10, -9] },
    { type: 'hut', at: [-11, 14], rot: 0.6 },
  ],
  island: { margin: 7, mounds: [[0, -20, 10, 4]], jungle: 1.2 },
};

const swRoute: P2[] = [
  [-8, 17],
  [6, 17],
  [8.6, 15],
  [7.5, 11.4],
  [-6, 6.2],
  [-8.6, 5],
  [-7, 2.4],
  [4, -3.2],
  [6.8, -4.8],
];
const swH = [4.4, 3.5, 3.5, 3.5, 2.5, 2.5, 2.5, 1.4, 1.4];

export const jungleSwitchback: HoleDef = {
  id: 'jf3',
  name: 'Switchback Slide',
  par: 4,
  tee: [-7, 17],
  cup: [7.2, -5.2],
  tip: 'Downhill all the way — easy on the power!',
  route: swRoute,
  pieces: [
    {
      shape: union(
        path(
          [
            [-9, 17],
            [6.5, 17],
          ],
          4.0,
          { smooth: false },
        ),
        circle(8.6, 15, 3.3),
        path(
          [
            [7.6, 11.4],
            [-6.2, 6.2],
          ],
          4.0,
          { smooth: false },
        ),
        circle(-8.6, 5, 3.3),
        path(
          [
            [-7.2, 2.4],
            [4.2, -3.2],
          ],
          4.0,
          { smooth: false },
        ),
        circle(6.8, -4.8, 3.5),
      ),
      height: routeHeight(swRoute, swH),
      baseBottom: -1.2,
    },
  ],
  obstacles: [
    { type: 'bumper', at: [-9.4, 4.2] },
    { type: 'slider', from: [0.6, 10.6], to: [-0.6, 7.2], size: [1.2, 1.0], height: 0.55, period: 3.2 },
    { type: 'rock', at: [10, 16.2], r: 0.7 },
  ],
  decor: [
    { type: 'tiki', at: [-10.8, 18.6], rot: 1.2, scale: 1.3 },
    { type: 'torch', at: [-10.4, 15] },
    { type: 'torch', at: [11.8, 13.5] },
    { type: 'torch', at: [-12, 3] },
    { type: 'palm', at: [0, 21] },
    { type: 'palm', at: [12.5, 9] },
    { type: 'palm', at: [-12.5, 9.5] },
    { type: 'palm', at: [-2, 1] },
    { type: 'palm', at: [11, -8] },
  ],
  island: {
    margin: 7,
    mounds: [
      [-1, 17, 12, 3.2],
      [0, 9, 9, 1.6],
    ],
    jungle: 1.2,
  },
};

export const jungleFalls = [waterfallBend, tikiTemple, jungleSwitchback];
