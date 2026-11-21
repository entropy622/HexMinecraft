import { DistantField } from './distant-field.js';

import { World } from './world.js';
import { BiomeColors } from './biome-colors.js';
import { distantMesh } from './distant-mesh.js';

let field, epoch, world, textures;
function configure({ bounds, colors }) {
  const biomes = new BiomeColors({});
  biomes.byBiome = colors;
  textures = {
    biomes,
    materials: bounds,
    uv(name, u, v) {
      const [x, y, right, top] = bounds.get(name);
      return [x + u * (right - x), y + v * (top - y)];
    },
  };
}
function meshPacket(tile) {
  const mesh = distantMesh(tile, textures, world, null),
    g = mesh.geometry;
  const attributes = Object.entries(g.attributes).map(([name, a]) => [
    name,
    a.array,
    a.itemSize,
    a.normalized,
  ]);
  return {
    attributes,
    index: g.index.array,
    groups: g.groups,
    position: mesh.position.toArray(),
    center: g.boundingSphere.center.toArray(),
    radius: g.boundingSphere.radius,
  };
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      epoch = data.epoch;
      field = new DistantField(data.snapshot);
      world = new World(data.snapshot.seed, data.snapshot.dimension, {
        load: false,
      });
      if (data.atlas) configure(data.atlas);
      self.postMessage({ type: 'ready', epoch });
    } else if (data.epoch === epoch && data.type === 'atlas') {
      configure(data.atlas);
    } else if (data.epoch === epoch && data.type === 'patch') {
      field.patch(data.cells);
    } else if (data.epoch === epoch && data.type === 'tile') {
      const start = performance.now(),
        tile = data.cached ?? field.tile(data.tq, data.tr),
        mesh = textures ? meshPacket(tile) : null;
      self.postMessage(
        {
          type: 'tile',
          epoch,
          id: data.id,
          generation: data.generation,
          tile,
          mesh,
          atlasVersion: data.atlasVersion,
          duration: performance.now() - start,
        },
        [
          ...(mesh
            ? [mesh.index.buffer, ...mesh.attributes.map((a) => a[1].buffer)]
            : []),
          tile.heights.buffer,
          tile.types.buffer,
          tile.offsets.buffer,
          tile.groundHeights.buffer,
          tile.groundTypes.buffer,
          tile.groundOffsets.buffer,
          tile.details.buffer,
          tile.detailMeta.buffer,
          tile.fineDetails.buffer,
          tile.skyRuns.buffer,
        ],
      );
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      epoch,
      id: data.id,
      error: String(error.stack || error),
    });
  }
};
