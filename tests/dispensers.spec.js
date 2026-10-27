import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 900, height: 650 });
});
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const data = await page
    .evaluate(() => {
      const g = window.__hexwild;
      g.save();
      const t = g.state.target;
      return {
        target: t && { q: t.q, y: t.y, r: t.r, type: t.type },
        save: JSON.parse(localStorage.getItem('hexwild-save-v16')),
      };
    })
    .catch((e) => ({ error: e.message }));
  await writeFile(
    info.outputPath('failure-state.json'),
    JSON.stringify(data, null, 2),
  );
});
async function use(page) {
  await page.evaluate(() => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
}
async function aim(page, q, y, r, type) {
  await page.evaluate((p) => window.__hexwild.lookAt(...p), [q, y, r]);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const t = window.__hexwild.state.target;
          return t && [t.q || 0, t.y, t.r || 0, t.type];
        }),
      { timeout: 15000 },
    )
    .toEqual([q, Math.floor(y), r, type]);
}
async function snapshot(page) {
  return page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
}
async function waitGame(page, seconds) {
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(
      () =>
        page.evaluate((start) => window.__hexwild.state.time - start, start),
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(seconds);
}
async function platform(page, creative = false) {
  await page.goto('/');
  await page.locator(creative ? '#creative' : '#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -7; q <= 7; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(-3, 40, 0);
  });
}
async function fill(page, item) {
  const s = await snapshot(page),
    index = s.inventory.slots.findIndex((slot) => slot?.item === item);
  expect(index).toBeGreaterThanOrEqual(0);
  await page
    .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
    .click({ modifiers: ['Shift'] });
}

