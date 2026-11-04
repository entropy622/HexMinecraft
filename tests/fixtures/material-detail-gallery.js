import { World } from '../../src/world.js';
import { axialToWorld } from '../../src/core.js';
import { currentSave } from './current-save.js';
import { validateSave } from '../../src/save.js';

export function materialDetailGallery() {
  const world = new World(624, 'overworld', { load: false });
  for (let q = -1; q <= 0; q++)
    for (let r = -1; r <= 0; r++) world.generateChunk(q, r);
  for (let q = -10; q <= 10; q++)
    for (let r = -8; r <= 9; r++)
      for (let y = 47; y <= 53; y++)
        world.set(q, y, r, y === 47 ? 'smoothStone' : null);
  const samples = [
    ['stone', 'cobble', 'brick', 'calcite'],
    ['wood', 'birchWood', 'planks', 'sprucePlanks'],
    ['dirt', 'gravel', 'ironOre', 'copperOre'],
  ];
  samples.forEach((row, z) =>
    row.forEach((id, x) => {
      const q = -7 + x * 4,
        r = -5 + z * 4;
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++)
          for (let y = 48; y < 50; y++) world.set(q + a, y, r + b, id);
    }),
  );
  const save = currentSave(world),
    eye = axialToWorld(0, 17),
    look = axialToWorld(0, -1);
  save.time = 70;
  save.creative = save.creativeFlying = true;
  save.position = [eye.x, 62, eye.z];
  save.yaw = Math.atan2(-(look.x - eye.x), -(look.z - eye.z));
  save.pitch = Math.atan2(
    48.5 - save.position[1],
    Math.hypot(look.x - eye.x, look.z - eye.z),
  );
  save.weather = {
    kind: 'clear',
    remaining: 3600,
    sequence: 0,
    rain: 0,
    storm: 0,
    wetness: 0,
  };
  validateSave(save);
  return save;
}
