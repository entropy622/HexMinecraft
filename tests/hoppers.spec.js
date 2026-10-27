import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
const check = expect.configure({ timeout: 60000 });
test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const snapshot = await page
    .evaluate(() => {
      const g = window.__hexwild;
      if (!g) return { ready: false };
      g.save();
      const w = g.state.world,
        s = JSON.parse(localStorage.getItem('hexwild-save-v16')),
        t = g.state.target;
      return {
        playing: g.state.playing,
        position: g.state.position,
        target: t && { q: t.q, y: t.y, r: t.r, type: t.type },
        cell: w.get(0, 41, 0),
        state: w.state(0, 41, 0),
        circuits: [...w.circuitCells],
        cooldowns: [...w.hoppers.cooldowns],
        chests: [...w.chests],
        drops: s.dimensions.overworld?.drops,
      };
    })
    .catch((e) => ({ error: e.message }));
  await writeFile(
    info.outputPath('failure-state.json'),
    JSON.stringify(snapshot, null, 2),
  );
});

async function use(page, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
  if (shift) await page.keyboard.up('Shift');
}
async function aim(page, q, y, r, type) {
  await page.evaluate((p) => window.__hexwild.lookAt(...p), [q, y, r]);
  await check
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q || 0, t.r || 0, t.type];
      }),
    )
    .toEqual([q, r, type]);
}
async function platform(page) {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/', { timeout: 90000 });
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -5; q <= 7; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 40, 0, 'chest');
    w.chests.set('0,40,0', Array(27).fill(null));
    cells.push([0, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-1, 40, 0);
  });
}