async function machine(page, stack, facing = 0) {
  await page.evaluate(
    ({ stack, facing }) => {
      const g = window.__hexwild,
        w = g.state.world;
      w.set(0, 40, 0, 'dispenser');
      w.setState(0, 40, 0, { facing, open: false, powered: false });
      w.chests.set('0,40,0', [structuredClone(stack), ...Array(8).fill(null)]);
      w.set(0, 40, 1, 'stone');
      w.set(0, 41, 1, 'lever');
      w.setState(0, 41, 1, {
        facing: 0,
        mount: 'floor',
        open: false,
        powered: false,
      });
      g.graphics.updateCells([
        [0, 40, 0],
        [0, 40, 1],
        [0, 41, 1],
      ]);
      g.teleport(0, 40, 2);
    },
    { stack, facing },
  );
}
async function pulse(page) {
  await aim(page, 0, 41.07, 1, 'lever');
  if (
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 41, 1).powered,
    )
  ) {
    await use(page);
    await waitGame(page, 0.12);
  }
  await aim(page, 0, 41.07, 1, 'lever');
  await use(page);
  await waitGame(page, 0.35);
}
async function stock(page, stack) {
  await page.evaluate((stack) => {
    window.__hexwild.state.world.chests.set('0,40,0', [
      stack,
      ...Array(8).fill(null),
    ]);
  }, stack);
}
async function sourceSlots(page) {
  return page.evaluate(() =>
    structuredClone(window.__hexwild.state.world.chests.get('0,40,0')),
  );
}
async function load(page, saved) {
  saved.time += 1;
  await page.locator('#save-file').setInputFiles({
    name: 'dispenser-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator('#toast')).toHaveText('存档已载入。');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time), {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(saved.time);
}

test('player crafts and places a nine-slot dispenser whose pulse shoots a harmful tipped arrow without repeating', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(-2, 40, 0, 'workbench');
    g.graphics.updateCells([[-2, 40, 0]]);
    for (const [id, n] of [
      ['cobble', 7],
      ['redstone', 1],
      ['bow', 1],
    ])
      g.give(id, n);
  });
  await aim(page, -2, 40.5, 0, 'workbench');
  await use(page);
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.locator('#recipe-search').fill('发射器');
  const recipe = page.locator('[data-recipe]').filter({ hasText: '发射器' });
  await expect(recipe).toBeVisible();
  await recipe.click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  for (const [id, n] of [
    ['dispenser', 1],
    ['cobble', 0],
    ['redstone', 0],
    ['bow', 0],
  ])
    expect(
      await page.evaluate(
        (id) => window.__hexwild.state.inventory[id] || 0,
        id,
      ),
    ).toBe(n);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-2, 40, 0, null);
    w.set(0, 40, 0, 'stone');
    g.graphics.updateCells([
      [-2, 40, 0],
      [0, 40, 0],
    ]);
    g.selectItem('dispenser');
  });
  await aim(page, 0, 40.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 0)),
    )
    .toBe('dispenser');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(-1, 40, 0).facing,
    ),
  ).toBe(3);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-1, 40, -1, 'lever');
    w.setState(-1, 40, -1, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: false,
    });
    g.graphics.updateCells([[-1, 40, -1]]);
    g.give('slownessArrow', 2);
  });
  await aim(page, -1, 40.5, 0, 'dispenser');
  await use(page);
  await expect(page.locator('[data-inv-slot^="box:"]')).toHaveCount(9);
  await fill(page, 'slownessArrow');
  await page.screenshot({ path: info.outputPath('dispenser-inventory.png') });
  await page.keyboard.press('Escape');
  await aim(page, -1, 40.07, -1, 'lever');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health), {
      timeout: 20000,
    })
    .toBeLessThan(20);
  const hit = await snapshot(page);
  expect(hit.survival.effects.slowness.time).toBeGreaterThan(28);
  await waitGame(page, 1);
  const held = await snapshot(page),
    source = held.dimensions.overworld.chests.find(([k]) => k === '-1,40,0')[1];
  expect(source.filter(Boolean)).toEqual([{ item: 'slownessArrow', count: 1 }]);
  expect(
    held.dimensions.overworld.drops.filter((d) => d.item === 'slownessArrow'),
  ).toEqual([]);
  await aim(page, -1, 40.5, 0, 'dispenser');
  await page.screenshot({ path: info.outputPath('dispenser-arrow-trap.png') });
  await writeFile(
    info.outputPath('arrow-trap.json'),
    JSON.stringify(
      {
        health: hit.health,
        effect: hit.survival.effects.slowness,
        source,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('bucket cycles, bottle collection and full-container overflow conserve real liquids and inventory', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, { item: 'waterBucket', count: 1 });
  await pulse(page);
  expect((await sourceSlots(page))[0]).toEqual({ item: 'bucket', count: 1 });
  expect(
    await page.evaluate(() =>
      window.__hexwild.state.world.fluids.get(1, 40, 0),
    ),
  ).toMatchObject({ type: 'water', source: true });
  await stock(page, { item: 'glassBottle', count: 2 });
  await pulse(page);
  expect((await sourceSlots(page)).filter(Boolean)).toEqual([
    { item: 'glassBottle', count: 1 },
    { item: 'waterBottle', count: 1 },
  ]);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(1, 40, 0)?.source,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    window.dispenserRandom = Math.random;
    Math.random = () => 0;
    w.chests.set('0,40,0', [
      { item: 'bucket', count: 2 },
      ...Array.from({ length: 8 }, () => ({ item: 'stone', count: 64 })),
    ]);
  });
  await pulse(page);
  const overflow = await snapshot(page);
  await page.evaluate(() => {
    Math.random = window.dispenserRandom;
  });
  expect((await sourceSlots(page))[0]).toEqual({ item: 'bucket', count: 1 });
  expect(
    overflow.dimensions.overworld.drops
      .filter((d) => d.item === 'waterBucket')
      .reduce((n, d) => n + d.count, 0),
  ).toBe(1);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(1, 40, 0)?.source || false,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(0, 40, 0) || null,
    ),
  ).toBeNull();
  // Powder snow uses the same real bucket replacement transaction.
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(3, 40, 0, 'dispenser');
    w.setState(3, 40, 0, { facing: 7, open: false, powered: false });
    w.chests.set('3,40,0', [
      { item: 'powderSnowBucket', count: 1 },
      ...Array(8).fill(null),
    ]);
    w.set(3, 40, 1, 'stone');
    w.set(3, 41, 1, 'lever');
    w.setState(3, 41, 1, {
      facing: 0,
      mount: 'floor',
      open: false,
      powered: false,
    });
    g.graphics.updateCells([
      [3, 40, 0],
      [3, 40, 1],
      [3, 41, 1],
    ]);
    g.teleport(3, 40, 2);
  });
  await aim(page, 3, 41.07, 1, 'lever');
  await use(page);
  await waitGame(page, 0.35);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(3, 41, 0) || null,
    ),
  ).toBe('powderSnow');
  await use(page);
  await waitGame(page, 0.12);
  await aim(page, 3, 41.07, 1, 'lever');
  await use(page);
  await waitGame(page, 0.35);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(3, 41, 0) || null,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.chests.get('3,40,0')[0],
    ),
  ).toEqual({ item: 'powderSnowBucket', count: 1 });
  await writeFile(
    info.outputPath('liquid-conservation.json'),
    JSON.stringify({ overflow, final: await snapshot(page) }, null, 2),
  );
});

