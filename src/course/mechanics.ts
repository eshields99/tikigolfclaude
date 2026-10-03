// Lantern Lagoon course mechanics: tiki tunnels, blowholes (geysers), gusty wind and creek currents.
// Each builder registers its physics with the hole's world, adds colliders and animated visuals, and
// returns a small handle the game uses for particles, sounds and event reactions.
import * as THREE from 'three';
import { addGeoCollider, getTikiMaterial, type ObstacleContext } from './obstacles';
import type { HoleDef, ObstacleDef, StreamDef } from './types';
import { BALL_R, ballisticLaunch, gustStrength, geyserCycle, pathFlowField, type PhysicsWorld } from '../physics/world';
import { Mat } from '../physics/surfaces';
import { circle, intersect, path as sdfPath, union, type SDF } from '../core/sdf';
import { buildTurfMesh, type HeightFn } from './turfmesh';
import { tunnelHeadGeo, tunnelGlowGeo, windTikiGeo, windCheeksGeo, TUNNEL } from '../world/lagoonProps';
import { sharedUniforms } from '../render/materials';
import { foamTexture, waterNormal } from '../render/textures';

type TunnelDef = Extract<ObstacleDef, { type: 'tunnel' }>;
type GeyserDef = Extract<ObstacleDef, { type: 'geyser' }>;
type GustDef = Extract<ObstacleDef, { type: 'gust' }>;

/** Tunnel pairs are colour coded so you can tell which mouth leads where. */
export const TUNNEL_COLORS = [0x2ff5d2, 0xff52d9, 0xffb22e, 0x8cff3a];

export interface TunnelFx {
  color: THREE.Color;
  /** Where the ball is swallowed and where it pops out. */
  entry: THREE.Vector3;
  exit: THREE.Vector3;
  exitDir: THREE.Vector3;
  flash(which: 'in' | 'out'): void;
}

export interface GeyserFx {
  pos: THREE.Vector3;
  /** Height of the water column at full eruption. */
  height: number;
  period: number;
  phase: number;
  burst: number;
}

export interface GustFx {
  /** A point in the middle of the windy stretch (for sound and particles). */
  center: THREE.Vector3;
  dir: THREE.Vector3;
  zone: SDF;
  /** Height of the course in the zone (where wind streaks fly). */
  y: number;
  source: THREE.Vector3 | null;
  strength(t: number): number;
}

const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------------------- tiki tunnels
export function buildTunnel(ctx: ObstacleContext, o: TunnelDef, index: number): TunnelFx {
  const { tb, group, world, updaters, heightAt, aoCircles, disposables } = ctx;
  const s = o.scale ?? 1;
  const base = new THREE.Color(o.color ?? TUNNEL_COLORS[index % TUNNEL_COLORS.length]);
  const { W, D, H, MW, MH, BACK } = TUNNEL;
  const solid = (m: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    addGeoCollider(tb, g, m, Mat.WoodWall);
    g.dispose();
  };
  const place = (at: [number, number], fx: number, fz: number) => {
    const y = heightAt(at[0], at[1]);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], y, at[1]), new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(fx, fz)), new THREE.Vector3(s, s, s));
    const head = new THREE.Mesh(tunnelHeadGeo(), getTikiMaterial());
    head.applyMatrix4(m);
    head.castShadow = head.receiveShadow = true;
    group.add(head);
    const mat = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(2) });
    disposables.push(mat);
    const glow = new THREE.Mesh(tunnelGlowGeo(), mat);
    glow.applyMatrix4(m);
    group.add(glow);
    // colliders: cheek pillars, the head above the mouth and the back of the mouth
    const z0 = -D / 2 - 0.05, z1 = D / 2 + 0.2;
    solid(m, MW, W / 2 + 0.05, -0.3, 1.9, z0, z1);
    solid(m, -W / 2 - 0.05, -MW, -0.3, 1.9, z0, z1);
    solid(m, -W / 2 - 0.05, W / 2 + 0.05, MH, H + 0.35, z0, z1);
    solid(m, -MW, MW, -0.3, MH, z0, BACK);
    aoCircles.push([at[0], at[1], 1.15 * s]);
    return { m, y, mat };
  };
  const inF: [number, number] = [-Math.cos(o.dir), -Math.sin(o.dir)];
  const outF: [number, number] = [Math.cos(o.toDir), Math.sin(o.toDir)];
  const A = place(o.at, inF[0], inF[1]);
  const B = place(o.to, outF[0], outF[1]);
  const entry = new THREE.Vector3(0, 0, 0.3).applyMatrix4(A.m);
  entry.y = A.y + BALL_R;
  const exit = new THREE.Vector3(0, 0, D / 2 + 0.55).applyMatrix4(B.m);
  exit.y = heightAt(exit.x, exit.z) + BALL_R;
  const dist = Math.hypot(exit.x - entry.x, exit.z - entry.z);
  world.teleporters.push({
    x: entry.x, y: entry.y, z: entry.z, r: 0.5 * s,
    tx: exit.x, ty: exit.y, tz: exit.z, dx: outF[0], dz: outF[1],
    keep: o.keep ?? 0.8, minSpeed: o.minSpeed ?? 3.2, maxSpeed: o.maxSpeed ?? 13,
    delay: o.delay ?? 0.55 + dist * 0.03,
    arc: o.arc ?? 1.2 + dist * 0.12,
  });
  let fin = 0, fout = 0;
  updaters.push((t, dt) => {
    fin = Math.max(0, fin - dt * 1.8);
    fout = Math.max(0, fout - dt * 1.8);
    const pulse = 1.5 + Math.sin(t * 2.4 + index * 1.7) * 0.3;
    A.mat.color.copy(base).multiplyScalar(pulse + fin * 4);
    B.mat.color.copy(base).multiplyScalar(pulse + fout * 4);
  });
  return {
    color: base,
    entry,
    exit,
    exitDir: new THREE.Vector3(outF[0], 0, outF[1]),
    flash: (w) => {
      if (w === 'in') fin = 1;
      else fout = 1;
    },
  };
}

