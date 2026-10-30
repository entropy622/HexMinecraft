// labPBR: RG tangent normal, B material AO, A height (reserved for POM).
export const materialPackGLSL = /* glsl */ `
uniform float surfacePackEnabled;
uniform sampler2D surfacePackNormal,surfacePackSpecular,surfacePackFlags;
uniform vec2 surfacePackGrid;
vec2 surfacePackChannels(vec2 texUv){
  vec2 cell=floor(vec2(texUv.x,1.0-texUv.y)*surfacePackGrid);
  float index=cell.y*surfacePackGrid.x+cell.x;
  return texture2D(surfacePackFlags,vec2((index+0.5)/float(textureSize(surfacePackFlags,0).x),0.5)).rg;
}
vec3 surfacePackPerturb(vec3 n,vec3 eye,vec2 texUv,vec2 encoded,float facing){
  vec3 q0=dFdx(eye),q1=dFdy(eye);vec2 st0=dFdx(texUv),st1=dFdy(texUv);
  vec3 p1=cross(q1,n),p0=cross(n,q0),t=p1*st0.x+p0*st1.x,b=p1*st0.y+p0*st1.y;
  float det=max(dot(t,t),dot(b,b)),scale=det>0.0?inversesqrt(det):0.0;
  vec2 xy=(encoded*2.0-1.0)*facing;
  return normalize(mat3(t*scale,b*scale,n)*vec3(xy,sqrt(clamp(1.0-dot(xy,xy),0.0,1.0))));
}
`;
export const materialPackFragment = /* glsl */ `
  PhotonSurfaceOptics surfaceOptical=photonSurfaceOptics(diffuseColor.rgb,vSurfaceOptics);
  vec4 surfacePackSpec=vec4(0.0);
  float surfaceHasSpec=0.0,surfacePorosity=vPorosity;
  float surfaceSkyLevel=vSkylight;vec3 surfaceBlockLevel=vBlockLight;
  #ifdef USE_MAP
    if(surfacePackEnabled>0.5){
      vec2 channels=surfacePackChannels(vMapUv);
      if(channels.r>0.5){
        vec4 mapped=texture2D(surfacePackNormal,vMapUv);
        normal=surfacePackPerturb(normal,-vViewPosition,vMapUv,mapped.rg,faceDirection);
        float ao=mix(0.7,1.0,mapped.b);surfaceSkyLevel*=ao*ao;surfaceBlockLevel*=ao*ao;
      }
      if(channels.g>0.5){
        surfacePackSpec=texture2D(surfacePackSpecular,vMapUv);surfaceHasSpec=1.0;
        photonDecodeLabPbr(surfacePackSpec,diffuseColor.rgb,surfaceOptical);
        surfacePorosity=surfaceOptical.porosity;
        totalEmissiveRadiance=max(totalEmissiveRadiance,diffuseColor.rgb*surfaceOptical.emission);
      }
    }
  #endif
  // HEX_SURFACE_DATA_READY
`;
