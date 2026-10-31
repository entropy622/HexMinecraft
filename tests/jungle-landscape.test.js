import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS, axialToWorld, worldToAxial, key } from '../src/core.js';
import { jungleForm, naturalTree } from '../src/jungle-landscape.js';
import { treeCells, megaTreeRoots } from '../src/tree-layout.js';
import { tickVines } from '../src/vines.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';
import { buildingMesh } from '../src/building-graphics.js';
import { DoubleSide, MeshLambertMaterial, Raycaster, Vector3 } from 'three';

const sites = {
  bush: [-160, 38],
  jungle: [-159, 36],
  giant: [-158, 54],
  'fancy-oak': [-150, 43],
  fallen: [-36, 55],
};
const terrain = (extra = {}) => ({
  seed: 624,
  maxY: 64,
  treeKind: () => 'jungle',
  terrainHeight: () => 12,
  biome: () => '丛林',
  treeGround: () => true,
  treeSpace: () => true,
  ...extra,
});

test('the ordered jungle selector produces bush, ordinary, giant, fancy oak and a fallen stump with the right decorations', () => {
  const w = new World(624, 'overworld', { load: false });
  for (const [form, [q, r]] of Object.entries(sites)) {
    assert.equal(jungleForm(q, r, 624), form);
    const t = w.naturalTree(q, r);
    assert.equal(t.form, form);
    assert.equal(t.cocoa, form === 'jungle');
    assert.equal(t.vines, form === 'jungle' || form === 'giant');
    if (form === 'bush') {
      assert.equal(t.cells.filter((c) => c[3] === 'jungleWood').length, 1);
      assert.ok(t.cells.some((c) => c[3] === 'leaves'));
      assert.equal(Math.max(...t.cells.map((c) => c[1])) - t.base, 2);
    }
    if (form === 'fancy-oak') {
      assert.equal(t.species, 'oak');
      assert.ok(t.cells.some((c) => c[3] === 'wood' && c[4]));
    }
    if (form === 'fallen') assert.ok(t.cells.some((c) => c[4]));
  }
});

test('a selected giant needs four compatible roots and room below the world ceiling without a single-tree fallback', () => {
  const [q, r] = sites.giant;
  assert.ok(naturalTree(terrain(), q, r).cells.length > 100);
  assert.equal(naturalTree(terrain({ maxY: 24 }), q, r), null);
  assert.equal(naturalTree(terrain({ treeGround: () => false }), q, r), null);
  assert.equal(naturalTree(terrain({ treeSpace: () => false }), q, r), null);
  assert.equal(
    naturalTree(terrain({ terrainHeight: (a) => (a === q ? 12 : 15) }), q, r),
    null,
  );
  assert.equal(
    naturalTree(terrain({ biome: (a) => (a === q ? '丛林' : '森林') }), q, r),
    null,
  );
  const gentle = naturalTree(
    terrain({ terrainHeight: (a) => (a === q ? 12 : 13) }),
    q,
    r,
  );
  assert.equal(gentle.base, 13);
  assert.equal(gentle.cells.filter((c) => c[3] === 'dirt').length, 4);
  const ruin = new World(624, 'overworld', { load: false });
  assert.equal(ruin.naturalTree(-54, -80), null);
  ruin.generateChunk(-7, 4);
  assert.equal(ruin.get(-56, 14, 32), undefined);
  assert.equal(ruin.get(-56, 14, 33), 'leaves');
  assert.equal(ruin.edits.size, 0);
});

