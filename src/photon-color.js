// Photon 6e67b36, utility/color.glsl. Upstream notice: public/licenses/PHOTON-NOTICE.md.
export const PHOTON_2020_TO_XYZ = [
  0.6369736, 0.1446172, 0.1688585, 0.2627066, 0.6779996, 0.0592938, 0,
  0.0280728, 1.0608437,
];
export const PHOTON_XYZ_TO_2020 = [
  1.7166084, -0.3556621, -0.2533601, -0.6666829, 1.6164776, 0.0157685,
  0.0176422, -0.0427763, 0.94222867,
];
export const photonColorGLSL = /* glsl */ `
#ifndef HEX_PHOTON_COLOR
#define HEX_PHOTON_COLOR
const mat3 photon2020ToXyz=mat3(${PHOTON_2020_TO_XYZ.map((x) => (Number.isInteger(x) ? x + '.0' : x)).join(',')});
const mat3 photonXyzTo2020=mat3(${PHOTON_XYZ_TO_2020.join(',')});
const mat3 photonXyzTo709=mat3(3.2406,-1.5372,-0.4986,-0.9689,1.8758,0.0415,0.0557,-0.2040,1.0570);
const mat3 photon709ToXyz=mat3(0.4124,0.3576,0.1805,0.2126,0.7152,0.0722,0.0193,0.1192,0.9505);
vec3 photonTo2020(vec3 rgb){return rgb*photon709ToXyz*photonXyzTo2020;}
vec3 photonTo709(vec3 rgb){return max(rgb*photon2020ToXyz*photonXyzTo709,vec3(0.0));}
#endif
`;