test('ordinary pearls and blocked buckets eject beside a chest instead of inserting or teleporting the player', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, { item: 'pearl', count: 2 });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(1, 40, 0, 'chest');
    w.chests.set('1,40,0', Array(27).fill(null));
    g.graphics.updateCells([[1, 40, 0]]);
  });
  const before = await snapshot(page);
  await pulse(page);
  expect((await sourceSlots(page))[0]).toEqual({
    item: 'pearl',
    count: 1,
  });
  expect(
    await page.evaluate(() =>
      window.__hexwild.state.world.chests.get('1,40,0').some(Boolean),
    ),
  ).toBe(false);
  const pearl = await snapshot(page);
  expect(
    Math.hypot(
      pearl.position[0] - before.position[0],
      pearl.position[2] - before.position[2],
    ),
  ).toBeLessThan(0.01);
  expect(pearl.health).toBe(before.health);
  expect(pearl.dimensions.overworld.drops.some((d) => d.item === 'pearl')).toBe(
    true,
  );
  await stock(page, { item: 'waterBucket', count: 1 });
  await pulse(page);
  expect((await sourceSlots(page)).filter(Boolean)).toEqual([]);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(1, 40, 0) || null,
    ),
  ).toBeNull();
  await page.evaluate(() => window.__hexwild.teleport(0, 41, 0));
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.inventory.waterBucket || 0),
      { timeout: 20000 },
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      window.__hexwild.state.world.chests.get('1,40,0').some(Boolean),
    ),
  ).toBe(false);
  await page.screenshot({ path: info.outputPath('blocked-outlet.png') });
});

test('bonemeal targets the actual crop above soil and igniters wear only after relighting a campfire', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, { item: 'boneMeal', count: 2 });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(1, 39, 0, 'farmland');
    w.set(2, 39, 0, null);
    w.fluids.source(2, 39, 0, 'water');
    g.state.crops.set('1,39,0', { kind: 'wheat', age: 0 });
    g.graphics.crop('1,39,0', g.state.crops.get('1,39,0'));
    g.graphics.updateCells([
      [1, 39, 0],
      [2, 39, 0],
    ]);
  });
  await pulse(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.crops.get('1,39,0').age),
  ).toBe(90);
  expect((await sourceSlots(page))[0].count).toBe(1);
  await pulse(page);
  expect((await sourceSlots(page))[0].count).toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    g.state.crops.delete('1,39,0');
    g.graphics.removeCrop('1,39,0');
    w.set(1, 40, 0, 'campfire');
    w.campfires.set('1,40,0', { lit: false, slots: Array(6).fill(null) });
    g.graphics.updateCells([[1, 40, 0]]);
  });
  await stock(page, {
    item: 'flintAndSteel',
    count: 1,
    wear: { value: 2, enchant: {}, name: '自动点火器' },
  });
  await pulse(page);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.campfires.get('1,40,0').lit,
    ),
  ).toBe(true);
  expect((await sourceSlots(page))[0].wear).toEqual({
    value: 1,
    enchant: {},
    name: '自动点火器',
  });
  await pulse(page);
  expect((await sourceSlots(page))[0].wear.value).toBe(1);
  await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    w.campfires.get('1,40,0').lit = false;
    w.lightRevision++;
  });
  await pulse(page);
  expect((await sourceSlots(page))[0]).toBeNull();
  await page.screenshot({
    path: info.outputPath('automated-farm-and-fire.png'),
  });
});

test('armor equips only an empty slot with intact metadata and a packed shulker box places its real contents', async ({
  page,
}, info) => {
  await platform(page);
  await machine(
    page,
    {
      item: 'ironChest',
      count: 1,
      wear: { value: 120, enchant: { protection: 1 }, name: '机关护甲' },
    },
    3,
  );
  await page.evaluate(() => window.__hexwild.teleport(-1, 40, 0));
  // The lever remains reachable from the target cell, so player input supplies the pulse.
  await pulse(page);
  const equipped = await snapshot(page);
  expect(equipped.inventory.gear[1]).toEqual({
    item: 'ironChest',
    count: 1,
    wear: { value: 120, enchant: { protection: 1 }, name: '机关护甲' },
  });
  await stock(page, { item: 'ironChest', count: 1, wear: 100 });
  await pulse(page);
  expect((await snapshot(page)).inventory.gear[1]).toEqual(
    equipped.inventory.gear[1],
  );
  await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    w.setState(0, 40, 0, { ...w.state(0, 40, 0), facing: 0 });
    window.__hexwild.teleport(0, 40, 2);
  });
  const contents = Array(27).fill(null);
  contents[4] = { item: 'diamond', count: 3 };
  await stock(page, { item: 'shulkerBox', count: 1, contents });
  await pulse(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(1, 40, 0)),
  ).toBe('shulkerBox');
  expect(
    await page.evaluate(() =>
      window.__hexwild.state.world.chests.get('1,40,0'),
    ),
  ).toEqual(contents);
  await stock(page, { item: 'shulkerBox', count: 1, contents });
  await pulse(page);
  expect((await sourceSlots(page))[0].contents).toEqual(contents);
  await page.evaluate(() => window.__hexwild.teleport(2, 40, 1));
  await aim(page, 1, 40.5, 0, 'shulkerBox');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  await expect(page.locator('[data-inv-slot="box:4"]')).toContainText('3');
  await page.screenshot({
    path: info.outputPath('dispensed-shulker-contents.png'),
  });
});

