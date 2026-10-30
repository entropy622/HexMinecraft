// Photon 6e67b36 sky/clouds/{common,cirrus}.glsl and utility/random.glsl.
// Numeric noisetex is already part of cloudNoise; no extra sampler is needed.
import {
  CLOUD_METRES_PER_UNIT,
  CIRRUS_DENSITY,
  CIRROCUMULUS_DENSITY,
} from './cloud-optics.js';

export const cloudCirrusGLSL = /* glsl */ `
vec2 hexCloudGradientHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  h += dot(h, h.yzx + 33.33);
  return fract((h.xx + h.yz) * h.zy);
}
vec2 hexCloudCurl(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);
  vec2 g0 = hexCloudGradientHash(i), g1 = hexCloudGradientHash(i+vec2(1,0));
  vec2 g2 = hexCloudGradientHash(i+vec2(0,1)), g3 = hexCloudGradientHash(i+1.0);
  float v0 = dot(g0,f), v1 = dot(g1,f-vec2(1,0));
  float v2 = dot(g2,f-vec2(0,1)), v3 = dot(g3,f-1.0);
  vec2 gradient = g0 + u.x*(g1-g0) + u.y*(g2-g0) + u.x*u.y*(g0-g1-g2+g3)
    + du*(u.yx*(v0-v1-v2+v3)+vec2(v1,v2)-v0);
  return vec2(gradient.y,-gradient.x);
}
// Return the two physical density components separately. World-space inputs
// use the host's inverse advection convention; all frequencies below are the
// source's per-metre values, including the later detail-octave wind offsets.
vec2 hexCloudHighDensity(vec2 position, vec2 displacement, vec2 amounts, float altitude, float dayFactor) {
  vec2 wind = -displacement * ${CLOUD_METRES_PER_UNIT.toFixed(1)};
  vec2 coord = position * ${CLOUD_METRES_PER_UNIT.toFixed(1)} + wind;
  vec2 curl = hexCloudCurl(coord*0.00002)*0.5 + hexCloudCurl(coord*0.00004)*0.25 + hexCloudCurl(coord*0.00008)*0.125;
  float height = 1.0-abs(1.0-2.0*altitude);
  float cirrus = 0.7*hexPhotonCloudNoise(coord*0.000001+0.0032*curl).r
    + 0.3*hexPhotonCloudNoise(coord*0.000008+0.0064*curl).r;
  cirrus = clamp((cirrus-(0.7-amounts.x))/(0.3+amounts.x),0.0,1.0);
  vec2 detailCoord = coord;
  float amplitude = 0.2, frequency = 0.00002, strength = 0.08;
  for(int octave=0;octave<4;octave++) {
    // All later terms only erode: the final max(0,density) stays zero.
    if(cirrus<=0.0) break;
    cirrus -= hexPhotonCloudNoise(detailCoord*frequency+curl*strength).r*amplitude;
    amplitude*=0.6; frequency*=2.0; strength*=4.0;
    detailCoord+=0.3*wind;
  }
  cirrus=max(0.0,cirrus);
  cirrus=(1.0-0.25*dayFactor)*cirrus*cirrus*cirrus*height*height*${CIRRUS_DENSITY.toFixed(1)};
  float coverage=5.0*clamp((amounts.y*hexPhotonCloudNoise(coord*0.0000026+0.25).a-0.25)/0.65,0.0,1.0);
  float cells=0.0;
  if(coverage>0.0) {
    cells=hexPhotonCloudNoise(coord*0.000025+0.033*curl).a;
    cells*=2.0-cells;
    cells=clamp((cells-(1.0-coverage))/coverage,0.0,1.0);
    vec2 fineCurl=hexCloudCurl(coord*0.001);
    float detail=hexPhotonCloudNoise(coord*0.00005+0.003*fineCurl).g;
    cells-=detail*detail;
    detail=hexPhotonCloudNoise(coord*0.0002+0.007*fineCurl).g;
    cells-=detail*detail*0.5;
    detail=hexPhotonCloudNoise(coord*0.0008+0.03*fineCurl).g;
    cells-=detail*detail*0.1;
    cells=max(0.0,cells);
    cells=0.25*cells*cells*cells*cells*height*${CIRROCUMULUS_DENSITY.toFixed(1)};
  }
  return vec2(cirrus,cells);
}
`;
