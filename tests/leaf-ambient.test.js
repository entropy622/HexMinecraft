import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint8BufferAttribute,
  Mesh,
} from 'three';
import { LeafAmbient } from '../src/leaf-ambient.js';
import { VoxelLight } from '../src/voxel-light.js';
import { World } from '../src/world.js';
import { axialToWorld } from '../src/core.js';

function field() {
  return {
    minQ: -4,
    minR: -4,
    width: 9,
    depth: 9,
    cost: new Uint8Array(9 * 9 * 64).fill(1),
    medium: new Uint8Array(9 * 9 * 64),
    index(q, y, r) {
      if (
        q < this.minQ ||
        q >= this.minQ + this.width ||
        r < this.minR ||
        r >= this.minR + this.depth ||
        y < 0 ||
        y >= 64
      )
        return -1;
      return ((q - this.minQ) * this.depth + r - this.minR) * 64 + y;
    },
  };
}

// Independent fine ray march. Cell selection minimizes distance to candidate
// hex centers rather than using the production cube-rounding or face exits.
function oracle(f, root) {
  const origin = axialToWorld(root[0], root[2]),
    ds = 0.0002;
  let visible = 0;
  for (let azimuth = 0; azimuth < 6; azimuth++)
    for (const y of [-Math.SQRT1_2, 0, Math.SQRT1_2]) {
      const direction = [
        Math.cos((azimuth * Math.PI) / 3) * Math.sqrt(1 - y * y),
        y,
        Math.sin((azimuth * Math.PI) / 3) * Math.sqrt(1 - y * y),
      ];
      let start = null,
        tau = 0,
        blocked = false;
      for (let t = ds * 0.5; t < 6; t += ds) {
        const x = origin.x + direction[0] * t,
          y = Math.floor(root[1] + 0.5 + direction[1] * t),
          z = origin.z + direction[2] * t;
        let q,
          r,
          best = Infinity;
        for (let dq = -3; dq <= 3; dq++)
          for (let dr = -3; dr <= 3; dr++) {
            const p = axialToWorld(root[0] + dq, root[2] + dr),
              distance = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (distance < best) {
              best = distance;
              q = root[0] + dq;
              r = root[2] + dr;
            }
          }
        if (start === null) {
          if (q === root[0] && y === root[1] && r === root[2]) continue;
          start = t;
        }
        if (t - start >= 2 || y >= 64) break;
        const i = f.index(q, y, r);
        if (i < 0 || f.cost[i] >= 16 || f.medium[i] === 13) {
          blocked = true;
          break;
        }
        if (f.medium[i] === 12) tau += 1.3 * ds;
      }
      visible += blocked ? 0 : Math.exp(-tau);
    }
  return Math.round((255 * visible) / 18);
}

test('local leaf transmission follows occupied length, walls and openings', () => {
  const f = field(),
    a = new LeafAmbient(),
    root = f.index(0, 32, 0);
  f.medium[root] = 12;
  f.cost[root] = 3;
  a.update(f, [root]);
  assert.equal(a.values[root], 255);
  f.cost = f.cost.slice().fill(3);
  f.medium = f.medium.slice().fill(12);
  a.update(f, [root]);
  assert.equal(a.values[root], Math.round(255 * Math.exp(-1.3 * 2)));
  f.cost = f.cost.slice().fill(16);
  f.cost[root] = 3;
  a.update(f, [root]);
  assert.equal(a.values[root], 0);
  f.cost = f.cost.slice();
  for (let q = -1; q <= 1; q++)
    for (let r = -1; r <= 1; r++)
      for (let y = 33; y <= 36; y++) f.cost[f.index(q, y, r)] = 1;
  a.update(f, [root]);
  assert.ok(a.values[root] > 0 && a.values[root] < 255);
  assert.ok(Math.abs(a.values[root] - oracle(f, [0, 32, 0])) <= 1);
});