test('a pending upward pulse resumes once through native continue and held power does not repeat', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, { item: 'stone', count: 2 }, 7);
  await aim(page, 0, 41.07, 1, 'lever');
  await page.evaluate(async () => {
    const g = window.__hexwild;
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
    // A zero-time call to the real scheduler captures the pending edge even
    // when a slow software-rendered frame would span the whole 0.2 s delay.
    g.state.world.redstone.tick(0, []);
    g.setPlaying(false);
    g.save();
  });
  const pending = await snapshot(page);
  expect(
    pending.dimensions.overworld.redstoneTimers.find(
      ([k]) => k === '0,40,0',
    )[1],
  ).toBeGreaterThan(0);
  await page.reload();
  await page.locator('#continue').click();
  await expect
    .poll(async () => (await sourceSlots(page))[0]?.count || 0, {
      timeout: 20000,
    })
    .toBe(1);
  await waitGame(page, 1);
  expect((await sourceSlots(page))[0].count).toBe(1);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 40, 0).facing,
    ),
  ).toBe(7);
  await writeFile(
    info.outputPath('pending-continue.json'),
    JSON.stringify({ pending, continued: await snapshot(page) }, null, 2),
  );
});

test('a shield blocks the real dispenser arrow and preserves the paid arrow for recovery', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, { item: 'slownessArrow', count: 1 }, 3);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('shield', 1);
    g.selectItem('shield');
    g.teleport(-2, 40, 0);
    window.dispenserShieldSeen = false;
    const observe = () => {
      if (g.graphics.shieldImpact > 0) window.dispenserShieldSeen = true;
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await aim(page, 0, 41.07, 1, 'lever');
  await page.evaluate(() => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
    document
      .querySelector('#world')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true }),
      );
    window.__hexwild.lookAt(0, 40.5, 0);
  });
  await waitGame(page, 2);
  const saved = await snapshot(page);
  expect(await page.evaluate(() => window.dispenserShieldSeen)).toBe(true);
  expect(saved.health).toBe(20);
  expect(saved.survival.effects.slowness).toBeUndefined();
  expect(
    saved.inventory.slots.find((s) => s?.item === 'shield').wear,
  ).toBeLessThan(336);
  await page.keyboard.up('KeyR');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.state.inventory.slownessArrow || 0,
        ),
      { timeout: 20000 },
    )
    .toBe(1);
  expect((await sourceSlots(page)).filter(Boolean)).toEqual([]);
  await writeFile(
    info.outputPath('shield-and-recovery.json'),
    JSON.stringify(await snapshot(page), null, 2),
  );
});

