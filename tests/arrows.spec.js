import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.setViewportSize({ width: 800, height: 600 });
});

test('creative inventory exposes a distinct Slowness arrow stack', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('KeyE');
  await page.locator('#creative-search').fill('缓慢之箭');
  const arrow = page.getByRole('button', { name: '缓慢之箭', exact: true });
  await expect(arrow).toBeVisible();
  await arrow.click();
  await page.locator('[data-inv-slot="pack:8"]').click();
  await page.keyboard.press('KeyE');
  const inventory = await page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16')).inventory;
  });
  expect(inventory.slots[8]).toMatchObject({
    item: 'slownessArrow',
    count: 64,
  });
  await writeFile(
    info.outputPath('creative-ammo.json'),
    JSON.stringify(inventory, null, 2),
  );
  await page.screenshot({ path: info.outputPath('slowness-arrow.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('bow', 1);
    g.selectItem('bow');
    g.lookAt(10, 64, 0);
  });
  await expect(page.locator('#combat-status')).toContainText('缓慢之箭 ∞');
  await shoot(page);
  const fired = await snapshot(page);
  expect(
    fired.inventory.slots
      .filter((s) => s?.item === 'slownessArrow')
      .reduce((n, s) => n + s.count, 0),
  ).toBe(64);
});

async function waitGame(page, seconds) {
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(
      () =>
        page.evaluate((start) => window.__hexwild.state.time - start, start),
      { timeout: Math.max(20000, seconds * 5000) },
    )
    .toBeGreaterThanOrEqual(seconds);
}
async function snapshot(page) {
  return page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
}
async function load(page, saved) {
  saved.time += 1;
  const time = saved.time;
  await page.locator('#save-file').setInputFiles({
    name: 'arrows.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time), {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(time);
}
async function platform(page) {
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    g.setPlaying(false);
    for (let q = -8; q <= 8; q++)
      for (let r = -5; r <= 5; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 63; y++) w.set(q, y, r, null);
      }
    g.graphics.updateCells(
      Array.from({ length: 17 }, (_, i) => i - 8).flatMap((q) =>
        [-1, 0, 1].map((r) => [q, 39, r]),
      ),
    );
    g.teleport(-3, 40, 0);
    g.lookAt(5, 41.65, 0);
  });
  return snapshot(page);
}
async function shoot(page, aim) {
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })),
  );
  await waitGame(page, 1.1);
  if (aim) await page.evaluate(aim);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })),
  );
  await waitGame(page, 0.7);
}
async function cowSpeed(page) {
  await page.evaluate(() => {
    const g = window.__hexwild,
      p = g.graphics.scene.children.find(
        (m) => m.userData.kind === 'cow',
      ).position;
    g.selectItem('wheat');
    g.teleport((p.x - 7) / Math.sqrt(3) - p.z / 3, 40, (2 * p.z) / 3);
  });
  await waitGame(page, 0.4);
  const before = await snapshot(page);
  await waitGame(page, 1);
  const after = await snapshot(page);
  const a = before.dimensions.overworld.fauna.mobs.find(
      (m) => m.kind === 'cow',
    ),
    b = after.dimensions.overworld.fauna.mobs.find((m) => m.kind === 'cow');
  return (
    Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]) /
    (after.time - before.time)
  );
}

