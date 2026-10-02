// Course 3: Volcano Peak — dusk, glowing lava rivers, an erupting volcano and a crater finale.
import type { HoleDef } from '../types';
import { path, circle, union, box } from '../../core/sdf';
import { smoothstep, type P2 } from '../../core/math';
import { routeHeight, bowl } from '../helpers';

const riverPts: P2[] = [
  [-13, 3.4],
  [-6, 1.4],
  [0, 2.9],
  [6, 1.6],
  [13, 3.2],
];
const lavaRiver = path(riverPts, 13.2);
const lavaRiverWide = path(riverPts, 14.4);

export const lavaLanes: HoleDef = {
  id: 'vp1',
  name: 'Lava Lanes',
  par: 3,
  tee: [0, 12.6],
  cup: [0, -10],
  tip: 'Two lanes, no walls. Stay on the stone!',
  route: [
    [0, 12.6],
    [0, 2],
    [0, -10],
  ],
  pieces: [
    {
      shape: union(
        box(0, 12.6, 3.8, 2.4, 0, 1.0),
        path(
          [
            [-2.6, 10.6],
            [-3.4, 6],
            [-1.6, 2],
            [-3.4, -2],
            [-2.6, -6.4],
          ],
          1.9,
        ),
        box(2.7, 2.2, 0.85, 8.4),
        box(0, -9.6, 4.2, 3.8, 0, 1.4),
      ),
      height: 1.6,
      open: [box(0, 2.2, 6.5, 7.75)],
    },
  ],
  obstacles: [{ type: 'boost', at: [2.7, 6.6], dir: -Math.PI / 2, len: 2.0, width: 1.3, speed: 15 }],
  lava: [{ shape: lavaRiver, y: 0.45, flow: [1, 0.1] }],
  decor: [
    { type: 'tiki', at: [-5.6, 13.4], rot: 0.6, scale: 1.4, variant: 1 },
    { type: 'tiki', at: [5.6, 13.4], rot: -0.6, scale: 1.4, variant: 1 },
    { type: 'torch', at: [-4.6, 10.4] },
    { type: 'torch', at: [4.6, 10.4] },
    { type: 'torch', at: [-4.9, -6.2] },
    { type: 'torch', at: [4.9, -6.2] },
    { type: 'tiki', at: [0, -15.2], rot: 0, scale: 1.7, variant: 2 },
  ],
  island: { margin: 6, land: [box(0, 2, 17.5, 15, 0, 6)], carve: [{ shape: lavaRiverWide, y: 0.05 }], jungle: 0.5 },
};

const jumpH = (_x: number, z: number) => 1.6 + 0.7 * smoothstep(3.5, -4.6, z);

export const magmaJump: HoleDef = {
  id: 'vp2',
  name: 'Magma Jump',
  par: 3,
  tee: [0, 13],
  cup: [-1.9, -11.6],
  tip: 'Full power off the ramp clears the magma!',
  route: [
    [0, 13],
    [0, 4],
    [-1.9, -11.6],
  ],
  pieces: [
    {
      shape: union(
        box(0, 13.2, 2.6, 2.4, 0, 1),
        box(0, 8.5, 2.1, 4.7),
        path(
          [
            [-2, 12.2],
            [-7, 11.2],
            [-9.2, 6.5],
            [-9.2, -4],
            [-6.8, -8.2],
            [-3.4, -9.2],
          ],
          3.4,
        ),
        box(0, -9.9, 3.9, 5.5, 0, 1.4),
      ),
      height: jumpH,
      open: [box(0, 3.85, 2.3, 0.35), box(0, -4.4, 3.2, 0.4)],
    },
  ],
  obstacles: [
    { type: 'ramp', at: [0, 6.0], dir: -Math.PI / 2, len: 2.3, width: 2.7, height: 1.1, kicker: true },
    { type: 'bumper', at: [-8.4, 2.2] },
    { type: 'bumper', at: [-9.9, -1.8] },
  ],
  lava: [{ shape: box(-0.5, -0.3, 6.2, 4.4, 0, 1.5), y: 0.45, flow: [0.2, -1] }],
  decor: [
    { type: 'tiki', at: [3.8, 14.6], rot: -0.5, scale: 1.3 },
    { type: 'torch', at: [2.9, 4.4] },
    { type: 'torch', at: [-2.9, 4.4] },
    { type: 'torch', at: [4.6, -4.6] },
    { type: 'tiki', at: [5.3, -12.5], rot: -1.0, scale: 1.6, variant: 2 },
    { type: 'tiki', at: [-5.6, -13.4], rot: 0.7, scale: 1.5, variant: 1 },
  ],
  island: { margin: 6, carve: [{ shape: box(-0.5, -0.3, 6.6, 4.8, 0, 1.5), y: 0.05 }], jungle: 0.45 },
};

