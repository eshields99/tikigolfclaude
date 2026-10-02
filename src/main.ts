import { Game, type GameUI } from './game/game';
import { testHole } from './course/holes/test';

const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.appendChild(canvas);
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:10px;top:10px;color:#fff;font:bold 16px sans-serif;text-shadow:0 2px 4px #000;pointer-events:none';
document.body.appendChild(hud);
let info = '';
const ui: GameUI = {
  hudStrokes: (s, p) => { hud.textContent = `${info} | Strokes ${s} / Par ${p}`; },
  hudHole: (i) => { info = `Hole ${i.num}: ${i.name}`; },
  toast: (t) => console.log('TOAST', t),
  callout: (t, s) => console.log('CALLOUT', t, s),
  hint: (t) => t && console.log('HINT', t),
  power: () => {},
  timer: () => {},
  holeFinished: (_s, next) => setTimeout(next, 500),
};
const params = new URLSearchParams(location.search);
const game = new Game(canvas, ui, (params.get('q') as 'high') ?? 'high');
game.loadCourse({ id: 'test', name: 'Test', env: params.get('env') ?? 'day', theme: 'beach', style: { turfA: 0x63c832, turfB: 0x4caf27, stone: 0x5b5754, plinth: 0x57514d, sand: 0xf1d9a0, wood: 0xa0703f, flag: 0xe0242c }, holes: [testHole] });
game.playHole(0, { mode: 'tour', maxStrokes: 10, timeLimit: 0 });
(window as unknown as { game: Game }).game = game;
