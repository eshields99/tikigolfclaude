// Lantern Lagoon props: tiki tunnel heads, the wind god tiki, paper lanterns and overwater bungalows.
// Geometries are memoised; glowing parts are separate geometries so they can use unlit materials.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GeoBuilder, M, jitterColor } from './geo';
import { TIKI_COLORS } from './props';
import { Rng } from '../core/math';

const cache = new Map<string, THREE.BufferGeometry>();
function memo(key: string, fn: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = fn()));
  return g;
}
const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);

// ---------------------------------------------------------------------------
// Tiki tunnel head. Local frame: the mouth faces +Z, ground at y = 0. The mouth is an opening
// MW wide (each side of x = 0) and MH tall that runs back to z = BACK; the ball rolls in.
// ---------------------------------------------------------------------------
export const TUNNEL = { W: 2.3, D: 1.9, H: 2.8, MW: 0.62, MH: 0.84, BACK: -0.2 };

export function tunnelHeadGeo(): THREE.BufferGeometry {
  return memo('tunnelHead', () => {
    const gb = new GeoBuilder();
    const C = TIKI_COLORS;
    const { W, D, H, MW, MH, BACK } = TUNNEL;
    const cw = W / 2 - MW;
    const front = D / 2;
    // cheek pillars either side of the mouth, with carved bands
    for (const sx of [-1, 1]) {
      gb.add(rb(cw, 1.7, D, 0.16), M.compose(sx * (MW + cw / 2), 0.85, 0), C.wood);
      gb.add(rb(cw + 0.06, 0.1, D + 0.06, 0.04), M.compose(sx * (MW + cw / 2), 0.24, 0), C.dark);
      gb.add(rb(cw + 0.06, 0.1, D + 0.06, 0.04), M.compose(sx * (MW + cw / 2), 0.5, 0), C.dark);
    }
    // the head block above the mouth, overhanging a little
    gb.add(rb(W + 0.1, H - MH, D + 0.1, 0.24), M.compose(0, MH + (H - MH) / 2, 0), C.wood);
    // crown band with zigzag teeth
    gb.add(rb(W + 0.24, 0.32, D + 0.24, 0.1), M.compose(0, H - 0.08, 0), C.dark);
    gb.add(rb(W - 0.1, 0.18, D - 0.1, 0.08), M.compose(0, H + 0.16, 0), C.light);
    for (let i = -6; i <= 6; i++) {
      const cone = new THREE.ConeGeometry(0.09, 0.2, 4);
      gb.add(cone, M.compose(i * 0.18, H - 0.08 + (i % 2 === 0 ? 0.04 : -0.04), front + 0.13, i % 2 === 0 ? 0 : Math.PI, Math.PI / 4, 0, 1, 1, 0.4), C.light);
    }
    // brow ridge
    for (const sx of [-1, 1]) gb.add(rb(0.95, 0.22, 0.3, 0.09), M.compose(sx * 0.5, 2.08, front + 0.06, -0.12, 0, sx * -0.16), C.light);
    // eye sockets: carved rings around a dark backing (the glow sits inside), pupils in front
    for (const sx of [-1, 1]) {
      gb.add(new THREE.TorusGeometry(0.31, 0.075, 8, 24), M.compose(sx * 0.5, 1.68, front + 0.06), C.light);
      gb.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24), M.compose(sx * 0.5, 1.68, front + 0.02, Math.PI / 2), C.mouth);
      gb.add(new THREE.SphereGeometry(0.1, 12, 8), M.compose(sx * 0.47, 1.66, front + 0.1, 0, 0, 0, 1, 1, 0.45), C.pupil);
    }
    // nose and nostrils
    gb.add(new THREE.SphereGeometry(0.32, 16, 12), M.compose(0, 1.24, front + 0.07, 0, 0, 0, 0.95, 1.22, 0.7), C.light);
    for (const sx of [-1, 1]) gb.add(new THREE.SphereGeometry(0.12, 10, 8), M.compose(sx * 0.2, 1.03, front + 0.1, 0, 0, 0, 1, 0.8, 0.8), C.wood);
    // round cheeks
    for (const sx of [-1, 1]) gb.add(new THREE.SphereGeometry(0.27, 14, 10), M.compose(sx * 0.82, 1.12, front + 0.0, 0, 0, 0, 1, 0.82, 0.6), C.wood);
    // ears with plugs
    for (const sx of [-1, 1]) {
      gb.add(new THREE.CapsuleGeometry(0.17, 0.62, 4, 10), M.compose(sx * (W / 2 + 0.12), 1.62, 0), C.dark);
      gb.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), M.compose(sx * (W / 2 + 0.27), 1.45, 0, 0, 0, Math.PI / 2), C.teeth);
    }
    // lips framing the mouth opening
    gb.add(rb(MW * 2 + 0.42, 0.22, 0.26, 0.09), M.compose(0, MH + 0.07, front + 0.05), C.light);
    for (const sx of [-1, 1]) gb.add(rb(0.2, MH + 0.1, 0.26, 0.08), M.compose(sx * (MW + 0.08), MH / 2, front + 0.05), C.light);
    // a row of teeth hanging from the top lip
    for (let i = 0; i < 7; i++) {
      const x = (i / 6 - 0.5) * (MW * 2 - 0.2);
      gb.add(rb(0.15, 0.16, 0.09, 0.03), M.compose(x, MH - 0.07, front + 0.0), C.teeth);
    }
    // dark mouth lining (cavity walls, ceiling and back)
    const depth = front - BACK;
    for (const sx of [-1, 1]) gb.add(new THREE.BoxGeometry(0.02, MH, depth), M.compose(sx * (MW - 0.01), MH / 2, BACK + depth / 2), C.mouth);
    gb.add(new THREE.BoxGeometry(MW * 2, 0.02, depth), M.compose(0, MH - 0.01, BACK + depth / 2), C.mouth);
    gb.add(new THREE.BoxGeometry(MW * 2, MH, 0.04), M.compose(0, MH / 2, BACK + 0.02), C.mouth);
    // tongue lolling out onto the turf like a welcome mat
    const tongue = new THREE.Shape();
    tongue.moveTo(-0.42, 0);
    tongue.lineTo(-0.42, 0.75);
    tongue.quadraticCurveTo(-0.42, 1.2, 0, 1.22);
    tongue.quadraticCurveTo(0.42, 1.2, 0.42, 0.75);
    tongue.lineTo(0.42, 0);
    tongue.lineTo(-0.42, 0);
    const tg = new THREE.ExtrudeGeometry(tongue, { depth: 0.02, bevelEnabled: false, curveSegments: 10 });
    gb.add(tg, M.compose(0, 0.012, BACK + 0.3, Math.PI / 2), C.tongue);
    // the back of the head: a second, sleeping face (heads are seen from every side)
    const back = -D / 2 - 0.05;
    for (const sx of [-1, 1]) {
      gb.add(rb(0.85, 0.18, 0.26, 0.08), M.compose(sx * 0.48, 2.0, back - 0.04, 0.1, 0, sx * 0.14), C.light);
      // closed eyelids: half rings
      gb.add(new THREE.TorusGeometry(0.26, 0.06, 6, 16, Math.PI), M.compose(sx * 0.5, 1.66, back - 0.03, 0, Math.PI, Math.PI), C.light);
      gb.add(new THREE.SphereGeometry(0.24, 12, 8), M.compose(sx * 0.82, 1.08, back + 0.02, 0, 0, 0, 1, 0.8, 0.55), C.wood);
    }
    gb.add(new THREE.SphereGeometry(0.3, 14, 10), M.compose(0, 1.22, back - 0.05, 0, 0, 0, 0.95, 1.2, 0.65), C.light);
    gb.add(rb(1.2, 0.14, 0.2, 0.06), M.compose(0, 0.62, back - 0.02), C.dark);
    for (let i = 0; i < 5; i++) gb.add(rb(0.14, 0.12, 0.08, 0.03), M.compose((i - 2) * 0.22, 0.52, back - 0.05), C.teeth);
    for (const y of [0.24, 0.5]) gb.add(rb(MW * 2 + 0.04, 0.1, 0.06, 0.03), M.compose(0, y, back - 0.01), C.dark);
    // headdress: a fan of palm-leaf blades behind the crown
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2;
      const blade = new THREE.ConeGeometry(0.2, 1.3, 4);
      gb.add(blade, M.compose(Math.sin(a) * 0.55, H + 0.55 + Math.cos(a) * 0.45, -0.3, 0, Math.PI / 4, -a * 0.9, 1, 1, 0.3), i % 2 ? 0x3f9a3a : 0x2f7a2e);
    }
    return gb.build(false);
  });
}

