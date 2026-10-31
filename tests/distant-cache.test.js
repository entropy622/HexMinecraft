import test from 'node:test';
import assert from 'node:assert/strict';
import { DistantCache } from '../src/distant-cache.js';
import { DistantField, DISTANT_TYPES } from '../src/distant-field.js';

const entry = (id, generation = 0, bytes = 16) => ({
  id,
  epoch: 1,
  generation,
  tile: { details: new Uint8Array(bytes) },
});

test('returning data follows recency while retired geometry is never retained', () => {
  const cache = new DistantCache(2, 64),
    a = entry('a'),
    b = entry('b'),
    c = entry('c');
  cache.put({ ...a, mesh: { geometry: { gpu: 'owned by the renderer' } } });
  cache.put(b);
  const returned = cache.take('a', 0);
  assert.equal(returned.tile, a.tile);
  assert.equal('mesh' in returned, false);
  cache.put(returned);
  cache.put(c);
  assert.equal(cache.take('b', 0), null);
  assert.equal(cache.take('a', 0).tile, a.tile);
  assert.equal(cache.take('c', 0).tile, c.tile);
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
});

test('the byte limit counts shared backing buffers once and rejects an oversized replacement', () => {
  const cache = new DistantCache(10, 32),
    buffer = new ArrayBuffer(24);
  cache.put({
    id: 'shared',
    generation: 0,
    tile: { a: new Uint8Array(buffer, 0, 8), b: new Uint8Array(buffer, 8, 8) },
  });
  assert.equal(cache.bytes, 24);
  cache.put(entry('small', 0, 16));
  assert.equal(cache.take('shared', 0), null);
  assert.equal(cache.bytes, 16);
  cache.put(entry('small', 1, 33));
  assert.equal(cache.size, 0);
  cache.put(entry('clear', 0, 24));
  cache.clear();
  assert.equal(cache.bytes, 0);
  assert.equal(cache.take('clear', 0), null);
});

test('an edited real tile cannot be restored under its old generation', () => {
  const field = new DistantField({ seed: 624, edits: [['5,60,5', 'wood']] }),
    cache = new DistantCache(2, 1024 * 1024);
  cache.put({ id: '0,0', generation: 0, tile: field.tile(0, 0) });
  field.patch([{ key: '5,60,5', edit: 'stone' }]);
  assert.equal(cache.take('0,0', 1), null);
  cache.put({ id: '0,0', generation: 1, tile: field.tile(0, 0) });
  const restored = cache.take('0,0', 1).tile;
  assert.equal(DISTANT_TYPES[restored.types[11]], 'stone');
  assert.equal(restored.heights[11], 61);
});
