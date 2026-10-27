import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

async function use(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
}
async function transfer(page, item) {
  const slot = await page.evaluate((id) => {
    window.__hexwild.save();
    return JSON.parse(
      localStorage.getItem('hexwild-save-v16'),
    ).inventory.slots.findIndex((s) => s?.item === id);
  }, item);
  expect(slot).toBeGreaterThanOrEqual(0);
  await page
    .locator(`[data-inv-slot="pack:${slot}"]`)
    .click({ modifiers: ['Shift'] });
}
async function aim(page, q, y, r, type) {
  await page.evaluate((p) => window.__hexwild.lookAt(...p), [q, y, r]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q || 0, t.r || 0, t.type];
      }),
    )
    .toEqual([q, r, type]);
}
async function platform(page) {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -7; q <= 12; q++)
      for (let r = -5; r <= 5; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(-2, 40, 0);
  });
}

test('a player-placed comparator reads real chest transfers live and preserves its mode across Continue', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('comparator', 1);
    g.give('stone', 192);
    g.selectItem('comparator');
  });
  await aim(page, 0, 40, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0)))
    .toBe('comparator');
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-1, 40, 0, 'chest');
    for (const q of [1, 2]) w.set(q, 40, 0, 'redstoneWire');
    w.set(3, 40, 0, 'redstoneLamp');
    g.graphics.updateCells([
      [-1, 40, 0],
      [1, 40, 0],
      [3, 40, 0],
    ]);
    g.teleport(-1, 40, -1);
  });
  await aim(page, -1, 40.5, 0, 'chest');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const slot = await page.evaluate(() => {
      window.__hexwild.save();
      return JSON.parse(
        localStorage.getItem('hexwild-save-v16'),
      ).inventory.slots.findIndex((s) => s?.item === 'stone');
    });
    await page
      .locator(`[data-inv-slot="pack:${slot}"]`)
      .click({ modifiers: ['Shift'] });
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 40, 0).output),
    )
    .toBe(2);
  expect(
    await page.evaluate(() =>
      window.__hexwild.state.world.redstone.power(2, 40, 0),
    ),
  ).toBe(1);
  await page.keyboard.press('Escape');
  const separate = await page.evaluate(() => {
    const g = window.__hexwild;
    g.travel('nether');
    return (
      g.state.chests === g.state.world.chests && !g.state.chests.has('-1,40,0')
    );
  });
  expect(separate).toBe(true);
  await page.evaluate(() => window.__hexwild.travel('overworld'));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 40, 0).output),
    )
    .toBe(2);
  await aim(page, -1, 40.5, 0, 'chest');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page
      .locator(`[data-inv-slot="box:${i}"]`)
      .click({ modifiers: ['Shift'] });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 40, 0).output),
    )
    .toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.teleport(0, 40, -1));
  await aim(page, 0, 40.2, 0, 'comparator');
  await use(page);
  await expect(page.locator('#target')).toContainText('减法');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 40, 0).subtract,
    ),
  ).toBe(true);
  await writeFile(
    info.outputPath('chest-mode.json'),
    JSON.stringify(
      {
        fullStacks: 3,
        signal: 2,
        tail: 1,
        emptied: 0,
        modeRestored: true,
        dimensionInventoriesIsolated: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('real side comparators compare and subtract analog storage through a powered block', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const put = (q, r, type, state = {}) => {
      w.set(q, 40, r, type);
      w.setState(q, 40, r, { facing: 0, open: false, ...state });
    };
    const chest = (q, r, stacks) => {
      put(q, r, 'chest');
      w.chests.set(
        `${q},40,${r}`,
        Array.from({ length: 27 }, (_, i) =>
          i < stacks ? { item: 'stone', count: 64 } : null,
        ),
      );
    };
    put(0, 0, 'comparator');
    put(0, 1, 'comparator', { facing: 4 });
    put(1, -1, 'comparator', { facing: 2 });
    chest(-1, 0, 18);
    chest(0, 2, 12);
    chest(2, -2, 6);
    put(1, 0, 'stone');
    put(2, 0, 'redstoneWire');
    put(3, 0, 'redstoneWire');
    put(4, 0, 'redstoneLamp');
    g.graphics.updateCells([
      [-1, 40, 0],
      [0, 40, 0],
      [0, 40, 1],
      [0, 40, 2],
      [1, 40, -1],
      [2, 40, -2],
      [1, 40, 0],
      [2, 40, 0],
      [3, 40, 0],
      [4, 40, 0],
    ]);
    g.teleport(0, 40, -1);
  });
  const reading = () =>
    page.evaluate(() => {
      const w = window.__hexwild.state.world;
      return [
        w.state(0, 40, 0).output,
        w.redstone.power(2, 40, 0),
        w.redstone.power(3, 40, 0),
      ];
    });
  await expect.poll(reading).toEqual([10, 10, 9]);
  await aim(page, 0, 40.2, 0, 'comparator');
  await use(page);
  await expect.poll(reading).toEqual([3, 3, 2]);
  await expect(page.locator('#target')).toContainText('3 / 15');
  // Keep the normal high-preset scene composition and the real three-post model.
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => {
    window.__hexwild.teleport(2, 42, -4);
    window.__hexwild.lookAt(0, 40.2, 0);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('subtract-circuit.png') });
  await page.evaluate(() => window.__hexwild.teleport(0, 40, -1));
  await aim(page, 0, 40.2, 0, 'comparator');
  await use(page);
  await expect.poll(reading).toEqual([10, 10, 9]);
  await page.evaluate(() => {
    window.__hexwild.teleport(2, 42, -4);
    window.__hexwild.lookAt(0, 40.2, 0);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('compare-circuit.png') });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('arithmetic.json'),
    JSON.stringify(
      {
        rear: 10,
        sides: [7, 4],
        compare: [10, 10, 9],
        subtract: [3, 3, 2],
        errors,
      },
      null,
      2,
    ),
  );
});

