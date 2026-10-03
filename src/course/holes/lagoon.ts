// Course 4: Lantern Lagoon — a moonlit island of paper lanterns, glowing water and tiki magic.
// Each hole is built around route choices: a safe long way, a risky short way and a hero shot.
import type { HoleDef } from '../types';
import { path, circle, union, box, subtract } from '../../core/sdf';
import type { P2 } from '../../core/math';
import { routeHeight, bowl, funnel } from '../helpers';

// ------------------------------------------------------------------------------------------------
// 1. Lantern Creek (par 3)
// A creek cuts the hole in two and flows back toward the tee. The narrow log on the direct line is a
// birdie (or ace) chance; fall off and the current carries you all the way back to the start. The
// railed bridge on the east loop is safe but long.
// ------------------------------------------------------------------------------------------------
const lcCreek: P2[] = [
  [15, -0.9],
  [10, -0.2],
  [5, 0.3],
  [0.5, 0.4],
  [-4, 0.5],
  [-7.6, 1.8],
  [-9.9, 4.6],
  [-10.5, 7.6],
];
const lcBedY = 0.55;
const lcChannel = path(lcCreek, 2.8);
// the beach the creek washes you up on, climbing back to the tee
const lcBeachPts: P2[] = [
  [-10.5, 7.8],
  [-10.2, 10.6],
  [-8.0, 12.3],
  [-5.5, 13.4],
  [-3.0, 13.8],
];
const lcBeach = path(lcBeachPts, 3.0);
const lcBeachH = routeHeight(lcBeachPts, [lcBedY, 0.95, 1.2, 1.45, 1.6]);
const lcCreekH = (x: number, z: number) => (z > 7 && lcBeach.f(x, z) < 0.4 ? lcBeachH(x, z) : lcBedY);
const lcLogAng = Math.atan2(-1.4 - 2.2, 0.78 - 0.55);

