export const DISTANT_TILE = 32;
export const DISTANT_STEP = 4;
export const DISTANT_SAMPLES = DISTANT_TILE / DISTANT_STEP + 2;
export const DISTANT_TREE_STEP = 2;
// The field keeps four source columns on both sides of the rendered core.
export const DISTANT_INSET = DISTANT_STEP;
export const DISTANT_TREE_SAMPLES =
  (DISTANT_SAMPLES * DISTANT_STEP) / DISTANT_TREE_STEP;
export const DISTANT_RADIUS = 6;
export const DISTANT_CACHE_TILES = (2 * DISTANT_RADIUS + 1) ** 2;
export const DISTANT_CACHE_BYTES = 10 * 1024 * 1024;
// One tile of reserve covers normal walking while the next row is generated.
export const DISTANT_FOG_FAR = (DISTANT_RADIUS - 1) * DISTANT_TILE * 1.5 - 2;
export const DISTANT_FOG_NEAR = DISTANT_FOG_FAR * 0.74;
export const DISTANT_CAMERA_FAR = 480;
