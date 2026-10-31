export const FULL_DETAIL = 127;

// A sparse exception stores one cell index and its span/axis in 32 bits. The
// current 20*20*64 field fits the upper 16 bits; ordinary full cells need none.
export function encodeDetail(bottom, top, axis = 0) {
  return (
    ((axis & 3) << 14) |
    (Math.round(Math.max(0, Math.min(1, bottom)) * 127) << 7) |
    Math.round(Math.max(0, Math.min(1, top)) * 127)
  );
}
export function decodeDetail(value = FULL_DETAIL) {
  return {
    bottom: ((value >> 7) & 127) / 127,
    top: (value & 127) / 127,
    axis: value >>> 14,
  };
}
export function detailMetadata(tile) {
  return new Map(
    Array.from(tile.detailMeta || [], (value) => [
      value >>> 16,
      decodeDetail(value & 65535),
    ]),
  );
}
