// Raw packed-volume addressing is shared by moving models, atmosphere and water light.
export const lightVolumeGLSL = /* glsl */ `
uniform highp sampler3D entityLightVolume;
uniform vec3 entityLightOrigin;
uniform vec3 entityLightSize;
uniform float entityOutsideSky;
vec2 lightAxial(vec3 position) {
  vec3 p = position - entityLightOrigin;
  return vec2(p.x / 1.7320508075688772 - p.z / 3.0, p.z * (2.0 / 3.0));
}
ivec3 lightCell(vec3 position) {
  vec2 axial = lightAxial(position);
  vec3 cube = vec3(axial, -axial.x - axial.y), rounded = floor(cube + 0.5);
  vec3 error = abs(cube - rounded);
  if (error.x > error.y && error.x > error.z) rounded.x = -rounded.y - rounded.z;
  else if (error.y > error.z) rounded.y = -rounded.x - rounded.z;
  return ivec3(int(floor(position.y - entityLightOrigin.y)), int(rounded.y), int(rounded.x));
}
bool insideLightVolume(ivec3 cell) {
  return all(greaterThanEqual(cell, ivec3(0))) && all(lessThan(cell, ivec3(entityLightSize)));
}
vec4 readLightCell(ivec3 cell) {
  if (cell.x < 0) return vec4(0.0, 0.0, 0.0, 15.0);
  if (!insideLightVolume(cell)) return vec4(0.0, 0.0, 0.0, entityOutsideSky * 240.0 + 15.0);
  return floor(texelFetch(entityLightVolume, cell, 0) * 255.0 + 0.5);
}
float lightWaterHeight(float medium) {
  return medium < 0.5 || medium > 9.5 ? 0.0 : medium < 1.5 ? 1.0 : 0.92 - (medium - 2.0) * 0.085;
}
`;
