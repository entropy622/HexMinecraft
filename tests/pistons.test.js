import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { axialToWorld, key, RECIPES, BLOCKS, DIRECTIONS } from '../src/core.js';
import { dropperOffset } from '../src/droppers.js';
import { pushPistonActors } from '../src/pistons.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';
import { bodyClear } from '../src/grounding.js';

// Input classes and failure modes were recorded before implementation in
// pistons-verification.md. World, scheduler, collisions and serializers are real.
function rig(facing = 0, type = 'piston') {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 3);
  const origin = [-1, facing === 6 ? 51 : 30, -1],
    d = dropperOffset(facing),
    at = (n) => origin.map((v, i) => v + d[i] * n),
    side = DIRECTIONS[facing < 6 ? (facing + 2) % 6 : 0],
    supply = [origin[0] + side[0], origin[1], origin[2] + side[1]];
  for (let n = -1; n <= 14; n++) if (at(n)[1] < 64) w.set(...at(n), null);
  w.set(...origin, type);
  w.setState(...origin, { facing, open: false, powered: false });
  w.set(...supply, 'lever');
  w.setState(...supply, {
    facing: 0,
    open: false,
    powered: false,
    mount: 'floor',
  });
  const power = (on) =>
    w.setState(...supply, { ...w.state(...supply), powered: on });
  const tick = (dt = 0) => w.redstone.tick(dt, []);
  const pulse = (on) => {
    power(on);
    tick();
    return tick(0.1);
  };
  return { w, origin, d, at, supply, power, tick, pulse };
}

test('a scheduled piston moves exactly twelve blocks in every hex/vertical direction and cannot partially move thirteen', () => {
  for (let facing = 0; facing < 8; facing++) {
    const { w, origin, at, pulse } = rig(facing);
    for (let n = 1; n <= 12; n++)
      w.set(...at(n), n === 12 ? 'goldBlock' : 'stone');
    pulse(true);
    assert.equal(w.state(...origin).open, true, `facing ${facing}`);
    assert.equal(w.get(...at(1)), 'pistonHead');
    assert.equal(w.get(...at(13)), 'goldBlock');
    assert.equal(
      Array.from({ length: 12 }, (_, n) => w.get(...at(n + 2))).filter(Boolean)
        .length,
      12,
    );
    pulse(false);
    assert.equal(w.get(...at(1)), undefined);
    assert.equal(w.get(...at(2)), 'stone');
    w.set(...at(1), 'diamondOre');
    const before = Array.from({ length: 14 }, (_, n) => w.get(...at(n)));
    pulse(true);
    assert.equal(w.state(...origin).open, false);
    assert.deepEqual(
      Array.from({ length: 14 }, (_, n) => w.get(...at(n))),
      before,
    );
  }
});

test('sticky retraction returns one actual partial block with orientation, while ordinary pistons leave their line', () => {
  const { w, at, pulse } = rig(0, 'stickyPiston');
  w.set(...at(1), 'stoneStairs');
  const state = { facing: 4, open: false, upper: true, axis: 2 };
  w.setState(...at(1), state);
  w.set(...at(2), 'diamondOre');
  pulse(true);
  assert.equal(w.get(...at(2)), 'stoneStairs');
  assert.equal(w.state(...at(2)).upper, true);
  pulse(false);
  assert.equal(w.get(...at(1)), 'stoneStairs');
  assert.equal(w.get(...at(2)), undefined);
  assert.equal(w.get(...at(3)), 'diamondOre');
  assert.equal(w.state(...at(1)).facing, 4);
  assert.equal(w.state(...at(1)).axis, 2);
  const p = axialToWorld(at(1)[0], at(1)[2]);
  assert.equal(w.groundAt(p.x, p.z, at(1)[1], at(1)[1] + 1), at(1)[1] + 1);
});

test('unbreakable blocks and live containers block the entire push; removing the obstruction retries held power', () => {
  for (const kind of [
    'obsidian',
    'bedrock',
    'portal',
    'endportal',
    'spawner',
    'chest',
    'furnace',
    'brewingStand',
    'campfire',
  ]) {
    const { w, at, tick, pulse, origin } = rig();
    w.set(...at(1), 'stone');
    w.set(...at(2), kind);
    if (BLOCKS[kind].storage)
      w.chests.set(key(...at(2)), [
        { item: 'diamond', count: 7 },
        ...Array(26).fill(null),
      ]);
    const chest = structuredClone([...w.chests]);
    pulse(true);
    assert.equal(w.state(...origin).open, false, kind);
    assert.equal(w.get(...at(1)), 'stone');
    assert.equal(w.get(...at(2)), kind);
    assert.deepEqual([...w.chests], chest);
    w.set(...at(2), null);
    tick();
    tick(0.1);
    assert.equal(w.state(...origin).open, true, kind);
  }
});

