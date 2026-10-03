// Stylized tropical ocean: depth-tinted turquoise shallows, caustics, sky reflection, sun glint and shore foam.
import * as THREE from 'three';
import type { EnvPreset } from './environment';
import type { IslandBuild } from './island';
import { waterNormal, foamTexture } from '../render/textures';
import { sharedUniforms } from '../render/materials';

export function makeOcean(p: EnvPreset, island: IslandBuild) {
  const geo = new THREE.PlaneGeometry(2400, 2400, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    // note: UniformsUtils.merge would clone (and leak) the textures, so only the fog block is cloned
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      tDepth: { value: island.depthTex },
      tNormal: { value: waterNormal() },
      tFoam: { value: foamTexture() },
      uDepthBounds: { value: island.depthBounds },
      uShallow: { value: p.waterShallow.clone() },
      uDeep: { value: p.waterDeep.clone() },
      uSunDir: { value: p.sunDir.clone() },
      uSunColor: { value: p.sunColor.clone() },
      uSkyTop: { value: p.skyTop.clone() },
      uSkyHorizon: { value: p.skyHorizon.clone() },
      uTime: sharedUniforms.uTime,
      uNight: sharedUniforms.uNight,
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float dist = length(w.xz - cameraPosition.xz);
        float amp = 1.0 - smoothstep(60.0, 220.0, dist);
        w.y += (sin(w.x * 0.13 + uTime * 0.9) * 0.035 + sin(w.z * 0.17 - uTime * 1.1) * 0.03) * amp;
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth, tNormal, tFoam;
      uniform vec4 uDepthBounds;
      uniform vec3 uShallow, uDeep, uSunDir, uSunColor, uSkyTop, uSkyHorizon;
      uniform float uTime, uNight;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float terrainH(vec2 xz) {
        vec2 uv = (xz - uDepthBounds.xy) / uDepthBounds.z;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -6.0;
        return texture2D(tDepth, uv).r * 8.0 - 5.0;
      }
      void main() {
        float h = terrainH(vW.xz);
        float depth = max(0.0, -h);
        vec3 V = normalize(cameraPosition - vW);
        float viewDist = length(cameraPosition - vW);
        vec2 uv1 = vW.xz * 0.05 + vec2(uTime * 0.013, uTime * 0.009);
        vec2 uv2 = vW.xz * 0.11 - vec2(uTime * 0.011, -uTime * 0.016);
        vec3 n1 = texture2D(tNormal, uv1).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(tNormal, uv2).xyz * 2.0 - 1.0;
        float nStrength = mix(1.0, 0.25, smoothstep(30.0, 250.0, viewDist));
        vec3 N = normalize(vec3((n1.x + n2.x) * nStrength, 3.2, (n1.y + n2.y) * nStrength));
        float shallowK = exp(-depth * 0.5);
        vec3 base = mix(uDeep, uShallow, shallowK);
        // caustics on the shallows
        float c1 = texture2D(tFoam, vW.xz * 0.11 + N.xz * 0.25 + vec2(uTime * 0.021, uTime * 0.017)).r;
        float c2 = texture2D(tFoam, vW.xz * 0.09 - vec2(uTime * 0.018, -uTime * 0.012)).r;
        base += vec3(0.55, 0.95, 0.9) * c1 * c2 * shallowK * 0.65;
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.7, R.y));
        vec3 col = mix(base, sky, 0.08 + fres * 0.65);
        float sd = max(dot(R, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 320.0) * 7.0 + pow(sd, 36.0) * 0.18);
        // sparkles
        float sp = texture2D(tFoam, vW.xz * 0.6 + uTime * 0.05).b * texture2D(tFoam, vW.xz * 0.45 - uTime * 0.04).b;
        col += uSunColor * smoothstep(0.42, 0.55, sp) * pow(sd, 6.0) * 2.5 * (1.0 - smoothstep(40.0, 160.0, viewDist));
        // shore foam
        float fn = texture2D(tFoam, vW.xz * 0.22 + vec2(uTime * 0.03, uTime * 0.02)).g;
        float edge = smoothstep(0.42, 0.04, depth + (fn - 0.5) * 0.34);
        float band = smoothstep(0.55, 0.95, sin(depth * 16.0 - uTime * 2.0 + fn * 5.0)) * smoothstep(1.1, 0.25, depth) * smoothstep(0.0, 0.1, depth);
        float foam = clamp(edge + band * 0.55, 0.0, 1.0);
        // at night the breaking waves and the shallows glow with bioluminescent plankton
        vec3 foamCol = mix(vec3(0.97, 1.0, 1.0), vec3(0.3, 1.0, 0.92) * 1.9, uNight);
        col = mix(col, foamCol, foam * 0.88);
        float plankton = texture2D(tFoam, vW.xz * 0.5 + vec2(uTime * 0.03, -uTime * 0.02)).b * texture2D(tFoam, vW.xz * 0.37 - uTime * 0.025).b;
        col += vec3(0.15, 0.85, 1.0) * smoothstep(0.4, 0.58, plankton) * shallowK * uNight * 1.6 * (1.0 - smoothstep(30.0, 120.0, viewDist));
        col += vec3(0.0, 0.18, 0.22) * shallowK * uNight;
        float alpha = mix(1.0, 0.5, shallowK);
        alpha = max(alpha, foam * 0.95);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(island.center.x, 0, island.center.y);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