test('automatic furnace fuel consumption updates a comparator while its actual inventory is open and Esc pauses it', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-1, 40, 0, 'furnace');
    w.set(0, 40, 0, 'comparator');
    w.setState(0, 40, 0, { facing: 0, open: false });
    w.set(1, 40, 0, 'redstoneWire');
    g.give('lavaBucket', 1);
    g.give('netherQuartzOre', 1);
    g.graphics.updateCells([
      [-1, 40, 0],
      [0, 40, 0],
      [1, 40, 0],
    ]);
    g.teleport(-1, 40, -1);
  });
  await aim(page, -1, 40.5, 0, 'furnace');
  await use(page);
  await expect(page.locator('#furnace-status')).toBeVisible();
  await transfer(page, 'lavaBucket');
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 40, 0).output),
    )
    .toBe(5);
  await transfer(page, 'netherQuartzOre');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window.__hexwild.state.world;
        return [w.state(0, 40, 0).output, w.furnaces.get('-1,40,0').fuel?.item];
      }),
    )
    .toEqual([1, 'bucket']);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__hexwild.state.world.furnaces.get('-1,40,0').output?.item,
        ),
      { timeout: 45000 },
    )
    .toBe('netherQuartz');
  await page
    .locator('[data-inv-slot="furnace:output"]')
    .click({ modifiers: ['Shift'] });
  await page
    .locator('[data-inv-slot="furnace:fuel"]')
    .click({ modifiers: ['Shift'] });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 40, 0).output),
    )
    .toBe(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(
    () => window.__hexwild.state.world.furnaces.get('-1,40,0').burn,
  );
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.furnaces.get('-1,40,0').burn,
    ),
  ).toBe(paused);
  await page.locator('#resume').click();
  await page.evaluate(() => window.__hexwild.save());
  const result = await page.evaluate(() => {
    const g = window.__hexwild;
    return {
      quartz: g.state.inventory.netherQuartz,
      bucket: g.state.inventory.bucket,
      output: g.state.world.state(0, 40, 0).output,
    };
  });
  expect(result).toEqual({ quartz: 1, bucket: 1, output: 0 });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('processing.json'),
    JSON.stringify(
      {
        ...result,
        fullBucketSignal: 5,
        emptyBucketSignal: 1,
        pauseFrozen: true,
        errors,
      },
      null,
      2,
    ),
  );
});