const crRoute: P2[] = [
  [0, 15],
  [0, 7],
  [-4, 2],
  [-7, -4],
  [-5, -10],
  [0, -12.5],
  [5.5, -10],
  [8.2, -4],
  [6.8, 1.6],
  [3.6, 0.4],
];
const crH = [1.4, 1.4, 1.8, 2.3, 2.8, 3.2, 3.5, 3.75, 3.9, 3.9];
const crRouteH = routeHeight(crRoute, crH);
const crBowl = bowl(1.6, -3.4, 3.8, 0.6);
const crHeight = (x: number, z: number) => {
  const d = Math.hypot(x - 1.6, z + 3.4);
  if (d < 3.8) return 3.9 + crBowl(x, z);
  return crRouteH(x, z);
};

export const theCrater: HoleDef = {
  id: 'vp3',
  name: 'The Crater',
  par: 4,
  tee: [0, 14.6],
  cup: [1.6, -3.4],
  tip: 'Climb the spiral — the crater does the rest!',
  route: crRoute.concat([[1.6, -3.4]]),
  pieces: [
    {
      shape: union(
        path(crRoute.slice(0, 9).map((p, i) => (i === 0 ? [0, 16.2] : p) as P2), 3.8),
        path(
          [
            [6.8, 1.6],
            [3.6, -0.4],
          ],
          3.4,
          { smooth: false },
        ),
        circle(1.6, -3.4, 3.8),
      ),
      height: crHeight,
      baseBottom: -1.4,
    },
  ],
  obstacles: [
    { type: 'bumper', at: [-6.6, -6.8] },
    { type: 'bumper', at: [3.2, -12.0] },
    { type: 'boost', at: [-1.5, 4.6], dir: Math.atan2(-5, -4.5), len: 1.8, width: 1.4, speed: 12 },
  ],
  lava: [
    { shape: circle(-11.5, 6, 3.2), y: 0.45, flow: [0.3, 1] },
    { shape: circle(12.5, -9.5, 3.4), y: 0.45, flow: [-1, 0.2] },
  ],
  decor: [
    { type: 'tiki', at: [-3.4, 16.4], rot: 0.5, scale: 1.3, variant: 0 },
    { type: 'tiki', at: [3.4, 16.4], rot: -0.5, scale: 1.3, variant: 1 },
    { type: 'torch', at: [-10.8, -2] },
    { type: 'torch', at: [11.4, -2.5] },
    { type: 'torch', at: [-3, -15.6] },
    { type: 'torch', at: [4, -15.2] },
  ],
  island: {
    margin: 6,
    land: [circle(-11.5, 6, 6.5), circle(12.5, -9.5, 6.5)],
    mounds: [[1.6, -3.4, 7, 2.2]],
    carve: [
      { shape: circle(-11.5, 6, 3.6), y: 0.05 },
      { shape: circle(12.5, -9.5, 3.8), y: 0.05 },
    ],
    jungle: 0.45,
  },
};

export const volcanoPeak = [lavaLanes, magmaJump, theCrater];
