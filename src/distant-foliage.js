import { addSurfaceFeature } from './surface-program.js';
import { distantLeafSurfaceFeature } from './surface-foliage.js';
// The coarse field has no complete local optical volume. Its material module
// uses far-shadow response and actual cached ambient visibility.
export function applyDistantFoliage(material, uniforms) {
  if (!addSurfaceFeature(material, distantLeafSurfaceFeature(uniforms)))
    throw Error('Distant foliage requires an owned surface program');
}