test('front-only power cannot actuate, held power never repeats, and weak short pulses cancel before movement', () => {
  const { w, at, origin, supply, power, tick, pulse } = rig();
  w.set(...supply, null);
  w.set(...at(1), 'lever');
  w.setState(...at(1), { facing: 0, open: false, powered: true });
  tick();
  tick(1);
  assert.equal(w.state(...origin).open, false);
  w.set(...at(1), 'stone');
  w.set(...supply, 'lever');
  w.setState(...supply, { facing: 0, open: false, powered: false });
  power(true);
  tick();
  tick(0.04);
  power(false);
  tick();
  tick(0.06);
  assert.equal(w.state(...origin).open, false);
  pulse(true);
  for (let n = 0; n < 20; n++) tick(0.1);
  assert.equal(w.get(...at(2)), 'stone');
  assert.equal(w.get(...at(3)), undefined);
});

test('breaking either half removes one pair, including an edited head across an unloaded chunk', () => {
  const a = rig();
  a.pulse(true);
  a.w.set(...a.at(1), null);
  assert.equal(a.w.get(...a.origin), undefined);
  const b = rig();
  b.pulse(true);
  b.w.set(...b.origin, null);
  assert.equal(b.w.get(...b.at(1)), undefined);
  const c = rig(0);
  c.pulse(true);
  const head = c.at(1),
    ck = `${Math.floor(head[0] / 8)},${Math.floor(head[2] / 8)}`;
  // Use the public streaming path, rather than deleting the chunks collection.
  c.w.ensureAround(80, 80);
  c.w.ensureAround(...[c.origin[0], c.origin[2]], 0);
  assert.equal(c.w.get(...c.origin), 'piston');
  assert.equal(c.w.loaded(head[0], head[2]), false);
  c.w.set(...c.origin, null);
  assert.equal(c.w.edits.get(key(...head)), null, ck);
});

test('fragile components drop once, portable boxes keep nested contents and liquids are displaced by the real block update', () => {
  const a = rig();
  a.w.set(...a.at(1), 'redstoneWire');
  const wire = a.pulse(true);
  assert.deepEqual(
    wire.broken.map((b) => b.stack),
    [{ item: 'redstone', count: 1 }],
  );
  const b = rig();
  b.w.set(...b.at(1), 'shulkerBox');
  const contents = [{ item: 'diamond', count: 9 }, ...Array(26).fill(null)];
  b.w.chests.set(key(...b.at(1)), contents);
  const box = b.pulse(true);
  assert.deepEqual(
    box.broken.map((b) => b.stack),
    [{ item: 'shulkerBox', count: 1, contents }],
  );
  assert.equal(b.w.chests.has(key(...b.at(1))), false);
  const c = rig();
  c.w.fluids.source(...c.at(1), 'water');
  c.pulse(true);
  assert.equal(c.w.fluids.get(...c.at(1)), undefined);
});

test('the real swept collision path lifts a standing actor and cannot push a body through a fixed wall', () => {
  const a = rig(7);
  a.w.set(...a.at(1), 'stone');
  const center = axialToWorld(a.origin[0], a.origin[2]),
    actor = {
      x: center.x,
      y: a.origin[1] + 2,
      z: center.z,
      radius: 0.24,
      height: 1.8,
    },
    movement = a.pulse(true);
  for (const motion of movement.motions) pushPistonActors(a.w, motion, [actor]);
  assert.ok(
    actor.y > a.origin[1] + 2.95 && actor.y < a.origin[1] + 3.1,
    actor.y,
  );
  assert.ok(!actor.crushed);
  assert.ok(
    bodyClear(
      a.w,
      actor.x,
      actor.z,
      actor.y + 0.005,
      actor.y + actor.height - 0.005,
      actor.radius,
    ),
  );
  const b = rig(),
    p = axialToWorld(b.at(2)[0], b.at(2)[2]);
  b.w.set(...b.at(1), 'stone');
  const body = {
    x: p.x,
    y: b.origin[1] + 0.02,
    z: p.z,
    radius: 0.24,
    height: 1.8,
  };
  b.w.set(b.at(3)[0], b.origin[1] + 1, b.at(3)[2], 'stone');
  const pushed = b.pulse(true);
  for (const motion of pushed.motions) pushPistonActors(b.w, motion, [body]);
  assert.equal(body.crushed, true);
  assert.ok(body.x < axialToWorld(b.at(3)[0], b.at(3)[2]).x);
  assert.equal(b.w.state(...b.origin).open, true);
});

