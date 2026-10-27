import {
  Color,
  DoubleSide,
  Matrix4,
  NearestFilter,
  ShaderLib,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// R protects overlay/transparent surfaces from AO. G rejects temporal history
// for transforms in motion, liquids and first-person models. One shared draw.
export class SurfaceProtectionPass extends Pass {
  constructor(scene, camera, frame) {
    super();
    this.needsSwap = false;
    this.scene = scene;
    this.camera = camera;
    this.target = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    this.clearColor = new Color();
    this.saved = [];
    this.previous = new WeakMap();
    this.flags = new WeakMap();
    this.material = new ShaderMaterial({
      vertexShader: ShaderLib.basic.vertexShader,
      fragmentShader: /* glsl */ `
      uniform sampler2D surfaceDepth;
      uniform vec2 surfaceResolution;
      uniform vec2 surfaceChannels;
      void main(){
        float depth=texture2D(surfaceDepth,gl_FragCoord.xy/surfaceResolution).r;
        if(gl_FragCoord.z>depth+0.000001)discard;
        gl_FragColor=vec4(surfaceChannels,0.0,1.0);
      }`,
      uniforms: {
        surfaceDepth: { value: frame.depthTexture },
        surfaceResolution: { value: new Vector2(1, 1) },
        surfaceChannels: { value: new Vector2() },
      },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.material.onBeforeRender = (
      _renderer,
      _scene,
      _camera,
      _geometry,
      object,
    ) => {
      this.material.uniforms.surfaceChannels.value.copy(this.flags.get(object));
      this.material.uniformsNeedUpdate = true;
    };
  }
  setSize(width, height) {
    this.target.setSize(
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height)),
    );
    this.material.uniforms.surfaceResolution.value.set(
      this.target.width,
      this.target.height,
    );
  }
  render(renderer) {
    const scene = this.scene,
      camera = this.camera,
      cameraMask = camera.layers.mask,
      background = scene.background,
      override = scene.overrideMaterial,
      autoClear = renderer.autoClear,
      shadows = renderer.shadowMap.enabled,
      alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    this.saved.length = 0;
    try {
      scene.traverse((object) => {
        if (
          !object.isMesh &&
          !object.isPoints &&
          !object.isLine &&
          !object.isSprite
        )
          return;
        this.saved.push(object, object.layers.mask);
        if (!object.isMesh) {
          object.layers.mask = 0;
          return;
        }
        let overlay = false,
          sky = false;
        for (let parent = object; parent; parent = parent.parent) {
          overlay ||= !!parent.userData.skipOcclusion;
          sky ||= !!parent.userData.temporalSky;
        }
        const materials = Array.isArray(object.material)
            ? object.material
            : [object.material],
          protection =
            overlay ||
            materials.some(
              (m) =>
                m &&
                ((m.transparent && !m.depthWrite) ||
                  m.isMeshBasicMaterial ||
                  m.userData.skipOcclusion),
            );
        let previous = this.previous.get(object),
          moved = !previous;
        if (previous) {
          moved = !previous.equals(object.matrixWorld);
          previous.copy(object.matrixWorld);
        } else {
          previous = new Matrix4().copy(object.matrixWorld);
          this.previous.set(object, previous);
        }
        const reactive =
          !sky &&
          (overlay ||
            moved ||
            object.isInstancedMesh ||
            !!object.userData.liquid ||
            materials.some((m) => m?.transparent));
        let flags = this.flags.get(object);
        if (!flags) {
          flags = new Vector2();
          this.flags.set(object, flags);
        }
        flags.set(protection ? 1 : 0, reactive ? 1 : 0);
        object.layers.mask =
          (protection || reactive) && (object.layers.mask & cameraMask) !== 0
            ? 1 << 31
            : 0;
      });
      camera.layers.set(31);
      scene.background = null;
      scene.overrideMaterial = this.material;
      renderer.shadowMap.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
      renderer.render(scene, camera);
    } finally {
      for (let i = 0; i < this.saved.length; i += 2)
        this.saved[i].layers.mask = this.saved[i + 1];
      camera.layers.mask = cameraMask;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.shadowMap.enabled = shadows;
      renderer.autoClear = autoClear;
      renderer.setClearColor(this.clearColor, alpha);
      this.saved.length = 0;
    }
  }
  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
