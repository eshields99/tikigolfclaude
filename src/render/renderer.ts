// WebGL renderer + post-processing (bloom, vignette, tone mapping) with quality tiers.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';

export type Quality = 'low' | 'medium' | 'high';

export class Renderer {
  gl: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private effectPass: EffectPass | null = null;
  bloom: BloomEffect | null = null;
  quality: Quality;
  private pixelRatio = 1;
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality(quality);
  }

  applyQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 1);
    this.gl.setPixelRatio(this.pixelRatio);
    this.composer?.dispose();
    this.composer = null;
    if (q === 'low') {
      this.gl.toneMapping = THREE.ACESFilmicToneMapping;
      this.gl.toneMappingExposure = 1.0;
    } else {
      this.gl.toneMapping = THREE.NoToneMapping;
      this.composer = new EffectComposer(this.gl, {
        frameBufferType: THREE.HalfFloatType,
        multisampling: q === 'high' ? 4 : 0,
      });
    }
    this.setSize(this.w, this.h);
  }

  setup(scene: THREE.Scene, camera: THREE.Camera) {
    if (!this.composer) return;
    this.composer.removeAllPasses();
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.92, luminanceSmoothing: 0.25, intensity: 0.85, radius: 0.72 });
    const vignette = new VignetteEffect({ darkness: 0.42, offset: 0.28 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const sat = new HueSaturationEffect({ saturation: 0.12 });
    const bc = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.05 });
    const effects = [this.bloom, tone, sat, bc, vignette];
    if (this.quality === 'medium') effects.push(new SMAAEffect() as unknown as BloomEffect);
    this.effectPass = new EffectPass(camera, ...effects);
    this.composer.addPass(this.effectPass);
  }

  setCamera(camera: THREE.Camera) {
    if (this.renderPass) this.renderPass.mainCamera = camera;
    if (this.effectPass) this.effectPass.mainCamera = camera;
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.gl.setSize(w, h, false);
    this.composer?.setSize(w, h, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.gl.render(scene, camera);
  }
}
