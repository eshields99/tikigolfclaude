// Shared materials with small shader injections for a polished stylized look.
import * as THREE from 'three';
import { grassTextures, stoneTextures, woodTextures, sandTextures } from './textures';

export const sharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0.3) },
};

const TRIPLANAR_VERT_DECL = /* glsl */ `
varying vec3 vTpPos;
varying vec3 vTpNormal;
`;
const TRIPLANAR_VERT = /* glsl */ `
{
  vec4 tpW = vec4(transformed, 1.0);
  vec3 tpN = objectNormal;
  #ifdef USE_INSTANCING
    tpW = instanceMatrix * tpW;
    tpN = mat3(instanceMatrix) * tpN;
  #endif
  tpW = modelMatrix * tpW;
  vTpPos = tpW.xyz;
  vTpNormal = normalize(mat3(modelMatrix) * tpN);
}
`;
const TRIPLANAR_FRAG_DECL = /* glsl */ `
varying vec3 vTpPos;
varying vec3 vTpNormal;
uniform sampler2D tDetail;
uniform sampler2D tDetailN;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uNormalStrength;
uniform vec3 uMossColor;
uniform float uMoss;
vec3 tpWeights() {
  vec3 w = pow(abs(normalize(vTpNormal)), vec3(4.0));
  return w / (w.x + w.y + w.z + 1e-5);
}
float tpSample(sampler2D t, float s) {
  vec3 w = tpWeights();
  return texture2D(t, vTpPos.zy * s).r * w.x + texture2D(t, vTpPos.xz * s).r * w.y + texture2D(t, vTpPos.xy * s).r * w.z;
}
`;

function triplanarInject(shader: THREE.WebGLProgramParametersWithUniforms, opts: { scale: number; strength: number; normal: number; moss: number; mossColor: THREE.Color }) {
  const { map, normal } = stoneTextures();
  shader.uniforms.tDetail = { value: map };
  shader.uniforms.tDetailN = { value: normal };
  shader.uniforms.uDetailScale = { value: opts.scale };
  shader.uniforms.uDetailStrength = { value: opts.strength };
  shader.uniforms.uNormalStrength = { value: opts.normal };
  shader.uniforms.uMossColor = { value: opts.mossColor };
  shader.uniforms.uMoss = { value: opts.moss };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + TRIPLANAR_VERT_DECL)
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + TRIPLANAR_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + TRIPLANAR_FRAG_DECL)
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      {
        float d = tpSample(tDetail, uDetailScale);
        float d2 = tpSample(tDetail, uDetailScale * 0.23);
        diffuseColor.rgb *= mix(1.0, 0.55 + d * 0.9, uDetailStrength) * (0.85 + d2 * 0.3);
        vec3 wn = normalize(vTpNormal);
        float mossN = smoothstep(0.55, 0.9, wn.y) * smoothstep(0.35, 0.7, d2 + (d - 0.5) * 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMossColor * (0.8 + d * 0.4), mossN * uMoss);
      }`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      /* glsl */ `#include <normal_fragment_maps>
      {
        vec3 w = tpWeights();
        float s = uDetailScale;
        vec3 nx = texture2D(tDetailN, vTpPos.zy * s).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(tDetailN, vTpPos.xz * s).xyz * 2.0 - 1.0;
        vec3 nz = texture2D(tDetailN, vTpPos.xy * s).xyz * 2.0 - 1.0;
        vec3 wn = normalize(vTpNormal);
        vec3 pert = w.x * vec3(0.0, nx.y, nx.x) + w.y * vec3(ny.x, 0.0, ny.y) + w.z * vec3(nz.x, nz.y, 0.0);
        vec3 nn = normalize(wn + pert * uNormalStrength);
        normal = normalize(mix(normal, normalize((viewMatrix * vec4(nn, 0.0)).xyz), 0.85));
      }`,
    );
}

/** Dark volcanic stone (walls, plinths, rocks). Works with instancing + instanceColor. */
export function makeStoneMaterial(opts: { color?: THREE.ColorRepresentation; moss?: number; scale?: number; roughness?: number; vertexColors?: boolean } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 0.88,
    metalness: 0,
    vertexColors: opts.vertexColors ?? false,
  });
  const mossColor = new THREE.Color(0x5f8f3a);
  mat.onBeforeCompile = (shader) => triplanarInject(shader, { scale: opts.scale ?? 1.1, strength: 0.75, normal: 0.9, moss: opts.moss ?? 0.0, mossColor });
  mat.customProgramCacheKey = () => 'stone';
  return mat;
}

export interface TurfStyle {
  a: THREE.ColorRepresentation;
  b: THREE.ColorRepresentation;
}

/** Checkered mowed turf with grass detail, wall AO and soft velvet sheen. */
export function makeTurfMaterial(style: TurfStyle) {
  const { map, normal } = grassTextures();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const uniforms = {
    tGrass: { value: map },
    tGrassN: { value: normal },
    uColA: { value: new THREE.Color(style.a) },
    uColB: { value: new THREE.Color(style.b) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aChecker;
        attribute float aAO;
        varying vec2 vChecker;
        varying float vAO;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vChecker = aChecker;
        vAO = aAO;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass;
        uniform sampler2D tGrassN;
        uniform vec3 uColA;
        uniform vec3 uColB;
        varying vec2 vChecker;
        varying float vAO;
        varying vec3 vWPos;
        float filteredChecker(vec2 p) {
          vec2 w = fwidth(p) + 1e-4;
          vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
          return 0.5 - 0.5 * i.x * i.y;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float c = filteredChecker(vChecker);
          vec3 base = mix(uColA, uColB, c);
          float g = texture2D(tGrass, vWPos.xz * 1.35).r;
          float g2 = texture2D(tGrass, vWPos.xz * 0.11 + 0.37).r;
          base *= (0.80 + g * 0.42) * (0.9 + g2 * 0.2);
          // soft contact occlusion near walls & props
          float ao = mix(0.42, 1.0, smoothstep(0.0, 1.0, vAO));
          diffuseColor.rgb *= base * ao;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 gn = texture2D(tGrassN, vWPos.xz * 1.35).xyz * 2.0 - 1.0;
          normal = normalize(normal + (viewMatrix * vec4(gn.x, 0.0, gn.y, 0.0)).xyz * 0.55);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          outgoingLight += diffuseColor.rgb * fres * 0.22;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'turf';
  return mat;
}

/** Sand (bunkers, beaches) with world-space grain. */
export function makeSandMaterial(color: THREE.ColorRepresentation = 0xf1d9a0) {
  const { map, normal } = sandTextures();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tSand = { value: map };
    shader.uniforms.tSandN = { value: normal };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPosS;\nattribute float aAO;\nvarying float vAOS;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWPosS = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvAOS = aAO;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tSand;\nuniform sampler2D tSandN;\nvarying vec3 vWPosS;\nvarying float vAOS;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= (0.82 + texture2D(tSand, vWPosS.xz * 0.9).r * 0.25) * mix(0.55, 1.0, smoothstep(0.0, 0.9, vAOS));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        { vec3 sn = texture2D(tSandN, vWPosS.xz * 0.9).xyz * 2.0 - 1.0;
          normal = normalize(normal + (viewMatrix * vec4(sn.x, 0.0, sn.y, 0.0)).xyz * 0.5); }`,
      );
  };
  mat.customProgramCacheKey = () => 'sand';
  return mat;
}

