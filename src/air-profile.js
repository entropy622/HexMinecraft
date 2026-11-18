// Host world units. Photon measures its falloff starts above the sea surface
// and specifies half-lives for exp2. The analytic column kernel uses exp.
import { OVERWORLD_SEA_LEVEL } from './world-scale.js';
export const overworldAir = {
  mieBase: OVERWORLD_SEA_LEVEL + 7,
  mieFalloff: Math.LN2 / 7,
  rayleighBase: OVERWORLD_SEA_LEVEL + 30,
  rayleighFalloff: Math.LN2 / 30,
};
