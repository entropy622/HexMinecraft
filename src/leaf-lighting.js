// Photon-inspired primary SSS and sheen in the host's linear-sRGB working space.
// Actual hex leaf path lengths use Photon's geometry-ray response scale (0.2).
export const leafLightingGLSL = /* glsl */ `
// Photon uses a 32nd-power approach to the shadow boundary. Include the host's
// depth clipping as well as its XY projection; outside coverage uses voxels.
float leafShadowRangeFade(vec3 shadowPosition) {
  vec3 edge=abs(shadowPosition*2.0-1.0);
  float x=clamp(max(max(edge.x,edge.y),edge.z),0.0,1.0);
  x*=x; x*=x; x*=x; x*=x; x*=x;
  return clamp((x-0.1)/0.9,0.0,1.0);
}
float leafRangeResponse(float fade, float NoL, float ao, float ambientSss) {
  // Photon compensates the zero-thickness far fallback with actual visibility.
  return mix(1.0,(ao+3.14159265359*ambientSss)*(0.8*clamp(NoL,0.0,1.0)+0.2),clamp(fade,0.0,1.0));
}
vec3 leafBeerTransmission(vec3 albedo, float thickness, float sssAmount) {
  float amount=clamp(sssAmount,0.0,1.0);
  if(amount<0.000001)return vec3(0.0);
  float luminance=dot(albedo,vec3(0.2126,0.7152,0.0722));
  vec3 tint=clamp(albedo*inversesqrt(luminance+0.000001),vec3(0.0),vec3(1.0));
  vec3 coefficient=(vec3(1.0)-0.75*tint)*14.0/amount;
  return exp2(-coefficient*(max(0.0,thickness)*0.2));
}
vec3 leafSolarResponse(vec3 albedo, float cosine, vec3 transmission, float sheenAmount, float sssAmount) {
  float amount=clamp(sssAmount,0.0,1.0);
  if(amount<0.000001)return vec3(0.0);
  float mu=clamp(cosine,-1.0,1.0);
  float primaryPhase=0.07957747155*(0.67+0.33*0.51/pow(1.49-1.4*mu,1.5));
  // Photon's outer albedo/pi cancels the primary SSS's pi, not its HG units.
  vec3 diffuse=5.0*primaryPhase*(amount*(2.0-amount))*albedo;
  float phase=0.07957747155*0.75/pow(1.25-mu,1.5);
  float forward=clamp((mu+0.8)/0.6,0.0,1.0);
  // Photon multiplies the material albedo after its reciprocal-albedo sheen.
  // Keep that cancellation bounded, including truly black texture channels.
  vec3 pigment=albedo/(albedo+vec3(0.000001));
  vec3 sheen=pigment*(0.8*max(0.0,sheenAmount)*phase*forward/3.14159265359);
  return (diffuse+sheen)*transmission;
}
`;
