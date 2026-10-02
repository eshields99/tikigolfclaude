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
import { Particles } from '../render/particles';
import { makeLiquid } from '../world/liquids';
import { Waterfall } from '../world/waterfall';
import { Volcano } from '../world/volcano';
import { Critters } from '../world/critters';

export interface Backdrop {
  volcano?: { at: [number, number]; height: number; radius: number; lava?: number };
}

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
  particles = new Particles();
  liquids: { dispose(): void }[] = [];
  waterfalls: Waterfall[] = [];
  volcano: Volcano | null = null;
  critters: Critters | null = null;
  private backdropKey = '';

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.renderer = new Renderer(canvas, quality);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:grid;place-items:center;background:#06222e;color:#fff;font:600 18px Fredoka,sans-serif;z-index:999;text-align:center;padding:20px">Reloading the island…</div>');
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.scene.add(this.particles.mesh, this.particles.meshAdd);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.lights = new LightRig(this.preset, quality === 'low' ? 1024 : 2048);
    this.scene.add(this.lights.group);
    this.scene.add(this.holeGroup);
    this.renderer.setup(this.scene, this.camera);
  }

  setQuality(q: Quality) {
    this.renderer.applyQuality(q);
    this.renderer.setup(this.scene, this.camera);
    this.applyCasterBudget();
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

  setBackdrop(b: Backdrop | undefined) {
    const key = JSON.stringify(b ?? {});
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    if (this.volcano) {
      this.scene.remove(this.volcano.group);
      this.volcano.dispose();
      this.volcano = null;
    }
    if (b?.volcano) {
      const v = b.volcano;
      this.volcano = new Volcano(new THREE.Vector3(v.at[0], -2, v.at[1]), v.height, v.radius, this.particles, v.lava ?? 1);
      this.scene.add(this.volcano.group);
    }
  }

  loadHole(def: HoleDef, style: CourseStyle, theme: Theme) {
    this.unloadHole();
    const hole = buildHole(def, style);
    const island = buildIsland(hole, this.preset, { volcanic: theme === 'volcano', detail: this.renderer.quality === 'high' ? 1 : 0.75 });
    const ocean = makeOcean(this.preset, island);
    const detail = this.renderer.quality === 'low' ? 0.5 : this.renderer.quality === 'medium' ? 0.8 : 1;
    const exclude = [...(def.lava ?? []), ...(def.pools ?? [])].map((l) => l.shape);
    const decor = buildDecor(hole, island, this.preset, theme, detail, exclude);
    hole.world.terrainHeight = (x, z) => island.heightAt(x, z);
    this.holeGroup.add(hole.group, island.group, ocean.mesh, decor.group);
    for (const lv of def.lava ?? []) {
      const l = makeLiquid(lv.shape, lv.y, 'lava', lv.flow);
      this.holeGroup.add(l.mesh);
      this.liquids.push(l);
    }
    for (const pl of def.pools ?? []) {
      const l = makeLiquid(pl.shape, pl.y, 'water', pl.flow);
      this.holeGroup.add(l.mesh);
      this.liquids.push(l);
    }
    for (const wf of def.waterfalls ?? []) {
      const w = new Waterfall(new THREE.Vector3(...wf.top), new THREE.Vector3(...wf.bottom), wf.width, wf.dir, this.particles);
      this.holeGroup.add(w.group);
      this.waterfalls.push(w);
    }
    this.hole = hole;
    this.island = island;
    this.ocean = ocean;
    this.decor = decor;
    this.torchLights = new TorchLights(Math.min(4, decor.torchPositions.length), decor.torchPositions, this.preset.torchBoost);
    this.critters = new Critters(this.particles, theme, hole.cup.clone());
    this.holeGroup.add(this.critters.group);
    this.holeGroup.add(this.torchLights.group);
    this.lights.fit(hole.bounds);
    this.applyCasterBudget();
    return hole;
  }

  /** On lower quality tiers, minor casters (wall stones, plinths) skip the shadow pass. */
  applyCasterBudget() {
    const full = this.renderer.quality === 'high';
    this.hole?.group.traverse((o) => {
      if (o.userData.minorCaster) o.castShadow = full;
    });
    this.lights.sun.shadow.needsUpdate = true;
  }

  unloadHole() {
    if (!this.hole) return;
    this.holeGroup.clear();
    this.hole.dispose();
    this.island?.dispose();
    this.ocean?.dispose();
    this.decor?.dispose();
    for (const l of this.liquids) l.dispose();
    for (const w of this.waterfalls) w.dispose();
    this.critters?.dispose();
    this.critters = null;
    this.liquids = [];
    this.waterfalls = [];
    this.particles.clear();
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
    for (const w of this.waterfalls) w.update(dt);
    this.critters?.update(dt, this.focus);
    this.volcano?.update(dt, this.camera);
    this.particles.update(dt, this.camera);
  }

  render(dt: number) {
    this.renderer.render(this.scene, this.camera, dt);
  }
}