export const lanternCreek: HoleDef = {
  id: 'll1',
  name: 'Lantern Creek',
  par: 3,
  tee: [0, 14.2],
  cup: [1.4, -18.0],
  tip: 'Walk the log for a birdie. Fall in and the creek takes you home!',
  route: [
    [0, 14.2],
    [0.4, 6],
    [0.7, -2],
    [1.0, -10],
    [1.4, -18.0],
  ],
  pieces: [
    {
      // terraces either side of the creek, the log and the bridge
      shape: union(
        subtract(
          union(
            box(0, 13.8, 3.6, 2.4, 0, 1.0),
            box(0.4, 7.0, 2.3, 5.4, 0, 0.3),
            path(
              [
                [2.6, 13.4],
                [7.2, 12.2],
                [9.4, 8.5],
                [9.6, 2.6],
              ],
              3.2,
            ),
            box(0.9, -8.4, 2.3, 7.8, 0, 0.3),
            circle(1.4, -17.8, 3.7),
            path(
              [
                [9.6, -1.8],
                [9.4, -9.0],
                [7.0, -15.0],
                [4.2, -17.8],
              ],
              3.2,
            ),
          ),
          lcChannel,
          lcBeach,
        ),
        path(
          [
            [0.55, 2.2],
            [0.78, -1.4],
          ],
          1.3,
          { smooth: false },
        ),
        path(
          [
            [9.6, 2.4],
            [9.6, -2.0],
          ],
          2.6,
          { smooth: false },
        ),
      ),
      height: 1.6,
      bridges: [
        { from: [0.55, 2.2], to: [0.78, -1.4], width: 1.3, style: 'logs' },
        { from: [9.6, 2.3], to: [9.6, -1.9], width: 2.6 },
      ],
      // the creek banks and the log have no walls: roll off and you're in the water
      open: [box(0.665, 0.4, 2.0, 0.95, lcLogAng), box(0.4, 1.85, 2.6, 0.45), box(0.9, -1.05, 2.6, 0.45), box(-2.4, 13.8, 1.3, 1.9)],
      baseBottom: -1.2,
    },
    {
      // the creek bed, and the beach ramp back up to the tee
      shape: union(lcChannel, lcBeach),
      height: lcCreekH,
      bed: [subtract(lcChannel, box(-10.5, 10, 2.5, 1.5))],
      open: [box(0.4, 1.85, 2.25, 0.6), box(0.9, -1.05, 2.25, 0.6), box(-2.4, 13.8, 1.3, 1.9)],
      noBase: [box(0.65, 0.4, 2.3, 1.6)],
      baseBottom: -1.2,
    },
  ],
  streams: [
    {
      path: lcCreek,
      width: 3.0,
      speed: [2.6, 3.2, 3.6, 3.8, 3.8, 3.4, 2.8, 2.2],
      surface: lcBedY + 0.3,
      pool: circle(-10.4, 8.9, 1.9),
    },
  ],
  waterfalls: [{ top: [17.6, 4.6, -1.0], bottom: [15.2, lcBedY + 0.3, -0.95], width: 2.4, dir: Math.PI }],
  decor: [
    { type: 'lanterns', pts: [[-2.8, 11], [-2.8, 6.6], [-2.6, 2.6]], seed: 1 },
    { type: 'lanterns', pts: [[3.6, 10.6], [3.5, 6.6], [3.4, 2.7]], seed: 2 },
    { type: 'lanterns', pts: [[-2.1, -2.2], [-2.1, -7.6], [-2.3, -13.0]], seed: 3 },
    { type: 'lanterns', pts: [[4.1, -2.0], [4.1, -7.6], [4.4, -12.4]], seed: 4 },
    { type: 'lanterns', pts: [[5.6, 2.6], [5.6, -1.9]], seed: 5 },
    { type: 'tiki', at: [-4.6, 16.4], rot: 0.6, scale: 1.3, variant: 1 },
    { type: 'tiki', at: [4.8, 16.2], rot: -0.6, scale: 1.3, variant: 0 },
    { type: 'tiki', at: [1.4, -23.2], rot: 0, scale: 1.7, variant: 2 },
    { type: 'torch', at: [12.4, 3.4] },
    { type: 'rock', at: [17.8, -1.0], r: 2.4, h: 4.6 },
    { type: 'rock', at: [17.2, 1.8], r: 1.8, h: 3.2 },
    { type: 'rock', at: [17.0, -3.6], r: 1.9, h: 3.6 },
    { type: 'bungalow', at: [-22, -8], rot: 1.2 },
    { type: 'bungalow', at: [-19, -18], rot: 0.7 },
    { type: 'bungalow', at: [22, 14], rot: -2.2 },
  ],
  island: {
    margin: 5,
    mounds: [
      [19, -1, 6, 4.5],
      [-14, -16, 7, 2.5],
    ],
    jungle: 0.9,
  },
};

// ------------------------------------------------------------------------------------------------
// 2. Tiki Tubes (par 3)
// A lagoon channel splits the hole. Three tiki heads on the tee plaza swallow your ball and spit it
// out across the water: teal is easy but drops you on the long west path, amber hides behind a
// spinning totem and comes out on the green's apron, and magenta sits in an alcove you can only
// reach with a bank shot off the far wall, then rolls you down toward the cup. Or walk the long
// rope bridge.
// ------------------------------------------------------------------------------------------------
const ttH = (x: number, z: number) => 1.3 + bowl(-0.55, -15.2, 2.4, 0.22)(x, z) + Math.max(0, -(z + 16.2)) * 0.16 * (Math.abs(x + 0.8) < 3.2 ? 1 : 0);

