import { World } from '../../src/world.js';
import { axialToWorld } from '../../src/core.js';
import { currentSave } from './current-save.js';
import { validateSave } from '../../src/save.js';

export function reflectionAirGallery() {
  const world = new World(624, 'overworld', { load: false });
  for (let q = -2; q <= 1; q++)
    for (let r = -2; r <= 1; r++) world.generateChunk(q, r);
  for (let q = -10; q <= 10; q++)
    for (let r = -8; r <= 8; r++)
      for (let y = 8; y < 64; y++) {
        let type = y === 8 ? (q < 0 ? 'ironBlock' : 'stone') : null;
        if (r === -6 && y > 8 && y <= 17) type = q < 0 ? 'redWool' : 'blueWool';
        if (world.get(q, y, r) !== type) world.set(q, y, r, type);
      }
  const save = currentSave(world),
    eye = axialToWorld(0, 6),
    look = axialToWorld(0, -1);
  save.creative = save.creativeFlying = true;
  save.time = 30;
  save.position = [eye.x, 12.5, eye.z];
  save.yaw = Math.atan2(-(look.x - eye.x), -(look.z - eye.z));
  save.pitch = Math.atan2(
    9 - save.position[1],
    Math.hypot(look.x - eye.x, look.z - eye.z),
  );
  save.weather = {
    kind: 'clear',
    remaining: 180,
    sequence: 0,
    rain: 0,
    storm: 0,
    wetness: 1,
  };
  validateSave(save);
  return save;
}
