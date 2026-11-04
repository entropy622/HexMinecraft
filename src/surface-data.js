// Shared material contract. RGB values are linear Rec.709; normal is view-space.
// Skylight/blocklight attributes are already squared normalized voxel levels.
export const surfaceDataGLSL = /* glsl */ `
struct SurfaceData {
  vec3 diffuseColor;
  vec3 normal;
  float geometryAO;
  float squaredSky;
  vec3 squaredBlock;
  PhotonSurfaceOptics optical;
  vec3 emission;
};
`;

// Preserve the existing compact reflection layout while making its ownership
// explicit. Later lighting stages can consume this contract without cloning a
// lit shader and searching for a marker inside its material decoder.
export const surfaceRecordOpticsGLSL = /* glsl */ `
// RGBA8 geometry alpha: 0 = class defaults, 1..254 = native base roughness,
// 255 = labPBR specular attachment. Keep native roughness before wet blending.
bool surfaceRecordLabPbr(float tag){return tag>254.5/255.0;}
float surfaceRecordRoughness(float tag){return clamp((tag*255.0-1.0)/253.0,0.0,1.0);}
float surfaceEncodeRecordOptics(float roughness,bool nativeDetail,bool labPbr){
  return labPbr?1.0:nativeDetail?(1.0+floor(clamp(roughness,0.0,1.0)*253.0+0.5))/255.0:0.0;
}
`;
export const surfaceRecordParsGLSL = /* glsl */ `
${surfaceRecordOpticsGLSL}
layout(location=1) out highp vec4 reflectionAlbedo;
layout(location=2) out highp vec4 reflectionGeometry;
#ifdef HEX_PACK_SPECULAR_OUTPUT
layout(location=3) out highp vec4 reflectionSpecular;
#endif
uniform sampler2D surfaceDepth;
uniform vec2 surfaceResolution;
uniform vec3 surfaceChannels;
vec2 surfaceOctEncode(vec3 n){
  n/=abs(n.x)+abs(n.y)+abs(n.z);
  vec2 e=n.xy;
  if(n.z<0.0)e=(1.0-abs(e.yx))*mix(vec2(-1.0),vec2(1.0),step(vec2(0.0),e));
  return e*0.5+0.5;
}
vec3 surfaceEncodeAlbedo(vec3 c){
  return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
`;
export const surfaceRecordOutputGLSL = /* glsl */ `
float surfaceDepthValue=texture2D(surfaceDepth,gl_FragCoord.xy/surfaceResolution).r;
if(gl_FragCoord.z>surfaceDepthValue+0.000001)discard;
vec3 surfaceWorldNormal=normalize(inverseTransformDirection(material.normal,viewMatrix));
float coverage=surfaceChannels.z>0.5?surfacePuddleCoverage:0.0;
gl_FragColor=vec4(surfaceChannels.x,max(surfaceChannels.y,step(0.025,coverage)),coverage,1.0);
reflectionAlbedo=vec4(surfaceEncodeAlbedo(material.diffuseColor),(floor(vSurfaceOptics+0.5)+1.0)/255.0);
reflectionGeometry=vec4(surfaceOctEncode(surfaceWorldNormal),sqrt(clamp(material.squaredSky,0.0,1.0)),surfaceEncodeRecordOptics(surfaceNativeRoughness,surfaceNativeRoughness>=0.0,surfaceHasSpec>0.5));
#ifdef HEX_PACK_SPECULAR_OUTPUT
reflectionSpecular=surfacePackSpec;
#endif
`;

export const SURFACE_RECORDS = Object.freeze({
  mask: Object.freeze({
    attachment: 0,
    channels: 'protection, reactive, wet coverage, valid',
  }),
  albedo: Object.freeze({
    attachment: 1,
    channels: 'sRGB albedo, (class + 1) / 255',
  }),
  geometry: Object.freeze({
    attachment: 2,
    channels:
      'oct world normal, raw sky level, optics tag: 0 class / 1..254 native roughness / 255 labPBR',
  }),
  specular: Object.freeze({
    attachment: 3,
    channels: 'original labPBR specular RGBA; optional',
  }),
});
