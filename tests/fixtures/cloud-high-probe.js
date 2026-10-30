import {
  FloatType,
  GLSL3,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from '../../src/cloud-field.js';
import { cloudCoverageWeather } from '../../src/cloud-field.js';
import sourceFunctions from './photon-cirrus-source.glsl?raw';

// The reference functions are extracted verbatim from the pinned Photon files,
// not generated from the host implementation. Only the image/global adapters
// below supply the original inputs to the independent source density function.
export function readCloudHigh(graphics) {
  const points = [
      [0, 0],
      [120, 64],
      [-1937, 2721],
      [224, 1024],
      [327.1, -119.7],
      [8096, 4924],
      [-82, 119],
      [-6000, -3000],
    ],
    climates = [
      [0.5, 0.5, 0, 0],
      [0.6, 0.7, 0.8, 0],
      [0, 1, 1, 1],
      [1, 1, 1, 0],
    ],
    weather = climates.map((c, i) => {
      const p = cloudCoverageWeather(...c);
      return [p.cirrus, p.cirrocumulus, i % 2, 0];
    }),
    renderer = graphics.renderer,
    target = new WebGLRenderTarget(points.length, weather.length * 3 * 2, {
      type: FloatType,
      depthBuffer: false,
    }),
    material = new ShaderMaterial({
      glslVersion: GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        ...graphics.cloudSystem.uniforms,
        probePoints: { value: points.map((p) => new Vector2(...p)) },
        probeWeather: { value: weather.map((p) => new Vector4(...p)) },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${cloudFieldGLSL}
        uniform vec2 probePoints[8];uniform vec4 probeWeather[4];
        out vec4 highResult;
        struct SourceHighParameters {float cirrus_amount;float cirrocumulus_amount;};
        SourceHighParameters clouds_params;
        float world_age,day_factor;
        const float degree=0.017453292519943295;
        float sqr(float x){return x*x;}
        float rcp(float x){return 1.0/x;}
        float cube(float x){return x*x*x;}
        float pow4(float x){return x*x*x*x;}
        float max0(float x){return max(0.0,x);}
        float dampen(float x){return x*(2.0-x);}
        float linear_step(float a,float b,float x){
          // Define the physical zero-coverage limit instead of 0/0.
          float result=0.0;if(a!=b)result=clamp((x-a)/(b-a),0.0,1.0);return result;
        }
        vec4 sourceImage(vec2 p){
          vec2 pixel=fract(p)*512.0+vec2(129.0,1.0);
          return textureLod(cloudNoise,pixel/vec2(textureSize(cloudNoise,0)),0.0);
        }
        #define CLOUDS_SCALE 20.0
        #define CLOUDS_CIRRUS_WIND_ANGLE 0.0
        #define CLOUDS_CIRRUS_WIND_SPEED 1.0
        #define CLOUDS_CIRRUS_SIZE 1.0
        #define CLOUDS_CIRROCUMULUS_SIZE 1.0
        #define CLOUDS_CIRRUS_CURL_STRENGTH 0.8
        #define CLOUDS_CIRROCUMULUS_CURL_STRENGTH 1.0
        #define CLOUDS_CIRROCUMULUS_DETAIL_STRENGTH 1.0
        #define CLOUDS_CIRRUS_DENSITY 0.5
        #define CLOUDS_CIRROCUMULUS_DENSITY 1.0
        #define cameraPosition vec3(0.0)
        #define texture(s,p) sourceImage(p)
        ${sourceFunctions}
        #undef texture
        #undef cameraPosition
        void main(){
          int row=int(gl_FragCoord.y),climate=row%4;
          float altitude=float((row/4)%3)*0.5;
          float wind=row/12==0?0.0:123.45;
          vec4 parameters=probeWeather[climate];
          clouds_params.cirrus_amount=parameters.x;
          clouds_params.cirrocumulus_amount=parameters.y;
          day_factor=parameters.z;world_age=-wind*20.0;
          vec2 p=probePoints[int(gl_FragCoord.x)]+cloudNoiseOffset;
          vec2 actual=hexCloudHighDensity(p,vec2(wind,0),parameters.xy,altitude,day_factor);
          float expected=clouds_cirrus_density(p*20.0,altitude);
          highResult=vec4(actual.x+actual.y,expected,actual);
        }`,
    }),
    quad = new FullScreenQuad(material),
    previous = renderer.getRenderTarget(),
    data = new Float32Array(target.width * target.height * 4);
  try {
    renderer.setRenderTarget(target);
    quad.render(renderer);
    renderer.readRenderTargetPixels(
      target,
      0,
      0,
      target.width,
      target.height,
      data,
    );
    return {
      points,
      climates,
      weather,
      width: target.width,
      height: target.height,
      output: Array.from(data),
      gl: renderer.getContext().getError(),
    };
  } finally {
    renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}