test('natural giant roots, branches, vines and edits agree through all neighboring chunk orders and a real v16 reload', () => {
  const [q, r] = sites.giant,
    cq = Math.floor(q / 8),
    cr = Math.floor(r / 8),
    chunks = [];
  for (let a = cq - 2; a <= cq + 2; a++)
    for (let b = cr - 2; b <= cr + 2; b++) chunks.push([a, b]);
  const a = new World(624, 'overworld', { load: false }),
    b = new World(624, 'overworld', { load: false });
  chunks.forEach((p) => a.generateChunk(...p));
  chunks.toReversed().forEach((p) => b.generateChunk(...p));
  assert.deepEqual(b.blocks, a.blocks);
  assert.deepEqual(b.naturalStates, a.naturalStates);
  const t = a.naturalTree(q, r);
  for (const [x, , z] of megaTreeRoots(q, t.base, r, t.rotation)) {
    assert.equal(a.get(x, t.base, z), 'jungleWood');
    assert.equal(a.solid(x, t.base - 1, z), true);
  }
  assert.ok(a.vineCells.size > 0);
  assert.deepEqual(tickVines(a, 0).changed, []);
  const branch = t.cells.find(
    (c) =>
      c[4] &&
      a.get(...c.slice(0, 3)) === 'jungleWood' &&
      a.state(...c.slice(0, 3)).axis === c[4],
  );
  assert.ok(branch);
  a.set(q, t.base + 4, r, null);
  a.set(...branch.slice(0, 3), 'jungleWood');
  a.setState(...branch.slice(0, 3), {
    facing: 0,
    open: false,
    axis: branch[4],
  });
  tickVines(a, 0);
  const save = currentSave(a);
  validateSave(save);
  const restored = new World(624, 'overworld', {
    ...save.dimensions.overworld,
    load: false,
  });
  chunks.toReversed().forEach((p) => restored.generateChunk(...p));
  assert.equal(restored.get(q, t.base + 4, r), undefined);
  assert.equal(restored.state(...branch.slice(0, 3)).axis, branch[4]);
  assert.deepEqual(restored.blocks, a.blocks);
  assert.deepEqual(tickVines(restored, 0).changed, []);
});

test('fallen logs have a real horizontal axis and retain their stump when the fallen segment is obstructed', () => {
  const [q, r] = sites.fallen,
    ground = terrain(),
    normal = naturalTree(ground, q, r);
  assert.ok(normal.cells.length > 2);
  assert.equal(normal.cells[0][3], 'jungleWood');
  assert.ok(normal.cells.slice(1).every((c) => c[4] >= 1 && c[4] <= 3));
  const blocked = normal.cells[2];
  const t = naturalTree(
    terrain({
      terrainHeight: (a, c) => (a === blocked[0] && c === blocked[2] ? 13 : 12),
    }),
    q,
    r,
  );
  assert.deepEqual(t.cells, [[q, 12, r, 'jungleWood']]);
});

test('other biomes preserve their existing ordinary tree layouts', () => {
  for (const species of ['oak', 'birch', 'spruce', 'crimson']) {
    const w = terrain({ treeKind: () => species });
    assert.deepEqual(
      naturalTree(w, 20, -15).cells,
      treeCells(species, 20, 12, -15, 624),
    );
  }
});

test('vine walls and ceiling are real double-sided planes with correct hit cells and no unused saw attributes', () => {
  const textures = {
      uv: (_, u, v) => [u, v],
      biomes: { tint: () => [94, 190, 107, 2] },
      materials: { reflective: () => false },
    },
    material = new MeshLambertMaterial({ side: DoubleSide });
  material.userData.geometricShade = true;
  for (let side = 0; side < 7; side++) {
    const world = {
        dimension: 'overworld',
        get: () => 'vine',
        state: () => ({ facing: 0, faces: 1 << side }),
        surface: () => 1,
        biome: () => '森林',
      },
      mesh = buildingMesh(world, 0, 0, 0, { x: 0, z: 0 }, textures, material),
      geometry = mesh.geometry;
    assert.equal(geometry.attributes.position.count, side === 6 ? 12 : 6);
    assert.equal(geometry.attributes.sawNextUV, undefined);
    assert.equal(geometry.attributes.sawLastUV, undefined);
    const p = side < 6 ? axialToWorld(...DIRECTIONS[side]) : { x: 0, z: 0 },
      normal =
        side < 6
          ? new Vector3(-p.x / Math.sqrt(3), 0, -p.z / Math.sqrt(3))
          : new Vector3(0, -1, 0),
      centre =
        side < 6
          ? new Vector3(
              -normal.x * (Math.sqrt(3) / 2 - 1 / 32),
              0.5,
              -normal.z * (Math.sqrt(3) / 2 - 1 / 32),
            )
          : new Vector3(0, 1 - 1 / 32, 0),
      ray = new Raycaster(
        centre.clone().addScaledVector(normal, 2),
        normal.clone().negate(),
      );
    mesh.updateMatrixWorld();
    const hit = ray.intersectObject(mesh)[0];
    assert.ok(hit);
    assert.ok(hit.face.normal.dot(normal) > 0.999);
    const inside = hit.point.clone().addScaledVector(hit.face.normal, -0.003),
      cell = worldToAxial(inside.x, inside.z);
    assert.equal(key(cell.q, Math.floor(inside.y), cell.r), '0,0,0');
    geometry.dispose();
  }
  material.dispose();
});