test('player places a five-slot hopper, transfers through its live UI, unlocks it and continues a saved pipeline', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('ingot', 5);
    g.give('chest', 1);
    g.give('stone', 64);
    g.state.world.set(-2, 40, 0, 'workbench');
    g.graphics.updateCells([[-2, 40, 0]]);
  });
  await aim(page, -2, 40.5, 0, 'workbench');
  await use(page);
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.locator('#recipe-search').fill('漏斗');
  await page.locator('[data-recipe]').filter({ hasText: '漏斗' }).click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.hopper),
  ).toBe(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('hopper');
  });
  await aim(page, 0, 41, 0, 'chest');
  await use(page, true);
  await check
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0)))
    .toBe('hopper');
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(1, 40, 0, 'stone');
    w.set(1, 41, 0, 'lever');
    w.setState(1, 41, 0, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: true,
    });
    g.graphics.updateCells([
      [1, 40, 0],
      [1, 41, 0],
    ]);
  });
  await check
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 41, 0).powered),
    )
    .toBe(true);
  await aim(page, 0, 41.9, 0, 'hopper');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  await expect(page.locator('[data-inv-slot^="box:"]')).toHaveCount(5);
  const index = await page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(
      localStorage.getItem('hexwild-save-v16'),
    ).inventory.slots.findIndex((s) => s?.item === 'stone');
  });
  await page
    .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
    .click({ modifiers: ['Shift'] });
  await check
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.world.chests.get('0,41,0')[0]?.count,
      ),
    )
    .toBe(64);
  await page.screenshot({ path: info.outputPath('hopper-ui.png') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.teleport(1, 40, -1));
  await aim(page, 1, 41.25, 0, 'lever');
  await use(page);
  await check
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.world.chests.get('0,40,0')[0]?.count || 0,
      ),
    )
    .toBeGreaterThan(1);
  await aim(page, 0, 41.9, 0, 'hopper');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  const liveSlot = page.locator('#station-overlay [data-inv-slot="box:0"]'),
    liveButton = await liveSlot.elementHandle(),
    initialLabel = await liveSlot.getAttribute('aria-label');
  await check
    .poll(() => liveSlot.getAttribute('aria-label'))
    .not.toBe(initialLabel);
  expect(await liveButton.evaluate((button) => button.isConnected)).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.teleport(-1, 40, 0));
  await aim(page, 0, 40.5, 0, 'chest');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  await expect(page.locator('[data-inv-slot^="box:"]')).toHaveCount(27);
  await check
    .poll(() =>
      page.locator('[data-inv-slot="box:0"]').getAttribute('aria-label'),
    )
    .toContain('石头');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => {
    window.__hexwild.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
      .overworld;
    return {
      slots: Object.fromEntries(s.chests)['0,41,0'].length,
      down: Object.fromEntries(s.blockStates)['0,41,0'].down,
      total: s.chests
        .filter(([k]) => ['0,40,0', '0,41,0'].includes(k))
        .flatMap(([, s]) => s)
        .reduce((n, s) => n + (s?.count || 0), 0),
    };
  });
  expect(before).toEqual({ slots: 5, down: true, total: 64 });
  await page.reload();
  await page.locator('#continue').click();
  const restored = await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    return ['0,40,0', '0,41,0']
      .flatMap((k) => w.chests.get(k))
      .reduce((n, s) => n + (s?.count || 0), 0);
  });
  expect(restored).toBe(64);
  const dimensionRoundTrip = await page.evaluate(() => {
    const g = window.__hexwild;
    g.travel('nether');
    const isolated = !g.state.world.chests.has('0,41,0');
    g.travel('overworld');
    return {
      isolated,
      total: ['0,40,0', '0,41,0']
        .flatMap((k) => g.state.world.chests.get(k))
        .reduce((n, s) => n + (s?.count || 0), 0),
      shared: g.state.chests === g.state.world.chests,
    };
  });
  expect(dimensionRoundTrip).toEqual({
    isolated: true,
    total: 64,
    shared: true,
  });

  await writeFile(
    info.outputPath('pipeline.json'),
    JSON.stringify(
      { before, restored, dimensionRoundTrip, liveDOMPreserved: true, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test.describe('mobile hopper inventory', () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  test('touch places a side outlet without support and splits then quick-transfers five-slot stock', async ({
    page,
  }, info) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await platform(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const g = window.__hexwild,
        w = g.state.world;
      w.set(-1, 40, -1, 'lever');
      w.setState(-1, 40, -1, {
        facing: 0,
        open: false,
        mount: 'floor',
        powered: true,
      });
      g.graphics.updateCells([[-1, 40, -1]]);
      g.give('hopper', 1);
      g.give('egg', 4);
      g.selectItem('hopper');
      g.teleport(-2, 40, 0);
    });
    const center = async (selector) => {
      const b = await page.locator(selector).boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const shift = await center('[data-key="ShiftLeft"]'),
      place = await center('[data-action="place"]');
    const driver = await page.context().newCDPSession(page);
    await driver.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...shift, id: 1 }],
    });
    await check
      .poll(() =>
        page.evaluate(() => {
          window.__hexwild.save();
          return JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
            .overworld.crouching;
        }),
      )
      .toBe(true);
    await aim(page, 0, 40.1, 0, 'chest');
    await driver.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { ...shift, id: 1 },
        { ...place, id: 2 },
      ],
    });
    await driver.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await check
      .poll(() =>
        page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 0)),
      )
      .toBe('hopper');
    const placed = await page.evaluate(() => {
      const g = window.__hexwild,
        w = g.state.world,
        s = w.state(-1, 40, 0);
      w.set(-1, 39, 0, null);
      g.graphics.updateCells([[-1, 39, 0]]);
      return { facing: s.facing, down: s.down };
    });
    expect(placed).toEqual({ facing: 0, down: false });
    await check
      .poll(() =>
        page.evaluate(
          () => window.__hexwild.state.world.state(-1, 40, 0).powered,
        ),
      )
      .toBe(true);
    // Releasing the touch crouch changes eye height. Wait for the real stance,
    // then aim at the solid basin bottom rather than through the open mouth.
    await check
      .poll(() =>
        page.evaluate(() => {
          window.__hexwild.save();
          return JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
            .overworld.crouching;
        }),
      )
      .toBe(false);
    await aim(page, -1, 40.325, 0, 'hopper');
    await page.locator('[data-action="interact"]').tap();
    await expect(page.locator('#station-overlay')).toBeVisible();
    await expect(
      page.locator('#station-overlay [data-inv-slot^="box:"]'),
    ).toHaveCount(5);
    const index = await page.evaluate(() => {
      window.__hexwild.save();
      return JSON.parse(
        localStorage.getItem('hexwild-save-v16'),
      ).inventory.slots.findIndex((s) => s?.item === 'egg');
    });
    await page.locator('#station-overlay [data-inventory-mode="single"]').tap();
    await page
      .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
      .tap();
    for (const i of [0, 1])
      await page.locator(`#station-overlay [data-inv-slot="box:${i}"]`).tap();
    const split = await page.evaluate(() =>
      window.__hexwild.state.world.chests
        .get('-1,40,0')
        .map((s) => s?.count || 0),
    );
    expect(split).toEqual([1, 1, 0, 0, 0]);
    await page.screenshot({ path: info.outputPath('hopper-mobile.png') });
    await page.locator('#station-overlay [data-inventory-mode="quick"]').tap();
    for (const i of [0, 1])
      await page.locator(`#station-overlay [data-inv-slot="box:${i}"]`).tap();
    const result = await page.evaluate(() => ({
      stock: window.__hexwild.state.world.chests.get('-1,40,0').filter(Boolean)
        .length,
      eggs: window.__hexwild.state.inventory.egg,
      unsupported: window.__hexwild.state.world.get(-1, 40, 0) === 'hopper',
      lock: !!document.pointerLockElement,
      width: document.documentElement.scrollWidth,
    }));
    expect(result).toEqual({
      stock: 0,
      eggs: 4,
      unsupported: true,
      lock: false,
      width: 390,
    });
    await writeFile(
      info.outputPath('touch.json'),
      JSON.stringify({ placed, split, result, errors }, null, 2),
    );
    expect(errors).toEqual([]);
  });
});

