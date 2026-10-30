import {
  GLSL3,
  HalfFloatType,
  LinearFilter,
  RepeatWrapping,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from './cloud-field.js';
import { cloudScatteringGLSL } from './cloud-scattering.js';
import { cloudIntegralGLSL } from './cloud-integral.js';
import { skyRadianceGLSL } from './sky-transport.js';
import { skyFogGLSL, skyFogUniforms, setSkyFog } from './sky-fog.js';

// Separate from the displayed clear sky: the camera composites its own clouds.
// Cloud fill reads this update's CLEAR irradiance, so it cannot feed itself.
export class SkyClouds {
  constructor(uniforms) {
    this.uniforms = uniforms;
    this.targets = [];
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      defines: { SKY_CAPTURE_CLOUDS: 1 },
      uniforms: {
        ...uniforms,
        ...skyFogUniforms(),
        cloudLightDirection: { value: new Vector3() },
        skyCloudOrigin: { value: new Vector3() },
        skyCloudSummary: { value: null },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: /* glsl */ `
        ${cloudFieldGLSL}
        ${skyRadianceGLSL}
        ${cloudScatteringGLSL}
        varying vec2 vUv;
        uniform sampler2D skyCloudSummary;
        uniform vec3 skyCloudOrigin;
        uniform float cloudAlbedo;
        vec3 cloudAmbient,cloudDirect,cloudGround,cloudFogColor;
        ${cloudIntegralGLSL}
        ${skyFogGLSL}
        out vec4 environmentColor;
        void main(){
          cloudAmbient=max(vec3(0),texelFetch(skyCloudSummary,ivec2(17,0),0).rgb)/cloudPi;
          cloudGround=max(vec3(0),texelFetch(skyCloudSummary,ivec2(18,0),0).rgb)/cloudPi;
          cloudDirect=texelFetch(skyCloudSummary,ivec2(13,0),0).rgb;
          cloudFogColor=max(vec3(0),texelFetch(skyCloudSummary,ivec2(19,0),0).rgb);
          vec3 direction=skyDirection(vUv);
          vec3 radiance=textureLod(skyRadianceMap,skyUv(direction),0.0).rgb;
          #if SKY_CAPTURE_CLOUDS
          float apparent,layer;
          float jitter=fract(dot(gl_FragCoord.xy,vec2(0.754877666,0.569840296)));
          vec4 cloud=hexCloudRay(skyCloudOrigin,direction,cloudFar,jitter,apparent,layer);
          // Reflections retain the clear map's lower-hemisphere ground model;
          // only the displayed background extends its horizon below the world.
          radiance=radiance*cloud.a+cloud.rgb;
          #endif
          vec3 ambient=cloudFogColor;
          environmentColor=vec4(skyFogCompose(radiance,skyCloudOrigin,direction,ambient,cloudDirect,cloudLightDirection),1);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  get mode() {
    return this.uniforms.cloudVolumetric.value > 0.5
      ? 'volume:' + this.uniforms.cloudSeedNoise.value.version
      : 'clear';
  }
  key(position) {
    const u = this.uniforms;
    if (this.mode === 'clear') return 'clear';
    return [
      this.mode,
      u.cloudCoverageReady.value,
      ...position.toArray().map((v) => Math.round(v * 10)),
      ...u.cloudLayers.value.flatMap((v) =>
        v.toArray().map((x) => Math.round(x * 100)),
      ),
      ...u.cloudLayerWind.value.flatMap((v) =>
        v.toArray().map((x) => Math.round(x * 4)),
      ),
      Math.round(u.cloudAlbedo.value * 1000),
      Math.round(u.cloudShear.value * 100),
    ].join(':');
  }
  render(renderer, work, summary, position, fog = null) {
    const clouds = this.mode !== 'clear';
    if (!clouds && !fog) return null;
    if (this.material.defines.SKY_CAPTURE_CLOUDS !== Number(clouds)) {
      this.material.defines.SKY_CAPTURE_CLOUDS = Number(clouds);
      this.material.needsUpdate = true;
    }
    if (!this.targets.length) {
      this.targets = [0, 1].map((i) => {
        const target = new WebGLRenderTarget(96, 48, {
          type: HalfFloatType,
          depthBuffer: false,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
        });
        target.texture.wrapS = RepeatWrapping;
        target.texture.name = 'Cloud and fog environment radiance ' + i;
        return target;
      });
    }
    const u = this.material.uniforms;
    // Keep sky uniforms from the same pending update, never the old publication.
    Object.assign(u, work);
    setSkyFog(u, fog);
    u.skyCloudSummary.value = summary;
    u.skyCloudOrigin.value.copy(position);
    u.cloudLightDirection.value
      .copy(work.skySunDirection.value)
      .multiplyScalar(work.skySunDirection.value.y >= 0 ? 1 : -1);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.targets[1]);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
    return this.targets[1].texture;
  }
  publish(texture) {
    if (texture === this.targets[1]?.texture)
      [this.targets[0], this.targets[1]] = [this.targets[1], this.targets[0]];
  }
  release() {
    for (const target of this.targets) target.dispose();
    this.targets = [];
  }
  dispose() {
    this.release();
    this.material.uniforms.skyCloudSummary.value = null;
    this.material.dispose();
    this.quad.dispose();
  }
}
