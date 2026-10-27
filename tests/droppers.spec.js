import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 900, height: 650 });
});
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const state = await page
    .evaluate(() => {
      const g = window.__hexwild;
      g.save();
      return {
        target:
          g.state.target &&
          (({ q, y, r, type, normal }) => ({ q, y, r, type, normal }))(
            g.state.target,
          ),
        position: g.state.position,
        save: JSON.parse(localStorage.getItem('hexwild-save-v16')),
      };
    })
    .catch((e) => ({ error: e.message }));
  await writeFile(
    info.outputPath('failure-state.json'),
    JSON.stringify(state, null, 2),
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
async function waitGame(page, seconds) {
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(() => page.evaluate((t) => window.__hexwild.state.time - t, start), {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(seconds);
}
async function snapshot(page) {
  return page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
}

test('player crafts, aims and fills a nine-slot dropper, pulses horizontal transport and continues without retriggering', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -6; q <= 6; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(-2, 40, 0, 'workbench');
    cells.push([-2, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-3, 40, 0);
    g.give('cobble', 7);
    g.give('redstone', 1);
  });
  await aim(page, -2, 40.5, 0, 'workbench');
  await use(page);
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.locator('#recipe-search').fill('投掷器');
  const recipe = page.locator('[data-recipe]').filter({ hasText: '投掷器' });
  await expect(recipe).toBeVisible();
  await recipe.click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.dropper),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.cobble || 0),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redstone || 0),
  ).toBe(0);
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
    g.selectItem('dropper');
  });
  await aim(page, 0, 40.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 0)),
    )
    .toBe('dropper');
  const facing = await page.evaluate(
    () => window.__hexwild.state.world.state(-1, 40, 0).facing,
  );
  expect(facing).toBe(3);
  await page.screenshot({ path: info.outputPath('horizontal-dropper.png') });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-2, 40, 0, 'chest');
    w.chests.set('-2,40,0', Array(27).fill(null));
    w.set(-1, 40, 1, 'lever');
    w.setState(-1, 40, 1, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: false,
    });
    g.graphics.updateCells([
      [-2, 40, 0],
      [-1, 40, 1],
    ]);
    g.teleport(-1, 40, -2);
    g.give('stone', 12);
  });
  await aim(page, -1, 40.5, 0, 'dropper');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  await expect(page.locator('[data-inv-slot^="box:"]')).toHaveCount(9);
  const save = await snapshot(page),
    index = save.inventory.slots.findIndex((s) => s?.item === 'stone');
  await page
    .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
    .click({ modifiers: ['Shift'] });
  await page.screenshot({ path: info.outputPath('dropper-inventory.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-inv-slot="box:8"]')).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath('dropper-inventory-mobile.png'),
  });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.keyboard.press('Escape');
  const count = () =>
    page.evaluate(() =>
      window.__hexwild.state.world.chests
        .get('-2,40,0')
        .reduce((n, s) => n + (s?.count || 0), 0),
    );
  await page.evaluate(() => window.__hexwild.teleport(-1, 40, 2));
  await aim(page, -1, 40.07, 1, 'lever');
  await use(page);
  await expect.poll(count).toBe(1);
  await waitGame(page, 1);
  expect(await count()).toBe(1);
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.world.state(-1, 40, 1).powered,
      ),
    )
    .toBe(false);
  await waitGame(page, 0.2);
  await aim(page, -1, 40.07, 1, 'lever');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.world.state(-1, 40, 1).powered,
      ),
    )
    .toBe(true);
  await expect.poll(count).toBe(2);
  await page.keyboard.press('Escape');
  await page.locator('#home').click();
  await page.locator('#continue').click();
  await waitGame(page, 0.6);
  expect(await count()).toBe(2);
  const result = await snapshot(page);
  expect(
    result.dimensions.overworld.chests
      .find(([k]) => k === '-1,40,0')[1]
      .filter(Boolean)[0].count,
  ).toBe(10);
  await writeFile(
    info.outputPath('dropper-pipeline.json'),
    JSON.stringify(
      {
        facing,
        source: result.dimensions.overworld.chests.find(
          ([k]) => k === '-1,40,0',
        )[1],
        destination: result.dimensions.overworld.chests.find(
          ([k]) => k === '-2,40,0',
        )[1],
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('a pulse ejects a filled bucket as a physical item and the player picks it up without placing water', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 5; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 40, 0, 'dropper');
    w.setState(0, 40, 0, { facing: 0, open: false, powered: false });
    w.chests.set('0,40,0', Array(9).fill(null));
    w.set(0, 40, -1, 'lever');
    w.setState(0, 40, -1, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: false,
    });
    cells.push([0, 40, 0], [0, 40, -1]);
    g.graphics.updateCells(cells);
    g.teleport(0, 40, -2);
    g.give('waterBucket', 1);
  });
  await aim(page, 0, 40.5, 0, 'dropper');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  const before = await snapshot(page),
    index = before.inventory.slots.findIndex((s) => s?.item === 'waterBucket');
  await page
    .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Escape');
  await aim(page, 0, 40.3, -1, 'lever');
  await use(page);
  await expect
    .poll(async () =>
      (await snapshot(page)).dimensions.overworld.drops
        .filter((d) => d.item === 'waterBucket')
        .reduce((n, d) => n + d.count, 0),
    )
    .toBe(1);
  await aim(page, 0, 40.5, 0, 'dropper');
  const emitted = await snapshot(page);
  expect(
    emitted.dimensions.overworld.chests
      .find(([k]) => k === '0,40,0')[1]
      .filter(Boolean),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(1, 40, 0) || null,
    ),
  ).toBe(null);
  await page.screenshot({ path: info.outputPath('ejected-bucket.png') });
  await page.evaluate(() => window.__hexwild.teleport(1, 40, 0));
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.inventory.waterBucket || 0),
      { timeout: 30000 },
    )
    .toBe(1);
  const collected = await snapshot(page);
  expect(
    collected.dimensions.overworld.drops.filter(
      (d) => d.item === 'waterBucket',
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(1, 40, 0) || null,
    ),
  ).toBe(null);
  await writeFile(
    info.outputPath('air-ejection.json'),
    JSON.stringify(
      {
        emitted: emitted.dimensions.overworld.drops.filter(
          (d) => d.item === 'waterBucket',
        ),
        collected: collected.inventory.slots.filter(
          (s) => s?.item === 'waterBucket',
        ),
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('player places an upward mouth, opens it under a container, lifts arrows as items and breaks it without losing stock', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 4; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(-1, 40, 0, 'stone');
    cells.push([-1, 40, 0]);
    g.graphics.updateCells(cells);
    g.give('dropper', 1);
    g.selectItem('dropper');
    g.teleport(-1, 41, 0);
  });
  await aim(page, 0, 39.8, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0)))
    .toBe('dropper');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 40, 0).facing,
    ),
  ).toBe(7);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 41, 0, 'chest');
    w.chests.set('0,41,0', Array(27).fill(null));
    w.set(0, 40, -1, 'lever');
    w.setState(0, 40, -1, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: false,
    });
    g.graphics.updateCells([
      [0, 41, 0],
      [0, 40, -1],
    ]);
    g.teleport(0, 40, -2);
    g.give('slownessArrow', 2);
  });
  await aim(page, 0, 40.5, 0, 'dropper');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  await expect(page.locator('[data-inv-slot^="box:"]')).toHaveCount(9);
  const before = await snapshot(page),
    index = before.inventory.slots.findIndex(
      (s) => s?.item === 'slownessArrow',
    );
  await page
    .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Escape');
  await aim(page, 0, 40.3, -1, 'lever');
  await use(page);
  const output = () =>
    page.evaluate(() =>
      window.__hexwild.state.world.chests.get('0,41,0').filter(Boolean),
    );
  await expect.poll(output).toEqual([{ item: 'slownessArrow', count: 1 }]);
  await waitGame(page, 0.5);
  expect(await output()).toEqual([{ item: 'slownessArrow', count: 1 }]);
  await aim(page, 0, 40.5, 0, 'dropper');
  await page.screenshot({ path: info.outputPath('upward-dropper.png') });
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0) || null),
    )
    .toBe(null);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
  );
  const result = await snapshot(page),
    loose = result.dimensions.overworld.drops.filter(
      (d) => d.item === 'slownessArrow',
    );
  expect(loose.reduce((n, d) => n + d.count, 0)).toBe(1);
  expect(result.dimensions.overworld.chests.some(([k]) => k === '0,40,0')).toBe(
    false,
  );
  expect(
    result.dimensions.overworld.redstoneTimers.some(([k]) => k === '0,40,0'),
  ).toBe(false);
  await writeFile(
    info.outputPath('upward-and-break.json'),
    JSON.stringify({ output: await output(), loose, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
