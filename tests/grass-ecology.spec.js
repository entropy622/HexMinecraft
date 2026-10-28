import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(180000);

test('a grazed pasture recovers, opaque cover kills grass, and streaming/continue keep terrain', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  const saved = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
  const { World } = await import('../src/world.js');
  const w = new World(saved.seed, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  w.ensureAround(4, 4, 1);
  for (let q = 0; q <= 7; q++)
    for (let r = 0; r <= 7; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
    }
  w.set(4, 39, 4, 'grass');
  w.set(3, 39, 4, 'grass');
  const { axialToWorld } = await import('../src/core.js');
  const sheepPoint = axialToWorld(3, 4);
  const fauna = saved.dimensions.overworld.fauna;
  const sheep = {
    ...fauna.mobs[0],
    kind: 'sheep',
    position: [sheepPoint.x, 40, sheepPoint.z],
    hp: 8,
    baby: 0,
    wool: 0.05,
    love: 0,
    cooldown: 0,
  };
  saved.dimensions.overworld = {
    ...saved.dimensions.overworld,
    ...w.serialize(),
    fauna: { ...fauna, mobs: [sheep] },
  };
  saved.time = 100;
  await page.locator('#save-file').setInputFiles({
    name: 'grass-pasture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time))
    .toBeGreaterThanOrEqual(100);
  await page.evaluate(() => {
    // Randomness is the external boundary. This also makes all four spread
    // attempts compete for the same cell through the real maintenance loop.
    Math.random = () => 0.61;
    window.__hexwild.teleport(1, 40, 4);
  });
  const cell = (q, y, r) =>
    page.evaluate(
      ([q, y, r]) => window.__hexwild.state.world.get(q, y, r) || null,
      [q, y, r],
    );
  await expect.poll(() => cell(3, 39, 4)).toBe('dirt');
  const paused = await page.evaluate(() => {
    const g = window.__hexwild;
    g.open('#pause-overlay');
    return g.state.time;
  });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(paused);
  expect(await cell(3, 39, 4)).toBe('dirt');
  await page.evaluate(() => window.__hexwild.close());
  await expect.poll(() => cell(3, 39, 4), { timeout: 30000 }).toBe('grass');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('stone', 1);
    g.selectItem('stone');
    g.teleport(3, 40, 3);
    g.lookAt(4, 39.99, 4);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('grass');
  for (const type of ['mousedown', 'mouseup'])
    await page.locator('#world').dispatchEvent(type, { button: 2 });
  await expect.poll(() => cell(4, 40, 4)).toBe('stone');
  await expect.poll(() => cell(4, 39, 4), { timeout: 30000 }).toBe('dirt');
  await page.screenshot({ path: info.outputPath('covered-pasture.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(180, 45, 180);
    g.teleport(3, 40, 3);
    g.save();
  });
  expect(await cell(4, 39, 4)).toBe('dirt');
  expect(await cell(3, 39, 4)).toBe('grass');
  await page.reload();
  await page.locator('#continue').click();
  expect(await cell(4, 39, 4)).toBe('dirt');
  expect(await cell(3, 39, 4)).toBe('grass');
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    const sheep = s.dimensions.overworld.fauna.mobs.find(
      (m) => m.kind === 'sheep',
    );
    return {
      coveredSource: g.state.world.get(4, 39, 4),
      recoveredPasture: g.state.world.get(3, 39, 4),
      cover: g.state.world.get(4, 40, 4),
      recoveredWool: sheep.wool === 0,
      collision: g.state.world.solid(3, 39, 4),
      gl: g.graphics.renderer.getContext().getError(),
      saveVersion: s.version,
    };
  });
  expect(manifest).toEqual({
    coveredSource: 'dirt',
    recoveredPasture: 'grass',
    cover: 'stone',
    recoveredWool: true,
    collision: true,
    gl: 0,
    saveVersion: 16,
  });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('grass-ecology.json'),
    JSON.stringify(
      { ...manifest, paused: true, streamed: true, continued: true, errors },
      null,
      2,
    ),
  );
});
