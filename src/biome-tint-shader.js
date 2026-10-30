// The atlas retains its default tint for icons and independent models. Recover
// the pigment in sRGB before applying the world's blended biome color; AO and
// lighting remain separate and PBR/SSS see the resulting material albedo.
export const biomeTintGLSL = /* glsl */ `
varying vec4 vBiomeTint;
uniform sampler2D biomeGrassOverlay;
uniform float biomeTileSize;
vec3 biomeEncode(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
vec3 biomeDecode(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec4 biomeOverlay(vec2 texUv){
    vec2 cell=fract(vec2(texUv.x,1.0-texUv.y)*surfacePackGrid);
    vec2 local=clamp((cell*2.0*biomeTileSize-biomeTileSize*.5-.5)/(biomeTileSize-1.0),0.0,1.0);
    return texture2D(biomeGrassOverlay,vec2(local.x,1.0-local.y));
}
vec3 biomeSurfaceTint(vec3 albedo,vec2 texUv){
  int kind=int(floor(vBiomeTint.a*255.0+.5));if(kind==0)return albedo;
  vec3 base=kind==2?vec3(121,169,77)/255.0:kind==3?vec3(77,144,53)/255.0:kind==4?vec3(136,173,84)/255.0:vec3(145,185,93)/255.0;
  vec3 srgb=biomeEncode(albedo);
  if(kind==4){
    vec4 overlay=biomeOverlay(texUv);
    srgb+=overlay.rgb*overlay.a*(vBiomeTint.rgb-base);
  }else srgb=srgb/base*vBiomeTint.rgb;
  return biomeDecode(clamp(srgb,0.0,1.0));
}
`;
