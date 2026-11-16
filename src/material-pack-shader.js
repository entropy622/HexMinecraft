// labPBR: RG tangent normal, B material AO, A height (POM below).
export const SURFACE_POM_DEPTH = 0.25;
export const materialPackGLSL = /* glsl */ `
uniform float surfacePackEnabled,surfaceParallaxDistance;
uniform sampler2D surfacePackNormal,surfacePackSpecular,surfacePackFlags;
uniform vec2 surfacePackGrid;
vec3 surfacePackChannels(vec2 texUv){
  vec2 cell=floor(vec2(texUv.x,1.0-texUv.y)*surfacePackGrid);
  float index=cell.y*surfacePackGrid.x+cell.x;
  return texture2D(surfacePackFlags,vec2((index+0.5)/float(textureSize(surfacePackFlags,0).x),0.5)).rgb;
}
// Photon parallax.glsl: tile-local march with a depth of ${SURFACE_POM_DEPTH} blocks and a
// 0.75..1 distance fade. Tile gradients come from the real surface, so hexagon
// tops and sides keep the same world-space depth.
vec4 surfaceParallaxTile=vec4(0.0);
vec3 surfaceParallaxHit=vec3(0.0),surfaceParallaxGu=vec3(0.0),surfaceParallaxGv=vec3(0.0),surfaceParallaxN=vec3(0.0,0.0,1.0);
vec2 surfaceParallaxDx=vec2(0.0),surfaceParallaxDy=vec2(0.0);
float surfaceParallaxScale=0.0;
vec2 surfaceParallaxUv(vec2 local){return surfaceParallaxTile.xy+surfaceParallaxTile.zw*fract(local);}
float surfaceParallaxDepth(vec2 local){
  return 1.0-textureGrad(surfacePackNormal,surfaceParallaxUv(local),surfaceParallaxDx,surfaceParallaxDy).a;
}
vec2 surfaceParallaxMap(vec2 uv){
  surfaceParallaxDx=dFdx(uv);surfaceParallaxDy=dFdy(uv);
  if(surfacePackEnabled<0.5||surfaceParallaxDistance<=0.0)return uv;
  vec3 eye=-vViewPosition,q0=dFdx(eye),q1=dFdy(eye),n=normalize(cross(q0,q1));
  if(dot(n,vViewPosition)<0.0)n=-n;
  float viewDistance=length(vViewPosition);
  if(viewDistance>=surfaceParallaxDistance||surfacePackChannels(uv).r<0.5)return uv;
  vec3 p1=cross(q1,n),p0=cross(n,q0);float det=dot(q0,p1);
  if(abs(det)<1e-14)return uv;
  vec2 atlas=vec2(textureSize(surfacePackNormal,0));float cell=atlas.x/surfacePackGrid.x;
  surfaceParallaxTile=vec4((floor(uv*atlas/cell)*cell+0.25*cell)/atlas,vec2(0.5*cell)/atlas);
  surfaceParallaxGu=(p1*surfaceParallaxDx.x+p0*surfaceParallaxDy.x)/(det*surfaceParallaxTile.z);
  surfaceParallaxGv=(p1*surfaceParallaxDx.y+p0*surfaceParallaxDy.y)/(det*surfaceParallaxTile.w);
  surfaceParallaxN=n;
  surfaceParallaxScale=${SURFACE_POM_DEPTH.toFixed(3)}*(1.0-smoothstep(0.75*surfaceParallaxDistance,surfaceParallaxDistance,viewDistance));
  vec2 local=(uv-surfaceParallaxTile.xy)/surfaceParallaxTile.zw;
  float depth=surfaceParallaxDepth(local);
  surfaceParallaxHit=vec3(local,depth);
  // A texel at full height needs no march; this also keeps tile edges exact.
  if(depth<1.0/255.0||surfaceParallaxScale<=0.0)return uv;
  vec3 v=normalize(vViewPosition);
  float noV=max(dot(n,v),0.08);
  vec2 shift=-vec2(dot(surfaceParallaxGu,v),dot(surfaceParallaxGv,v))*(surfaceParallaxScale/noV);
  int steps=int(clamp(ceil(length(shift)*24.0),4.0,40.0));
  vec3 rayStep=vec3(shift,1.0)/float(steps),pos=vec3(local,0.0);
  for(int i=0;i<40;i++){
    if(i>=steps||depth-pos.z<1.0/255.0)break;
    pos+=rayStep;depth=surfaceParallaxDepth(pos.xy);
  }
  surfaceParallaxHit=vec3(pos.xy,depth);
  return surfaceParallaxUv(pos.xy);
}
// Photon get_parallax_shadow, softened over a few height levels so 16 px
// pixel steps do not alias under TAA. Returns direct-light visibility.
float surfaceParallaxShadow(vec3 lightDirection){
  float z=surfaceParallaxHit.z,noL=dot(surfaceParallaxN,lightDirection);
  if(surfaceParallaxScale<=0.0||z<1.0/255.0||noL<=0.02)return 1.0;
  vec2 shift=vec2(dot(surfaceParallaxGu,lightDirection),dot(surfaceParallaxGv,lightDirection))*(surfaceParallaxScale/noL);
  int steps=int(clamp(ceil(length(shift)*z*24.0),2.0,32.0));
  float occlusion=0.0;
  for(int i=1;i<=32;i++){
    if(i>steps)break;
    float rise=z*float(i)/float(steps);
    occlusion=max(occlusion,(z-rise)-surfaceParallaxDepth(surfaceParallaxHit.xy+shift*rise));
  }
  return 1.0-smoothstep(0.01,0.08,occlusion);
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
  float surfaceHasSpec=0.0,surfacePorosity=vPorosity,surfaceNativeRoughness=-1.0;
  float surfaceSkyLevel=vSkylight;vec3 surfaceBlockLevel=vBlockLight;
  #ifdef USE_MAP
    if(surfacePackEnabled>0.5){
      vec3 channels=surfacePackChannels(vMapUv);
      if(channels.r>0.5){
        vec4 mapped=textureGrad(surfacePackNormal,surfaceUv,surfaceParallaxDx,surfaceParallaxDy);
        normal=surfacePackPerturb(normal,-vViewPosition,vMapUv,mapped.rg,faceDirection);
        if(channels.b>0.25){
          // Native B stores roughness, not labPBR visibility. External _s
          // below retains priority over this native surface response.
          if(channels.b>0.75){
            surfaceOptical.roughness=mapped.b;
            surfaceNativeRoughness=mapped.b;
          }
        }else{
          float ao=mix(0.7,1.0,mapped.b);surfaceSkyLevel*=ao*ao;surfaceBlockLevel*=ao*ao;
        }
      }
      if(channels.g>0.5){
        surfacePackSpec=textureGrad(surfacePackSpecular,surfaceUv,surfaceParallaxDx,surfaceParallaxDy);surfaceHasSpec=1.0;
        photonDecodeLabPbr(surfacePackSpec,diffuseColor.rgb,surfaceOptical);
        surfacePorosity=surfaceOptical.porosity;
      }
    }
  #endif
  totalEmissiveRadiance=max(totalEmissiveRadiance,surfaceOptical.emissionRadiance);
  float surfacePuddle=0.0,surfacePuddleCoverage=0.0;
  #ifdef HEX_WET_SURFACE
    vec3 surfaceFlatNormal=normalize(cross(dFdx(vLightPosition),dFdy(vLightPosition)));
    float surfaceBlockLevelRaw=sqrt(clamp(max(max(vBlockLight.r,vBlockLight.g),vBlockLight.b),0.0,1.0));
    surfacePuddle=wetPuddle(vLightPosition,surfaceFlatNormal.y,vWetTop,terrainWetness)
      *(1.0-surfaceBlockLevelRaw*surfaceBlockLevelRaw*surfaceBlockLevelRaw)
      *clamp((sqrt(clamp(vSkylight,0.0,1.0))-14.0/15.0)*15.0,0.0,1.0);
    surfacePuddleCoverage=photonPuddleMaterial(surfacePuddle,surfacePorosity,diffuseColor.rgb,surfaceOptical);
    if(surfacePuddle>0.000001){
      vec3 surfaceNormalWorld=inverseTransformDirection(normal,viewMatrix);
      surfaceNormalWorld=photonPuddleNormal(surfaceNormalWorld,surfaceFlatNormal,
        wetRippleNormal(vLightPosition.xz,terrainRain,waterTime),surfacePuddleCoverage,terrainRain,
        normalize(cameraPosition-vLightPosition));
      normal=normalize((viewMatrix*vec4(surfaceNormalWorld,0.0)).xyz);
    }
  #endif
  // HEX_SURFACE_DATA_READY
`;