/** Glowing parts of the tunnel head: eyes, the swirl at the back of the mouth and crown gems. */
export function tunnelGlowGeo(): THREE.BufferGeometry {
  return memo('tunnelGlow', () => {
    const gb = new GeoBuilder();
    const { D, H, MH, BACK } = TUNNEL;
    const front = D / 2;
    for (const sx of [-1, 1]) gb.add(new THREE.CircleGeometry(0.27, 24), M.compose(sx * 0.5, 1.68, front + 0.055), 0xffffff);
    // spiral swirl on the back wall of the mouth
    const pts: number[] = [];
    const turns = 2.2, seg = 60;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const r0 = 0.06 + t0 * 0.28, r1 = 0.06 + t1 * 0.28;
      const a0 = t0 * turns * Math.PI * 2, a1 = t1 * turns * Math.PI * 2;
      const w0 = 0.035 + t0 * 0.03, w1 = 0.035 + t1 * 0.03;
      const p = (r: number, a: number, w: number, o: number) => [Math.cos(a) * (r + w * o), Math.sin(a) * (r + w * o)];
      const A = p(r0, a0, w0, -1), B = p(r0, a0, w0, 1), Cc = p(r1, a1, w1, 1), Dd = p(r1, a1, w1, -1);
      pts.push(A[0], A[1], 0, B[0], B[1], 0, Cc[0], Cc[1], 0, A[0], A[1], 0, Cc[0], Cc[1], 0, Dd[0], Dd[1], 0);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sg.computeVertexNormals();
    gb.add(sg, M.compose(0, MH * 0.48, BACK + 0.05), 0xffffff);
    gb.add(new THREE.CircleGeometry(0.42, 28), M.compose(0, MH * 0.48, BACK + 0.045), 0x404040);
    for (const x of [-0.55, 0, 0.55]) gb.add(new THREE.OctahedronGeometry(0.1, 0), M.compose(x, H - 0.08, front + 0.16, 0, 0, 0, 1, 1.3, 0.5), 0xffffff);
    // a glowing gem on the back so the pair colour reads from behind
    gb.add(new THREE.OctahedronGeometry(0.17, 0), M.compose(0, H - 0.08, -D / 2 - 0.16, 0, 0, 0, 1, 1.3, 0.5), 0xffffff);
    for (const x of [-0.55, 0.55]) gb.add(new THREE.OctahedronGeometry(0.09, 0), M.compose(x, H - 0.08, -D / 2 - 0.15, 0, 0, 0, 1, 1.3, 0.5), 0xffffff);
    return gb.build(false);
  });
}