// ------------------------------------------------------------------------------------- blowholes
export function buildGeyser(ctx: ObstacleContext, o: GeyserDef): GeyserFx {
  const { group, world, updaters, heightAt, disposables } = ctx;
  const [x, z] = o.at;
  const y = heightAt(x, z);
  const [tx, tz] = o.target;
  const ty = heightAt(tx, tz);
  const v = ballisticLaunch(x, y + BALL_R, z, tx, ty + BALL_R, tz, o.apex);
  const g = { x, y, z, r: o.r ?? 0.55, period: o.period ?? 3.6, phase: o.phase ?? 0, burst: o.burst ?? 0.4, vx: v.vx, vy: v.vy, vz: v.vz };
  world.geysers.push(g);

  // vent: a decal of dark wet rock with a glowing throat, conforming to the bowl
  const R = 1.6;
  const vm = buildTurfMesh(circle(x, z, R), (px, pz) => heightAt(px, pz) + 0.025, 0.14);
  const vgeo = new THREE.BufferGeometry();
  vgeo.setAttribute('position', new THREE.BufferAttribute(vm.positions, 3));
  vgeo.setIndex(new THREE.BufferAttribute(vm.index, 1));
  const ventMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: { uTime: sharedUniforms.uTime, uNight: sharedUniforms.uNight, uHeat: { value: 0 }, uC: { value: new THREE.Vector2(x, z) }, uR: { value: R } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uNight, uHeat; uniform vec2 uC; uniform float uR;
      varying vec2 vP;
      float h21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      void main(){
        vec2 d = vP - uC;
        float r = length(d) / uR;
        float a = atan(d.y, d.x);
        // jagged crater rim
        float jag = 0.06 * sin(a * 7.0) + 0.04 * sin(a * 13.0 + 1.3);
        float rock = smoothstep(1.0, 0.82 + jag, r);
        vec3 col = mix(vec3(0.09, 0.1, 0.12), vec3(0.2, 0.21, 0.24), smoothstep(0.25, 0.8, r) * h21(floor(vP * 9.0)));
        float throat = smoothstep(0.3, 0.05, r);
        vec3 glow = mix(vec3(0.45, 0.9, 1.0), vec3(1.0), throat * 0.4);
        float flick = 0.75 + 0.25 * sin(uTime * 6.0 + r * 20.0);
        float g = throat * (0.35 + uNight * 0.9 + uHeat * 1.8) * flick;
        // ripples of water welling up in the throat
        float rip = smoothstep(0.08, 0.0, abs(fract(r * 6.0 - uTime * (0.6 + uHeat * 2.0)) - 0.5) - 0.38) * smoothstep(0.35, 0.1, r);
        col = mix(col, glow * 0.9, throat * 0.85) + glow * (g + rip * (0.3 + uHeat));
        gl_FragColor = vec4(col, rock);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const vent = new THREE.Mesh(vgeo, ventMat);
  vent.renderOrder = 2;
  group.add(vent);

  // the water column (scaled in y by the eruption)
  const height = Math.max(2, o.apex - y) * 0.9;
  const cgeo = new THREE.CylinderGeometry(0.26, 0.5, 1, 20, 12, true);
  cgeo.translate(0, 0.5, 0);
  const colMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: sharedUniforms.uTime, uNight: sharedUniforms.uNight, uFade: { value: 0 }, tFoam: { value: foamTexture() } },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vUv = uv;
        vec3 p = position;
        // wobbling, bulging column with a fuller crown
        float t = uv.y;
        p.xz *= 1.0 + sin(t * 9.0 - uTime * 14.0) * 0.12 + smoothstep(0.75, 1.0, t) * 0.9;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uNight, uFade; uniform sampler2D tFoam;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        float f = texture2D(tFoam, vec2(vUv.x * 2.0, vUv.y * 1.2 - uTime * 2.6)).g;
        float c = texture2D(tFoam, vec2(vUv.x * 3.0 + 0.3, vUv.y * 2.0 - uTime * 3.4)).r;
        vec3 V = normalize(cameraPosition - vW);
        float rim = 1.0 - abs(dot(normalize(vN), V));
        float a = (0.35 + f * 0.5 + c * 0.4) * (0.45 + rim * 0.75) * uFade;
        a *= smoothstep(1.0, 0.82, vUv.y) * smoothstep(0.0, 0.05, vUv.y);
        vec3 day = vec3(0.85, 0.97, 1.0);
        vec3 night = vec3(0.35, 0.95, 1.0) * 1.6;
        gl_FragColor = vec4(mix(day, night, uNight) * a, a);
      }`,
  });
  const column = new THREE.Mesh(cgeo, colMat);
  column.position.set(x, y, z);
  column.visible = false;
  column.renderOrder = 3;
  group.add(column);
  disposables.push(vgeo, ventMat, cgeo, colMat);

  updaters.push((t) => {
    const u = geyserCycle(g, t);
    // rise fast, hang, then collapse
    let k = 0;
    if (u < g.burst) k = THREE.MathUtils.smoothstep(u / g.burst, 0, 1);
    else if (u < g.burst + 1.1) k = 1 - THREE.MathUtils.smoothstep((u - g.burst) / 1.1, 0, 1);
    column.visible = k > 0.01;
    column.scale.set(0.8 + k * 0.4, Math.max(0.01, k * height), 0.8 + k * 0.4);
    colMat.uniforms.uFade.value = Math.min(1, k * 1.6);
    const warn = 1.3;
    const heat = u > g.period - warn ? (u - (g.period - warn)) / warn : u < g.burst ? 1 : Math.max(0, 1 - (u - g.burst) * 2);
    ventMat.uniforms.uHeat.value = heat;
  });
  return { pos: new THREE.Vector3(x, y, z), height, period: g.period, phase: g.phase, burst: g.burst };
}

// ------------------------------------------------------------------------------------- gusts
export function buildGust(ctx: ObstacleContext, o: GustDef): GustFx {
  const { group, world, updaters, heightAt, disposables, def } = ctx;
  const dx = Math.cos(o.dir), dz = Math.sin(o.dir);
  const zone = { sdf: o.shape.f, yMin: -20, yMax: 60, ax: dx * o.strength, az: dz * o.strength, period: o.period, phase: o.phase ?? 0, blow: o.blow };
  world.gusts.push(zone);
  const strength = (t: number) => gustStrength(zone, t);

  // wind streaks painted over the turf inside the zone
  const footprint = union(...def.pieces.map((p) => p.shape));
  const area = intersect(o.shape, footprint);
  const tm = buildTurfMesh(area, (x, z) => heightAt(x, z) + 0.04, 0.3);
  const b = o.shape.b;
  const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
  let yAvg = 0, n = 0;
  const windMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: { uTime: sharedUniforms.uTime, uS: { value: 0 }, uDir: { value: new THREE.Vector2(dx, dz) }, uT: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aEdge; varying float vEdge; varying vec2 vP;
      void main(){ vEdge = aEdge; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uS, uT; uniform vec2 uDir;
      varying float vEdge; varying vec2 vP;
      float h11(float p){ return fract(sin(p * 91.7) * 43758.5453); }
      void main(){
        float along = dot(vP, uDir);
        float across = dot(vP, vec2(-uDir.y, uDir.x));
        float lane = floor(across * 1.6);
        float h = h11(lane);
        float s = fract((along - uT * (7.0 + h * 5.0)) * 0.16 + h);
        float dash = smoothstep(0.0, 0.05, s) * smoothstep(0.42, 0.12, s);
        float laneMask = smoothstep(0.5, 0.12, abs(fract(across * 1.6) - 0.5));
        // faint chevrons always show which way the wind blows
        float chev = fract(along * 0.5 - abs(fract(across * 0.5) - 0.5) * 0.8 - uT * 0.15);
        float arrows = smoothstep(0.0, 0.06, chev) * smoothstep(0.2, 0.1, chev) * 0.11;
        float edge = smoothstep(0.0, 0.6, vEdge);
        float a = (dash * laneMask * uS * 0.75 + arrows * (1.0 - uS * 0.6) + uS * 0.07) * edge;
        gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * (1.0 + uS * 0.6), a);
        #include <colorspace_fragment>
      }`,
  });
  if (tm.positions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(tm.positions, 3));
    const edge = new Float32Array(tm.positions.length / 3);
    for (let i = 0; i < edge.length; i++) {
      const x = tm.positions[i * 3], z = tm.positions[i * 3 + 2];
      edge[i] = Math.max(0, -o.shape.f(x, z));
      yAvg += tm.positions[i * 3 + 1];
      n++;
    }
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    geo.setIndex(new THREE.BufferAttribute(tm.index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, windMat);
    mesh.renderOrder = 2;
    group.add(mesh);
    disposables.push(geo);
  }
  disposables.push(windMat);
  const y = n ? yAvg / n : heightAt(cx, cz);

  // the wind god tiki blowing across the zone
  let source: THREE.Vector3 | null = null;
  let cheeks: THREE.Mesh | null = null;
  if (o.source) {
    const [sx, sz] = o.source;
    const sy = y - 0.1;
    source = new THREE.Vector3(sx, sy, sz);
    const yaw = Math.atan2(dx, dz);
    const head = new THREE.Mesh(windTikiGeo(), getTikiMaterial());
    head.position.copy(source);
    head.rotation.y = yaw;
    head.castShadow = head.receiveShadow = true;
    group.add(head);
    cheeks = new THREE.Mesh(windCheeksGeo(), getTikiMaterial());
    cheeks.position.set(0, 1.32, 0.42);
    cheeks.castShadow = true;
    head.add(cheeks);
  }
  updaters.push((t) => {
    const k = strength(t);
    windMat.uniforms.uS.value = k;
    windMat.uniforms.uT.value = t;
    if (cheeks) {
      // the tiki takes a breath just before each gust
      const puff = Math.max(k, strength(t + 0.45) * 0.9);
      const sc = 1 + puff * 0.55;
      cheeks.scale.set(sc, 1 + puff * 0.35, sc);
    }
  });
  return { center: new THREE.Vector3(cx, y, cz), dir: new THREE.Vector3(dx, 0, dz), zone: o.shape, y, source, strength };
}

