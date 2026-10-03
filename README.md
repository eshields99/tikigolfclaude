# Tiki Golf: Island Adventures

A tropical, tiki-themed 3D mini golf game for mobile and desktop browsers, inspired by the
pull-back-and-release putting of Golf Battle. Everything is procedural: the courses, the
island scenery, the textures and the music are generated in code, with no art or audio assets.

## Play

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN, for testing on a phone)
```

Drag anywhere on the screen and pull back away from where you want the ball to go. Pull
further for more power, release to putt. Drag back near your start point to cancel.

| Action | Touch | Mouse / keyboard |
| --- | --- | --- |
| Aim and shoot | drag, pull back, release | left-drag |
| Rotate camera | two-finger drag | right-drag, or Q / E |
| Zoom | pinch | mouse wheel |
| Course overview | map button | map button |
| Skip the hole intro | tap | click |

## Game modes

- **Island Tour**: play an island's three holes in order. Under par earns stars and coins;
  stars unlock the next island (Jungle Falls at 4, Volcano Peak at 10).
- **Tiki Battle**: you and three AI rivals play the same holes at the same time. Fewest
  total strokes wins, ties go to whoever holed out first. Wins earn trophies, and rivals get
  tougher as your trophy count grows.
- **Rush**: a race. The first ball in the cup wins the hole, strokes don't matter.
- **Practice**: any hole on any island, no unlocking needed, unlimited power-ups, no scoring.

Power-ups (one of each per round): **Fire** adds launch power and ignores sand, **Glide**
cuts rolling resistance so the ball slides much further, **Bounce** lofts the ball so it
hops over walls and obstacles.

## The islands

| Island | Mood | Holes |
| --- | --- | --- |
| Coconut Cove | sunny beach | Welcome Wave (par 2), Coconut Corner (par 3), Lagoon Leap (par 3) |
| Jungle Falls | golden hour | Waterfall Bend (par 3), Tiki Temple (par 3), Switchback Slide (par 4) |
| Volcano Peak | dusk, lava | Lava Lanes (par 3), Magma Jump (par 3), The Crater (par 4) |

## Building

```bash
npm run build           # typecheck + multi-file production build in dist/
npm run build:single    # one self-contained HTML file in dist-single/index.html
npm run build:artifact  # the single file as an HTML fragment (dist-single/tiki-golf.html)
npm run typecheck
```

## Tools

```bash
npx tsx tools/validate.ts          # build every hole headlessly, play it with the AI planner,
npx tsx tools/validate.ts vp3      # and scan tee shots for possible holes-in-one
npx tsx tools/phys-test.ts         # physics sanity checks: roll distances, cup capture, bounces
npx tsx tools/ai-skill.ts 0.4,0.85 # average rival strokes per hole at given skill levels
```

`validate.ts` is the quickest way to check a hole edit: it reports the strokes a perfect
player needs and fails loudly if a hole can't be completed.

## How it fits together

```
src/
  physics/   golf ball physics: sphere vs triangle meshes on a spatial grid, 240 Hz fixed
             step, rolling resistance, 5/7 slope gravity, restitution per surface, a real
             cup with lip-outs, moving obstacles, boosts, hazards and power-up modifiers
  course/    hole definitions (holes/*.ts) and the builder that turns 2D signed distance
             shapes into turf meshes, stone walls, rock plinths, bridges, ramps and colliders
  world/     island terrain, ocean, sky, clouds, palms and jungle trees, tikis, torches,
             waterfalls, lava, the volcano backdrop, seagulls and fireflies
  render/    renderer and post-processing (bloom, tone mapping, SMAA), materials, procedural
             textures, particles and flames
  game/      game loop, hole session rules, camera rig, aiming input, saves, and the AI rivals:
             a Web Worker rebuilds the hole physics and searches shots by simulation, then
             re-tests the best candidates under the rival's own aim error so it picks robust
             shots (difficulty scales with your trophies)
  ui/        DOM menus, HUD, result screens and the tiki-styled CSS
  audio/     WebAudio synthesis: putts, bounces, cup rattle, splashes, ambience and a
             procedural ukulele and steel drum soundtrack
```

### Adding a hole

Holes are data. A hole is a set of turf pieces, each a 2D signed distance shape (`path`,
`box`, `circle`, `union`, ...) with a height function, plus obstacles, decor and hazards:

```ts
export const myHole: HoleDef = {
  id: 'cc4',
  name: 'Palm Pass',
  par: 3,
  tee: [0, 12],
  cup: [0, -10],
  pieces: [{ shape: path([[0, 14], [3, 0], [0, -12]], 4.2), height: 1.2 }],
  obstacles: [{ type: 'bumper', at: [1.5, 0] }],
  decor: [{ type: 'palm', at: [-6, 2] }],
};
```

Walls follow every turf edge automatically; list `open` zones to leave edges unwalled, `sand`
zones for bunkers and `bridges` for plank bridges. Add the hole to a course in
`src/course/holes/`, then run `npx tsx tools/validate.ts cc4`.

## Quality and performance

Graphics quality defaults to Auto (Medium on phones, High on desktop) and steps down if the
frame rate stays under about 32 fps. Low turns off post-processing, Medium and Low thin out
the vegetation, use a coarser terrain grid and skip minor shadow casters.

The music can be switched off from the main menu (note button), the pause menu or Settings.
Progress, coins, balls and settings are stored in `localStorage`.