test('a real bow applies Slowness to a moving cow, preserving its timer through continue and expiring', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const saved = await platform(page);
  // Caller shape comes from an actual world save; no synthetic entity test API.
  const template = saved.dimensions.overworld.fauna.mobs.find(
    (m) => m.kind === 'cow',
  );
  expect(template).toBeTruthy();
  saved.dimensions.overworld.fauna.mobs = [
    { ...template, position: [0, 40, 0], hp: 10, angle: Math.PI / 2 },
  ];
  saved.inventory.slots.fill(null);
  saved.inventory.slots[0] = { item: 'bow', count: 1, wear: 384 };
  saved.inventory.slots[1] = { item: 'wheat', count: 4 };
  saved.inventory.gear.fill(null);
  saved.inventory.gear[4] = { item: 'slownessArrow', count: 3 };
  saved.selected = 0;
  await load(page, saved);
  await expect(page.locator('#combat-status')).toContainText('缓慢之箭 3');
  await page.evaluate(() => {
    window.originalRandom = Math.random;
    Math.random = () => 0;
  });
  await shoot(page, () => {
    const g = window.__hexwild,
      p = g.graphics.scene.children.find(
        (m) => m.userData.kind === 'cow',
      ).position;
    g.lookAt(p.x / Math.sqrt(3) - p.z / 3, p.y + 0.7, (2 * p.z) / 3);
  });
  await page.evaluate(() => {
    Math.random = window.originalRandom;
  });
  const hit = await snapshot(page),
    cow = hit.dimensions.overworld.fauna.mobs.find((m) => m.kind === 'cow');
  expect(cow.hp).toBeLessThan(10);
  expect(cow.hp).toBeGreaterThan(0);
  expect(cow.slowness).toBeGreaterThan(28);
  expect(hit.inventory.gear[4].count).toBe(2);
  await page.keyboard.press('Escape');
  await page.locator('#home').click();
  await page.locator('#continue').click();
  const continued = await snapshot(page);
  expect(
    continued.dimensions.overworld.fauna.mobs.find((m) => m.kind === 'cow')
      .slowness,
  ).toBeGreaterThan(25);
  await waitGame(page, 3.2);
  const slow = await cowSpeed(page);
  expect(slow).toBeGreaterThan(1.1);
  expect(slow).toBeLessThan(1.27);
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const paused = await snapshot(page);
  await page.waitForTimeout(500);
  expect(
    (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
      (m) => m.kind === 'cow',
    ).slowness,
  ).toBe(
    paused.dimensions.overworld.fauna.mobs.find((m) => m.kind === 'cow')
      .slowness,
  );
  await page.evaluate(() => window.__hexwild.setPlaying(true));
  await waitGame(page, 30);
  const expired = await snapshot(page);
  expect(
    expired.dimensions.overworld.fauna.mobs.find((m) => m.kind === 'cow')
      .slowness,
  ).toBeUndefined();
  const normal = await cowSpeed(page);
  expect(slow / normal).toBeGreaterThan(0.8);
  expect(slow / normal).toBeLessThan(0.9);
  // Import validation rejects corrupt durations without losing the current world.
  const invalid = structuredClone(expired);
  invalid.dimensions.overworld.fauna.mobs[0].slowness = 31;
  await page.locator('#save-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator('#toast')).toContainText('导入失败');
  await writeFile(
    info.outputPath('cow-slowness.json'),
    JSON.stringify(
      {
        hit: cow,
        continued: continued.dimensions.overworld.fauna.mobs[0],
        slow,
        normal,
        ratio: slow / normal,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('offhand tipped ammo is consumed by Infinity, full packs retain arrows until exact-type recovery', async ({
  page,
}, info) => {
  const saved = await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let r = -3; r <= 3; r++)
      for (let y = 40; y <= 44; y++) w.set(3, y, r, 'stone');
    g.graphics.updateCells([40, 41, 42, 43, 44].map((y) => [3, y, 0]));
    g.save();
  });
  const setup = await snapshot(page);
  setup.inventory.slots.fill(null);
  for (let i = 2; i < 36; i++)
    setup.inventory.slots[i] = { item: 'stone', count: 64 };
  setup.inventory.slots[0] = {
    item: 'bow',
    count: 1,
    wear: { value: 384, enchant: { infinity: 1 } },
  };
  setup.inventory.slots[1] = { item: 'arrow', count: 4 };
  setup.inventory.gear.fill(null);
  setup.inventory.gear[4] = { item: 'slownessArrow', count: 1 };
  setup.dimensions.overworld.fauna.mobs = [];
  setup.selected = 0;
  await load(page, setup);
  await expect(page.locator('#combat-status')).toContainText('缓慢之箭 1');
  await expect(page.locator('#combat-status')).not.toContainText('（无限）');
  await shoot(page);
  const fired = await snapshot(page);
  expect(fired.inventory.gear[4]).toBeNull();
  expect(fired.inventory.slots[1].count).toBe(4);
  await expect(page.locator('#combat-status')).toContainText('箭矢 4（无限）');
  await shoot(page);
  expect((await snapshot(page)).inventory.slots[1].count).toBe(4);
  await page.evaluate(() => window.__hexwild.teleport(2, 40, 0));
  await waitGame(page, 1);
  expect(
    (await snapshot(page)).inventory.slots.some(
      (s) => s?.item === 'slownessArrow',
    ),
  ).toBe(false);
  await page.evaluate(() => window.__hexwild.give('stone', 33 * 64));
  await expect
    .poll(async () =>
      (await snapshot(page)).inventory.slots
        .filter((s) => s?.item === 'slownessArrow')
        .reduce((n, s) => n + s.count, 0),
    )
    .toBe(1);
  const recovered = await snapshot(page);
  expect(
    recovered.inventory.slots
      .filter((s) => s?.item === 'arrow')
      .reduce((n, s) => n + s.count, 0),
  ).toBe(4);
  // The recovered arrow follows the existing inventory F swap into the offhand.
  await page.keyboard.press('KeyE');
  const index = recovered.inventory.slots.findIndex(
    (s) => s?.item === 'slownessArrow',
  );
  await page.locator(`[data-inv-slot="pack:${index}"]`).hover();
  await page.keyboard.press('KeyF');
  await page.keyboard.press('KeyE');
  expect((await snapshot(page)).inventory.gear[4]?.item).toBe('slownessArrow');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-3, 40, 0);
    g.lookAt(5, 41.65, 0);
  });
  await shoot(page);
  await waitGame(page, 30.5);
  await page.evaluate(() => window.__hexwild.teleport(2, 40, 0));
  await expect
    .poll(async () =>
      (await snapshot(page)).inventory.slots
        .filter((s) => s?.item === 'arrow')
        .reduce((n, s) => n + s.count, 0),
    )
    .toBe(5);
  const expired = await snapshot(page);
  await writeFile(
    info.outputPath('infinity-recovery.json'),
    JSON.stringify(
      {
        fired: fired.inventory,
        recovered: recovered.inventory,
        expired: expired.inventory,
      },
      null,
      2,
    ),
  );
});