test('shearing wears the actual named tool and a neutral arrow kill drops loot without player experience', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, {
    item: 'shears',
    count: 1,
    wear: { value: 5, enchant: {}, name: '牧场剪刀' },
  });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (const [q, r] of [
      [2, 0],
      [1, 1],
      [0, 1],
      [1, -1],
      [2, -1],
      [0, 0],
    ])
      for (let y = 40; y <= 41; y++) {
        if ((q === 0 && r === 0 && y === 40) || (q === 0 && r === 1)) continue;
        w.set(q, y, r, 'glass');
        cells.push([q, y, r]);
      }
    g.graphics.updateCells(cells);
  });
  const saved = await snapshot(page),
    d = saved.dimensions.overworld,
    template = d.fauna.mobs[0];
  expect(template).toBeTruthy();
  d.fauna.mobs = [
    {
      ...template,
      kind: 'sheep',
      position: [Math.sqrt(3), 40, 0],
      hp: 8,
      baby: 0,
      wool: 0,
      love: 0,
      angle: 0,
    },
  ];
  await load(page, saved);
  await pulse(page);
  const sheared = await snapshot(page);
  expect((await sourceSlots(page))[0].wear).toEqual({
    value: 4,
    enchant: {},
    name: '牧场剪刀',
  });
  expect(
    sheared.dimensions.overworld.fauna.mobs.find((m) => m.id === template.id)
      .wool,
  ).toBeGreaterThan(110);
  expect(
    sheared.dimensions.overworld.drops
      .filter((d) => d.item === 'wool')
      .reduce((n, d) => n + d.count, 0),
  ).toBe(3);
  await pulse(page);
  expect((await sourceSlots(page))[0].wear.value).toBe(4);
  const kill = await snapshot(page);
  kill.dimensions.overworld.fauna.mobs = [
    {
      ...kill.dimensions.overworld.fauna.mobs.find((m) => m.id === template.id),
      position: [Math.sqrt(3), 40, 0],
      hp: 1,
    },
  ];
  kill.dimensions.overworld.experienceOrbs = [];
  kill.dimensions.overworld.chests.find(([k]) => k === '0,40,0')[1][0] = {
    item: 'arrow',
    count: 1,
  };
  await load(page, kill);
  await pulse(page);
  await expect
    .poll(
      async () =>
        !(await snapshot(page)).dimensions.overworld.fauna.mobs.some(
          (m) => m.id === template.id,
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  const dead = await snapshot(page);
  expect(dead.experience.total).toBe(kill.experience.total);
  expect(dead.dimensions.overworld.experienceOrbs).toEqual([]);
  expect(dead.dimensions.overworld.drops.some((d) => d.item === 'meat')).toBe(
    true,
  );
  await writeFile(
    info.outputPath('shearing-and-neutral-kill.json'),
    JSON.stringify({ sheared, dead }, null, 2),
  );
});

test('two dispensers launch independent throwables, rockets follow the outlet and boats require actual water and room', async ({
  page,
}, info) => {
  await platform(page);
  await machine(page, { item: 'egg', count: 2 });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-1, 41, 1, 'dispenser');
    w.setState(-1, 41, 1, { facing: 0, open: false, powered: false });
    w.chests.set('-1,41,1', [
      { item: 'egg', count: 2 },
      ...Array(8).fill(null),
    ]);
    g.graphics.updateCells([[-1, 41, 1]]);
    window.machineVisuals = { maxThrowables: 0, rocket: [] };
    const observe = () => {
      const children = g.graphics.scene.children;
      const flying = children.filter(
        (m) =>
          m.isMesh &&
          m.geometry?.type === 'PlaneGeometry' &&
          m.geometry.parameters.width === 0.34,
      );
      window.machineVisuals.maxThrowables = Math.max(
        window.machineVisuals.maxThrowables,
        flying.length,
      );
      for (const m of children)
        if (
          m.isGroup &&
          m.children.some(
            (c) =>
              c.geometry?.type === 'CylinderGeometry' &&
              c.geometry.parameters.height === 0.3 &&
              c.geometry.parameters.radiusTop === 0.045,
          )
        )
          window.machineVisuals.rocket.push(m.position.toArray());
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await pulse(page);
  expect((await sourceSlots(page))[0].count).toBe(1);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.chests.get('-1,41,1')[0].count,
    ),
  ).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.machineVisuals.maxThrowables), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(2);
  await stock(page, { item: 'snowball', count: 1 });
  await pulse(page);
  expect((await sourceSlots(page)).filter(Boolean)).toEqual([]);
  await stock(page, { item: 'fireworkRocket', count: 1 });
  await pulse(page);
  await waitGame(page, 1.4);
  const rocket = await page.evaluate(() => window.machineVisuals.rocket);
  expect(rocket.length).toBeGreaterThan(1);
  expect(
    Math.max(...rocket.map((p) => p[0])) - Math.min(...rocket.map((p) => p[0])),
  ).toBeGreaterThan(3);
  expect(
    Math.max(...rocket.map((p) => p[1])) - Math.min(...rocket.map((p) => p[1])),
  ).toBeLessThan(0.01);
  await stock(page, { item: 'boat', count: 2 });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = 1; q <= 3; q++)
      for (let r = -1; r <= 1; r++) w.fluids.source(q, 40, r, 'water');
    g.fluidStep(1);
  });
  await pulse(page);
  expect((await snapshot(page)).dimensions.overworld.boats.length).toBe(1);
  expect((await sourceSlots(page))[0].count).toBe(1);
  await pulse(page);
  expect((await snapshot(page)).dimensions.overworld.boats.length).toBe(1);
  expect((await sourceSlots(page))[0].count).toBe(1);
  await writeFile(
    info.outputPath('throwables-rockets-boats.json'),
    JSON.stringify(
      {
        visuals: await page.evaluate(() => window.machineVisuals),
        final: await snapshot(page),
      },
      null,
      2,
    ),
  );
});