export const tikiTubes: HoleDef = {
  id: 'll2',
  name: 'Tiki Tubes',
  par: 3,
  tee: [0, 11.4],
  cup: [-0.55, -15.2],
  tip: 'Pick a tiki! Magenta needs a bank shot off the far wall.',
  aimYaw: 0,
  route: [
    [0, 11.4],
    [0, 3.2],
    [0, -8.2],
    [-0.55, -15.2],
  ],
  pieces: [
    {
      shape: union(
        // the tee plaza and the magenta alcove
        box(0, 7, 5.6, 6.2, 0, 1.2),
        box(-5.9, 6.6, 2.6, 5.8, 0, 0.4),
        box(7.9, 8.0, 2.4, 0.85),
        // walking route: east path, the long rope bridge and back west to the green
        path(
          [
            [4.6, 12.0],
            [12.2, 11.8],
            [13.6, 7],
            [13.6, 1.2],
          ],
          3.2,
        ),
        path(
          [
            [13.6, 1.4],
            [13.6, -6.6],
          ],
          2.4,
          { smooth: false },
        ),
        path(
          [
            [13.6, -6.4],
            [13.2, -12],
            [9.4, -15.4],
            [3.2, -15.4],
          ],
          3.2,
        ),
        // the green complex across the water
        box(0, -9.6, 4.2, 4.2, 0, 0.6),
        circle(-0.6, -15.4, 4.1),
        box(-0.8, -19.6, 2.6, 2.4, 0, 0.6),
        // teal's west path
        path(
          [
            [-12.6, -7.0],
            [-12.6, -12.0],
            [-9.8, -15.4],
            [-4.4, -16.0],
          ],
          3.4,
        ),
      ),
      height: ttH,
      bridges: [{ from: [13.6, 1.2], to: [13.6, -6.4], width: 2.4 }],
    },
  ],
  obstacles: [
    // teal: angled to face the tee, easy to hit
    { type: 'tunnel', at: [-5.6, 2.0], dir: Math.atan2(2.9 - 11.4, -5.0), to: [-12.6, -7.6], toDir: -Math.PI / 2, color: 0x2ff5d2 },
    // amber: straight ahead, behind the spinner
    { type: 'tunnel', at: [0, 1.85], dir: -Math.PI / 2, to: [0, -6.5], toDir: -Math.PI / 2, color: 0xffb22e, keep: 0.85 },
    // magenta: tucked in the east alcove, mouth facing west
    { type: 'tunnel', at: [9.4, 8.0], dir: 0, to: [-0.05, -20.2], toDir: Math.PI / 2, color: 0xff52d9, keep: 0.5, minSpeed: 2.2, maxSpeed: 4.5 },
    // a guardian tiki blocks the straight shot into magenta's alcove
    { type: 'tiki', at: [3.3, 9.8], rot: -0.6, scale: 0.85, variant: 1 },
    // a spinning totem off to the side sweeps across amber's mouth
    { type: 'spinner', at: [1.5, 4.6], len: 2.1, speed: 1.2, arms: 2 },
    { type: 'bumper', at: [-3.2, -12.2] },
    { type: 'bumper', at: [2.6, -12.0] },
  ],
  decor: [
    { type: 'lanterns', pts: [[-9.2, 12.6], [-9.2, 7.6], [-9.2, 2.2]], seed: 11 },
    { type: 'lanterns', pts: [[6.2, 12.4], [6.2, 10.0]], seed: 12 },
    { type: 'lanterns', pts: [[-5.2, -6.4], [-5.2, -12.6]], seed: 13 },
    { type: 'lanterns', pts: [[5.0, -6.2], [5.0, -12.4]], seed: 14 },
    { type: 'lanterns', pts: [[11.6, 0.6], [11.6, -5.8]], seed: 15 },
    { type: 'tiki', at: [-3.4, 15.6], rot: 0.5, scale: 1.3, variant: 0 },
    { type: 'tiki', at: [3.4, 15.6], rot: -0.5, scale: 1.3, variant: 1 },
    { type: 'tiki', at: [-0.6, -25.4], rot: 0, scale: 1.9, variant: 2 },
    { type: 'torch', at: [-2.6, -0.4] },
    { type: 'torch', at: [2.6, -0.4] },
    { type: 'torch', at: [-15.6, -9] },
    { type: 'bungalow', at: [-22, -2.4], rot: 1.57 },
    { type: 'bungalow', at: [23, -2.0], rot: -1.57 },
    { type: 'bungalow', at: [-18, -26], rot: 0.6 },
  ],
  island: {
    margin: 5,
    water: [box(0, -2.3, 40, 3.0, 0, 1.0)],
    mounds: [[-1, -30, 9, 3]],
    jungle: 0.9,
  },
};

