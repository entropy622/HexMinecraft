// Photon 6e67b36, shaders/image/worley_{bubbly,swirley}.dat: two R8 64³ volumes.
// Keep single-channel fetches in one guarded R8 atlas, without resampling or
// adding another fragment sampler. Z guard slices preserve periodic filtering.
export const CLOUD_DETAIL_DEPTH = 132;
export const CLOUD_DETAIL_BYTES = 64 * 64 * CLOUD_DETAIL_DEPTH;
export function packCloudDetail(bubbly, swirley) {
  const count = 64 ** 3;
  if (bubbly.byteLength !== count || swirley.byteLength !== count)
    throw new RangeError(
      'Photon cloud detail volumes must each contain 262144 bytes',
    );
  const data = new Uint8Array(CLOUD_DETAIL_BYTES),
    slice = 64 * 64;
  for (const [kind, volume] of [bubbly, swirley].entries()) {
    const offset = kind * 66 * slice;
    data.set(volume.subarray(count - slice), offset);
    data.set(volume, offset + slice);
    data.set(volume.subarray(0, slice), offset + 65 * slice);
  }
  return data;
}

export const cloudDetailGLSL = /* glsl */ `
float hexCloudDetail(vec3 p, float kind) {
  p.z = (fract(p.z) * 64.0 + 1.0 + kind * 66.0) / 132.0;
  return textureLod(cloudWorley, p, 0.0).r;
}
`;

// Photon weather/clouds.glsl detail weights and sharpening. These values are
// uniform across a frame; computing them in every secondary density sample
// needlessly repeats weather math throughout terrain shadows and cloud rays.
export function setCloudDetail(drift, shape, climate) {
  const clamp = (v) => Math.max(0, Math.min(1, v)),
    stratus = clamp(climate.stratus),
    wind = clamp((climate.shear - 0.7) / 0.6),
    torn = clamp((wind - 0.66) / 0.24) * (1 - stratus),
    boost = 1 + 0.5 * torn,
    squared = stratus * stratus;
  shape.set(
    0.33 * boost * (1 - squared) + 0.07 * squared,
    0.4 * boost * (1 - stratus) + 0.1 * stratus,
    3 - squared,
    12 - 5 * squared,
  );
  for (let i = 0; i < 2; i++) {
    const coarse = i === 0 ? 0.018 * 1.2 : 0.06 * 1.2,
      fine = i === 0 ? 0.1 * 1.4 : 0,
      w = climate.winds[i];
    drift[i].set(w[0] * coarse, w[1] * coarse, w[0] * fine, w[1] * fine);
  }
}
