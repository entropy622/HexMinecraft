export const DISTANT_TILE = 32;
export const DISTANT_STEP = 4;
export const DISTANT_SAMPLES = DISTANT_TILE / DISTANT_STEP + 2;
export const DISTANT_DETAIL_STEP = 2;
// The field keeps four source columns on both sides of the rendered core.
export const DISTANT_INSET = DISTANT_STEP;
export const DISTANT_DETAIL_SAMPLES =
  (DISTANT_SAMPLES * DISTANT_STEP) / DISTANT_DETAIL_STEP;
export const DISTANT_RADIUS = 6;
export const DISTANT_CACHE_TILES = (2 * DISTANT_RADIUS + 1) ** 2;
export const DISTANT_CACHE_BYTES = 10 * 1024 * 1024;
// One tile of reserve covers normal walking while the next row is generated.
export const DISTANT_FOG_FAR = (DISTANT_RADIUS - 1) * DISTANT_TILE * 1.5 - 2;
export const DISTANT_FOG_NEAR = DISTANT_FOG_FAR * 0.74;
export const DISTANT_CAMERA_FAR = 480;

// Bounds of the rendered hex prisms projected onto the two unit axial normals.
// Each outermost ground centre lies (tile-step)/2 cells from the tile centre,
// and a radius-step corner can extend by another full step on either axis.
const centre = DISTANT_INSET + (DISTANT_TILE - 1) * 0.5;
const halfWidth =
  1.5 * (DISTANT_TILE - DISTANT_STEP) * 0.5 + DISTANT_STEP + 0.01;
export function inDistantBand(tq, tr, eye, near, detailFar, far) {
  const q = Math.abs(
    1.5 * (tq * DISTANT_TILE + centre) -
      (Math.sqrt(3) * 0.5 * eye.x - 0.5 * eye.z),
  );
  const r = Math.abs(1.5 * (tr * DISTANT_TILE + centre) - eye.z);
  // Both the cubic norm and horizontal distance exceed either projected axis.
  if (Math.max(q, r) - halfWidth >= far) return false;
  // At high altitude the shader also fades downwards; keep its inner tiles.
  if (eye.y + 16 > detailFar) return true;
  return (q + halfWidth) ** 3 + (r + halfWidth) ** 3 >= near ** 3;
}
