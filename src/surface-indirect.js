// Original SH visibility-cone convolution following Photon's hemispherical
// cosine kernel. Three's coefficients and working RGB space remain authoritative.
export const surfaceIndirectGLSL = /* glsl */ `
uniform float surfaceBounce;
vec3 surfaceSkyCone(vec3 viewNormal, vec3 coefficients[9], float visibility) {
  vec3 n=transformNormalByInverseViewMatrix(viewNormal,viewMatrix);
  float x=n.x,y=n.y,z=n.z,v=clamp(visibility,0.0,1.0),closed=1.0-v;
  vec3 band0=coefficients[0]*0.886227;
  vec3 band1=2.0*0.511664*(coefficients[1]*y+coefficients[2]*z+coefficients[3]*x);
  vec3 band2=2.0*0.429043*(coefficients[4]*x*y+coefficients[5]*y*z+coefficients[7]*x*z) +
    coefficients[6]*(0.743125*z*z-0.247708)+coefficients[8]*0.429043*(x*x-y*y);
  // Divide the cone kernel by v here: the shared final geometry attenuation
  // multiplies all reflected light by v once. The v->0 limit is finite.
  float firstBand=v>0.0001 ? (1.0-closed*sqrt(closed))/v : 1.5;
  return max(vec3(0.0),band0+band1*firstBand+band2*(4.0-3.0*v));
}
`;
