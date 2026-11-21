import { World } from './world.js';

// Only return natural terrain. Apply current player edits, simulation state and
// fluid changes on the owning thread at install time, including edits in flight.
self.onmessage = ({ data: { seed, dimension, cq, cr, exclusions } }) => {
  const w = new World(seed, dimension, {
    load: false,
    villageExclusions: exclusions,
  });
  w.generateChunk(cq, cr, true);
  self.postMessage({
    cq,
    cr,
    blocks: w.blocks,
    heights: w.heights,
    naturalStates: w.naturalStates,
    buildings: w.buildings,
    spawners: w.spawners,
    chorusPending: w.chorusPending,
  });
};
