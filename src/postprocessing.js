import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Allocated only for the opt-in light-effects preset. OutputPass owns display conversion.
export function createPostprocessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new Vector2(innerWidth, innerHeight), 0.24, 0.6, 1.05),
  );
  composer.addPass(new OutputPass());
  composer.setPixelRatio(Math.min(devicePixelRatio, 1));
  return composer;
}
