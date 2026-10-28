import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
const browserLogs = new WeakMap();
test.beforeEach(async ({ page }) => {
  const logs = { pageErrors: [], consoleErrors: [], warnings: [] };
  browserLogs.set(page, logs);
  page.on('pageerror', (e) => logs.pageErrors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') logs.consoleErrors.push(e.text());
    if (e.type() === 'warning') logs.warnings.push(e.text());
  });
});
test.afterEach(async ({ page }, info) => {
  const graphics = page.isClosed()
    ? { closed: true }
    : await page.evaluate(() => {
        const gl = document.querySelector('#world')?.getContext('webgl2'),
          debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : null,
          vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
          glError: gl?.getError() ?? null,
        };
      });
  await writeFile(
    info.outputPath('graphics-diagnostics.json'),
    JSON.stringify({ ...graphics, ...browserLogs.get(page) }, null, 2),
  );
  expect(graphics.glError).toBe(0);
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild;
    if (!g) return { ready: false };
    g.save();
    const w = g.state.world,
      saved = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      observerCells: [...w.edits]
        .filter(([, type]) => type === 'observer')
        .sort(([a], [b]) => a.localeCompare(b)),
      floatingCells: [
        [-1, 42, 0],
        [2, 41, 0],
      ].map((p) => ({ position: p, type: w.get(...p) || null })),
      observerInventory: g.state.inventory.observer || 0,
      observerDrops: (saved?.dimensions?.[g.state.dimension]?.drops || [])
        .filter((d) => d.item === 'observer')
        .reduce((n, d) => n + d.count, 0),
    };
  });
  await writeFile(
    info.outputPath('observer-failure.json'),
    JSON.stringify(manifest, null, 2),
  );
  await page.screenshot({ path: info.outputPath('observer-failure.png') });
});
const use = (page) =>
  page.evaluate(() => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
async function aim(page, q, y, r, type) {
  await page.evaluate((p) => window.__hexwild.lookAt(...p), [q, y, r]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q || 0, t.y, t.r || 0, t.type];
      }),
    )
    .toEqual([q, Math.floor(y), r, type]);
}
async function mineAt(page, q, y, r, type) {
  await aim(page, q, y, r, type);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  try {
    await expect
      .poll(
        () =>
          page.evaluate(
            (p) => window.__hexwild.state.world.get(...p) || null,
            [q, Math.floor(y), r],
          ),
        { timeout: 15000 },
      )
      .toBe(null);
  } finally {
    await page.evaluate(() =>
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
    );
  }
}
const transferred = (page) =>
  page.evaluate(() =>
    (window.__hexwild.state.world.chests.get('-3,40,0') || []).reduce(
      (n, s) => n + (s?.count || 0),
      0,
    ),
  );

test('player crafts, places and saves an observer delivery machine that pulses once per lever change', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -5; q <= 4; q++)
      for (let r = -3; r <= 3; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(-2, 40, 0, 'workbench');
    cells.push([-2, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-3, 40, 0);
    for (const [item, n] of [
      ['cobble', 6],
      ['redstone', 2],
      ['netherQuartz', 1],
    ])
      g.give(item, n);
  });
  await aim(page, -2, 40.5, 0, 'workbench');
  await use(page);
  await page.locator('#recipe-search').fill('侦测器');
  await page
    .locator('[data-recipe]')
    .filter({ hasText: /^侦测器/ })
    .click();
  await page.screenshot({ path: info.outputPath('observer-recipe.png') });
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.observer),
  ).toBe(1);
  for (const item of ['cobble', 'redstone', 'netherQuartz'])
    expect(
      await page.evaluate(
        (id) => window.__hexwild.state.inventory[id] || 0,
        item,
      ),
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
    g.selectItem('observer');
  });
  await aim(page, 0, 40.5, 0, 'stone');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const graphics = window.__hexwild.graphics;
        let vertices = 0;
        graphics.held?.traverse((o) => {
          vertices += o.geometry?.attributes.position?.count || 0;
        });
        return graphics.heldKey === 'observer' && vertices > 0;
      }),
    )
    .toBe(true);
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 0)),
    )
    .toBe('observer');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(-1, 40, 0).facing,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 40, 0, 'lever');
    w.setState(0, 40, 0, {
      facing: 0,
      open: false,
      powered: false,
      mount: 'floor',
    });
    w.set(-2, 40, 0, 'dropper');
    w.setState(-2, 40, 0, { facing: 3, open: false, powered: false });
    w.chests.set('-2,40,0', [
      { item: 'cobble', count: 4 },
      ...Array(8).fill(null),
    ]);
    w.set(-3, 40, 0, 'chest');
    w.chests.set('-3,40,0', Array(27).fill(null));
    g.graphics.updateCells([
      [0, 40, 0],
      [-2, 40, 0],
      [-3, 40, 0],
    ]);
    g.teleport(0, 40, 2);
  });
  // Target replacement itself is a real change: let that initial pulse settle.
  await expect.poll(() => transferred(page)).toBe(1);
  await page.waitForTimeout(600);
  await aim(page, 0, 40.07, 0, 'lever');
  await use(page);
  await expect.poll(() => transferred(page)).toBe(2);
  await page.waitForTimeout(700);
  expect(await transferred(page)).toBe(2);
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  await page.waitForTimeout(600);
  expect(await transferred(page)).toBe(2);
  await aim(page, 0, 40.07, 0, 'lever');
  await use(page);
  await expect.poll(() => transferred(page)).toBe(3);
  await page.waitForTimeout(600);
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const count = (k) =>
      (w.chests.get(k) || []).reduce((n, s) => n + (s?.count || 0), 0);
    return {
      observer: w.get(-1, 40, 0),
      facing: w.state(-1, 40, 0).facing,
      powered: w.state(-1, 40, 0).powered,
      source: count('-2,40,0'),
      destination: count('-3,40,0'),
      webglError: document
        .querySelector('#world')
        .getContext('webgl2')
        .getError(),
    };
  });
  expect(manifest).toEqual({
    observer: 'observer',
    facing: 0,
    powered: false,
    source: 1,
    destination: 3,
    webglError: 0,
  });
  expect(errors).toEqual([]);
  await aim(page, -1, 40.5, 0, 'observer');
  await expect(page.locator('#target')).toContainText('检测 东');
  await page.screenshot({ path: info.outputPath('observer-delivery.png') });
  await writeFile(
    info.outputPath('observer-delivery.json'),
    JSON.stringify(manifest, null, 2),
  );
});

