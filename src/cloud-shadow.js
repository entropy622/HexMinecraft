// Photon 6e67b36 lighting/cloud_shadows.glsl and utility/bicubic.glsl.
// The 512² vec2 map is packed into the unused 256x512 atlas header region.
import { CLOUD_METRES_PER_UNIT, ALTOCUMULUS_DENSITY } from './cloud-optics.js';

export const CLOUD_SHADOW_SIZE = 512;
export const CLOUD_SHADOW_X = 768;
export const CLOUD_SHADOW_EXTENT = 256 / (CLOUD_METRES_PER_UNIT / 10);
export const CLOUD_SHADOW_INTENSITY = 0.8;

export const cloudShadowUniformsGLSL = /* glsl */ `
uniform mat4 cloudShadowView,cloudShadowInverse;
uniform float cloudShadowReady;
`;

export const cloudShadowLookupGLSL = /* glsl */ `
vec2 hexCloudShadowUv(vec3 point) {
  vec2 p=(cloudShadowView*vec4(point,1.0)).xy/${CLOUD_SHADOW_EXTENT.toFixed(1)};
  return 0.5+0.5*p/(1.0+length(p));
}
vec2 hexCloudShadowTexel(ivec2 cell) {
  cell=clamp(cell,ivec2(0),ivec2(511));
  vec4 packed=texelFetch(cloudNoise,ivec2(768+cell.x/2,cell.y),0);
  return cell.x%2==0?packed.rg:packed.ba;
}
vec4 hexCloudCubicWeights(float v) {
  vec4 n=vec4(1.0,2.0,3.0,4.0)-v,s=n*n*n;
  float x=s.x,y=s.y-4.0*s.x,z=s.z-4.0*s.y+6.0*s.x;
  return vec4(x,y,z,6.0-x-y-z)/6.0;
}
vec2 hexCloudPreparedShadow(vec3 point) {
  vec2 pixel=hexCloudShadowUv(point)*512.0-0.5,f=fract(pixel);
  ivec2 base=ivec2(floor(pixel));
  vec4 wx=hexCloudCubicWeights(f.x),wy=hexCloudCubicWeights(f.y);
  vec2 value=vec2(0.0);
  // Unpack before filtering. Hardware interpolation across RG/BA would mix
  // neighbouring logical pixels with the source image or the other channel.
  for(int y=0;y<4;y++)for(int x=0;x<4;x++)
    value+=hexCloudShadowTexel(base+ivec2(x-1,y-1))*wx[x]*wy[y];
  return clamp(value,0.0,1.0);
}
float hexCloudShadowWeight(vec3 point) {
  float altitude=clamp((point.y-cloudLayers[0].x)/cloudLayers[0].y,0.0,1.0);
  return ${CLOUD_SHADOW_INTENSITY.toFixed(1)}*smoothstep(0.05,0.15,cloudLightDirection.y)*(1.0-altitude);
}
float hexCloudShadow(vec3 point) {
  if(cloudEnabled<0.5||cloudLightDirection.y<=0.0)return 1.0;
  if(cloudVolumetric>0.5){
    if(cloudShadowReady<0.5)return 1.0;
    return mix(1.0,hexCloudPreparedShadow(point).x,hexCloudShadowWeight(point));
  }
  if(point.y>=cloudBase)return 1.0;
  float reach=(cloudBase+3.0-point.y)/max(0.04,cloudLightDirection.y);
  vec2 p=point.xz+cloudLightDirection.xz*reach-cloudWind;
  vec2 h=hexCloudCell(p);
  vec2 center=vec2(1.732050808*(h.x+h.y*0.5),1.5*h.y)*cloudRadius;
  vec2 delta=p-center;
  float edge=max(abs(delta.x),abs(dot(delta,vec2(0.5,0.866025404))));
  edge=max(edge,abs(dot(delta,vec2(-0.5,0.866025404))));
  edge/=cloudRadius*0.866025404;
  float presence=hexCloudPresence(hexCloudDensity(h));
  float coverage=(1.0-smoothstep(presence-0.12,presence+0.12,edge))*smoothstep(0.0,0.1,presence);
  return 1.0-coverage*cloudShade*smoothstep(0.04,0.18,cloudLightDirection.y);
}
`;