/** Wood with grain from UVs (planks are laid out so U runs along the board). */
export function makeWoodMaterial(color: THREE.ColorRepresentation = 0xffffff, opts: { vertexColors?: boolean } = {}) {
  const { map, normal } = woodTextures();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0,
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    vertexColors: opts.vertexColors ?? false,
  });
  mat.map!.colorSpace = THREE.NoColorSpace; // luminance multiplier
  return mat;
}

/** Plain vertex colored standard material (props). */
export function makeVertexColorMaterial(opts: { roughness?: number; side?: THREE.Side; flatShading?: boolean } = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.8,
    metalness: 0,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
  });
}

/** Foliage: vertex colors, double sided, wind sway driven by the aWind attribute, soft translucency. */
export function makeFoliageMaterial(opts: { side?: THREE.Side; windScale?: number } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0,
    side: opts.side ?? THREE.DoubleSide,
  });
  const windScale = opts.windScale ?? 1;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uWindScale = { value: windScale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aWind;
        uniform float uTime;
        uniform float uWindScale;
        varying float vWindAO;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = dot(ip, vec3(0.37, 0.0, 0.53));
          float sway = sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.3;
          float flutter = sin(uTime * 8.0 + position.x * 3.1 + position.z * 2.3 + ph) * 0.5 + sin(uTime * 13.0 + position.y * 5.0) * 0.25;
          float w = aWind * uWindScale;
          transformed.x += w * (sway * 0.22 + flutter * 0.05 * w);
          transformed.z += w * (sway * 0.1 + flutter * 0.03 * w);
          transformed.y += w * flutter * 0.035;
          vWindAO = aWind;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWindAO;')
      .replace(
        '#include <opaque_fragment>',
        `{
          // cheap translucency: brighten leaves seen against the light & tips
          float tip = smoothstep(0.3, 1.0, vWindAO);
          outgoingLight += diffuseColor.rgb * (0.10 + tip * 0.12);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'foliage' + windScale;
  return mat;
}

/** Carved wood (tikis, bumpers): vertex colors with triplanar vertical wood grain. */
export function makeCarvedWoodMaterial() {
  const { map, normal } = woodTextures();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tWood = { value: map };
    shader.uniforms.tWoodN = { value: normal };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TRIPLANAR_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + TRIPLANAR_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTpPos;
        varying vec3 vTpNormal;
        uniform sampler2D tWood;
        uniform sampler2D tWoodN;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 w = pow(abs(normalize(vTpNormal)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
          // grain runs vertically: stretch texture along y
          float gx = texture2D(tWood, vec2(vTpPos.y * 0.35, vTpPos.z * 1.6)).r;
          float gz = texture2D(tWood, vec2(vTpPos.y * 0.35, vTpPos.x * 1.6)).r;
          float gy = texture2D(tWood, vTpPos.xz * 0.8).r;
          float g = gx * w.x + gz * w.z + gy * w.y;
          diffuseColor.rgb *= 0.62 + g * 0.6;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'carvedwood';
  return mat;
}
