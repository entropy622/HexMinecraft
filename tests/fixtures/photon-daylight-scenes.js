import { referenceSave } from './photon-reference-scenes.js';
import { validateSave } from '../../src/save.js';

// A separate daylight reference, not a replacement for the historical dawn
// camera. Moderate sun elevation and visible sky match the supplied target's
// viewing conditions, without changing the game lighting or terrain.
export const daylightScenes = [
  { id: 'daylight-forest', eye: [-120, 24.5, 4], look: [-98, 29, -1] },
  { id: 'daylight-sky', eye: [-120, 24.5, 4], look: [-98, 51, -1] },
];
export function daylightSave() {
  const save = referenceSave(daylightScenes[0]);
  save.time = 70;
  validateSave(save);
  return save;
}
