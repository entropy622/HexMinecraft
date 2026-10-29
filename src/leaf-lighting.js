// Independent adaptation of Photon's normalized HG sheen lobe. The existing
// hex-volume Beer transmission supplies thickness; sky SSS remains separate.
export const leafLightingGLSL = /* glsl */ `
// Photon uses a 32nd-power approach to the shadow boundary. Include the host's
// depth clipping as well as its XY projection; outside coverage uses voxels.
float leafShadowRangeFade(vec3 shadowPosition) {
  vec3 edge=abs(shadowPosition*2.0-1.0);
  float x=clamp(max(max(edge.x,edge.y),edge.z),0.0,1.0);
  x*=x; x*=x; x*=x; x*=x; x*=x;
  return clamp((x-0.1)/0.9,0.0,1.0);
}
vec3 leafSolarResponse(vec3 albedo, float cosine, vec3 transmission, float sheenAmount) {
  float mu=clamp(cosine,-1.0,1.0);
  float diffusePhase=0.65+0.35*0.64/pow(1.36-1.2*mu,1.5);
  // The source uniform is now actual irradiance. Retain the previous diffuse
  // transmission amplitude here, instead of scaling every solar response.
  vec3 diffuse=0.2*diffusePhase*albedo;
  float phase=0.07957747155*0.75/pow(1.25-mu,1.5);
  float forward=clamp((mu+0.8)/0.6,0.0,1.0);
  // Photon multiplies the material albedo after its reciprocal-albedo sheen.
  // Keep that cancellation bounded, including truly black texture channels.
  vec3 pigment=albedo/(albedo+vec3(0.000001));
  vec3 sheen=pigment*(0.8*max(0.0,sheenAmount)*phase*forward/3.14159265359);
  return (diffuse+sheen)*transmission;
}
`;
