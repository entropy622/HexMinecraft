import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MeshLambertMaterial, Vector3 } from 'three';
import {
  unzipSync,
  zipSync,
  strToU8,
  strFromU8,
} from 'three/addons/libs/fflate.module.js';
import { readYsm, makeSkeleton, animator } from '../src/ysm-model.js';

const bytes = readFileSync(
  new URL('../public/models/pearl-dragon.zip', import.meta.url),
);
test('the distributable contains two native rigs, a skin and playable Bedrock clips', () => {
  const pack = readYsm(bytes);
  const rig = makeSkeleton(pack.geometry, new MeshLambertMaterial()),
    arm = makeSkeleton(pack.arm);
  for (const n of [
    'RightArm',
    'LeftArm',
    'RightHandLocator',
    'LeftHandLocator',
  ])
    assert.ok(arm.getObjectByName(n));
  const animation = animator(rig, pack.animations);
  const wing = rig.getObjectByName('LeftWing'),
    base = wing.rotation.y;
  animation.play('idle', 1);
  assert.notEqual(wing.rotation.y, base);
  animation.reset();
  assert.equal(wing.rotation.y, base);
  animation.play('walk', 0.2);
  assert.ok(
    rig.getObjectByName('RightLeg').rotation.x *
      rig.getObjectByName('LeftLeg').rotation.x <
      0,
  );
  animation.reset();
  animation.play('swing_hand', 0.12);
  assert.ok(rig.getObjectByName('RightArm').rotation.x < -1);
  animation.reset();
  animation.play('sneak', 0);
  assert.equal(rig.getObjectByName('AllBody').position.y, 11);
  const eye = rig.getObjectByName('Blink');
  animation.reset();
  const z = eye.position.z;
  animation.play('idle', 3.87);
  assert.ok(eye.position.z > z);
  const files = unzipSync(bytes),
    m = JSON.parse(strFromU8(files['ysm.json']));
  for (const p of Object.values(m.files.player.animation))
    assert.equal(JSON.parse(strFromU8(files[p])).format_version, '1.8.0');
});
test('authored expressions move in front of the face for the right action and return under the skin', () => {
  const pack = readYsm(bytes),
    rig = makeSkeleton(pack.geometry);
  const ctl = animator(rig, pack.animations);
  for (const [clip, name] of [
    ['gui', 'CuriousEyes'],
    ['swing_hand', 'IntentEyes'],
    ['attacked', 'WideEyes'],
  ]) {
    const card = rig.getObjectByName(name),
      z = card.position.z;
    ctl.play(clip, 0.12);
    assert.ok(card.position.z - z > 0.08);
    for (const other of ['CuriousEyes', 'IntentEyes', 'WideEyes'].filter(
      (n) => n !== name,
    ))
      assert.equal(rig.getObjectByName(other).position.z, z);
    ctl.reset();
    assert.equal(card.position.z, z);
  }
});
test('the cheek carries curved vertices; standard Bedrock still has a textured face without the contour file', () => {
  const pack = readYsm(bytes);
  const cheek = pack.geometry.bones.find((b) => b.name === 'IntentEyes');
  assert.ok(
    cheek.cubes.some((c) =>
      c.surfaceCut.some(
        ([u, v, z, x]) => Math.abs(z) > 1e-5 && Math.abs(x) > 0.001,
      ),
    ),
  );
  const mesh = makeSkeleton({
    ...pack.geometry,
    bones: [{ ...cheek, parent: undefined }],
  }).getObjectByName(cheek.name).children[0];
  const expected = cheek.cubes.reduce(
    (count, c) => count + c.surfaceCut.length,
    0,
  );
  assert.equal(mesh.geometry.attributes.position.count, expected);
  const files = unzipSync(bytes);
  const m = JSON.parse(strFromU8(files['ysm.json']));
  delete files[m.hexwild.surface_cuts];
  delete m.hexwild;
  files['ysm.json'] = strToU8(JSON.stringify(m));
  const native = readYsm(zipSync(files)).geometry;
  assert.ok(
    !native.bones.find((b) => b.name === cheek.name).cubes[0].surfaceCut,
  );
  assert.ok(
    makeSkeleton(native).getObjectByName(cheek.name).children[0].geometry
      .attributes.uv.count,
  );
});
test('a rotated cube follows its own pivot before the parent joint', () => {
  const g = {
    description: { texture_width: 16, texture_height: 16 },
    bones: [
      { name: 'Root', pivot: [2, 0, 0], rotation: [0, 0, 90] },
      {
        name: 'Joint',
        parent: 'Root',
        pivot: [3, 0, 0],
        cubes: [
          {
            origin: [3, 0, 0],
            size: [2, 2, 2],
            pivot: [3, 0, 0],
            rotation: [0, 0, 90],
            uv: [0, 0],
          },
        ],
      },
    ],
  };
  const root = makeSkeleton(g);
  root.updateMatrixWorld(true);
  const mesh = root.getObjectByName('Joint').children[0];
  mesh.geometry.computeBoundingBox();
  const center = mesh.localToWorld(
    mesh.geometry.boundingBox.getCenter(new Vector3()),
  );
  assert.ok(center.distanceTo(new Vector3(1, -2, -1)) < 1e-6);
});
test('nested packages load; ambiguous manifests, broken hierarchies and encrypted files fail cleanly', () => {
  const files = unzipSync(bytes);
  assert.equal(
    readYsm(
      zipSync(
        Object.fromEntries(
          Object.entries(files).map(([k, v]) => ['custom/dragon/' + k, v]),
        ),
      ),
    ).name,
    '六野 · 白龙娘',
  );
  assert.throws(
    () => readYsm(zipSync({ ...files, 'other/ysm.json': files['ysm.json'] })),
    /一份/,
  );
  assert.throws(() => readYsm(strToU8('YSM')), /未加密/);
  const g = {
    ...readYsm(bytes).geometry,
    bones: [
      { name: 'a', parent: 'b' },
      { name: 'b', parent: 'a' },
    ],
  };
  assert.throws(() => makeSkeleton(g), /层级/);
});

