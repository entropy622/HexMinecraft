import {
  GLSL3,
  HalfFloatType,
  LinearFilter,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  CLOUD_NOISE_SCALE,
  CLOUD_COVERAGE_SIZE,
  CLOUD_COVERAGE_SPANS,
  CLOUD_COVERAGE_HEADER,
  cloudMacroGLSL,
} from './cloud-field.js';

// One atlas preserves the exact seed lattice and caches both volume layers.
// Reusing cloudNoise avoids another fragment sampler on terrain/water materials.
export class CloudCoverage {
  constructor(uniforms) {
    this.uniforms = uniforms;
    this.seed = uniforms.cloudSeedNoise.value;
    this.target = null;
    this.key = null;
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        cloudNoise: { value: this.seed },
        cloudNoiseScale: { value: CLOUD_NOISE_SCALE },
        cloudRadius: uniforms.cloudRadius,
        cloudNoiseOffset: uniforms.cloudNoiseOffset,
        cloudCoverageOrigin: uniforms.cloudCoverageOrigin,
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `${cloudMacroGLSL}
        uniform vec2 cloudCoverageOrigin[2];
        out vec4 coverageValue;
        void main(){
          if(gl_FragCoord.y < ${CLOUD_COVERAGE_HEADER.toFixed(1)}){
            ivec2 cell=ivec2(gl_FragCoord.xy);
            coverageValue=texelFetch(cloudNoise,cell,0);
            if(cell.x<127&&cell.y<127) coverageValue.r=round(coverageValue.r*255.0);
            return;
          }
          vec2 uv=(gl_FragCoord.xy-vec2(0.0,${CLOUD_COVERAGE_HEADER.toFixed(1)}))/${CLOUD_COVERAGE_SIZE.toFixed(1)};
          vec2 p=uv-0.5;
          coverageValue=vec4(hexCloudMacroAnalytic(p*${CLOUD_COVERAGE_SPANS[0].toFixed(1)}+cloudCoverageOrigin[0],0),
            hexCloudMacroAnalytic(p*${CLOUD_COVERAGE_SPANS[1].toFixed(1)}+cloudCoverageOrigin[1],1));
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  reset() {
    this.key = null;
    this.uniforms.cloudNoise.value = this.seed;
    this.uniforms.cloudNoiseScale.value = CLOUD_NOISE_SCALE;
    this.uniforms.cloudCoverageReady.value = 0;
  }
  release() {
    this.reset();
    this.target?.dispose();
    this.target = null;
  }
  prepare(renderer, camera) {
    const u = this.uniforms;
    if (u.cloudVolumetric.value < 0.5) {
      this.release();
      return;
    }
    const d = u.cloudLightDirection.value;
    u.cloudCoverageOrigin.value.forEach((origin, layer) => {
      const band = u.cloudLayers.value[layer],
        wind = u.cloudLayerWind.value[layer];
      const reach =
        d.y > 0.04
          ? Math.max(
              0,
              Math.min(6000, (band.x + band.y * 0.5 - camera.position.y) / d.y),
            )
          : 0;
      // Integer multiples of the texel spacing keep the interpolation grid
      // anchored in noise space when the camera, sun or wind moves the tile.
      origin.set(
        Math.floor((camera.position.x + d.x * reach - wind.x) / 32) * 32,
        Math.floor((camera.position.z + d.z * reach - wind.y) / 32) * 32,
      );
    });
    const key = [
      this.seed.version,
      u.cloudRadius.value,
      ...u.cloudNoiseOffset.value.toArray(),
      ...u.cloudCoverageOrigin.value.flatMap((v) => v.toArray()),
    ].join(',');
    if (this.key !== key) {
      this.target ??= new WebGLRenderTarget(
        CLOUD_COVERAGE_SIZE,
        CLOUD_COVERAGE_SIZE + CLOUD_COVERAGE_HEADER,
        {
          type: HalfFloatType,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
          depthBuffer: false,
        },
      );
      this.target.texture.name = 'Cloud coverage and seed lattice';
      const previous = renderer.getRenderTarget(),
        autoClear = renderer.autoClear;
      try {
        renderer.autoClear = true;
        renderer.setRenderTarget(this.target);
        this.quad.render(renderer);
        this.key = key;
      } catch (error) {
        this.reset();
        throw error;
      } finally {
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(previous);
      }
    }
    u.cloudNoise.value = this.target.texture;
    u.cloudNoiseScale.value = 1 / 126;
    u.cloudCoverageReady.value = 1;
  }
  dispose() {
    this.release();
    this.material.dispose();
    this.quad.dispose();
  }
}
