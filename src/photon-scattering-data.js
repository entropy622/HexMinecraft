// Photon 6e67b36, shaders/image/atmosphere/scattering.dat: RGB16F 32x64x32.
// WebGL2 uses RGBA16F; preserve every RGB half bit and add an opaque alpha.
export function unpackPhotonScattering(bytes) {
  if (bytes.byteLength !== 393216)
    throw new RangeError('Photon scattering table must contain 393216 bytes');
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    rgba = new Uint16Array(32 * 64 * 32 * 4);
  for (let i = 0; i < rgba.length / 4; i++) {
    for (let c = 0; c < 3; c++)
      rgba[i * 4 + c] = input.getUint16((i * 3 + c) * 2, true);
    rgba[i * 4 + 3] = 0x3c00;
  }
  return rgba;
}