test('exact prism segments agree with fine ray marching at translated cells and world limits', () => {
  for (const position of [
    [0, 32, 0],
    [-3, 35, -2],
    [4, 32, 4],
    [0, 63, 0],
    [0, 0, 0],
  ]) {
    const f = field(),
      a = new LeafAmbient(),
      root = f.index(...position);
    for (let q = -4; q <= 4; q++)
      for (let r = -4; r <= 4; r++)
        for (let y = 0; y < 64; y++) {
          const i = f.index(q, y, r),
            h = Math.abs(q * 97 + r * 37 + y * 13) % 11;
          f.cost[i] = h === 0 ? 16 : h === 1 ? 2 : h < 7 ? 3 : 1;
          f.medium[i] = h === 1 ? 13 : h < 7 && h > 1 ? 12 : 0;
        }
    f.cost[root] = 3;
    f.medium[root] = 12;
    a.update(f, [root]);
    const expected = oracle(f, position);
    assert.ok(
      Math.abs(a.values[root] - expected) <= 1,
      `${position}: ${a.values[root]}, oracle ${expected}`,
    );
  }
});

test('static geometry cache ignores emitter RGB but detects topology, roots and streamed bounds', () => {
  const world = new World(624, 'overworld', { load: false });
  world.generateChunk(0, 0);
  world.set(3, 45, 3, 'leaves');
  world.set(4, 45, 3, 'redstoneLamp');
  const light = new VoxelLight(world);
  light.update(0, true);
  const values = light.leafAmbient,
    cells = light.leafAmbientCells,
    version = light.leafAmbientVersion;
  world.setState(4, 45, 3, { powered: true });
  assert.equal(light.update(1), true);
  assert.equal(light.leafAmbient, values);
  assert.equal(light.leafAmbientCells, cells);
  assert.equal(light.leafAmbientVersion, version);
  const p = axialToWorld(3, 3);
  light.setHeld('torch', { ...p, y: 44 });
  light.update(1);
  assert.equal(light.leafAmbient, values);
  assert.equal(light.leafAmbientVersion, version);
  world.set(4, 45, 3, null);
  light.update(1);
  assert.ok(light.leafAmbientVersion > version);
  assert.ok(
    light.leafAmbient[light.index(3, 45, 3)] > values[light.index(3, 45, 3)],
  );
  const opened = light.leafAmbientVersion;
  world.set(3, 45, 3, 'jungleLeaves');
  light.update(0, true);
  assert.equal(light.leafAmbientVersion, opened);
  world.set(3, 45, 3, null);
  light.update(1);
  assert.ok(light.leafAmbientVersion > opened);
  const removed = light.leafAmbientVersion;
  world.generateChunk(-1, 0);
  light.update(1);
  assert.ok(light.leafAmbientVersion > removed);
});

test('normalized geometry bytes use leaf cell ranges and skip uploads on held-light updates', () => {
  const world = new World(624, 'overworld', { load: false });
  world.generateChunk(0, 0);
  world.set(3, 45, 3, 'leaves');
  world.set(0, 45, 0, 'leaves');
  const light = new VoxelLight(world),
    g = new BufferGeometry();
  light.update(0, true);
  g.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 45, 0, 1, 45, 0, 0, 46, 0, 0, 45, 0, 1, 45, 0, 0, 46, 0],
      3,
    ),
  );
  g.computeVertexNormals();
  g.setAttribute(
    'skylight',
    new Float32BufferAttribute(new Float32Array(6), 1),
  );
  g.setAttribute(
    'leafAmbient',
    new Uint8BufferAttribute(new Uint8Array(6), 1, true),
  );
  g.userData.leafRanges = new Int32Array([3, 45, 3, 0, 3, 0, 45, 0, 3, 6]);
  const mesh = new Mesh(g);
  light.relight(mesh);
  const attr = g.attributes.leafAmbient;
  assert.equal(attr.array[0], light.leafAmbient[light.index(3, 45, 3)]);
  assert.equal(attr.array[3], light.leafAmbient[light.index(0, 45, 0)]);
  assert.equal(attr.getX(0), attr.array[0] / 255);
  assert.ok(attr.array[0] > attr.array[3]);
  const version = attr.version;
  const p = axialToWorld(3, 3);
  light.setHeld('torch', { ...p, y: 44 });
  light.update(1);
  light.relight(mesh);
  assert.equal(attr.version, version);
  assert.equal(g.userData.leafAmbientVersion, light.leafAmbientVersion);
  assert.ok(!Object.values(g.userData).includes(light.leafAmbient));
  g.dispose();
  mesh.material.dispose();
});
