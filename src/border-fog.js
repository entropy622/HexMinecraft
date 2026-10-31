import { skyProjectionGLSL } from './sky-projection.js';

// Photon d4_deferred_shading's morning/evening and rain horizon selection.
// The view-elevation contribution remains per fragment.
export function borderHorizonBlend(sunY, rain) {
  const glow = Math.exp(-75 * (sunY + 0.0496) ** 2);
  return Math.min(1, Math.max(0, (glow - 0.1) / 0.9) + Number(rain >= 0.01));
}

export const borderDistanceGLSL = /* glsl */ `
float airBorderCurve(float ratio) {
  float a=clamp(ratio,0.0,1.0);a*=a;a*=a;a*=a;
  return exp2(-8.0*a);
}
float airBorderDistance(vec3 delta) {
  // The rendered window has axial q/r boundaries. Their world-space unit
  // normals are (sqrt(3)/2,-1/2) and (0,1). Keep Photon's cubic norm between
  // the nearest loaded edge and the old circle, so fog never begins closer.
  vec2 axes=abs(vec2(0.866025403784*delta.x-0.5*delta.z,delta.z));
  float cubic=pow(dot(axes*axes,axes),1.0/3.0);
  return min(length(delta.xz),cubic);
}
float airBorderVisibility(vec3 delta,float nearDistance,float farDistance) {
  float distance=airBorderDistance(delta);
  float end=exp2(-8.0),start=airBorderCurve(nearDistance/farDistance);
  float visibility=clamp((airBorderCurve(distance/farDistance)-end)/max(start-end,0.000001),0.0,1.0);
  // Source downward cutoff. Upward relief requires geometry beyond the loaded
  // window and is deliberately not used to expose missing terrain.
  return visibility*clamp((delta.y+farDistance)/16.0,0.0,1.0);
}
`;
export const borderFogGLSL = /* glsl */ `
uniform sampler2D airBorderSky;
uniform float airBorderEnabled, airBorderHorizon, airBorderFlash;
const float SKY_PI = 3.14159265359;
${skyProjectionGLSL}
${borderDistanceGLSL}
vec3 airBorderSample(vec3 direction) {
  vec2 uv=skyUv(direction);
  // Match the visible dome's extension of the air-side horizon. The map's
  // lower hemisphere belongs to ground irradiance and reflections.
  uv.y=max(uv.y,0.5);
  return mix(textureLod(airBorderSky,uv,0.0).rgb,vec3(0.571,0.687,0.831),airBorderFlash*0.5);
}
vec3 airBorderColor(vec3 direction, vec3 fallback, float skylight) {
  if(airBorderEnabled<0.5)return fallback;
  vec3 horizonDirection=normalize(vec3(direction.x,min(direction.y,-0.1),direction.z));
  float horizonFactor=clamp((direction.y-0.15)/-0.1,0.0,1.0);
  horizonFactor=max(airBorderHorizon,horizonFactor*(2.0-horizonFactor));
  vec3 color=mix(airBorderSample(direction),airBorderSample(horizonDirection),horizonFactor*horizonFactor);
  return color*(0.035+0.965*clamp(skylight,0.0,1.0));
}
`;
