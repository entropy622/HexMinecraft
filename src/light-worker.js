import { VoxelLight } from './voxel-light.js';
import { DynamicLight } from './dynamic-light.js';
import { GLASS_TYPES } from './dye-data.js';
import { fluidHeight } from './fluids.js';
const tiles = new Map(),
  previous = new Map();
self.onmessage = ({ data }) => {
  if (!data.solve) {
    if (data.packet) tiles.set(data.k, data.packet);
    else tiles.delete(data.k);
    return;
  }
  const [cx, cz, radius] = data.center.split(',').map(Number);
  const coords = [...tiles]
    .map(([key, packet]) => [...key.split(',').map(Number), packet])
    .filter(
      ([x, z]) => Math.abs(x - cx) <= radius && Math.abs(z - cz) <= radius,
    );
  if (!coords.length) {
    self.postMessage({ empty: true });
    return;
  }
  const minQ = Math.min(...coords.map((c) => c[0])) * 8,
    minR = Math.min(...coords.map((c) => c[1])) * 8;
  const width = Math.max(...coords.map((c) => c[0])) * 8 + 8 - minQ,
    depth = Math.max(...coords.map((c) => c[1])) * 8 + 8 - minR;
  const size = width * depth * 64,
    glass = new Map();
  const world = {
    dimension: data.dimension,
    maxY: 64,
    get: (q, y, r) => glass.get(field.index(q, y, r)),
    fluids: {
      height: (q, y, r) => {
        const m = field.medium[field.index(q, y, r)];
        return m === 1 ? 1 : fluidHeight({ level: m - 2 });
      },
    },
  };
  const field = new VoxelLight(world),
    cost = new Uint8Array(size).fill(16),
    medium = new Uint8Array(size);
  Object.assign(field, {
    minQ,
    minR,
    width,
    depth,
    cost,
    medium,
    opticalTop: 0,
  });
  const emitters = [],
    leaves = [];
  for (const [cq, cr, packet] of coords)
    for (let col = 0; col < 64; col++) {
      const offset = field.index(cq * 8 + (col >> 3), 0, cr * 8 + (col & 7));
      for (let y = 0; y < 64; y++) {
        const value = packet[col * 64 + y],
          i = offset + y;
        cost[i] = value & 31 || 1;
        medium[i] = (value >> 5) & 15;
        if (value & (1 << 27)) leaves.push(i);
        if (value & (1 << 28))
          field.opticalTop = Math.max(field.opticalTop, y + 1);
        if (medium[i] === 14) glass.set(i, GLASS_TYPES[(value >> 21) & 31]);
        if ((value >> 9) & 4095)
          emitters.push([
            i,
            [(value >> 9) & 15, (value >> 13) & 15, (value >> 17) & 15],
          ]);
      }
    }
  field.finishTransport(emitters, leaves);
  field.baseRGB = field.rgb;
  field.heldSource = data.held;
  field.applyHeld();
  const texture = new DynamicLight();
  texture.upload(field);
  const { sky, baseRGB, rgb, leafAmbient, opticalTop } = field;
  const changed = new Set();
  for (const k of previous.keys()) if (!tiles.has(k)) previous.delete(k);
  for (const [cq, cr] of coords) {
    const k = cq + ',' + cr,
      old = previous.get(k) ?? new Uint32Array(4096);
    let dirty = !previous.has(k);
    previous.set(k, old);
    for (let col = 0; col < 64; col++) {
      const start = field.index(cq * 8 + (col >> 3), 0, cr * 8 + (col & 7));
      for (let h = 0; h < 64; h++) {
        const i = start + h,
          index = col * 64 + h,
          value =
            sky[i] |
            (rgb[0][i] << 4) |
            (rgb[1][i] << 8) |
            (rgb[2][i] << 12) |
            (leafAmbient[i] << 16);
        if (old[index] !== value) {
          old[index] = value;
          dirty = true;
        }
      }
    }
    if (dirty)
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) changed.add(cq + x + ',' + (cr + z));
  }
  self.postMessage(
    {
      changed: [...changed],
      field: {
        width,
        depth,
        minQ,
        minR,
        cost,
        medium,
        sky,
        baseRGB,
        rgb,
        leafAmbient,
        opticalTop,
      },
      revision: data.revision,
      packed: texture.data,
      min: texture.uniforms.glassBoundsMin.value.toArray(),
      max: texture.uniforms.glassBoundsMax.value.toArray(),
    },
    [
      ...new Set([
        cost.buffer,
        medium.buffer,
        sky.buffer,
        ...baseRGB.map((c) => c.buffer),
        ...rgb.map((c) => c.buffer),
        leafAmbient.buffer,
        texture.data.buffer,
      ]),
    ],
  );
};
