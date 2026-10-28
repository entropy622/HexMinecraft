// Raw packed-volume addressing is shared by moving models, atmosphere and water light.
export const lightVolumeGLSL = /* glsl */ `
#ifndef HEX_LIGHT_VOLUME
#define HEX_LIGHT_VOLUME
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
  vec4 packed = floor(texelFetch(entityLightVolume, cell, 0) * 255.0 + 0.5);
  return vec4(mod(packed.rgb, 16.0), packed.a);
}
float lightWaterHeight(float medium) {
  return medium < 0.5 || medium > 9.5 ? 0.0 : medium < 1.5 ? 1.0 : 0.92 - (medium - 2.0) * 0.085;
}
// Exact distance to the next face of this axial hex prism, in world units.
float lightCellExit(vec3 p, ivec3 cell, vec3 ray) {
  vec3 local = p - entityLightOrigin;
  vec2 center = vec2(1.732050808 * float(cell.z) + 0.866025404 * float(cell.y), 1.5 * float(cell.y));
  vec2 d = local.xz - center;
  vec3 plane = vec3(d.x, dot(d, vec2(0.5, 0.866025404)), dot(d, vec2(-0.5, 0.866025404)));
  vec3 speed = vec3(ray.x, dot(ray.xz, vec2(0.5, 0.866025404)), dot(ray.xz, vec2(-0.5, 0.866025404)));
  vec3 side = (vec3(0.866025404) - sign(speed) * plane) / max(abs(speed), vec3(0.000001));
  float top = abs(ray.y) > 0.000001 ? ((ray.y > 0.0 ? float(cell.x + 1) : float(cell.x)) - local.y) / ray.y : 1000000.0;
  return max(0.0001, min(min(side.x, side.y), min(side.z, top)));
}
#endif
`;
