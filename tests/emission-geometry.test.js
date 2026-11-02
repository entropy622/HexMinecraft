import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshLambertMaterial, Raycaster, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { World } from '../src/world.js';
import { buildingMesh, shapeCellAtTriangle } from '../src/building-graphics.js';
import { BLOCKS, axialToWorld } from '../src/core.js';
import { AMETHYST_STAGES } from '../src/amethyst-data.js';

test('actual partial meshes reserve emission for berries and rod shafts while all crystal stages carry their source class', () => {
  const world = new World(624, 'overworld', { load: false });
  world.generateChunk(0, 0);
  const material = new MeshLambertMaterial();
  material.userData.geometricShade = true;
  const classes = (type) => {
    world.set(3, 50, 3, type);
    const mesh = buildingMesh(
      world,
      3,
      50,
      3,
      { x: 0, z: 0 },
      { uv: (_name, u, v) => [u, v] },
      material,
    );
    const result = new Set(mesh.geometry.attributes.surfaceOptics.array);
    assert.equal(
      mesh.geometry.attributes.surfaceOptics.count,
      mesh.geometry.attributes.position.count,
    );
    assert.ok(
      mesh.geometry.attributes.ambientOcclusion.array.every(
        (value) => value === 1,
      ),
    );
    if (type === 'endRod')
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
        if (mesh.geometry.attributes.surfaceOptics.getX(i) === 33) {
          assert.ok(mesh.geometry.attributes.uv.getX(i) >= 0.5);
          assert.ok(mesh.geometry.attributes.uv.getX(i) <= 0.625);
        }
    mesh.geometry.dispose();
    return [...result].sort((a, b) => a - b);
  };
  assert.deepEqual(classes('endRod'), [0, 33]);
  assert.deepEqual(classes('caveVinesBerries'), [0, 37]);
  assert.deepEqual(classes('caveVines'), [0]);
  for (const type of AMETHYST_STAGES) assert.deepEqual(classes(type), [55]);
  material.dispose();
});

test('ray hits on merged partial geometry resolve the owning cell and empty geometry remains safe', () => {
  const world = new World(624, 'overworld', { load: false });
  world.generateChunk(0, 0);
  const type = Object.keys(BLOCKS).find((id) => BLOCKS[id].shape === 'slab'),
    material = new MeshLambertMaterial();
  material.userData.geometricShade = true;
  const cells = [
      [0, 40, 0],
      [7, 40, 0],
    ],
    geometries = [],
    ranges = [];
  let start = 0;
  for (const cell of cells) {
    world.set(...cell, type);
    const mesh = buildingMesh(
      world,
      ...cell,
      { x: 0, z: 0 },
      { uv: (_n, u, v) => [u, v] },
      material,
    );
    const count = mesh.geometry.attributes.position.count;
    ranges.push(...cell, start, start + count);
    start += count;
    geometries.push(mesh.geometry);
  }
  const geometry = mergeGeometries(geometries),
    batch = new Mesh(geometry, material);
  geometry.userData.shapeRanges = new Int32Array(ranges);
  batch.updateMatrixWorld();
  for (const [q, y, r] of cells) {
    const p = axialToWorld(q, r),
      ray = new Raycaster(new Vector3(p.x, y + 3, p.z), new Vector3(0, -1, 0)),
      hit = ray.intersectObject(batch)[0];
    assert.ok(hit);
    assert.deepEqual(shapeCellAtTriangle(geometry, hit.faceIndex), { q, y, r });
  }
  geometry.userData.leafRanges = geometry.userData.shapeRanges;
  delete geometry.userData.shapeRanges;
  assert.deepEqual(shapeCellAtTriangle(geometry, 0), { q: 0, y: 40, r: 0 });
  assert.equal(shapeCellAtTriangle(geometry, -1), null);
  assert.equal(shapeCellAtTriangle(geometry, 1e9), null);
  const empty = buildingMesh(
    world,
    3,
    60,
    3,
    { x: 0, z: 0 },
    { uv: (_n, u, v) => [u, v] },
    material,
  );
  assert.equal(empty.geometry.attributes.position.count, 0);
  empty.geometry.dispose();
  geometry.dispose();
  geometries.forEach((g) => g.dispose());
  material.dispose();
});
