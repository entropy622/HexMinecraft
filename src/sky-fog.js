// Photon-style sky fog composition using the host's shared RGB height kernel.
// The raw clear-sky incident light stays separate from the fogged environment.
import { Vector3 } from 'three';
import { airTransportGLSL } from './air-transport.js';

export function skyFogUniforms() {
  return {
    airBaseHeight: { value: 8 },
    airFalloff: { value: 0.14 },
    airRayleighBaseHeight: { value: 8 },
    airRayleighFalloff: { value: (0.14 * 7) / 30 },
    airRayleigh: { value: new Vector3() },
    airMieExtinction: { value: 0 },
    airMieScattering: { value: 0 },
    airDirectMultiplier: { value: 1 },
    airScatterMultiplier: { value: 1 },
    airFogDistance: { value: 118 },
    skyFogEnabled: { value: 0 },
    skyFogSkylight: { value: 1 },
  };
}

export function setSkyFog(uniforms, fog) {
  uniforms.skyFogEnabled.value = fog ? 1 : 0;
  if (!fog) return;
  const p = fog.parameters;
  uniforms.airRayleigh.value.fromArray(p.rayleigh);
  uniforms.airMieExtinction.value = p.mieExtinction;
  uniforms.airMieScattering.value = p.mieScattering;
  uniforms.airDirectMultiplier.value = p.direct;
  uniforms.airScatterMultiplier.value = p.glow;
  uniforms.airFogDistance.value = fog.distance;
  uniforms.skyFogSkylight.value = fog.skylight;
}

export const skyFogGLSL = /* glsl */ `
${airTransportGLSL}
uniform float skyFogEnabled;
uniform float skyFogSkylight;
vec3 skyFogCompose(vec3 radiance,vec3 origin,vec3 direction,vec3 ambient,vec3 direct,vec3 lightDirection){
  if(skyFogEnabled<0.5)return radiance;
  vec2 columns=airColumns(origin,direction,airFogDistance);
  vec3 transmission=exp(-airOpticalDepth(columns));
  vec3 scattering=airMediumScattering(columns,airDirectPhase(dot(direction,lightDirection)),
    ambient*skyFogSkylight,direct*skyFogSkylight);
  return radiance*transmission+max(scattering,vec3(0.0));
}
`;
