// The detailed scene and its sky read the same HDR/depth view. Color blending
// avoids holes between unrelated surface approximations at the LOD boundary.
export const distantBackdropGLSL = /* glsl */ `
uniform sampler2D airDistantColor,airDistantDepth;
uniform vec2 airDistantResolution;
uniform float airDistantBlend,airDetailFar;
uniform mat4 airProjectionMatrix;
vec2 airDistantUv(){return gl_FragCoord.xy/max(airDistantResolution,vec2(1.0));}
vec4 airDistantBackdrop(){
  if(airDistantBlend<=0.0)return vec4(0.0);
  vec4 color=texture2D(airDistantColor,airDistantUv());
  if(color.a>0.00001)color.rgb/=color.a;
  return color;
}
`;
