import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { AtmospherePass } from './atmosphere-pass.js';
import { SceneFramePass } from './scene-frame.js';
import { ContactOcclusionPass } from './contact-occlusion.js';
import { postSettings } from './render-settings.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
) {
  const target = new WebGLRenderTarget(innerWidth, innerHeight, {
    type: HalfFloatType,
    depthBuffer: false,
  });
  const composer = new EffectComposer(renderer, target);
  const frame = new SceneFramePass(scene, camera);
  const contact = new ContactOcclusionPass(scene, camera, frame);
  const bloom = new UnrealBloomPass(
    new Vector2(innerWidth, innerHeight),
    0.24,
    0.6,
    1.05,
  );
  const antialias = new SMAAPass();
  composer.addPass(frame);
  composer.addPass(contact);
  composer.addPass(
    new AtmospherePass(camera, sun, atmosphere, lightUniforms, frame),
  );
  composer.addPass(bloom);
  // Three.js SMAA operates in linear-sRGB, before the final display conversion.
  composer.addPass(antialias);
  composer.addPass(new OutputPass());
  composer.effects = { contact, bloom, antialias };
  setPostprocessingOptions(composer, settings);
  return composer;
}
export function setPostprocessingOptions(composer, settings) {
  const values = postSettings(settings),
    effects = composer.effects;
  effects.contact.enabled = values.occlusion > 0;
  effects.contact.composite.uniforms.strength.value = values.occlusion;
  effects.antialias.enabled = values.antialias;
  effects.bloom.enabled = values.bloom > 0;
  effects.bloom.strength = values.bloom;
}
export function disposePostprocessing(composer) {
  for (const pass of composer.passes) pass.dispose();
  composer.dispose();
}
