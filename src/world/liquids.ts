// Flat liquid surfaces (lava pools/rivers, elevated water pools) built from SDF regions.
import * as THREE from 'three';
import type { SDF } from '../core/sdf';
import { buildTurfMesh } from '../course/turfmesh';
import { sharedUniforms } from '../render/materials';
import { foamTexture, waterNormal } from '../render/textures';

const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
vec2 voro(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(x, y); vec2 o = vec2(h21(i + g), h21(i + g + 17.0));
    float d = length(g + o - f); if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2); }
`;

export function makeLiquid(region: SDF, y: number, kind: 'water' | 'lava', flow: [number, number] = [0, 0]) {
  const m = buildTurfMesh(region, () => y, 0.5);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  const edge = new Float32Array(m.positions.length / 3);
  for (let i = 0; i < edge.length; i++) edge[i] = Math.max(0, -region.f(m.positions[i * 3], m.positions[i * 3 + 2]));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.setIndex(new THREE.BufferAttribute(m.index, 1));
  geo.computeBoundingSphere();
  let mat: THREE.ShaderMaterial;
  if (kind === 'lava') {
    mat = new THREE.ShaderMaterial({
      uniforms: { uTime: sharedUniforms.uTime, uFlow: { value: new THREE.Vector2(flow[0], flow[1]) } },
      vertexShader: /* glsl */ `
        attribute float aEdge; varying float vEdge; varying vec3 vW; uniform float uTime;
        void main(){ vEdge = aEdge; vec4 w = modelMatrix * vec4(position, 1.0);
          w.y += sin(w.x * 0.8 + uTime * 1.3) * sin(w.z * 0.7 - uTime) * 0.025;
          vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec2 uFlow; varying float vEdge; varying vec3 vW;
        ${NOISE}
        void main(){
          vec2 p = vW.xz * 0.55 - uFlow * uTime * 0.35;
          vec2 warp = vec2(fb(p * 0.7 + uTime * 0.05), fb(p * 0.7 - uTime * 0.04 + 7.0));
          vec2 v = voro(p * 1.3 + warp * 1.6);
          float crack = smoothstep(0.02, 0.22, v.y - v.x);      // 0 at cell borders (glowing cracks)
          float heat = fb(p * 1.7 + uTime * 0.12);
          vec3 hot = mix(vec3(1.0, 0.32, 0.03), vec3(1.0, 0.75, 0.2), heat);
          vec3 crust = mix(vec3(0.09, 0.05, 0.05), vec3(0.32, 0.12, 0.06), heat * 0.6);
          float crustAmt = crack * smoothstep(0.18, 0.55, fb(p * 0.6 - uTime * 0.03 + 3.0));
          vec3 col = mix(hot * (1.05 + heat * 0.55), crust, crustAmt * 0.92);
          col += hot * (1.0 - crack) * 0.9; // glowing cracks
          // brighter rim where lava meets rock
          col += vec3(1.0, 0.4, 0.06) * (1.0 - smoothstep(0.0, 0.5, vEdge)) * 0.6;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  } else {
    mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: sharedUniforms.uTime, uFlow: { value: new THREE.Vector2(flow[0], flow[1]) }, tN: { value: waterNormal() }, tFoam: { value: foamTexture() } },
      vertexShader: /* glsl */ `
        attribute float aEdge; varying float vEdge; varying vec3 vW;
        void main(){ vEdge = aEdge; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec2 uFlow; uniform sampler2D tN; uniform sampler2D tFoam;
        varying float vEdge; varying vec3 vW;
        void main(){
          vec2 f = uFlow * uTime;
          vec3 n1 = texture2D(tN, vW.xz * 0.12 - f * 0.12).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(tN, vW.xz * 0.21 - f * 0.2 + 0.3).xyz * 2.0 - 1.0;
          vec3 N = normalize(vec3(n1.x + n2.x, 3.0, n1.y + n2.y));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 col = mix(vec3(0.12, 0.72, 0.68), vec3(0.03, 0.42, 0.55), smoothstep(0.0, 3.0, vEdge));
          col = mix(col, vec3(0.75, 0.92, 1.0), fres * 0.5);
          float c = texture2D(tFoam, vW.xz * 0.15 - f * 0.1).r;
          col += vec3(0.5, 0.9, 0.9) * c * 0.25;
          float foamN = texture2D(tFoam, vW.xz * 0.3 - f * 0.25).g;
          float foam = smoothstep(0.55, 0.0, vEdge + (foamN - 0.5) * 0.4);
          float streaks = smoothstep(0.62, 0.9, texture2D(tFoam, vW.xz * vec2(0.25, 0.25) - f * 0.6).g) * (length(uFlow) > 0.01 ? 0.6 : 0.0);
          col = mix(col, vec3(1.0), clamp(foam + streaks, 0.0, 1.0) * 0.85);
          gl_FragColor = vec4(col, mix(0.82, 0.95, smoothstep(0.0, 2.0, vEdge)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = kind === 'water' ? 1 : 0;
  return { mesh, dispose: () => { geo.dispose(); mat.dispose(); } };
}