test('an offhand bow consumes selected main-hand ammo before other pack arrows', async ({
  page,
}, info) => {
  const saved = await platform(page);
  saved.inventory.slots.fill(null);
  saved.inventory.slots[0] = { item: 'slownessArrow', count: 2 };
  saved.inventory.slots[1] = { item: 'arrow', count: 4 };
  saved.inventory.gear.fill(null);
  saved.inventory.gear[4] = { item: 'bow', count: 1, wear: 384 };
  saved.dimensions.overworld.fauna.mobs = [];
  saved.selected = 0;
  await load(page, saved);
  await expect(page.locator('#combat-status')).toContainText(
    '副手 · 缓慢之箭 2',
  );
  await shoot(page);
  const tipped = await snapshot(page);
  expect(tipped.inventory.slots[0]).toEqual({
    item: 'slownessArrow',
    count: 1,
  });
  expect(tipped.inventory.slots[1].count).toBe(4);
  await page.keyboard.press('Digit2');
  await expect(page.locator('#combat-status')).toContainText('副手 · 箭矢 4');
  await shoot(page);
  const ordinary = await snapshot(page);
  expect(
    ordinary.inventory.slots
      .filter((s) => s?.item === 'arrow')
      .reduce((n, s) => n + s.count, 0),
  ).toBe(3);
  expect(
    ordinary.inventory.slots
      .filter((s) => s?.item === 'slownessArrow')
      .reduce((n, s) => n + s.count, 0),
  ).toBe(1);
  expect(ordinary.inventory.gear[4].wear).toBe(382);
  await writeFile(
    info.outputPath('offhand-bow.json'),
    JSON.stringify(
      { tipped: tipped.inventory, ordinary: ordinary.inventory },
      null,
      2,
    ),
  );
});
