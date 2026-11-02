import { ShaderMaterial } from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BLOCKS } from './core.js';
import { photonSpecularGLSL } from './photon-specular.js';
import { wetMaterialGLSL } from './wet-material.js';
export { wetCoverageGLSL } from './wet-material.js';
import { surfaceReflectionGLSL } from './surface-reflection.js';
import { reflectionTraceGLSL } from './reflection-trace.js';
import { reflectionAirGLSL } from './reflection-air.js';
import {
  ReflectionRadiance,
  reflectionColorGLSL,
} from './reflection-radiance.js';

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

// Same-frame screen-space reflection, sharing the protection mask's B channel.
export class WetSurfacePass extends Pass {
  constructor(camera, frame, weather, sky, airUniforms) {
    super();
    this.weather = weather;
    this.radiance = new ReflectionRadiance();
    this.material = new ShaderMaterial({
      name: 'WetSurfaceReflection',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        ...airUniforms,
        sceneColor: { value: null },
        sceneDepth: { value: frame.depthTexture },
        surfaceMask: { value: null },
        wetProjection: { value: camera.projectionMatrix },
        wetInverse: { value: camera.projectionMatrixInverse },
        wetView: { value: camera.matrixWorldInverse },
        wetWorld: { value: camera.matrixWorld },
        surfaceAlbedo: { value: null },
        surfaceGeometry: { value: null },
        surfaceSpecular: { value: null },
        surfaceSpecularEnabled: { value: 0 },
        environmentSky: sky.skyEnvironmentMap,
        environmentStrength: { value: 1 },
        environmentFrame: { value: 0 },
        environmentScene: { value: 1 },
        environmentSkyEnabled: { value: 1 },
        environmentRays: { value: 4 },
        environmentSteps: { value: 8 },
        reflectionColor: { value: null },
      },
      vertexShader: /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D sceneColor, sceneDepth, surfaceMask;
      uniform sampler2D surfaceAlbedo,surfaceGeometry,environmentSky;
      uniform sampler2D surfaceSpecular;uniform float surfaceSpecularEnabled;
      uniform sampler2D reflectionColor;
      uniform mat4 wetProjection, wetInverse, wetView, wetWorld;
      uniform float environmentStrength,environmentFrame;
      uniform float environmentScene,environmentSkyEnabled;
      uniform int environmentRays,environmentSteps;
      ${photonSpecularGLSL}
      ${wetMaterialGLSL}
      ${reflectionTraceGLSL}
      ${reflectionColorGLSL}
      ${reflectionAirGLSL}
      vec3 wetViewPosition(vec2 uv, float depth) {
        vec4 p=wetInverse*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);return p.xyz/p.w;
      }
      vec4 reflectedScene(vec3 origin,vec3 direction,int steps,float mip,float dither) {
        vec3 hit;
        if(!reflectionTrace(sceneDepth,wetProjection,origin,direction,dither,steps,4,hit))return vec4(0.0);
        if(textureLod(surfaceMask,hit.xy,0.0).r>0.5)return vec4(0.0);
        float depth=textureLod(sceneDepth,hit.xy,0.0).r;
        vec3 point=wetViewPosition(hit.xy,depth),rayPoint=wetViewPosition(hit.xy,hit.z);
        if(abs(point.z-rayPoint.z)>max(0.16,-point.z*0.015))return vec4(0.0);
        float edge=min(min(hit.x,hit.y),min(1.0-hit.x,1.0-hit.y));
        float confidence=smoothstep(0.005,0.065,edge)*(1.0-smoothstep(26.0,48.0,length(point-origin)));
        if(confidence<=0.0)return vec4(0.0);
        vec4 color=mip<0.0?vec4(textureLod(sceneColor,hit.xy,0.0).rgb,1.0):filteredReflectionColor(reflectionColor,hit.xy,mip);
        if(color.a<=0.0)return vec4(0.0);
        vec3 airOrigin=(wetWorld*vec4(origin,1.0)).xyz;
        vec3 airHit=(wetWorld*vec4(point,1.0)).xyz;
        vec3 transported=surfaceReflectionAir(color.rgb,airOrigin,airHit);
        // HEX_REFLECTION_AIR_READY
        return vec4(transported,confidence*color.a);
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
        base.rgb+=environment;
        gl_FragColor=base;
      }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.environmentFrame.value =
      (this.material.uniforms.environmentFrame.value + 1) % 64;
    this.material.uniforms.sceneColor.value = readBuffer.texture;
    if (
      this.protection.reflectiveVisible &&
      this.material.uniforms.environmentStrength.value > 0 &&
      this.material.uniforms.environmentScene.value > 0
    )
      this.material.uniforms.reflectionColor.value = this.radiance.update(
        renderer,
        readBuffer.texture,
        this.material.uniforms.surfaceMask.value,
      );
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.radiance.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
  setSize(width, height) {
    this.radiance.setSize(width, height);
  }
  setOptions(values) {
    const u = this.material.uniforms;
    u.environmentScene.value = Number(values.environmentReflections);
    u.environmentSkyEnabled.value = Number(values.skyReflections);
    u.environmentRays.value = values.reflectionRays;
    u.environmentSteps.value = values.reflectionSteps;
    if (!values.environmentReflections) {
      this.radiance.release();
      u.reflectionColor.value = null;
    }
  }
}
