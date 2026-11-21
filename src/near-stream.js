import { VIEW_RADIUS } from './world.js';

export class NearStream {
  constructor(world, installed = () => {}) {
    this.installed = installed;
    this.world = world;
    this.wanted = new Set();
    this.loads = [];
    this.unloads = [];
    this.center = null;
    this.ready = null;
    this.busy = false;
  }
  move(q, r) {
    const x = Math.floor(q / 8),
      z = Math.floor(r / 8),
      center = x + ',' + z;
    const w = this.world,
      radius = VIEW_RADIUS + 1;
    if (this.center === center && w.streaming) return;
    const dx = Math.sign(x - (this.x ?? x)),
      dz = Math.sign(z - (this.z ?? z));
    this.x = x;
    this.z = z;
    this.center = center;
    this.wanted.clear();
    this.loads = [];
    w.streaming = true;
    w.center = center + ',' + radius;
    for (let i = -radius; i <= radius; i++)
      for (let j = -radius; j <= radius; j++) {
        const cq = x + i,
          cr = z + j,
          k = cq + ',' + cr;
        this.wanted.add(k);
        if (!w.chunks.has(k)) {
          if (Math.max(Math.abs(i), Math.abs(j)) <= 1) w.generateChunk(cq, cr);
          else
            this.loads.push({
              cq,
              cr,
              priority: i * i + j * j - 0.4 * (i * dx + j * dz),
            });
        }
      }
    this.loads.sort((a, b) => a.priority - b.priority);
    this.unloads = [...w.chunks.keys()].filter((k) => !this.wanted.has(k));
    this.request();
  }
  request() {
    if (this.busy || this.ready || !this.loads.length || this.failed) return;
    if (!this.worker) {
      this.worker = new Worker(new URL('./near-worker.js', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = ({ data }) => {
        this.busy = false;
        this.ready = data;
      };
      this.worker.onerror = () => {
        this.failed = true;
        this.busy = false;
        this.center = null;
        this.worker.terminate();
        this.worker = null;
      };
    }
    const { cq, cr } = this.loads.shift();
    this.busy = true;
    this.worker.postMessage({
      cq,
      cr,
      seed: this.world.seed,
      dimension: this.world.dimension,
      exclusions: [...this.world.villageExclusions],
    });
  }
  step() {
    const w = this.world,
      data = this.ready;
    if (data) {
      this.ready = null;
      const k = data.cq + ',' + data.cr;
      if (this.wanted.has(k) && !w.chunks.has(k)) {
        w.chunks.set(k, true);
        w.blockRevision++;
        w.lightRevision++;
        w.leafRevision++;
        for (const name of ['blocks', 'heights', 'naturalStates'])
          for (const [key, value] of data[name]) w[name].set(key, value);
        for (const name of ['buildings', 'spawners', 'chorusPending'])
          for (const key of data[name]) w[name].add(key);
        w.finishChunk(data.cq, data.cr);
        this.installed(data.cq, data.cr);
      }
      this.request();
      return true;
    }
    if (this.unloads.length) {
      const k = this.unloads.pop();
      if (!this.wanted.has(k) && w.chunks.has(k))
        w.unloadChunk(...k.split(',').map(Number));
      return true;
    }
    if (this.failed && this.loads.length) {
      const { cq, cr } = this.loads.shift();
      w.generateChunk(cq, cr);
      return true;
    }
    this.request();
    return false;
  }
  dispose() {
    this.worker?.terminate();
  }
}