test('naturally mined quartz crafts a comparator at a real workbench and the placed device can be mined and collected', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  const ore = await page.evaluate(() => {
    const g = window.__hexwild;
    g.travel('nether');
    const w = g.state.world;
    const p = [...w.blocks]
      .filter(([, t]) => t === 'netherQuartzOre')
      .map(([k]) => k.split(',').map(Number))
      .find(
        ([q, y, r]) => y > 3 && y < 30 && Math.abs(q) < 6 && Math.abs(r) < 6,
      );
    if (!p) throw Error('natural quartz fixture missing');
    const [q, y, r] = p,
      cells = [];
    for (const a of [q - 1, q]) {
      w.set(a, y - 1, r, 'netherrack');
      for (let h = y; h <= y + 2; h++)
        if (a !== q || h !== y) w.set(a, h, r, null);
      cells.push([a, y, r]);
    }
    g.graphics.updateCells(cells);
    g.setTool(3);
    g.teleport(q - 1, y, r);
    return p;
  });
  await aim(page, ore[0], ore[1] + 0.5, ore[2], 'netherQuartzOre');
  await expect(page.locator('#travel')).not.toHaveClass(/active/);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({ path: info.outputPath('natural-quartz.png') });
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(
      () =>
        page.evaluate(
          (p) => window.__hexwild.state.world.get(...p) || null,
          ore,
        ),
      { timeout: 15000 },
    )
    .toBe(null);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.evaluate((p) => window.__hexwild.teleport(...p), ore);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.netherQuartz || 0),
    )
    .toBe(1);
  await page.evaluate(() => window.__hexwild.save());
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.__hexwild.save();
        return JSON.parse(localStorage.getItem('hexwild-save-v16')).experience
          .total;
      }),
    )
    .toBeGreaterThanOrEqual(2);
  const recipes = await page.evaluate(async () => {
    const g = window.__hexwild,
      { RECIPES } = await import('/src/core.js');
    g.travel('overworld');
    g.teleport(-2, 40, 0);
    g.give('wood', 3);
    g.give('redstone', 3);
    g.give('stone', 3);
    return ['redstoneTorch', 'comparator'].map((id) =>
      RECIPES.findIndex((r) => r.id === id),
    );
  });
  await page.keyboard.press('KeyE');
  for (let i = 0; i < 3; i++) {
    await page.locator(`[data-recipe="${recipes[0]}"]`).click();
    await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  }
  await page.locator(`[data-recipe="${recipes[1]}"]`).click();
  await expect(page.locator('#craft-button')).toBeDisabled();
  await page.keyboard.press('KeyE');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(0, 40, 0, 'workbench');
    g.graphics.updateBlock(0, 40, 0);
    g.teleport(0, 40, -1);
  });
  await page.keyboard.press('KeyE');
  await page.locator(`[data-recipe="${recipes[1]}"]`).click();
  await expect(page.locator('#craft-button')).toBeEnabled();
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({ path: info.outputPath('comparator-crafting.png') });
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  await page.keyboard.press('KeyE');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('comparator');
    g.teleport(2, 40, 0);
  });
  await aim(page, 3, 40, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(3, 40, 0)))
    .toBe('comparator');
  await aim(page, 3, 40.2, 0, 'comparator');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(3, 40, 0) || null),
    )
    .toBe(null);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.evaluate(() => window.__hexwild.teleport(3, 40, 0));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.comparator || 0),
    )
    .toBe(1);
  const inventory = await page.evaluate(() =>
    Object.fromEntries(
      [
        'wood',
        'redstone',
        'stone',
        'netherQuartz',
        'redstoneTorch',
        'comparator',
      ].map((id) => [id, window.__hexwild.state.inventory[id] || 0]),
    ),
  );
  expect(inventory).toEqual({
    wood: 0,
    redstone: 0,
    stone: 0,
    netherQuartz: 0,
    redstoneTorch: 0,
    comparator: 1,
  });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('survival.json'),
    JSON.stringify(
      {
        naturalOre: ore,
        inventory,
        stationRequired: true,
        minedAndCollected: true,
        errors,
      },
      null,
      2,
    ),
  );
});

test('touch use toggles comparator mode without pointer lock and support loss or water drops devices', async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseURL);
  await page.locator('#start').tap();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -3; q <= 3; q++)
      for (let r = -2; r <= 2; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
      }
    for (const q of [0, 2]) {
      w.set(q, 40, 0, 'comparator');
      w.setState(q, 40, 0, {
        facing: 0,
        open: false,
        output: 0,
        subtract: false,
      });
    }
    g.graphics.updateCells([
      [0, 40, 0],
      [2, 40, 0],
    ]);
    g.teleport(-1, 40, 0);
  });
  await aim(page, 0, 40.2, 0, 'comparator');
  const modes = [];
  for (const subtract of [true, false]) {
    await page.locator('[data-action="interact"]').tap();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__hexwild.state.world.state(0, 40, 0).subtract,
        ),
      )
      .toBe(subtract);
    modes.push(subtract);
  }
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 39, 0, null);
    w.fluids.source(2, 40, 0, 'water');
    g.graphics.updateCells([
      [0, 39, 0],
      [2, 40, 0],
    ]);
  });
  for (const q of [0, 2])
    await expect
      .poll(() =>
        page.evaluate(
          (q) => window.__hexwild.state.world.get(q, 40, 0) || null,
          q,
        ),
      )
      .toBe(null);
  const recovered = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const data = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return (
      (g.state.inventory.comparator || 0) +
      data.dimensions.overworld.drops
        .filter((d) => d.item === 'comparator')
        .reduce((n, d) => n + d.count, 0)
    );
  });
  expect(recovered).toBe(2);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('touch-support-water.json'),
    JSON.stringify(
      {
        modes,
        nativePointerLock: false,
        supportRemoved: true,
        floodedRemoved: true,
        recoveredDevices: recovered,
        errors,
      },
      null,
      2,
    ),
  );
  await context.close();
});
