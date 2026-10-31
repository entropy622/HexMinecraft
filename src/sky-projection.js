// Shared by displayed sky, its captures and directional terrain border fog.
// Callers provide the same SKY_PI constant.
export const skyProjectionGLSL = /* glsl */ `
vec2 skyUv(vec3 direction) {
  float elevation = asin(clamp(direction.y, -1.0, 1.0));
  float azimuth = dot(direction.xz, direction.xz) < 1e-10 ? 0.0 : atan(direction.z, direction.x);
  return vec2(azimuth / (2.0 * SKY_PI) + 0.5,
    0.5 + 0.5 * sign(elevation) * sqrt(abs(elevation) / (0.5 * SKY_PI)));
}
vec3 skyDirection(vec2 uv) {
  float v = uv.y * 2.0 - 1.0, elevation = sign(v) * v * v * SKY_PI * 0.5;
  float azimuth = (uv.x - 0.5) * 2.0 * SKY_PI;
  return vec3(cos(azimuth) * cos(elevation), sin(elevation), sin(azimuth) * cos(elevation));
}
`;