// ------------------------------------------------------------------------------------- creeks
const STREAM_VERT = /* glsl */ `
  attribute vec2 aFlow; attribute float aEdge;
  varying vec2 vFlow; varying float vEdge; varying vec3 vW;
  #include <fog_pars_vertex>
  void main(){
    vFlow = aFlow; vEdge = aEdge;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const STREAM_FRAG = /* glsl */ `
  uniform float uTime, uNight; uniform sampler2D tN, tFoam;
  varying vec2 vFlow; varying float vEdge; varying vec3 vW;
  #include <fog_pars_fragment>
  void main(){
    // two-phase flow mapping: two copies of the ripples slide along the current and cross-fade
    float p0 = fract(uTime * 0.35), p1 = fract(uTime * 0.35 + 0.5);
    float w0 = 1.0 - abs(2.0 * p0 - 1.0), w1 = 1.0 - w0;
    vec2 uv = vW.xz * 0.22;
    vec2 f = vFlow * 0.22 / 0.35;
    vec3 n0 = texture2D(tN, uv - f * p0).xyz * 2.0 - 1.0;
    vec3 n1 = texture2D(tN, uv - f * p1 + 0.37).xyz * 2.0 - 1.0;
    vec3 n = n0 * w0 + n1 * w1;
    vec3 N = normalize(vec3(n.x * 1.4, 3.0, n.y * 1.4));
    float s0 = texture2D(tFoam, uv * 1.6 - f * 1.6 * p0).g;
    float s1 = texture2D(tFoam, uv * 1.6 - f * 1.6 * p1 + 0.51).g;
    float streak = smoothstep(0.6, 0.85, s0 * w0 + s1 * w1) * clamp(length(vFlow) * 0.35, 0.0, 1.0);
    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 dayDeep = vec3(0.04, 0.42, 0.52), dayShallow = vec3(0.16, 0.78, 0.74);
    vec3 nightDeep = vec3(0.01, 0.08, 0.16), nightShallow = vec3(0.02, 0.22, 0.3);
    vec3 col = mix(mix(dayShallow, dayDeep, smoothstep(0.0, 1.5, vEdge)), mix(nightShallow, nightDeep, smoothstep(0.0, 1.5, vEdge)), uNight);
    col = mix(col, mix(vec3(0.75, 0.92, 1.0), vec3(0.25, 0.4, 0.7), uNight), fres * 0.45);
    float edgeFoam = smoothstep(0.35, 0.0, vEdge + (s0 - 0.5) * 0.25);
    float foam = clamp(edgeFoam + streak, 0.0, 1.0);
    // bioluminescence: foam and ripple crests glow cyan at night
    vec3 foamCol = mix(vec3(1.0), vec3(0.35, 1.0, 0.95) * 2.2, uNight);
    col = mix(col, foamCol, foam * mix(0.8, 0.7, uNight));
    float crest = smoothstep(0.55, 0.95, n.x * 0.5 + 0.5) * uNight;
    col += vec3(0.1, 0.55, 0.6) * crest * 0.6;
    float alpha = mix(0.8, 0.94, smoothstep(0.0, 1.5, vEdge));
    alpha = max(alpha, foam);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export interface StreamFx {
  def: StreamDef;
  channel: SDF;
  surface: HeightFn;
  field: (x: number, z: number, out: Float64Array) => void;
}

/** Register each creek's current and draw its flowing water surface. */
export function buildStreams(def: HoleDef, world: PhysicsWorld, group: THREE.Group, disposables: { dispose(): void }[]): StreamFx[] {
  const out: StreamFx[] = [];
  for (const st of def.streams ?? []) {
    const channel = sdfPath(st.path, st.width);
    const surface: HeightFn = typeof st.surface === 'number' ? ((v: number) => () => v)(st.surface) : st.surface;
    const field = pathFlowField(st.path, st.speed, 1.4);
    world.flows.push({ sdf: channel.f, yMin: -20, yMax: 100, top: (x, z) => surface(x, z) + 0.12, fx: 0, fz: 0, strength: st.strength ?? 2.6, field });
    out.push({ def: st, channel, surface, field });

    const region = st.pool ? union(channel, st.pool) : channel;
    const m = buildTurfMesh(region, surface, 0.3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    const nv = m.positions.length / 3;
    const flow = new Float32Array(nv * 2);
    const edge = new Float32Array(nv);
    const tmp = new Float64Array(2);
    for (let i = 0; i < nv; i++) {
      const x = m.positions[i * 3], z = m.positions[i * 3 + 2];
      field(x, z, tmp);
      // the pool beyond the channel is still water
      const k = THREE.MathUtils.smoothstep(-channel.f(x, z), -0.6, 0.4);
      flow[i * 2] = tmp[0] * k;
      flow[i * 2 + 1] = tmp[1] * k;
      edge[i] = Math.max(0, -region.f(x, z));
    }
    geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: sharedUniforms.uTime, uNight: sharedUniforms.uNight, tN: { value: waterNormal() }, tFoam: { value: foamTexture() } },
      vertexShader: STREAM_VERT,
      fragmentShader: STREAM_FRAG,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    group.add(mesh);
    disposables.push(geo, mat);
  }
  return out;
}
