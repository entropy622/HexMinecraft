import { airTransportGLSL } from './air-transport.js';

// Photon 6e67b36 trace_specular_ray / air_fog_analytic: transport on the
// receiver-to-hit segment and the source VL shadow approximation. Host SSR
// samples current pre-volume HDR, so previous-frame fog subtraction is not needed.
// Height integrals, coefficients and working space are shared with host air.
export const reflectionAirGLSL = /* glsl */ `
${airTransportGLSL}
uniform float airCameraSky,airVolume;
vec3 surfaceReflectionAir(vec3 color,vec3 origin,vec3 end){
  if(airVolume<0.5 || airSkyFogActive<0.5 || airDensity<=0.0)return color;
  vec3 delta=end-origin;float distance=length(delta);
  if(distance<0.0001)return color;
  vec3 direction=delta/distance;
  vec2 columns=airColumns(origin,direction,distance);
  vec3 transmission=exp(-airOpticalDepth(columns));
  float facing=max(0.0,dot(direction,airSunDirection));
  float shadow=1.0-facing*facing;
  float sky=clamp(airCameraSky,0.0,1.0);
  vec3 scattering=airMediumScattering(columns,airDirectPhase(dot(direction,airSunDirection)),
    airSkyMean*airAmbient*sky,airSunColor*airSunPower*sky*shadow);
  return max(color*transmission+scattering,vec3(0.0));
}
`;
