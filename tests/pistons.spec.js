import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const state = await page.evaluate(() => {
    const g = window.__hexwild;
    return {
      position: g.state.position,
      target:
        g.state.target &&
        (({ q, y, r, type, place, normal }) => ({
          q,
          y,
          r,
          type,
          place,
          normal,
        }))(g.state.target),
      inventory: g.state.inventory,
      hotbar: [...g.state.hotbar],
      pistons: [...g.state.world.edits].filter(
        ([, t]) => t?.includes('Piston') || t?.includes('piston'),
      ),
      states: [...g.state.world.blockStates],
    };
  });
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
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q || 0, t.y, t.r || 0, t.type];
      }),
    )
    .toEqual([q, Math.floor(y), r, type]);
}
async function handModels(page) {
  return page.evaluate(() => {
    const g = window.__hexwild.graphics;
    const vertices = (group) => {
      let count = 0;
      group?.traverse((o) => {
        count += o.geometry?.attributes.position?.count || 0;
      });
      return count;
    };
    return {
      main: { item: g.heldKey, vertices: vertices(g.held) },
      offhand: { item: g.offhandKey, vertices: vertices(g.offhandHeld) },
    };
  });
}

test('player crafts and places a piston, powers a stone push and continues with exactly one paired head', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -5; q <= 6; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(-2, 40, 0, 'workbench');
    cells.push([-2, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-3, 40, 0);
    for (const [item, count] of [
      ['planks', 3],
      ['cobble', 4],
      ['ingot', 1],
      ['redstone', 1],
    ])
      g.give(item, count);
  });
  await aim(page, -2, 40.5, 0, 'workbench');
  await use(page);
  await page.locator('#recipe-search').fill('活塞');
  const recipe = page.locator('[data-recipe]').filter({ hasText: /^活塞/ });
  await expect(recipe).toBeVisible();
  await recipe.click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.piston),
  ).toBe(1);
  for (const id of ['planks', 'cobble', 'ingot', 'redstone'])
    expect(
      await page.evaluate(
        (id) => window.__hexwild.state.inventory[id] || 0,
        id,
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
    g.selectItem('piston');
  });
  await aim(page, 0, 40.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 0)),
    )
    .toBe('piston');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(-1, 40, 0).facing,
    ),
  ).toBe(3);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-2, 40, 0, 'stone');
    w.set(-2, 41, 0, 'redstoneWire');
    w.set(-1, 40, 1, 'lever');
    w.setState(-1, 40, 1, {
      facing: 0,
      open: false,
      powered: false,
      mount: 'floor',
    });
    g.graphics.updateCells([
      [-2, 40, 0],
      [-2, 41, 0],
      [-1, 40, 1],
    ]);
    g.teleport(0, 40, 2);
    g.selectItem('piston');
  });
  await aim(page, -1, 40.07, 1, 'lever');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-2, 40, 0)),
    )
    .toBe('pistonHead');
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-3, 40, 0)),
    )
    .toBe('stone');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(-2, 41, 0) || null,
    ),
  ).toBe(null);
  const first = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const w = g.state.world;
    return {
      cells: [
        [-1, 40, 0],
        [-2, 40, 0],
        [-3, 40, 0],
      ].map((p) => ({ position: p, type: w.get(...p) })),
      baseState: w.state(-1, 40, 0),
      headState: w.state(-2, 40, 0),
      wireRemoved: !w.get(-2, 41, 0),
    };
  });
  await page.screenshot({ path: info.outputPath('extended-piston.png') });
  await page.reload();
  await page.locator('#continue').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(-1, 40, 0).open),
    )
    .toBe(true);
  await aim(page, -1, 40.07, 1, 'lever');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-2, 40, 0) || null),
    )
    .toBe(null);
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(-3, 40, 0)),
  ).toBe('stone');
  expect(
    await page.evaluate(() =>
      document.querySelector('#world').getContext('webgl2').getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('player-piston.json'),
    JSON.stringify({ extended: first, errors }, null, 2),
  );
});

