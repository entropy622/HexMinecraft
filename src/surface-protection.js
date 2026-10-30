import { wetCoverageGLSL } from './wet-surfaces.js';
import {
  Color,
  Frustum,
  DoubleSide,
  Matrix4,
  NoBlending,
  NearestFilter,
  ShaderLib,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// R protects overlay/transparent surfaces from AO. G rejects temporal history
// for moving/reflective surfaces. B stores exposed puddle coverage. One shared draw.
export class SurfaceProtectionPass extends Pass {
  constructor(scene, camera, frame, wet) {
    super();
    this.needsSwap = false;
    this.scene = scene;
    this.camera = camera;
    this.wet = wet;
    this.target = new WebGLRenderTarget(1, 1, {
      count: 3,
      depthBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    this.clearColor = new Color();
    this.saved = [];
    this.previous = new WeakMap();
    this.flags = new WeakMap();
    this.variants = new WeakMap();
    this.ownedMaterials = new Set();
    this.frustum = new Frustum();
    this.viewProjection = new Matrix4();
    this.reflectiveVisible = false;
    wet.protection = this;
    this.material = new ShaderMaterial({
      name: 'SurfaceProtection',
      vertexShader:
        `attribute float rainExposure;attribute float surfacePorosity;varying vec3 wetWorldPosition;varying vec2 wetMaterial;
` +
        ShaderLib.basic.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
      wetWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;wetMaterial=vec2(rainExposure,surfacePorosity);`,
        ),
      fragmentShader: /* glsl */ `
      layout(location=1) out highp vec4 reflectionAlbedo;
      layout(location=2) out highp vec4 reflectionGeometry;
      uniform sampler2D surfaceDepth;
      uniform vec2 surfaceResolution;
      uniform vec3 surfaceChannels;
      uniform float terrainWetness;
      varying vec3 wetWorldPosition;varying vec2 wetMaterial;
      ${wetCoverageGLSL}
      void main(){
        float depth=texture2D(surfaceDepth,gl_FragCoord.xy/surfaceResolution).r;
        if(gl_FragCoord.z>depth+0.000001)discard;
        vec3 surfaceNormal=normalize(cross(dFdx(wetWorldPosition),dFdy(wetWorldPosition)));
        float coverage=surfaceChannels.z>0.5 ? wetCoverage(wetWorldPosition,surfaceNormal.y,wetMaterial.x,wetMaterial.y,terrainWetness) : 0.0;
        gl_FragColor=vec4(surfaceChannels.x,max(surfaceChannels.y,step(0.025,coverage)),coverage,1.0);
        reflectionAlbedo=vec4(0.0);reflectionGeometry=vec4(0.0);
      }`,
      uniforms: {
        surfaceDepth: { value: frame.depthTexture },
        surfaceResolution: { value: new Vector2(1, 1) },
        surfaceChannels: { value: new Vector3() },
        terrainWetness: wet.weather.terrainWetness,
      },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.material.defaultAttributeValues.rainExposure = [0];
    this.material.defaultAttributeValues.surfacePorosity = [1];
    wet.material.uniforms.surfaceMask.value = this.target.texture;
    wet.material.uniforms.surfaceAlbedo.value = this.target.textures[1];
    wet.material.uniforms.surfaceGeometry.value = this.target.textures[2];
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
  opticalMaterial(original, flags, receivesOptics) {
    if (!receivesOptics || !original?.userData.geometricShade)
      return this.material;
    let variants = this.variants.get(original);
    if (!variants) this.variants.set(original, (variants = new Map()));
    const key = flags.x + flags.y * 2 + flags.z * 4;
    if (variants.has(key)) return variants.get(key);
    const material = original.clone(),
      compile = original.onBeforeCompile,
      uniforms = this.material.uniforms;
    material.name = 'SurfaceOptics-' + original.name;
    material.defaultAttributeValues = { ...original.defaultAttributeValues };
    material.transparent = false;
    material.blending = NoBlending;
    material.depthTest =
      material.depthWrite =
      material.toneMapped =
      material.fog =
        false;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(original, shader, renderer);
      Object.assign(shader.uniforms, uniforms, {
        surfaceChannels: { value: flags.clone() },
      });
      shader.vertexShader =
        'varying float surfaceRain;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nsurfaceRain=rainExposure;',
        );
      shader.fragmentShader =
        /* glsl */ `
        layout(location=1) out highp vec4 reflectionAlbedo;
        layout(location=2) out highp vec4 reflectionGeometry;
        varying float surfaceRain;
        uniform sampler2D surfaceDepth;uniform vec2 surfaceResolution;
        uniform vec3 surfaceChannels;
        ${wetCoverageGLSL}
        vec2 surfaceOctEncode(vec3 n){
          n/=abs(n.x)+abs(n.y)+abs(n.z);
          vec2 e=n.xy;
          if(n.z<0.0)e=(1.0-abs(e.yx))*mix(vec2(-1.0),vec2(1.0),step(vec2(0.0),e));
          return e*0.5+0.5;
        }
        vec3 surfaceEncodeAlbedo(vec3 c){
          return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
        }
      ` +
        shader.fragmentShader.replace(
          '#include <alphatest_fragment>',
          /* glsl */ `#include <alphatest_fragment>
        float surfaceDepthValue=texture2D(surfaceDepth,gl_FragCoord.xy/surfaceResolution).r;
        if(gl_FragCoord.z>surfaceDepthValue+0.000001)discard;
        vec3 surfaceWorldNormal=normalize(cross(dFdx(vLightPosition),dFdy(vLightPosition)));
        float coverage=surfaceChannels.z>0.5?wetCoverage(vLightPosition,surfaceWorldNormal.y,
          surfaceRain,vPorosity,terrainWetness):0.0;
        gl_FragColor=vec4(surfaceChannels.x,max(surfaceChannels.y,step(0.025,coverage)),coverage,1.0);
        reflectionAlbedo=vec4(surfaceEncodeAlbedo(diffuseColor.rgb),(floor(vSurfaceOptics+0.5)+1.0)/255.0);
        reflectionGeometry=vec4(surfaceOctEncode(surfaceWorldNormal),sqrt(clamp(vSkylight,0.0,1.0)),1.0);
        return;`,
        );
    };
    material.customProgramCacheKey = () =>
      original.customProgramCacheKey() + '-reflection-gbuffer-v1';
    variants.set(key, material);
    this.ownedMaterials.add(material);
    return material;
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
    this.reflectiveVisible = false;
    this.frustum.setFromProjectionMatrix(
      this.viewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    try {
      scene.traverse((object) => {
        if (
          !object.isMesh &&
          !object.isPoints &&
          !object.isLine &&
          !object.isSprite
        )
          return;
        this.saved.push(object, object.layers.mask, object.material);
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
          receivesWet =
            this.wet.enabled &&
            this.wet.weather.terrainWetness.value > 0.001 &&
            materials.some((m) => m?.userData.wetSurface),
          receivesOptics =
            this.wet.enabled &&
            this.wet.material.uniforms.environmentStrength.value > 0 &&
            !!object.userData.surfaceReflection,
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
          flags = new Vector3();
          this.flags.set(object, flags);
        }
        flags.set(protection ? 1 : 0, reactive ? 1 : 0, receivesWet ? 1 : 0);
        object.layers.mask =
          (protection || reactive || receivesWet || receivesOptics) &&
          (object.layers.mask & cameraMask) !== 0
            ? 1 << 31
            : 0;
        if (object.layers.mask)
          object.material = Array.isArray(object.material)
            ? object.material.map((m) =>
                this.opticalMaterial(m, flags, receivesOptics),
              )
            : this.opticalMaterial(object.material, flags, receivesOptics);
        if (
          receivesOptics &&
          object.layers.mask &&
          !protection &&
          this.frustum.intersectsObject(object)
        ) {
          let visible = true;
          for (let parent = object; parent; parent = parent.parent)
            visible &&= parent.visible;
          this.reflectiveVisible ||= visible;
        }
      });
      camera.layers.set(31);
      scene.background = null;
      scene.overrideMaterial = null;
      renderer.shadowMap.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(scene, camera);
    } finally {
      for (let i = 0; i < this.saved.length; i += 3) {
        this.saved[i].layers.mask = this.saved[i + 1];
        this.saved[i].material = this.saved[i + 2];
      }
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
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
  }
}
