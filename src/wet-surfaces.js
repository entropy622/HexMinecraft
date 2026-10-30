import { ShaderMaterial } from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BLOCKS } from './core.js';
import { photonSpecularGLSL } from './photon-specular.js';
import { surfaceReflectionGLSL } from './surface-reflection.js';

export function wetPorosity(type) {
  if (['snow', 'powderSnow'].includes(type) || BLOCKS[type]?.light) return 1;
  if (/sand|dirt|grass|moss|gravel|farmland/i.test(type)) return 0.92;
  if (/wood|plank|log|hay|bookshelf/i.test(type)) return 0.65;
  if (
    [
      'ironBlock',
      'goldBlock',
      'copperBlock',
      'diamondBlock',
      'obsidian',
    ].includes(type)
  )
    return 0.06;
  return 0.25;
}

// Original world-space field: the same puddle spans neighboring voxel faces.
export const wetCoverageGLSL = /* glsl */ `
float wetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wetNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wetHash(i), wetHash(i+vec2(1,0)), f.x),
             mix(wetHash(i+vec2(0,1)), wetHash(i+vec2(1,1)), f.x), f.y);
}
float wetCoverage(vec3 world, float upward, float exposure, float porosity, float wetness) {
  float basin = wetNoise(world.xz * 0.28) * 0.7 + wetNoise(world.xz * 0.81) * 0.3;
  return smoothstep(0.4, 0.63, basin) * pow(max(0.0, 1.0-porosity), 1.25)
    * exposure * wetness * smoothstep(0.98, 1.0, upward);
}
`;

// Same-frame screen-space reflection, sharing the protection mask's B channel.
export class WetSurfacePass extends Pass {
  constructor(camera, frame, weather, sky) {
    super();
    this.weather = weather;
    this.material = new ShaderMaterial({
      name: 'WetSurfaceReflection',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        sceneColor: { value: null },
        sceneDepth: { value: frame.depthTexture },
        surfaceMask: { value: null },
        wetProjection: { value: camera.projectionMatrix },
        wetInverse: { value: camera.projectionMatrixInverse },
        wetView: { value: camera.matrixWorldInverse },
        wetWorld: { value: camera.matrixWorld },
        wetSky: weather.wetSky,
        rain: weather.terrainRain,
        wetTime: weather.waterTime,
        surfaceAlbedo: { value: null },
        surfaceGeometry: { value: null },
        environmentSky: sky.skyRadianceMap,
        environmentStrength: { value: 1 },
        environmentFrame: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D sceneColor, sceneDepth, surfaceMask;
      uniform sampler2D surfaceAlbedo,surfaceGeometry,environmentSky;
      uniform mat4 wetProjection, wetInverse, wetView, wetWorld;
      uniform vec3 wetSky;
      uniform float rain, wetTime;
      uniform float environmentStrength,environmentFrame;
      ${wetCoverageGLSL}
      ${photonSpecularGLSL}
      vec3 wetViewPosition(vec2 uv, float depth) {
        vec4 p=wetInverse*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);return p.xyz/p.w;
      }
      vec3 puddleNormal(vec2 world) {
        vec2 slope=vec2(0.0);
        if(rain>0.001) {
          vec2 p=world*0.9,base=floor(p);
          for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
            vec2 cell=base+vec2(float(x),float(y));
            float h=wetHash(cell);
            vec2 center=cell+vec2(wetHash(cell+19.0),wetHash(cell+53.0));
            vec2 d=p-center;float distance=length(d),age=fract(wetTime*0.8+h);
            float ring=distance-age*0.7;
            float wave=cos(ring*42.0)*exp(-abs(ring)*22.0)*(1.0-age)*(1.0-age);
            slope+=d/max(distance,0.01)*wave*0.018;
          }
        }
        return normalize(vec3(slope.x*rain,1.0,slope.y*rain));
      }
      vec4 reflectedScene(vec3 origin,vec3 direction) {
        float previous=0.035,travel=0.1;
        for(int i=0;i<40;i++) {
          vec3 p=origin+direction*travel;
          if(p.z>=-0.08)break;
          vec4 clip=wetProjection*vec4(p,1.0);vec2 uv=clip.xy/clip.w*0.5+0.5;
          if(any(lessThan(uv,vec2(0.002)))||any(greaterThan(uv,vec2(0.998))))break;
          float depth=texture2D(sceneDepth,uv).r;
          float gap=depth<0.999999 ? -p.z+wetViewPosition(uv,depth).z : -10000.0;
          if(gap>0.0) {
            float low=previous,high=travel;
            for(int j=0;j<6;j++) {
              float mid=(low+high)*0.5;
              vec3 point=origin+direction*mid;
              vec4 projected=wetProjection*vec4(point,1.0);
              vec2 sampleUv=projected.xy/projected.w*0.5+0.5;
              float d=texture2D(sceneDepth,sampleUv).r;
              float delta=d<0.999999 ? -point.z+wetViewPosition(sampleUv,d).z : -10000.0;
              if(delta>0.0)high=mid;else low=mid;
            }
            p=origin+direction*high;clip=wetProjection*vec4(p,1.0);uv=clip.xy/clip.w*0.5+0.5;
            depth=texture2D(sceneDepth,uv).r;
            gap=-p.z+wetViewPosition(uv,depth).z;
            if(depth<0.999999 && gap<max(0.16,-p.z*0.015) && texture2D(surfaceMask,uv).r<0.5) {
              float edge=min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y));
              float confidence=smoothstep(0.005,0.065,edge)*(1.0-smoothstep(26.0,48.0,high));
              return vec4(texture2D(sceneColor,uv).rgb,confidence);
            }
            break;
          }
          previous=travel;travel+=0.1+travel*0.14;
        }
        return vec4(0.0);
      }
      ${surfaceReflectionGLSL}
      void main() {
        vec4 base=texture2D(sceneColor,vUv),mask=texture2D(surfaceMask,vUv);
        float coverage=mask.b;
        vec4 optical=texture2D(surfaceAlbedo,vUv);
        if(mask.r>0.5||(coverage<0.001&&(environmentStrength<=0.0||optical.a<0.001))){gl_FragColor=base;return;}
        float depth=texture2D(sceneDepth,vUv).r;
        if(depth>=0.999999){gl_FragColor=base;return;}
        vec3 position=wetViewPosition(vUv,depth);
        vec3 view=normalize(-position);
        vec3 environment=surfaceEnvironment(position,view,optical,texture2D(surfaceGeometry,vUv));
        base.rgb+=environment*(1.0-coverage);
        if(coverage<0.001){gl_FragColor=base;return;}
        vec3 world=(wetWorld*vec4(position,1.0)).xyz;
        vec3 normalWorld=puddleNormal(world.xz);
        vec3 normal=normalize(mat3(wetView)*normalWorld);
        vec3 ray=reflect(-view,normal),rayWorld=mat3(wetWorld)*ray;
        vec3 sky=wetSky*mix(0.65,1.3,smoothstep(0.0,0.75,rayWorld.y));
        vec4 hit=reflectedScene(position+normal*0.045,ray);
        vec3 reflected=mix(sky,hit.rgb,hit.a);
        float fresnel=0.02+0.98*pow(1.0-clamp(dot(normal,view),0.0,1.0),5.0);
        gl_FragColor=vec4(mix(base.rgb,reflected,coverage*min(fresnel,0.94)),base.a);
      }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.environmentFrame.value =
      (this.material.uniforms.environmentFrame.value + 1) % 64;
    this.material.uniforms.sceneColor.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}
