import { World } from '../../src/world.js';
import { PlayerInventory } from '../../src/inventory.js';
import { newCraftingGrid } from '../../src/crafting.js';
import { newWorkstationItems } from '../../src/workstation-items.js';
import { Survival } from '../../src/survival.js';
import { Glider } from '../../src/glider.js';

// Parser fixtures use current production serializers, not a second v1/v3 schema.
export function currentSave(
  world = new World(624, 'overworld', { load: false }),
) {
  const pack = new PlayerInventory();
  pack.insert('wood', 7);
  return {
    version: 16,
    dimension: world.dimension,
    seed: world.seed,
    dimensions: {
      [world.dimension]: {
        ...world.serialize(),
        crouching: false,
        crawling: false,
        crops: [],
        drops: [],
        experienceOrbs: [],
        lastDeath: null,
      },
    },
    inventory: pack.serialize(),
    crafting: newCraftingGrid(),
    workstations: newWorkstationItems(),
    selected: 0,
    survival: new Survival().serialize(),
    flight: new Glider().serialize(),
    experience: { total: 0, seed: 624, fraction: 0 },
    creative: false,
    creativeFlying: false,
    position: [0, 13, 0],
    health: 18,
    hunger: 16,
    time: 204,
  };
}