test('a player crafts a sticky piston without a workbench, places its upward face and is lifted by the real pushed block', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -5; q <= 5; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 48; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(1, 40, 0, 'stone');
    cells.push([1, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(1, 41, 0);
    g.give('piston', 1);
    g.give('slimeBall', 1);
  });
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('黏性活塞');
  const recipe = page.locator('[data-recipe]').filter({ hasText: /^黏性活塞/ });
  await expect(recipe).toContainText('随身合成');
  await recipe.click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.stickyPiston),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.piston || 0),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.slimeBall || 0),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.selectItem('stickyPiston'));
  const heldSticky = await handModels(page);
  expect(heldSticky.main.item).toBe('stickyPiston');
  expect(heldSticky.main.vertices).toBeGreaterThan(0);
  await aim(page, 0, 39.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0)))
    .toBe('stickyPiston');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 40, 0).facing,
    ),
  ).toBe(7);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 41, 0, 'stone');
    w.set(-2, 40, 0, 'lever');
    w.setState(-2, 40, 0, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: false,
    });
    w.set(-1, 40, 0, 'redstoneWire');
    g.graphics.updateCells([
      [0, 41, 0],
      [-2, 40, 0],
      [-1, 40, 0],
    ]);
    g.teleport(0, 42, 0);
  });
  await aim(page, -2, 40.07, 0, 'lever');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)))
    .toBe('stone');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1] - 1.65))
    .toBeGreaterThan(42.9);
  const raised = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return {
      standingY: Math.round(g.state.position[1] - 1.65),
      state: g.state.world.state(0, 40, 0),
      crouching: JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
        .overworld.crouching,
    };
  });
  expect(raised.crouching).toBe(false);
  await page.screenshot({
    path: info.outputPath('sticky-piston-player-lift.png'),
  });
  await page.evaluate(() => window.__hexwild.teleport(-2, 40, 2));
  await aim(page, -2, 40.07, 0, 'lever');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0)))
    .toBe('stone');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(0, 42, 0) || null,
    ),
  ).toBe(null);
  expect(
    await page.evaluate(() =>
      document.querySelector('#world').getContext('webgl2').getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('sticky-lift.json'),
    JSON.stringify({ raised, errors }, null, 2),
  );
});

test('pushing a portable box keeps its contents and mining the actual piston head drops its base exactly once', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 6; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 40, 0, 'piston');
    w.setState(0, 40, 0, { facing: 0, open: false, powered: false });
    w.set(1, 40, 0, 'shulkerBox');
    w.chests.set('1,40,0', [
      { item: 'diamond', count: 7 },
      ...Array(26).fill(null),
    ]);
    w.set(0, 40, 1, 'lever');
    w.setState(0, 40, 1, {
      facing: 0,
      open: false,
      powered: false,
      mount: 'floor',
    });
    g.graphics.updateCells([...cells, [0, 40, 0], [1, 40, 0], [0, 40, 1]]);
    g.teleport(1, 40, 2);
  });
  await aim(page, 0, 40.07, 1, 'lever');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(1, 40, 0)))
    .toBe('pistonHead');
  const box = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return s.dimensions.overworld.drops
      .filter((d) => d.item === 'shulkerBox')
      .map(({ item, count, contents }) => ({ item, count, contents }));
  });
  expect(box).toHaveLength(1);
  expect(box[0].contents[0]).toEqual({ item: 'diamond', count: 7 });
  expect(
    await page.evaluate(() =>
      window.__hexwild.state.world.chests.has('1,40,0'),
    ),
  ).toBe(false);
  await page.evaluate(() => {
    window.__hexwild.teleport(3, 40, 0);
    window.__hexwild.setTool(2);
  });
  await aim(page, 1, 40.5, 0, 'pistonHead');
  await page.screenshot({ path: info.outputPath('head-before-mining.png') });
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
            () => window.__hexwild.state.world.get(0, 40, 0) || null,
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
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(1, 40, 0) || null,
    ),
  ).toBe(null);
  const end = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      inventory: g.state.inventory.piston || 0,
      drops: s.dimensions.overworld.drops
        .filter((d) => d.item === 'piston')
        .map(({ item, count }) => ({ item, count })),
      heads: s.dimensions.overworld.edits.filter(
        ([, t]) => t === 'pistonHead' || t === 'stickyPistonHead',
      ),
    };
  });
  expect(end.inventory + end.drops.reduce((sum, d) => sum + d.count, 0)).toBe(
    1,
  );
  expect(end.heads).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('head-and-box-conservation.json'),
    JSON.stringify({ box, end, errors }, null, 2),
  );
});

