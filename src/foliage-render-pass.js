import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

// Seed the existing target's depth with the same leaf program, wind and alpha.
// A uniform fragment branch skips lighting; beauty then shades visible leaves.
export class FoliageRenderPass extends RenderPass {
  constructor(scene, camera, foliageUniforms) {
    super(scene, camera);
    this.depthOnly = foliageUniforms?.leafDepthOnly;
    this.depthPrepassEnabled = true;
    this.saved = [];
    this.materials = new Map();
  }
  render(renderer, writeBuffer, readBuffer) {
    if (
      !this.depthPrepassEnabled ||
      !this.depthOnly ||
      !this.clear ||
      !renderer.autoClearDepth ||
      this.scene.overrideMaterial ||
      this.overrideMaterial ||
      this.clearColor !== null ||
      this.clearAlpha !== null ||
      this.clearDepth
    ) {
      super.render(renderer, writeBuffer, readBuffer);
      return;
    }
    const scene = this.scene,
      background = scene.background,
      autoClear = renderer.autoClear,
      clearDepth = renderer.autoClearDepth,
      matrixAutoUpdate = scene.matrixWorldAutoUpdate,
      shadowAutoUpdate = renderer.shadowMap.autoUpdate,
      shadowUpdate = renderer.shadowMap.needsUpdate,
      depthOnly = this.depthOnly.value,
      clear = this.clear;
    let leaves = 0,
      completed = false;
    const restoreObjects = () => {
      for (let i = 0; i < this.saved.length; i += 2)
        this.saved[i].layers.mask = this.saved[i + 1];
      for (const [material, colorWrite] of this.materials)
        material.colorWrite = colorWrite;
      this.saved.length = 0;
      this.materials.clear();
    };
    try {
      // Keep lights, receives-shadow flags and materials unchanged so both
      // draws select the very same vertex program. Update matrices only once.
      if (matrixAutoUpdate) scene.updateMatrixWorld();
      scene.matrixWorldAutoUpdate = false;
      scene.traverseVisible((object) => {
        if (
          !object.isMesh &&
          !object.isPoints &&
          !object.isLine &&
          !object.isSprite
        )
          return;
        const material = object.material;
        if (
          object.isMesh &&
          object.customDepthMaterial &&
          material?.visible &&
          !material.transparent &&
          material.depthWrite &&
          material.depthTest &&
          material.alphaTest > 0
        ) {
          leaves++;
          if (!this.materials.has(material))
            this.materials.set(material, material.colorWrite);
          material.colorWrite = false;
        } else {
          this.saved.push(object, object.layers.mask);
          object.layers.mask = 0;
        }
      });
      if (leaves) {
        renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
        renderer.clear(
          renderer.autoClearColor,
          renderer.autoClearDepth,
          renderer.autoClearStencil,
        );
        renderer.autoClear = false;
        scene.background = null;
        // Preserve the full-scene shadow update, and its existing shader variant.
        renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;
        this.depthOnly.value = 1;
        renderer.render(scene, this.camera);
      }
      restoreObjects();
      this.depthOnly.value = depthOnly;
      scene.background = background;
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowUpdate;
      if (leaves) {
        // A Color background forces an RGB clear. Retain only the seeded depth.
        renderer.autoClearDepth = false;
        this.clear = false;
      }
      super.render(renderer, writeBuffer, readBuffer);
      completed = true;
    } finally {
      restoreObjects();
      this.depthOnly.value = depthOnly;
      scene.background = background;
      renderer.autoClear = autoClear;
      renderer.autoClearDepth = clearDepth;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      if (!completed) renderer.shadowMap.needsUpdate = shadowUpdate;
      scene.matrixWorldAutoUpdate = matrixAutoUpdate;
      this.clear = clear;
    }
  }
}