test('the HY playable pack uses native surfaces, real wing and tail joints and two working grip chains', () => {
  const data = readYsm(
    readFileSync(
      new URL('../public/models/pearl-dragon-hy.zip', import.meta.url),
    ),
  );
  const g = data.geometry,
    rig = makeSkeleton(g),
    arm = makeSkeleton(data.arm);
  assert.equal(g.description.identifier, 'geometry.pearl_hy.main');
  assert.deepEqual(
    g.bones
      .filter((b) => b.name.endsWith('Wing'))
      .map((b) => b.name)
      .sort(),
    ['LeftWing', 'RightWing'],
  );
  let triangles = 0;
  rig.traverse((n) => {
    if (n.isMesh) triangles += n.geometry.index.count / 3;
  });
  // The source-fitted hero retains the actual fringe, cuffs and scaled tail.
  // Bound the submitted mesh, including eye variants, independently of the studio floor.
  let vertices = 0,
    draws = 0;
  rig.traverse((o) => {
    if (o.isMesh) {
      draws++;
      vertices += o.geometry.attributes.position.count;
    }
  });
  assert.ok(triangles > 0 && triangles <= 16000, 'native hero triangle budget');
  assert.ok(
    vertices <= 32000 && draws <= 32,
    'compact vertex and batch budget',
  );
  const w = g.description.texture_width,
    h = g.description.texture_height;
  for (const b of g.bones)
    for (const c of b.cubes || [])
      for (const {
        uv: [x, y],
        uv_size: [du, dv],
      } of Object.values(c.uv)) {
        assert.ok(x >= 0 && y >= 0 && x + du <= w && y + dv <= h);
        assert.ok(!c.surfaceCut);
      }
  for (const [name, clip] of Object.entries(data.animations)) {
    for (const bone of Object.keys(clip.bones || {}))
      assert.ok(rig.getObjectByName(bone), name + ' / ' + bone);
  }
  for (const side of ['Left', 'Right']) {
    assert.equal(
      arm.getObjectByName(side + 'HandLocator').parent.name,
      side + 'ForeArm',
    );
    assert.equal(
      arm.getObjectByName(side + 'ForeArm').parent.name,
      side + 'Arm',
    );
  }
  const ctl = animator(rig, data.animations);
  const tail = rig.getObjectByName('Tail6');
  assert.equal(tail.parent.name, 'Tail5');
  ctl.play('idle', 1.1);
  assert.notEqual(tail.rotation.y, 0);
  ctl.reset();
  ctl.play('walk', 0.2);
  assert.ok(
    rig.getObjectByName('LeftLeg').rotation.x *
      rig.getObjectByName('RightLeg').rotation.x <
      0,
  );
  ctl.reset();
  ctl.play('swing_hand', 0.12);
  assert.ok(rig.getObjectByName('RightArm').rotation.x < -1.4);
});

test('batched north faces match the box path across rotations, inflated dimensions and signed UVs', () => {
  const desc = { texture_width: 32, texture_height: 48 };
  const face = { uv: [9, 12], uv_size: [-4, 8] };
  const cube = {
    origin: [-2, 3, 5],
    size: [3, 4, 0.02],
    pivot: [1, -2, 3],
    rotation: [23, 43, -82],
    uv: { north: face },
  };
  const rig = (cubes) =>
    makeSkeleton({
      description: desc,
      bones: [{ name: 'Head', pivot: [1, 3, 7], inflate: 0.12, cubes }],
    }).getObjectByName('Head').children[0].geometry;
  const batch = rig([cube, cube]);
  const box = rig([{ ...cube, uv: { north: face, west: { uv: [0, 0] } } }]);
  assert.equal(batch.attributes.position.count, 8);
  // In Three's BoxGeometry the four vertices of north start at index 16.
  for (const key of ['position', 'normal', 'uv']) {
    const a = batch.attributes[key],
      b = box.attributes[key],
      size = a.itemSize;
    for (let i = 0; i < 4 * size; i++) {
      assert.ok(Math.abs(a.array[i] - b.array[16 * size + i]) < 2e-6, key);
      assert.equal(a.array[i], a.array[4 * size + i]);
    }
  }
});