test('a player places a downward piston and its real geometry survives quality, resize, context restoration and dimension travel', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 5; q++)
      for (let r = -4; r <= 5; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 49; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 46, 0, 'stone');
    cells.push([0, 46, 0]);
    g.graphics.updateCells(cells);
    g.teleport(0, 42, 0);
  });
  await page.keyboard.press('KeyE');
  await page.locator('#creative-search').fill('活塞');
  await expect(
    page.locator(
      '[data-creative-item="pistonHead"], [data-creative-item="stickyPistonHead"]',
    ),
  ).toHaveCount(0);
  await page.locator('[data-creative-item="piston"]').click();
  await page.locator('[data-inv-slot="pack:0"]').click();
  await page.keyboard.press('Escape');
  await aim(page, 0, 46.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 45, 0)))
    .toBe('piston');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 45, 0).facing,
    ),
  ).toBe(6);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 44, 0, 'stone');
    w.set(1, 44, 0, 'stone');
    w.set(2, 44, 2, 'stone');
    w.set(-2, 44, 2, 'stone');
    w.set(1, 45, 0, 'lever');
    w.setState(1, 45, 0, {
      facing: 0,
      open: false,
      powered: false,
      mount: 'floor',
    });
    g.graphics.updateCells([
      [0, 44, 0],
      [1, 44, 0],
      [1, 45, 0],
      [2, 44, 2],
      [-2, 44, 2],
    ]);
    g.teleport(2, 45, 2);
  });
  await aim(page, 1, 45.07, 0, 'lever');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 44, 0)))
    .toBe('pistonHead');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 43, 0)),
  ).toBe('stone');
  await page.evaluate(() => window.__hexwild.teleport(-2, 45, 2));
  await page.keyboard.press('Digit2');
  await aim(page, 0, 44.1, 0, 'pistonHead');
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true })),
  );
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /活塞/,
  );
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 1, bubbles: true })),
  );
  const heldPiston = await handModels(page);
  expect(heldPiston.main.item).toBe('piston');
  expect(heldPiston.main.vertices).toBeGreaterThan(0);
  await page.keyboard.press('KeyF');
  const offhandPiston = await handModels(page);
  expect(offhandPiston.offhand.item).toBe('piston');
  expect(offhandPiston.offhand.vertices).toBeGreaterThan(0);
  await page.keyboard.press('KeyF');
  const frames = async (n) =>
    page.evaluate(
      (n) =>
        new Promise((resolve) => {
          const next = () => (--n ? requestAnimationFrame(next) : resolve());
          requestAnimationFrame(next);
        }),
      n,
    );
  for (const quality of ['1.7', '1', '0.65', '1.7']) {
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption(quality);
    await page.locator('#resume').click();
    await frames(5);
    expect(
      await page.evaluate(() =>
        document.querySelector('#world').getContext('webgl2').getError(),
      ),
    ).toBe(0);
  }
  await page.setViewportSize({ width: 960, height: 640 });
  await frames(3);
  await page.evaluate(() => window.__hexwild.lookAt(0, 44.5, 0));
  await page.screenshot({ path: info.outputPath('downward-piston-high.png') });
  const supported = await page.evaluate(() => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.pistonRestored = false;
    canvas.addEventListener(
      'webglcontextrestored',
      () => (window.pistonRestored = true),
      { once: true },
    );
    window.restorePistonContext = () => ext.restoreContext();
    ext.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restorePistonContext());
  await expect
    .poll(() => page.evaluate(() => window.pistonRestored), { timeout: 30000 })
    .toBe(true);
  await frames(8);
  expect(
    await page.evaluate(() =>
      document.querySelector('#world').getContext('webgl2').getError(),
    ),
  ).toBe(0);
  await page.evaluate(() => window.__hexwild.travel('nether'));
  await frames(3);
  await page.evaluate(() => window.__hexwild.travel('overworld'));
  await frames(5);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 45, 0).open,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 43, 0)),
  ).toBe('stone');
  expect(
    await page.evaluate(() =>
      document.querySelector('#world').getContext('webgl2').getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('piston-graphics-lifecycle.json'),
    JSON.stringify(
      {
        facing: 6,
        quality: [1.7, 1, 0.65, 1.7],
        contextRestored: true,
        heldPiston,
        offhandPiston,
        errors,
      },
      null,
      2,
    ),
  );
});

test('a real powered piston breaks a planted chorus flower once and saves no orphaned growth state', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -3; q <= 5; q++)
      for (let r = -3; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(1, 39, 0, 'endstone');
    w.set(1, 40, 0, 'chorusFlower');
    w.chorus.set('1,40,0', { stage: 2, time: 7 });
    w.set(0, 40, 0, 'piston');
    w.setState(0, 40, 0, { facing: 0, open: false, powered: false });
    w.set(0, 40, 1, 'lever');
    w.setState(0, 40, 1, {
      facing: 0,
      open: false,
      powered: false,
      mount: 'floor',
    });
    g.graphics.updateCells([...cells, [1, 40, 0], [0, 40, 0], [0, 40, 1]]);
    g.teleport(1, 40, 2);
  });
  await aim(page, 0, 40.07, 1, 'lever');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(1, 40, 0)))
    .toBe('pistonHead');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(2, 40, 0) || null,
    ),
  ).toBe(null);
  const result = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      growth: s.dimensions.overworld.chorus,
      flowers: s.dimensions.overworld.drops
        .filter((d) => d.item === 'chorusFlower')
        .map(({ item, count }) => ({ item, count })),
      inventory: g.state.inventory.chorusFlower || 0,
    };
  });
  expect(result.growth).toEqual([]);
  expect(
    result.inventory + result.flowers.reduce((sum, d) => sum + d.count, 0),
  ).toBe(1);
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(1, 40, 0)),
  ).toBe('pistonHead');
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('chorus-conservation.json'),
    JSON.stringify({ result, errors }, null, 2),
  );
});
