import { World } from '../../src/world.js';
import { axialToWorld, hexDistance, key } from '../../src/core.js';
import { newFurnace } from '../../src/furnaces.js';
import { PlayerInventory } from '../../src/inventory.js';
import { currentSave } from './current-save.js';
import { validateSave } from '../../src/save.js';

// A deliberately constructed lighting gallery, never reported as natural terrain.
export function emissionGallery() {
  const world = new World(624, 'overworld', { load: false });
  for (let q = -1; q <= 0; q++)
    for (let r = -1; r <= 0; r++) world.generateChunk(q, r);
  for (let q = -7; q <= 7; q++)
    for (let r = -7; r <= 7; r++) {
      const distance = hexDistance(q, r);
      if (distance > 7) continue;
      for (let y = 39; y <= 46; y++)
        world.set(
          q,
          y,
          r,
          y === 39 ? 'calcite' : y === 46 || distance === 7 ? 'stone' : null,
        );
    }
  const models = [
    { type: 'glowstone', cell: [-4, 40, 0], look: [-4, 40.5, 0] },
    { type: 'lantern', cell: [-2, 40, 0], look: [-2, 40.5, 0] },
    { type: 'torch', cell: [0, 40, 0], look: [0, 40.65, 0] },
    { type: 'amethystCluster', cell: [2, 40, 0], look: [2, 40.2, 0] },
    { type: 'endRod', cell: [4, 40, -1], look: [4, 40.5, -1] },
    { type: 'caveVinesBerries', cell: [-2, 42, -3], look: [-2, 42.3, -3] },
    { type: 'furnace', cell: [0, 40, -3], look: [0, 40.5, -3] },
    { type: 'redstoneLamp', cell: [2, 40, -3], look: [2, 40.5, -3] },
  ];
  for (const model of models) world.set(...model.cell, model.type);
  world.set(2, 39, 0, 'buddingAmethyst');
  world.set(-2, 43, -3, 'stone');
  world.set(3, 40, -3, 'lever');
  world.setState(3, 40, -3, { facing: 0, open: false, powered: true });
  world.setState(2, 40, -3, { facing: 0, open: false, powered: true });
  world.setState(0, 40, -3, { facing: 1, open: false });
  world.furnaces.set(key(0, 40, -3), {
    ...newFurnace(),
    input: { item: 'rawIron', count: 8 },
    burn: 40,
    burnTotal: 80,
  });
  const save = currentSave(world),
    position = axialToWorld(0, 4),
    target = axialToWorld(0, -1);
  save.inventory = new PlayerInventory().serialize();
  save.time = 430;
  save.health = save.hunger = 20;
  save.position = [position.x, 41.65, position.z];
  save.yaw = Math.atan2(-(target.x - position.x), -(target.z - position.z));
  save.pitch = Math.atan2(
    40.7 - save.position[1],
    Math.hypot(target.x - position.x, target.z - position.z),
  );
  validateSave(save);
  return { save, models };
}