// ------------------------------------------------------------------------------------------------
// 3. Blowhole Bluff (par 4)
// The cup sits on a moonlit bluff. Three ways up: thread the causeway into the blowhole and ride the
// geyser straight up to the green (too hard and you're in the tide pool), climb the narrow sea
// ledge where the wind god blows balls off the edge, or take the long walled switchback.
// ------------------------------------------------------------------------------------------------
const bbVent: P2 = [1.5, 1.4];
const bbShelf = box(2, 6.6, 8.8, 7.0, 0, 1.0);
const bbPoolRing = circle(bbVent[0], bbVent[1], 4.0);
const bbIslet = circle(bbVent[0], bbVent[1], 1.9);
const bbCauseway = box(1.5, 4.5, 0.5, 1.5);
const bbBluff = box(3, -13.8, 7.6, 4.6, 0, 1.2);
const bbLedgePts: P2[] = [
  [-6.0, 7.4],
  [-8.9, 5.0],
  [-9.6, -1.0],
  [-7.4, -8.6],
  [-5.2, -10.2],
  [-3.2, -11.6],
];
const bbLedge = path(bbLedgePts, 2.3);
const bbLedgeH = routeHeight(bbLedgePts, [0.9, 0.9, 2.4, 4.0, 4.6, 4.6]);
const bbRampPts: P2[] = [
  [8.2, 9.8],
  [12.9, 8.9],
  [14.2, 3.6],
  [13.4, -2.2],
  [11.0, -5.8],
  [12.8, -9.8],
  [11.4, -11.4],
  [8.4, -13.8],
];
const bbRamp = path(bbRampPts, 3.0);
const bbRampH = routeHeight(bbRampPts, [0.9, 0.9, 1.7, 2.6, 3.4, 4.3, 4.6, 4.6]);
const bbCup: P2 = [2.4, -14.6];
const bbHeight = (x: number, z: number) => {
  if (bbBluff.f(x, z) < 0.05) return 4.6 + bowl(bbCup[0], bbCup[1], 2.4, 0.2)(x, z);
  if (bbShelf.f(x, z) < 0.05 || bbIslet.f(x, z) < 0.3 || bbCauseway.f(x, z) < 0.05) return 0.9 + funnel(bbVent[0], bbVent[1], 1.8, 0.6)(x, z);
  if (bbLedge.f(x, z) < bbRamp.f(x, z)) return bbLedgeH(x, z);
  return bbRampH(x, z);
};
const bbGust = box(-9.0, 0.6, 2.4, 5.4, 0.12);