// ---------------------------------------------------------------------------
// Wind god tiki on a sea stack: blows gusts along +Z. Cheeks are separate so they can puff up.
// ---------------------------------------------------------------------------
export function windTikiGeo(): THREE.BufferGeometry {
  return memo('windTiki', () => {
    const gb = new GeoBuilder();
    const C = TIKI_COLORS;
    const rng = new Rng(17);
    // rocky pillar it stands on (top at y = 0, reaching down into the sea)
    for (let i = 0; i < 6; i++) {
      const y = -0.4 - i * 0.75;
      const r = 0.85 + i * 0.12 + rng.range(-0.08, 0.08);
      gb.add(new THREE.DodecahedronGeometry(1, 1), M.compose(rng.range(-0.1, 0.1), y, rng.range(-0.1, 0.1), rng.next(), rng.next(), 0, r, 0.55, r), jitterColor(0x4a4f5a, () => rng.next(), 0.02, 0.05, 0.1));
    }
    // carved post + head
    gb.add(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 12), M.compose(0, 0.4, 0), C.dark);
    gb.add(rb(1.25, 1.45, 1.0, 0.2), M.compose(0, 1.55, 0), C.wood);
    gb.add(rb(1.4, 0.24, 1.12, 0.08), M.compose(0, 2.3, 0), C.dark);
    // swept-back leaf hair, streaming in its own wind
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.6;
      gb.add(new THREE.ConeGeometry(0.16, 1.2, 4), M.compose(Math.sin(a) * 0.45, 2.45 + Math.cos(a) * 0.1, -0.55, -1.25, Math.PI / 4 + a * 0.3, 0, 1, 1, 0.3), i % 2 ? 0x3f9a3a : 0x2f7a2e);
    }
    // brows knitted with effort, squinting eyes
    for (const sx of [-1, 1]) {
      gb.add(rb(0.5, 0.14, 0.2, 0.06), M.compose(sx * 0.27, 2.02, 0.5, -0.1, 0, sx * 0.28), C.light);
      gb.add(new THREE.SphereGeometry(0.15, 12, 8), M.compose(sx * 0.27, 1.83, 0.47, 0, 0, 0, 1, 0.45, 0.4), C.eye);
      gb.add(new THREE.SphereGeometry(0.07, 8, 6), M.compose(sx * 0.27, 1.82, 0.53, 0, 0, 0, 1, 0.6, 0.5), C.pupil);
    }
    gb.add(new THREE.SphereGeometry(0.18, 12, 8), M.compose(0, 1.6, 0.52, 0, 0, 0, 0.9, 1.2, 0.8), C.light);
    // pursed "O" lips
    gb.add(new THREE.TorusGeometry(0.16, 0.08, 10, 20), M.compose(0, 1.18, 0.55), C.tongue);
    gb.add(new THREE.CircleGeometry(0.12, 16), M.compose(0, 1.18, 0.56), C.mouth);
    return gb.build(false);
  });
}

