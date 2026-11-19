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
