import { Matrix3 } from 'three';
import { photonColorGLSL, PHOTON_2020_TO_XYZ } from './photon-color.js';

// Pinned settings.glsl ranges and defaults; also describe the real settings UI.
export const COLOR_SETTINGS = {
  brightness: { label: '画面亮度', value: 1, min: 0, max: 2, step: 0.01 },
  contrast: { label: '对比度', value: 1, min: 0, max: 2, step: 0.01 },
  saturation: { label: '色彩浓度', value: 1, min: 0, max: 2, step: 0.01 },
  whiteBalance: {
    label: '白平衡色温',
    value: 6500,
    min: 4000,
    max: 9000,
    step: 100,
    unit: 'K',
  },
  orangeSaturation: {
    label: '橙色浓度',
    value: 0,
    min: -0.5,
    max: 0.5,
    step: 0.01,
  },
  tealSaturation: {
    label: '青色浓度',
    value: 0.1,
    min: -0.5,
    max: 0.5,
    step: 0.01,
  },
  greenSaturation: {
    label: '绿色浓度',
    value: 0,
    min: -0.5,
    max: 0.5,
    step: 0.01,
  },
  greenHue: {
    label: '绿色色相',
    value: 0,
    min: -8,
    max: 8,
    step: 0.1,
    unit: '°',
  },
};
export const DEFAULT_COLOR_SETTINGS = Object.fromEntries(
  Object.entries(COLOR_SETTINGS).map(([key, spec]) => [key, spec.value]),
);
function rowMultiply(v, m) {
  return [0, 1, 2].map((c) =>
    v.reduce((sum, x, r) => sum + x * m[c * 3 + r], 0),
  );
}
function sourceWhite(temperature) {
  const rgb = [660, 550, 440].map((lambda) => {
    const h = 6.63e-16,
      k = 1.38e-5,
      c = 3e17;
    return (
      (lambda ** 5 / (2 * h * c * c)) *
      Math.expm1((h * c) / (k * lambda * temperature))
    );
  });
  return rgb.map((x) => Math.min(...rgb) / x);
}
// Source vertex-stage blackbody/Bradford calculation, evaluated only on a setting
// change. Preserve the pinned source's row-vector/matrix convention exactly.
export function photonWhiteBalance(temperature) {
  if (temperature === 6500) return new Matrix3();
  const bradford = new Matrix3().fromArray([
    0.8951, -0.7502, 0.0389, 0.2664, 1.7135, -0.0685, -0.1614, 0.0367, 1.0296,
  ]);
  const src = rowMultiply(
      rowMultiply(sourceWhite(temperature), PHOTON_2020_TO_XYZ),
      bradford.elements,
    ),
    dst = rowMultiply(
      rowMultiply(sourceWhite(6500), PHOTON_2020_TO_XYZ),
      bradford.elements,
    ),
    q = dst.map((x, i) => x / src[i]);
  return bradford
    .clone()
    .multiply(new Matrix3().set(q[0], 0, 0, 0, q[1], 0, 0, 0, q[2]))
    .multiply(bradford.clone().invert());
}

// Adapted from c19_color_grading.fsh, tonemap_operators.glsl, utility/color.glsl
// and global.glsl at Photon 6e67b36. The source's functions called HSL actually
// use HSV/value; retain that algorithm and the source epsilon, not generic HSL.
export const photonGradingGLSL = /* glsl */ `
${photonColorGLSL}
vec3 photonGradeHsv(vec3 c){
  const vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
  vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-6)),d/(q.x+1e-6),q.x);
}
vec3 photonGradeRgb(vec3 c){
  const vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
  c.yz=clamp(c.yz,0.0,1.0);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}
float photonGradeHue(vec3 hsv,float center,float width){
  if(hsv.y<1e-2 || hsv.z<1e-2)return 0.0;
  float x=fract((hsv.x*360.0-center+180.0)/360.0)*360.0-180.0;
  x=clamp(abs(x)/width,0.0,1.0);
  return 1.0-x*x*(3.0-2.0*x);
}
vec3 photonLottes(vec3 rgb){
  const vec3 a=vec3(1.5),d=vec3(0.91),hdrMax=vec3(8.0),midIn=vec3(0.26),midOut=vec3(0.32);
  const vec3 b=(-pow(midIn,a)+pow(hdrMax,a)*midOut)/((pow(hdrMax,a*d)-pow(midIn,a*d))*midOut);
  const vec3 c=(pow(hdrMax,a*d)*pow(midIn,a)-pow(hdrMax,a)*pow(midIn,a*d)*midOut)/((pow(hdrMax,a*d)-pow(midIn,a*d))*midOut);
  return pow(rgb,a)/(pow(rgb,a*d)*b+c);
}
vec3 photonGrade(vec3 rgb,vec4 inputGrade,vec4 selective,mat3 whiteBalance){
  // Temporal ringing can be negative in this host; the source expects >= 0.
  rgb=max(photonTo2020(max(rgb,vec3(0.0))),vec3(0.0));
  rgb*=0.83*inputGrade.x;
  const float midpoint=-2.47393118833;
  rgb=max(exp2(inputGrade.y*(log2(rgb+1e-6)-midpoint)+midpoint)-1e-6,vec3(0.0));
  rgb=max(mix(vec3(dot(rgb,vec3(0.2627,0.6780,0.0593))),rgb,0.98*inputGrade.z),vec3(0.0));
  if(inputGrade.w!=6500.0)rgb=rgb*photon2020ToXyz*whiteBalance*photonXyzTo2020;
  rgb=clamp(photonTo709(photonLottes(max(rgb,vec3(0.0)))),0.0,1.0);
  vec3 hsv=photonGradeHsv(sqrt(rgb));
  hsv.y*=1.0+selective.x*photonGradeHue(hsv,30.0,20.0);
  hsv.y*=1.0+selective.y*photonGradeHue(hsv,210.0,20.0);
  float green=photonGradeHue(hsv,90.0,44.0);
  hsv.x+=selective.w/360.0*green;
  hsv.y*=1.0+selective.z*green;
  rgb=photonGradeRgb(hsv);
  vec3 upper=step(vec3(0.5),rgb);
  vec3 lower=0.5*pow(2.0*mix(rgb,1.0-rgb,upper),vec3(1.05));
  rgb=mix(lower,1.0-lower,upper);
  return rgb*rgb;
}
vec3 photonDisplayTransfer(vec3 linear){
  linear=clamp(linear,0.0,1.0);
  return 1.14374*(-0.126893*linear+sqrt(linear));
}
`;