test('actual furnace ports feed and drain while the furnace UI stays live, retaining automation XP for manual collection', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world;
    const { newFurnace } = await import('/src/furnaces.js');
    const put = (q, y, r, type, state = {}) => {
      w.set(q, y, r, type);
      w.setState(q, y, r, { facing: 0, open: false, ...state });
      if (type === 'hopper')
        w.chests.set(`${q},${y},${r}`, Array(5).fill(null));
    };
    put(0, 39, 0, 'chest');
    w.chests.set('0,39,0', Array(27).fill(null));
    put(0, 40, 0, 'hopper');
    put(0, 41, 0, 'furnace');
    put(0, 42, 0, 'hopper');
    put(-1, 41, 0, 'hopper', { down: false, facing: 0 });
    put(0, 43, 0, 'chest');
    w.chests.set('0,43,0', Array(27).fill(null));
    w.chests.get('0,43,0')[0] = { item: 'rawIron', count: 1 };
    w.chests.get('-1,41,0')[0] = { item: 'coal', count: 2 };
    // Resume a real almost-finished furnace rather than waiting ten simulated
    // seconds per software-rendered browser run.
    const f = newFurnace();
    Object.assign(f, {
      input: { item: 'rawIron', count: 1 },
      progress: 9.8,
      burn: 0.4,
      burnTotal: 80,
      xp: 1200,
    });
    w.furnaces.set('0,41,0', f);
    g.graphics.updateCells([
      [0, 39, 0],
      [0, 40, 0],
      [0, 41, 0],
      [0, 42, 0],
      [0, 43, 0],
      [-1, 41, 0],
    ]);
    g.teleport(1, 40, -1);
  });
  await aim(page, 0, 41.6, 0, 'furnace');
  await use(page);
  await expect(page.locator('#furnace-progress')).toBeVisible();
  await check
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.world.chests.get('0,39,0')[0]?.item,
      ),
    )
    .toBe('ingot');
  const automated = await page.evaluate(() => {
    const w = window.__hexwild.state.world,
      f = w.furnaces.get('0,41,0');
    return {
      top: w.chests.get('0,42,0').filter(Boolean),
      source: w.chests.get('0,43,0').filter(Boolean),
      side: w.chests.get('-1,41,0').filter(Boolean),
      out: f.output,
      xp: f.xp,
      fuel: f.fuel?.item,
      input: f.input?.item,
    };
  });
  expect(automated).toEqual({
    top: [],
    source: [],
    side: [],
    out: null,
    xp: 1200.7,
    fuel: 'coal',
    input: 'rawIron',
  });
  await expect(page.locator('[data-inv-slot="furnace:fuel"]')).toHaveAttribute(
    'aria-label',
    /煤炭/,
  );
  // Lock the extracting hopper through a real powered support.
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(1, 39, 0, 'stone');
    w.set(1, 40, 0, 'lever');
    w.setState(1, 40, 0, {
      facing: 0,
      open: false,
      mount: 'floor',
      powered: true,
    });
    const f = w.furnaces.get('0,41,0');
    f.progress = 9.9;
    f.burn = 1;
    f.burnTotal = 80;
    g.graphics.updateCells([
      [1, 39, 0],
      [1, 40, 0],
    ]);
  });
  await check
    .poll(() =>
      page
        .locator('[data-inv-slot="furnace:output"]')
        .getAttribute('aria-label'),
    )
    .toContain('铁锭');
  await page
    .locator('[data-inv-slot="furnace:output"]')
    .click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.furnaces.get('0,41,0').xp,
    ),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__hexwild.teleport(3, 40, -3);
    window.__hexwild.lookAt(0, 41.6, 0);
  });
  await page.screenshot({ path: info.outputPath('hopper-furnace.png') });
  await writeFile(
    info.outputPath('furnace.json'),
    JSON.stringify({ automated, manualXPCleared: true, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

test('restored loose equipment and a filled portable box enter the open mouth, then mining spills each exactly once', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  const wear = [
    17,
    { value: 23, enchant: { efficiency: 1 }, name: '洞穴矿镐' },
  ];
  const fixture = await page.evaluate((wear) => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 41, 0, 'hopper');
    w.setState(0, 41, 0, { facing: 0, open: false, down: false });
    w.chests.set('0,41,0', Array(5).fill(null));
    g.teleport(-2, 40, 0);
    g.lookAt(0, 41.9, 0);
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    const contents = Array(27).fill(null);
    contents[0] = { item: 'egg', count: 16 };
    const drop = (item, count, extra = {}) => ({
      item,
      count,
      position: [0, 42.25, 0],
      velocity: [0, 0, 0],
      wear: {},
      life: 300,
      delay: 0.8,
      ...extra,
    });
    s.dimensions.overworld.drops = [
      drop('pick1', 2, { wear: { pick1: wear } }),
      drop('stone', 10),
      drop('shulkerBox', 1, { contents }),
    ];
    return s;
  }, wear);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-save-v16', JSON.stringify(s)),
    fixture,
  );
  await page.reload();
  await page.locator('#continue').click();
  await check
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.state.world.chests.get('0,41,0').filter(Boolean)
            .length,
      ),
    )
    .toBe(4);
  const absorbed = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      slots: g.state.world.chests.get('0,41,0'),
      remaining: s.dimensions.overworld.drops.filter((d) =>
        ['pick1', 'stone', 'shulkerBox'].includes(d.item),
      ).length,
    };
  });
  expect(
    absorbed.slots.filter((s) => s?.item === 'pick1').map((s) => s.wear),
  ).toEqual(wear);
  expect(
    absorbed.slots.find((s) => s?.item === 'shulkerBox').contents[0],
  ).toEqual({ item: 'egg', count: 16 });
  expect(absorbed.remaining).toBe(0);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(-1, 40, 0, 'stone');
    g.graphics.updateCells([[-1, 40, 0]]);
    g.teleport(-1, 41, 0);
    g.setTool(2);
  });
  await aim(page, 0, 41.9, 0, 'hopper');
  await page.screenshot({ path: info.outputPath('hopper-mouth.png') });
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await check
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0) || null),
    )
    .toBe(null);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.keyboard.press('Escape');
  const spilled = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16')),
      d = s.dimensions.overworld;
    return {
      stored: d.chests.some(([k]) => k === '0,41,0'),
      cooldown: d.hopperCooldowns.some(([k]) => k === '0,41,0'),
      counts: Object.fromEntries(
        ['pick1', 'stone', 'shulkerBox', 'hopper'].map((item) => [
          item,
          d.drops
            .filter((x) => x.item === item)
            .reduce((n, x) => n + x.count, 0) +
            s.inventory.slots
              .filter((x) => x?.item === item)
              .reduce((n, x) => n + x.count, 0),
        ]),
      ),
      boxContents: (
        d.drops.find((x) => x.item === 'shulkerBox') ||
        s.inventory.slots.find((x) => x?.item === 'shulkerBox')
      )?.contents,
      tools: [
        ...d.drops
          .filter((x) => x.item === 'pick1')
          .flatMap((x) => x.wear.pick1),
        ...s.inventory.slots
          .filter((x) => x?.item === 'pick1')
          .map((x) => x.wear),
      ].sort(
        (a, b) =>
          (typeof a === 'number' ? a : a.value) -
          (typeof b === 'number' ? b : b.value),
      ),
    };
  });
  expect(spilled).toEqual({
    stored: false,
    cooldown: false,
    counts: { pick1: 2, stone: 10, shulkerBox: 1, hopper: 1 },
    boxContents: Array.from({ length: 27 }, (_, i) =>
      i === 0 ? { item: 'egg', count: 16 } : null,
    ),
    tools: wear,
  });
  await writeFile(
    info.outputPath('loose-recovery.json'),
    JSON.stringify({ absorbed, spilled, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
