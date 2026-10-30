// Photon noisetex is numeric RGBA, with no colour transform or premultiplication.
// The seed lattice and original 512² image share a sampler with the macro cache.
export const CLOUD_NOISE_SIZE = 512;
export const CLOUD_NOISE_OFFSET = 128;
export const CLOUD_NOISE_WIDTH = 1024;
export const CLOUD_COVERAGE_HEADER = 514;

export function updateCloudSeed(data, seed) {
  if (seed.length !== 127 * 127)
    throw new RangeError('The cloud seed lattice must contain 127² bytes');
  for (let y = 0; y < 127; y++)
    for (let x = 0; x < 127; x++)
      data[(y * CLOUD_NOISE_WIDTH + x) * 4] = seed[y * 127 + x];
}

export function packCloudCoverage(source, seed) {
  if (!(source instanceof Uint8Array) || source.length !== 512 * 512 * 4)
    throw new RangeError(
      'Photon coverage requires the original 512² RGBA image',
    );
  const data = new Uint8Array(CLOUD_NOISE_WIDTH * CLOUD_COVERAGE_HEADER * 4);
  for (let y = 0; y < 514; y++) {
    const row = ((y + 511) % 512) * 512 * 4,
      start = (y * CLOUD_NOISE_WIDTH + CLOUD_NOISE_OFFSET) * 4;
    data.set(source.subarray(row + 511 * 4, row + 512 * 4), start);
    data.set(source.subarray(row, row + 512 * 4), start + 4);
    data.set(source.subarray(row, row + 4), start + 513 * 4);
  }
  updateCloudSeed(data, seed);
  return data;
}

export const cloudCoverageNoiseGLSL = /* glsl */ `
vec4 hexPhotonCloudNoise(vec2 p) {
  // A periodic one-texel border allows one hardware bilinear fetch instead
  // of four manual ones. The same numeric image lives in both atlas headers.
  vec2 pixel = fract(p) * 512.0 + vec2(129.0, 1.0);
  return textureLod(cloudNoise, pixel / vec2(textureSize(cloudNoise, 0)), 0.0);
}
`;