test('player collision rejects ordinary and shaped trial placements without false observer output or saved state', async ({
  page,
}, info) => {
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 2; q++)
      for (let r = -2; r <= 2; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(-1, 40, 0, 'observer');
    w.setState(-1, 40, 0, { facing: 0, open: false, powered: false });
    w.set(-2, 40, 0, 'dropper');
    w.setState(-2, 40, 0, { facing: 3, open: false, powered: false });
    w.chests.set('-2,40,0', [
      { item: 'cobble', count: 2 },
      ...Array(8).fill(null),
    ]);
    w.set(-3, 40, 0, 'chest');
    w.chests.set('-3,40,0', Array(27).fill(null));
    cells.push([-1, 40, 0], [-2, 40, 0], [-3, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(0, 40, 0);
    g.give('stone', 1);
    g.give('observer', 1);
  });
  for (const item of ['stone', 'observer']) {
    await page.evaluate((id) => window.__hexwild.selectItem(id), item);
    await aim(page, 0, 39.7, 0, 'stone');
    await use(page);
    await page.waitForTimeout(600);
    expect(await transferred(page)).toBe(0);
    expect(
      await page.evaluate(() => {
        const w = window.__hexwild.state.world;
        return { empty: !w.get(0, 40, 0), state: w.blockStates.has('0,40,0') };
      }),
    ).toEqual({ empty: true, state: false });
    expect(
      await page.evaluate((id) => window.__hexwild.state.inventory[id], item),
    ).toBe(1);
  }
  const manifest = await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    return {
      rejectedPlacements: 2,
      target: w.get(0, 40, 0) || null,
      persistedTargetState: w
        .serialize()
        .blockStates.some(([k]) => k === '0,40,0'),
      source: w.chests.get('-2,40,0').reduce((n, s) => n + (s?.count || 0), 0),
      destination: w.chests
        .get('-3,40,0')
        .reduce((n, s) => n + (s?.count || 0), 0),
    };
  });
  expect(manifest).toEqual({
    rejectedPlacements: 2,
    target: null,
    persistedTargetState: false,
    source: 2,
    destination: 0,
  });
  await writeFile(
    info.outputPath('observer-rejected-placement.json'),
    JSON.stringify(manifest, null, 2),
  );
});

test('player places a floating observer and removes both side and floor supports without losing either machine', async ({
  page,
}, info) => {
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 5; q++)
      for (let r = -3; r <= 3; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 42, 0, 'stone');
    w.set(2, 40, 0, 'stone');
    cells.push([0, 42, 0], [2, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-3, 40, 0);
    g.give('observer', 2);
    g.give('pick4', 1);
    g.selectItem('observer');
  });
  await aim(page, 0, 42.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-1, 42, 0)),
    )
    .toBe('observer');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(-1, 41, 0) || null,
    ),
  ).toBe(null);
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 1));
  await aim(page, 2, 40.95, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(2, 41, 0)))
    .toBe('observer');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(2, 40, 2);
    g.selectItem('pick4');
  });
  await mineAt(page, 2, 40.15, 0, 'stone');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(2, 41, 0)),
  ).toBe('observer');
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 2));
  await mineAt(page, 0, 42.5, 0, 'stone');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    g.save();
    const saved = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      observers: [
        [-1, 42, 0],
        [2, 41, 0],
      ].map((p) => ({ position: p, type: w.get(...p) || null })),
      removedSupports: [
        [0, 42, 0],
        [2, 40, 0],
      ].every((p) => !w.get(...p)),
      observerInventory: g.state.inventory.observer || 0,
      observerDrops: saved.dimensions.overworld.drops
        .filter((d) => d.item === 'observer')
        .reduce((n, d) => n + d.count, 0),
    };
  });
  expect(manifest).toEqual({
    observers: [
      { position: [-1, 42, 0], type: 'observer' },
      { position: [2, 41, 0], type: 'observer' },
    ],
    removedSupports: true,
    observerInventory: 0,
    observerDrops: 0,
  });
  await page.screenshot({ path: info.outputPath('floating-observers.png') });
  await writeFile(
    info.outputPath('floating-observers.json'),
    JSON.stringify(manifest, null, 2),
  );
});