test('actual crafting pays all nine ingredients and a pending or extended save resumes without duplicated movement', () => {
  for (const wood of ['planks', 'birchPlanks', 'sprucePlanks'])
    for (const cobble of ['cobble', 'cobbledDeepslate']) {
      const pack = new PlayerInventory(),
        grid = newCraftingGrid(),
        recipe = RECIPES.find((r) => r.id === 'piston');
      for (const [id, n] of [
        [wood, 3],
        [cobble, 4],
        ['ingot', 1],
        ['redstone', 1],
      ])
        pack.insert(id, n);
      assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
      assert.equal(
        quickCraft(pack, grid, RECIPES.indexOf(recipe), true, 1).count,
        1,
      );
      assert.equal(pack.count('piston'), 1);
      assert.equal(
        pack.count(cobble) +
          pack.count(wood) +
          pack.count('ingot') +
          pack.count('redstone'),
        0,
      );
    }
  const a = rig(7, 'stickyPiston');
  a.w.set(...a.at(1), 'stone');
  a.power(true);
  a.tick();
  a.tick(0.04);
  const pending = currentSave(a.w);
  validateSave(pending);
  const restored = new World(
    a.w.seed,
    a.w.dimension,
    pending.dimensions.overworld,
  );
  restored.redstone.tick(0.06, []);
  assert.equal(restored.state(...a.origin).open, true);
  const extended = currentSave(restored);
  validateSave(extended);
  const again = new World(
    a.w.seed,
    a.w.dimension,
    extended.dimensions.overworld,
  );
  again.redstone.tick(4, []);
  assert.equal(again.get(...a.at(2)), 'stone');
  assert.equal(again.get(...a.at(3)), undefined);
  const broken = structuredClone(extended);
  broken.dimensions.overworld.edits = broken.dimensions.overworld.edits.filter(
    ([k]) => k !== key(...a.at(1)),
  );
  broken.dimensions.overworld.blockStates =
    broken.dimensions.overworld.blockStates.filter(
      ([k]) => k !== key(...a.at(1)),
    );
  assert.throws(() => validateSave(broken));
  const wrongFacing = structuredClone(extended);
  wrongFacing.dimensions.overworld.blockStates.find(
    ([k]) => k === key(...a.at(1)),
  )[1].facing = 0;
  assert.throws(() => validateSave(wrongFacing));
});

test('scheduled movement freezes outside loaded chunks and resumes the same remaining delay after streaming back', () => {
  const a = rig();
  a.w.set(...a.at(1), 'stone');
  a.power(true);
  a.tick();
  a.tick(0.04);
  const timer = a.w.redstone.timers.get(key(...a.origin));
  a.w.ensureAround(80, 80);
  a.tick(10);
  assert.equal(a.w.redstone.timers.get(key(...a.origin)), timer);
  a.w.ensureAround(a.origin[0], a.origin[2]);
  a.tick(timer - 0.001);
  assert.equal(a.w.state(...a.origin).open, false);
  a.tick(0.001);
  assert.equal(a.w.state(...a.origin).open, true);
  assert.equal(a.w.get(...a.at(2)), 'stone');
});

test('a loaded piston refuses unloaded or height-overflow destinations without modifying its front', () => {
  const a = rig();
  a.w.set(...a.supply, null);
  const back = a.at(-1);
  a.w.set(...back, 'lever');
  a.w.setState(...back, { facing: 0, open: false, powered: true });
  a.w.ensureAround(a.origin[0], a.origin[2], 0);
  assert.equal(a.w.loaded(a.at(1)[0], a.at(1)[2]), false);
  a.tick();
  a.tick(0.1);
  assert.equal(a.w.state(...a.origin).powered, true);
  assert.equal(a.w.state(...a.origin).open, false);
  assert.equal(a.w.edits.get(key(...a.at(1))), null);
  const b = rig(7);
  b.w.set(...b.origin, null);
  b.w.set(-1, 63, -1, 'piston');
  b.w.setState(-1, 63, -1, { facing: 7, open: false });
  b.w.set(-2, 63, -1, 'lever');
  b.w.setState(-2, 63, -1, { facing: 0, open: false, powered: true });
  b.tick();
  b.tick(0.1);
  assert.equal(b.w.state(-1, 63, -1).open, false);
  assert.equal(b.w.edits.has('-1,64,-1'), false);
});

test('a growing chorus flower breaks through its real plant lifecycle instead of moving with orphaned growth data', () => {
  const a = rig();
  a.w.set(...a.at(1), 'chorusFlower');
  a.w.set(a.at(1)[0], a.at(1)[1] - 1, a.at(1)[2], 'endstone');
  a.w.chorus.set(key(...a.at(1)), { stage: 2, time: 7 });
  const result = a.pulse(true);
  assert.equal(a.w.get(...a.at(1)), 'pistonHead');
  assert.equal(a.w.get(...a.at(2)), undefined);
  assert.equal(a.w.chorus.size, 0);
  assert.deepEqual(
    result.broken.map((b) => b.stack),
    [{ item: 'chorusFlower', count: 1 }],
  );
  validateSave(currentSave(a.w));
});
