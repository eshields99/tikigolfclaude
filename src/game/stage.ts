// The 3D stage: renderer, environment (sky/sea/lights) and the currently loaded hole + island + decor.
import * as THREE from 'three';
import { Renderer, type Quality } from '../render/renderer';
import { PRESETS, type EnvPreset, makeSky, makeClouds, makeDistantIslands, LightRig } from '../world/environment';
import { buildHole, type HoleBuild, type CourseStyle } from '../course/builder';
import type { HoleDef } from '../course/types';
import { buildIsland, type IslandBuild } from '../world/island';
import { makeOcean } from '../world/ocean';
import { buildDecor, type DecorBuild, type Theme } from '../world/decor';
import { TorchLights } from '../render/fx';
import { sharedUniforms } from '../render/materials';

export class Stage {
  renderer: Renderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  preset: EnvPreset = PRESETS.day;
  lights: LightRig;
  private sky: THREE.Mesh | null = null;
  private clouds: ReturnType<typeof makeClouds> | null = null;
  private islands: ReturnType<typeof makeDistantIslands> | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  hole: HoleBuild | null = null;
  island: IslandBuild | null = null;
  ocean: ReturnType<typeof makeOcean> | null = null;
  decor: DecorBuild | null = null;
  torchLights: TorchLights | null = null;
  holeGroup = new THREE.Group();
  focus = new THREE.Vector3();
  time = 0;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.renderer = new Renderer(canvas, quality);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.lights = new LightRig(this.preset, quality === 'low' ? 1024 : 2048);
    this.scene.add(this.lights.group);
    this.scene.add(this.holeGroup);
    this.renderer.setup(this.scene, this.camera);
  }

  setQuality(q: Quality) {
    this.renderer.applyQuality(q);
    this.renderer.setup(this.scene, this.camera);
    const size = q === 'low' ? 1024 : 2048;
    if (this.lights.sun.shadow.mapSize.x !== size) {
      this.lights.sun.shadow.mapSize.set(size, size);
      this.lights.sun.shadow.map?.dispose();
      this.lights.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  setEnvironment(id: string) {
    const p = PRESETS[id] ?? PRESETS.day;
    if (this.sky && this.preset === p) return;
    this.preset = p;
    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.geometry.dispose();
      (this.sky.material as THREE.Material).dispose();
    }
    if (this.clouds) { this.scene.remove(this.clouds.group); this.clouds.dispose(); }
    if (this.islands) { this.scene.remove(this.islands.group); this.islands.dispose(); }
    this.sky = makeSky(p);
    this.clouds = makeClouds(p);
    this.islands = makeDistantIslands(p);
    this.scene.add(this.sky, this.clouds.group, this.islands.group);
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    this.lights.apply(p);
    // environment map from the sky only
    const pm = new THREE.PMREMGenerator(this.renderer.gl);
    const envScene = new THREE.Scene();
    const skyCopy = makeSky(p);
    envScene.add(skyCopy);
    this.envRT?.dispose();
    this.envRT = pm.fromScene(envScene, 0, 0.1, 1000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.envIntensity;
    skyCopy.geometry.dispose();
    (skyCopy.material as THREE.Material).dispose();
    pm.dispose();
  }

  loadHole(def: HoleDef, style: CourseStyle, theme: Theme) {
    this.unloadHole();
    const hole = buildHole(def, style);
    const island = buildIsland(hole, this.preset, { volcanic: theme === 'volcano' });
    const ocean = makeOcean(this.preset, island);
    const decor = buildDecor(hole, island, this.preset, theme);
    hole.world.terrainHeight = (x, z) => island.heightAt(x, z);
    this.holeGroup.add(hole.group, island.group, ocean.mesh, decor.group);
    this.hole = hole;
    this.island = island;
    this.ocean = ocean;
    this.decor = decor;
    this.torchLights = new TorchLights(Math.min(4, decor.torchPositions.length), decor.torchPositions, this.preset.torchBoost);
    this.holeGroup.add(this.torchLights.group);
    this.lights.fit(hole.bounds);
    return hole;
  }

  unloadHole() {
    if (!this.hole) return;
    this.holeGroup.clear();
    this.hole.dispose();
    this.island?.dispose();
    this.ocean?.dispose();
    this.decor?.dispose();
    this.hole = null;
    this.island = null;
    this.ocean = null;
    this.decor = null;
    this.torchLights = null;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  update(dt: number, simTime: number) {
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    if (this.hole) for (const u of this.hole.updaters) u(simTime, dt);
    this.clouds?.update(this.time);
    this.torchLights?.update(this.focus, dt);
  }

  render(dt: number) {
    this.renderer.render(this.scene, this.camera, dt);
  }
}
