import { World } from '../../src/world.js';
import { axialToWorld } from '../../src/core.js';
import { currentSave } from './current-save.js';
import { validateSave } from '../../src/save.js';

export function wetGallery() {
  const world = new World(624, 'overworld', { load: false });
  for (let q = -1; q <= 0; q++)
    for (let r = -1; r <= 0; r++) world.generateChunk(q, r);
  for (let q = -7; q <= 7; q++)
    for (let r = -6; r <= 6; r++)
      for (let y = 48; y <= 55; y++) {
        let type = null;
        if (y === 48)
          type =
            q < -2 ? 'stone' : q < 1 ? 'dirt' : q < 4 ? 'planks' : 'ironBlock';
        if (r === -6 && y > 48 && y < 53) type = 'crimsonwood';
        if (q <= -3 && r >= 3 && y === 52) type = 'planks';
        world.set(q, y, r, type);
      }
  const save = currentSave(world),
    eye = axialToWorld(1, 9),
    look = axialToWorld(0, -1);
  save.time = 120;
  save.creative = save.creativeFlying = true;
  save.position = [eye.x, 54.5, eye.z];
  save.yaw = Math.atan2(-(look.x - eye.x), -(look.z - eye.z));
  save.pitch = Math.atan2(
    49 - save.position[1],
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