export const cloudShadowPrepareGLSL = /* glsl */ `
// Stable far sphere root, including intersections behind the reference plane.
// Factoring the radius products preserves thin-shell precision in WebGL float.
vec4 hexCloudShadowIntersection(vec3 origin,vec3 direction,float height) {
  vec2 offset=origin.xz-cloudCurvatureOrigin;
  float b=dot(vec3(offset,origin.y+hexCloudPlanet),direction.xzy);
  float c=dot(offset,offset)+(origin.y-height)*(2.0*hexCloudPlanet+origin.y+height);
  float disc=b*b-c;
  vec4 result=vec4(0.0);
  if(disc>=0.0){
    float root=sqrt(disc);
    float t=b>=0.0?-c/max(b+root,0.000001):-b+root;
    result=vec4(origin+direction*t,1.0);
  }
  return result;
}
float hexCloudShadowDistanceFade(vec3 p) {
  float x=clamp(abs(cloudLightDirection.y+0.01)/0.2,0.0,1.0);
  float pulse=1.0-x*x*(3.0-2.0*x);
  vec2 sourcePosition=vec2(p.x-cloudCurvatureOrigin.x,p.y+hexCloudPlanet)*${CLOUD_METRES_PER_UNIT.toFixed(1)};
  return exp2(-0.00000001*pulse*length(sourcePosition));
}
vec2 hexCloudPrepareShadow(vec2 uv) {
  vec2 p=uv*2.0-1.0;
  vec2 result=vec2(1.0);
  if(length(p)<1.0&&cloudLightDirection.y>0.0){
    p*=${CLOUD_SHADOW_EXTENT.toFixed(1)}/(1.0-length(p));
    vec3 origin=(cloudShadowInverse*vec4(p,1.0,1.0)).xyz;
    float inverseY=1.0/(abs(cloudLightDirection.y)+0.000001);
    vec4 hit=hexCloudShadowIntersection(origin,cloudLightDirection,cloudLayers[0].x+0.25*cloudLayers[0].y);
    if(hit.w>0.5){
      float density=hexCloudLayerDensity(hit.xyz,0);
      result.x*=exp(-hexCloudShadowDistanceFade(hit.xyz)*0.25*cloudOptics[0].x*${CLOUD_METRES_PER_UNIT.toFixed(1)}*cloudLayers[0].y*inverseY*density);
    }
    result.y=result.x;
    hit=hexCloudShadowIntersection(origin,cloudLightDirection,cloudLayers[1].x+0.5*cloudLayers[1].y);
    if(hit.w>0.5){
      float rain=clamp((1.0-cloudOptics[1].y)*4.0,0.0,1.0);
      float sigma=mix(0.05,0.1,cloudOptics[2].z)*${ALTOCUMULUS_DENSITY.toFixed(1)}*(1.0-0.33*rain);
      result.x*=exp(-hexCloudShadowDistanceFade(hit.xyz)*sigma*${CLOUD_METRES_PER_UNIT.toFixed(1)}*cloudLayers[1].y*inverseY*hexCloudLayerDensity(hit.xyz,1));
    }
    hit=hexCloudShadowIntersection(origin,cloudLightDirection,cloudLayers[2].x);
    if(hit.w>0.5){
      vec2 high=hexCloudHighDensity(hit.xz+cloudNoiseOffset,cloudLayerWind[2],cloudLayers[2].zw,0.5,cloudOptics[2].z);
      float tau=hexCloudShadowDistanceFade(hit.xyz)*cloudOptics[2].x*${CLOUD_METRES_PER_UNIT.toFixed(1)}*cloudLayers[2].y*inverseY*(high.x+high.y);
      result.x*=0.5+0.5*exp(-tau);
    }
  }
  return result;
}
`;
