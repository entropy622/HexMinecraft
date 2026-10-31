// CPU source data only. Retaining a tile never retains a mesh, material or GPU
// target; the display rebuilds against the current resource-pack layout.
export class DistantCache {
  constructor(maxEntries, maxBytes) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.entries = new Map();
    this.bytes = 0;
  }
  get size() {
    return this.entries.size;
  }
  delete(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(id);
  }
  put(data) {
    this.delete(data.id);
    const buffers = new Set(
      Object.values(data.tile)
        .filter(ArrayBuffer.isView)
        .map((v) => v.buffer),
    );
    const bytes = [...buffers].reduce((sum, b) => sum + b.byteLength, 0);
    if (bytes > this.maxBytes || this.maxEntries <= 0) return;
    this.entries.set(data.id, {
      bytes,
      data: {
        id: data.id,
        epoch: data.epoch,
        generation: data.generation,
        tile: data.tile,
      },
    });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)
      this.delete(this.entries.keys().next().value);
  }
  take(id, generation) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    this.delete(id);
    return entry.data.generation === generation ? entry.data : null;
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
