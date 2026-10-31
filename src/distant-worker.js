import { DistantField } from './distant-field.js';

let field, epoch;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      epoch = data.epoch;
      field = new DistantField(data.snapshot);
      self.postMessage({ type: 'ready', epoch });
    } else if (data.epoch === epoch && data.type === 'patch') {
      field.patch(data.cells);
    } else if (data.epoch === epoch && data.type === 'tile') {
      const start = performance.now(),
        tile = field.tile(data.tq, data.tr);
      self.postMessage(
        {
          type: 'tile',
          epoch,
          id: data.id,
          generation: data.generation,
          tile,
          duration: performance.now() - start,
        },
        [
          tile.heights.buffer,
          tile.types.buffer,
          tile.offsets.buffer,
          tile.groundHeights.buffer,
          tile.groundTypes.buffer,
          tile.groundOffsets.buffer,
          tile.details.buffer,
          tile.detailMeta.buffer,
          tile.fineDetails.buffer,
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
