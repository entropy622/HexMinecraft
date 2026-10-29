import { WetSurfacePass } from './wet-surfaces.js';
import { HalfFloatType, WebGLRenderTarget } from 'three';
import { AtmospherePass } from './atmosphere-pass.js';
import { SceneFramePass } from './scene-frame.js';
import { ContactOcclusionPass } from './contact-occlusion.js';
import { ExposurePass } from './exposure-pass.js';
import { SurfaceProtectionPass } from './surface-protection.js';
import { TemporalResolvePass } from './temporal-pass.js';
import { BloomPass } from './bloom-pass.js';
import { postSettings } from './render-settings.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Allocated only for the opt-in light-effects preset. OutputPass owns display conversion.
export function createPostprocessing(
  renderer,
  scene,
  camera,
  sun,
  atmosphere,
  lightUniforms,
  settings,
  cloudUniforms,
  fluids,
  weatherUniforms,
  foliageUniforms,
) {
  const target = new WebGLRenderTarget(innerWidth, innerHeight, {
    type: HalfFloatType,
    depthBuffer: false,
  });
  const composer = new EffectComposer(renderer, target);
  const frame = new SceneFramePass(
    scene,
    camera,
    fluids,
    cloudUniforms,
    foliageUniforms,
  );
  const wet = new WetSurfacePass(camera, frame, weatherUniforms);
  const protection = new SurfaceProtectionPass(scene, camera, frame, wet);
  const contact = new ContactOcclusionPass(camera, frame, protection);
  const temporal = new TemporalResolvePass(renderer, camera, frame, protection);
  const bloom = new BloomPass();
  const antialias = new SMAAPass();
  const exposure = new ExposurePass();
  composer.addPass(frame);
  composer.addPass(protection);
  composer.addPass(contact);
  composer.addPass(wet);
  composer.addPass(
    new AtmospherePass(
      camera,
      sun,
      atmosphere,
      lightUniforms,
      frame,
      cloudUniforms,
    ),
  );
  composer.addPass(temporal);
  composer.addPass(bloom);
  composer.addPass(exposure);
  // Three.js SMAA operates in linear-sRGB, before the final display conversion.
  composer.addPass(antialias);
  composer.addPass(new OutputPass());
  composer.effects = {
    contact,
    wet,
    bloom,
    antialias,
    exposure,
    protection,
    temporal,
  };
  setPostprocessingOptions(composer, settings);
  return composer;
}
export function setPostprocessingOptions(composer, settings) {
  const values = postSettings(settings),
    effects = composer.effects;
  if (
    effects.temporal.enabled !== values.antialias ||
    effects.contact.composite.uniforms.strength.value !== values.occlusion
  )
    effects.temporal.reset();
  effects.contact.enabled = values.occlusion > 0;
  effects.contact.composite.uniforms.strength.value = values.occlusion;
  effects.antialias.enabled = values.antialias;
  effects.temporal.enabled = values.antialias;
  effects.bloom.enabled = values.bloom > 0;
  effects.bloom.strength = values.bloom;
  if (effects.exposure.enabled !== values.exposure) effects.exposure.reset();
  effects.exposure.enabled = values.exposure;
}
export function disposePostprocessing(composer) {
  for (const pass of composer.passes) pass.dispose();
  composer.dispose();
}
