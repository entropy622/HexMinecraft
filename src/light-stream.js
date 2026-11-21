import { BLOCKS, hash } from './core.js';
import { blockLight, EMISSION } from './light-data.js';

// Each packet is one 8×8×64 optical tile. The worker keeps unchanged packets;
// player edits are never transferred by detaching a live world buffer.
export function opticalPacket(world, k) {
  const [cq, cr] = k.split(',').map(Number),
    packet = new Uint32Array(4096);
  const dense = world.columns.get(k);
  for (let i = 0; i < 4096; i++) {
    const type = dense[i];
    if (!type) continue;
    const y = i % 64,
      q = cq * 8 + (i >> 9),
      r = cr * 8 + ((i >> 6) & 7);
    const data = blockLight(world, q, y, r, type);
    packet[i] |= data | (1 << 28);
    if (
      (BLOCKS[type].foliage && !BLOCKS[type].nonSolid) ||
      BLOCKS[type].shape === 'flower'
    )
      packet[i] |= 1 << 27;
    if ((data & 31) === 16 && y < 63 && !dense[i + 1] && hash(q, 71, r) > 0.65)
      packet[i + 1] |= 1 << 27;
  }
  for (const [cell, fluid] of world.fluids.chunks.get(k) || []) {
    const [q, y, r] = cell.split(',').map(Number),
      i = ((q & 7) * 8 + (r & 7)) * 64 + y;
    const old = packet[i];
    if ((old & 31) === 16) continue;
    const water = fluid.type === 'water',
      m = water
        ? world.fluids.height(q, y, r) === 1
          ? 1
          : 2 + fluid.level
        : fluid.type === 'lava'
          ? 10
          : 11;
    let value = (old & ~511) | (water ? 2 : 1) | (m << 5) | (1 << 28);
    if (EMISSION[fluid.type])
      for (let c = 0; c < 3; c++) {
        const shift = 9 + 4 * c;
        value =
          (value & ~(15 << shift)) |
          (Math.max((old >> shift) & 15, EMISSION[fluid.type][c]) << shift);
      }
    packet[i] = value;
  }
  return packet;
}
export class LightStream {
  constructor(field, install) {
    this.field = field;
    this.install = install;
    this.world = field.world;
    this.dirty = this.world.opticalChanges = new Set(this.world.chunks.keys());
    this.worker = new Worker(new URL('./light-worker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = ({ data }) => {
      this.ready = data;
      this.busy = false;
    };
    this.worker.onerror = () => {
      this.failed = true;
      field.dirty = true;
      this.dispose();
    };
    this.lastRevision = field.revision;
    this.next = 0;
    this.batch = null;
    this.changes = this.world.opticalRevisions = new Map();
  }
  step() {
    if (this.failed) return false;
    const w = this.world,
      f = this.field;
    if (this.ready) {
      const ready = this.ready;
      this.ready = null;
      if (ready.empty) {
        this.lastRevision = -1;
        return true;
      }
      const { field, packed, min, max, revision } = ready;
      Object.assign(f, field);
      f.leafAmbientVersion++;
      f.revision = revision;
      for (const [k, changed] of this.changes)
        if (changed <= revision) this.changes.delete(k);
      this.install(f, packed, min, max, ready.changed);
      return true;
    }
    if (this.busy || performance.now() < this.next || !w.center) return false;
    if (!this.batch) {
      if (
        !this.dirty.size &&
        this.lastRevision === w.lightRevision &&
        !f.dirty &&
        !f.heldDirty
      )
        return false;
      this.batch = [...this.dirty];
      this.dirty.clear();
      this.lastRevision = w.lightRevision;
    }
    if (this.batch.length) {
      const k = this.batch.pop();
      const packet = w.columns.has(k) ? opticalPacket(w, k) : null;
      this.worker.postMessage({ k, packet }, packet ? [packet.buffer] : []);
      return true;
    }
    this.batch = null;
    f.dirty = f.heldDirty = false;
    this.busy = true;
    this.next = performance.now() + 250;
    this.worker.postMessage({
      solve: true,
      revision: this.lastRevision,
      center: w.center,
      dimension: w.dimension,
      held: f.heldSource,
    });
    return true;
  }
  dispose() {
    this.worker.terminate();
    this.world.opticalChanges = null;
    this.world.opticalRevisions = null;
  }
}