/** The puffed cheeks (scaled with gust strength). Centred on the face at y = 1.32. */
export function windCheeksGeo(): THREE.BufferGeometry {
  return memo('windCheeks', () => {
    const gb = new GeoBuilder();
    for (const sx of [-1, 1]) gb.add(new THREE.SphereGeometry(0.3, 16, 12), M.compose(sx * 0.42, 0, 0, 0, 0, 0, 1, 0.9, 0.85), TIKI_COLORS.light);
    return gb.build(false);
  });
}

// ---------------------------------------------------------------------------
// Paper lantern (~0.5 tall), hanging point at y = 0. Vertex colour R = how much it glows.
// ---------------------------------------------------------------------------
export function lanternGeo(): THREE.BufferGeometry {
  return memo('lantern', () => {
    const gb = new GeoBuilder();
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = -0.08 - t * 0.42;
      const r = 0.07 + Math.sin(t * Math.PI) * 0.17;
      prof.push(new THREE.Vector2(r, y));
    }
    const body = new THREE.LatheGeometry(prof, 14);
    // ribs: brighten between ribs, darker on the rib lines
    gb.add(body, null, (p) => {
      const a = Math.atan2(p.z, p.x);
      const rib = Math.pow(Math.abs(Math.cos(a * 7)), 18);
      return new THREE.Color(1 - rib * 0.45, 0, 0);
    });
    gb.add(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 12), M.compose(0, -0.07, 0), 0x0c0000);
    gb.add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12), M.compose(0, -0.52, 0), 0x0c0000);
    gb.add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), M.compose(0, -0.02, 0), 0x050000);
    // tassel
    gb.add(new THREE.ConeGeometry(0.035, 0.14, 6), M.compose(0, -0.62, 0, Math.PI), 0x2a0000);
    return gb.build(false);
  });
}

export function bambooPoleGeo(h: number): THREE.BufferGeometry {
  return memo('bamboo' + h.toFixed(2), () => {
    const gb = new GeoBuilder();
    const segs = Math.max(2, Math.round(h / 0.55));
    for (let i = 0; i < segs; i++) {
      const sh = h / segs;
      gb.add(new THREE.CylinderGeometry(0.06, 0.068, sh, 8), M.compose(0, sh * (i + 0.5), 0), i % 2 ? 0xb99a52 : 0xa88a44);
      gb.add(new THREE.TorusGeometry(0.068, 0.018, 5, 10), M.compose(0, sh * (i + 1), 0, Math.PI / 2), 0x6e5a26);
    }
    gb.add(new THREE.SphereGeometry(0.08, 8, 6), M.compose(0, h + 0.02, 0), 0x6e5a26);
    return gb.build(false);
  });
}