export const blowholeBluff: HoleDef = {
  id: 'll3',
  name: 'Blowhole Bluff',
  par: 4,
  tee: [2.4, 12.2],
  cup: bbCup,
  tip: 'Settle it in the blowhole and ride the geyser up!',
  route: [
    [2.4, 12.2],
    [1.6, 5.5],
    [bbVent[0], bbVent[1]],
    [2.0, -10.0],
    bbCup,
  ],
  pieces: [
    {
      shape: union(subtract(bbShelf, bbPoolRing), bbIslet, bbCauseway, bbLedge, bbRamp, bbBluff),
      height: bbHeight,
      // the tide pool's rim, the islet and the causeway drop straight into the water; so does the
      // sea side of the ledge
      open: [
        circle(bbVent[0], bbVent[1], 4.25),
        path(bbLedgePts.slice(1, 5).map(([x, z]) => [x - 1.15, z] as P2), 0.5),
      ],
      baseBottom: -1.4,
    },
  ],
  obstacles: [
    { type: 'geyser', at: bbVent, target: [3.4, -10.6], apex: 9.5, period: 3.4, burst: 0.4 },
    { type: 'gust', shape: bbGust, dir: Math.PI, strength: 2.6, period: 4.4, blow: 2.0, source: [-6.4, -2.4] },
    { type: 'bumper', at: [-1.6, -15.6] },
    { type: 'bumper', at: [6.6, -15.4] },
  ],
  pools: [{ shape: subtract(bbPoolRing, circle(bbVent[0], bbVent[1], 1.95), bbCauseway), y: 0.5 }],
  decor: [
    { type: 'lanterns', pts: [[-3.4, 14.4], [2.4, 14.6], [7.6, 14.4]], seed: 21 },
    { type: 'lanterns', pts: [[-5.2, -7.6], [-2.6, -8.2], [1.0, -8.4]], seed: 22 },
    { type: 'lanterns', pts: [[15.6, 6.4], [16.0, 0.4], [15.0, -4.6]], seed: 23 },
    { type: 'lanterns', pts: [[4.4, -8.4], [8.0, -8.0]], seed: 24 },
    { type: 'tiki', at: [-1.6, -19.8], rot: 0.3, scale: 1.6, variant: 2 },
    { type: 'tiki', at: [6.8, -19.6], rot: -0.3, scale: 1.4, variant: 0 },
    { type: 'torch', at: [-2.0, 2.2] },
    { type: 'torch', at: [5.0, 2.4] },
    { type: 'rock', at: [4.6, -0.6], r: 0.8 },
    { type: 'rock', at: [-1.4, -0.2], r: 0.7 },
    { type: 'rock', at: [-1.8, 3.2], r: 0.55 },
    { type: 'bungalow', at: [-20, 10], rot: 1.9 },
    { type: 'bungalow', at: [-21, -12], rot: 1.2 },
    { type: 'bungalow', at: [24, -6], rot: -1.6 },
  ],
  island: {
    margin: 5,
    mounds: [
      [3, -15, 12, 3.8],
      [-4, -6, 5, 2.2],
      [7, -6, 5, 2.4],
    ],
    carve: [{ shape: bbPoolRing, y: 0.0 }],
    jungle: 0.8,
  },
};

// ------------------------------------------------------------------------------------------------
// 4. Moonlight Gauntlet (par 4)
// The finale. A long fairway runs west from the jetty, past a bunker, to the Moon Tiki: thread its
// spinning guardian and it drops you on the rim of the funnel green (eagle chance).
// From the fairway you can also brave the rail-less boardwalk across the inlet while the wind god
// blows, or take the long causeway loop round the east shore.
// ------------------------------------------------------------------------------------------------
const mgFair: P2[] = [
  [16.2, 11.2],
  [8, 8.8],
  [0, 8.6],
  [-8, 9.2],
  [-15.6, 7.4],
];
const mgCup: P2 = [-5.2, -17.0];
const mgBridgeX = 1.6;
const mgHeight = (x: number, z: number) => 1.2 + bowl(mgCup[0], mgCup[1], 4.6, 0.32)(x, z);

export const moonlightGauntlet: HoleDef = {
  id: 'll4',
  name: 'Moonlight Gauntlet',
  par: 4,
  tee: [17.2, 14.6],
  cup: mgCup,
  tip: 'Time the Moon Tiki for a shortcut, or brave the windy boardwalk.',
  route: [
    [17.2, 14.6],
    [8, 9],
    [mgBridgeX, 7.6],
    [mgBridgeX, -6.6],
    [1.0, -11],
    mgCup,
  ],
  pieces: [
    {
      shape: union(
        box(17.2, 13.6, 2.4, 2.6, 0, 0.8),
        path(mgFair, 4.6),
        // the boardwalk across the inlet and the far shore
        path(
          [
            [mgBridgeX, 6.8],
            [mgBridgeX, -6.8],
          ],
          1.25,
          { smooth: false },
        ),
        path(
          [
            [mgBridgeX, -6.6],
            [1.2, -11],
            [-1.8, -14.6],
          ],
          3.4,
        ),
        // the long causeway loop round the east shore
        path(
          [
            [18.4, 11.6],
            [20.6, 4],
            [20.2, -5],
            [16.4, -11.6],
            [9, -15.4],
            [0.8, -16.4],
          ],
          3.2,
        ),
        // the funnel green and the Moon Tiki's perch above it
        circle(mgCup[0], mgCup[1], 4.6),
        box(-3.6, -21.6, 2.2, 1.8, 0, 0.5),
      ),
      height: mgHeight,
      sand: [circle(4.4, 10.0, 1.5), circle(-9.6, 10.4, 1.2), circle(-0.2, -19.8, 1.3)],
      bridges: [{ from: [mgBridgeX, 6.6], to: [mgBridgeX, -6.6], width: 1.25, style: 'boardwalk' }],
      open: [box(mgBridgeX, 0, 0.9, 6.9)],
    },
  ],
  obstacles: [
    // the Moon Tiki at the far end of the fairway, its guardian sweeping across the mouth
    { type: 'tunnel', at: [-16.8, 7.4], dir: Math.PI, to: [-3.4, -22.2], toDir: Math.PI / 2, color: 0xa06bff, keep: 0.55, minSpeed: 2.4, maxSpeed: 5.0, arc: 5 },
    { type: 'spinner', at: [-13.6, 5.4], len: 2.5, speed: 1.3, arms: 2 },
    { type: 'gust', shape: box(mgBridgeX, -0.2, 3.6, 4.8), dir: 0, strength: 2.5, period: 4.6, blow: 2.2, phase: 1.1, source: [-2.8, -0.6] },
    { type: 'bumper', at: [-9.2, -18.4] },
    { type: 'bumper', at: [-1.6, -14.0] },
    { type: 'rock', at: [-10.4, 11.0], r: 0.7 },
  ],
  decor: [
    { type: 'lanterns', pts: [[12.4, 11.6], [6.6, 11.6], [0.6, 11.4], [-5.6, 12.0], [-11.6, 10.8]], seed: 31 },
    { type: 'lanterns', pts: [[4.0, -8.4], [3.8, -12.6]], seed: 32 },
    { type: 'lanterns', pts: [[-10.6, -13.0], [-10.4, -19.6], [-6.4, -23.2]], seed: 33 },
    { type: 'lanterns', pts: [[22.8, 8.0], [23.0, 0.0], [22.2, -7.0]], seed: 34 },
    { type: 'tiki', at: [-19.6, 9.6], rot: 1.2, scale: 1.5, variant: 2 },
    { type: 'tiki', at: [14.0, 17.2], rot: 0.3, scale: 1.2, variant: 0 },
    { type: 'tiki', at: [20.4, 17.0], rot: -0.3, scale: 1.2, variant: 1 },
    { type: 'torch', at: [-0.4, 5.6] },
    { type: 'torch', at: [3.6, 5.6] },
    { type: 'torch', at: [-0.6, -7.4] },
    { type: 'torch', at: [3.8, -7.4] },
    { type: 'bungalow', at: [-8, -1.4], rot: 1.57 },
    { type: 'bungalow', at: [10.4, -1.2], rot: -1.4 },
    { type: 'bungalow', at: [-24, -10], rot: 1.2 },
  ],
  island: {
    margin: 5,
    water: [box(-1, -0.6, 17.5, 4.6, 0, 1.5)],
    mounds: [[-6, -25, 9, 3]],
    jungle: 0.8,
  },
};

export const lanternLagoon = [lanternCreek, tikiTubes, blowholeBluff, moonlightGauntlet];