// ---------------------------------------------------------------------------
// Overwater bungalow: deck on stilts (deck top at y = 1.0, stilts down to -2.5), thatched roof.
// ---------------------------------------------------------------------------
export function bungalowGeo(): THREE.BufferGeometry {
  return memo('bungalow', () => {
    const gb = new GeoBuilder();
    const rng = new Rng(23);
    const wood = 0x8a5a32, dark = 0x5e3a1e;
    for (const x of [-1.9, 0, 1.9])
      for (const z of [-1.7, 0, 1.7, 3.3]) gb.add(new THREE.CylinderGeometry(0.11, 0.13, 3.6, 8), M.compose(x, -0.8, z), dark);
    // deck (house part + veranda)
    gb.add(new THREE.BoxGeometry(4.2, 0.16, 5.6), M.compose(0, 0.92, 0.8), jitterColor(wood, () => rng.next()));
    for (let i = 0; i < 14; i++) gb.add(new THREE.BoxGeometry(4.2, 0.03, 0.04), M.compose(0, 1.01, -1.95 + i * 0.4), dark);
    // walls
    gb.add(new THREE.BoxGeometry(3.4, 1.9, 3.0), M.compose(0, 1.95, -0.4), 0xc79a5c);
    for (let i = 0; i < 9; i++) gb.add(new THREE.BoxGeometry(0.05, 1.9, 3.04), M.compose(-1.6 + i * 0.4, 1.95, -0.4), 0xa77a42);
    // door frame
    gb.add(new THREE.BoxGeometry(0.8, 1.4, 0.06), M.compose(0.7, 1.7, 1.12), dark);
    // veranda rail
    for (const x of [-2.0, 2.0]) gb.add(new THREE.BoxGeometry(0.06, 0.06, 2.2), M.compose(x, 1.5, 2.4), wood);
    gb.add(new THREE.BoxGeometry(4.06, 0.06, 0.06), M.compose(0, 1.5, 3.5), wood);
    for (let i = 0; i < 9; i++) gb.add(new THREE.BoxGeometry(0.05, 0.5, 0.05), M.compose(-2.0 + i * 0.5, 1.25, 3.5), wood);
    // ladder to the water
    for (const x of [-0.3, 0.3]) gb.add(new THREE.BoxGeometry(0.06, 1.8, 0.06), M.compose(x, 0.2, 3.62, 0.15), dark);
    for (let i = 0; i < 4; i++) gb.add(new THREE.BoxGeometry(0.6, 0.04, 0.06), M.compose(0, 0.8 - i * 0.4, 3.62 + i * 0.06), dark);
    // hipped thatch roof in layers
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.ConeGeometry(3.4 - k * 0.8, 1.3 - k * 0.15, 4, 2, true);
      const p = cone.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 9) * 0.05);
      cone.computeVertexNormals();
      gb.add(cone, M.compose(0, 3.5 + k * 0.5, -0.1, 0, Math.PI / 4, 0, 1, 1, 1.15), k % 2 ? 0xc9a45c : 0xb8913f);
    }
    gb.add(new THREE.ConeGeometry(0.2, 0.6, 6), M.compose(0, 5.0, -0.1), 0x8a6a2a);
    return gb.build(false);
  });
}

/** Warm window glow for the bungalow. */
export function bungalowGlowGeo(): THREE.BufferGeometry {
  return memo('bungalowGlow', () => {
    const gb = new GeoBuilder();
    for (const x of [-0.8]) gb.add(new THREE.PlaneGeometry(0.7, 0.6), M.compose(x, 2.1, 1.11), 0xffffff);
    gb.add(new THREE.PlaneGeometry(0.62, 1.25), M.compose(0.7, 1.66, 1.135), 0xb0b0b0);
    for (const z of [-1.2, 0.2]) {
      gb.add(new THREE.PlaneGeometry(0.6, 0.55), M.compose(1.71, 2.1, z, 0, Math.PI / 2), 0xffffff);
      gb.add(new THREE.PlaneGeometry(0.6, 0.55), M.compose(-1.71, 2.1, z, 0, -Math.PI / 2), 0xffffff);
    }
    return gb.build(false);
  });
}
