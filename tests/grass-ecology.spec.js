import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(180000);
const diagnostics = new WeakMap();
test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const state = await page
    .evaluate(() => {
      const g = window.__hexwild;
      if (!g) return { game: false };
      g.save();
      const gl = g.graphics.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        time: g.state.time,
        playing: g.state.playing,
        position: g.state.position,
        target: g.state.target && {
          q: g.state.target.q,
          y: g.state.target.y,
          r: g.state.target.r,
          type: g.state.target.type,
          place: g.state.target.place,
        },
        source: g.state.world.get(4, 39, 4),
        pasture: g.state.world.get(3, 39, 4),
        cover: g.state.world.get(4, 40, 4),
        lightRevision: g.graphics.voxelLight.revision,
        worldRevision: g.state.world.lightRevision,
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        gl: gl.getError(),
        fauna: JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
          .overworld.fauna,
      };
    })
    .catch((error) => ({ error: error.message }));
  await writeFile(
    info.outputPath('diagnostics.json'),
    JSON.stringify({ state, ...diagnostics.get(page) }, null, 2),
  );
});

test('a grazed pasture recovers, opaque cover kills grass, and streaming/continue keep terrain', async ({
  page,
}, info) => {
  const errors = [];
  const warnings = [];
  const consoleErrors = [];
  diagnostics.set(page, { errors, warnings, consoleErrors });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') consoleErrors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
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
  const playerPoint = axialToWorld(1, 4);
  saved.position = [playerPoint.x, 41.68, playerPoint.z];
  await page.evaluate(() => {
    Math.random = () => 0.61;
  });
  // Observe every real rendered frame before importing, so the short lived
  // grazed state cannot disappear between an out-of-process poll and pause.
  const pauseReceipt = page.waitForFunction(
    () => {
      const g = window.__hexwild;
      if (g.state.world.get(3, 39, 4) !== 'dirt') return false;
      g.open('#pause-overlay');
      return g.state.time;
    },
    null,
    { polling: 'raf', timeout: 30000 },
  );
  await page.locator('#save-file').setInputFiles({
    name: 'grass-pasture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  const paused = await (await pauseReceipt).jsonValue();
  const cell = (q, y, r) =>
    page.evaluate(
      ([q, y, r]) => window.__hexwild.state.world.get(q, y, r) || null,
      [q, y, r],
    );
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(paused);
  expect(await cell(3, 39, 4)).toBe('dirt');
  await page.evaluate(() => window.__hexwild.close());
  await expect.poll(() => cell(3, 39, 4), { timeout: 30000 }).toBe('grass');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('stone', 1);
    g.selectItem('stone');
    g.teleport(4, 40, 5);
    g.lookAt(4, 39.99, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.y, t.r, t.type, t.place.q, t.place.y, t.place.r];
      }),
    )
    .toEqual([4, 39, 4, 'grass', 4, 40, 4]);
  await expect(page.locator('#target')).toHaveText('草地');
  await writeFile(
    info.outputPath('placement-before.json'),
    JSON.stringify(
      await page.evaluate(() => {
        const g = window.__hexwild;
        return {
          position: g.state.position,
          playing: g.state.playing,
          stone: g.state.inventory.stone,
          selected: g.state.hotbar,
          targetText: document.querySelector('#target').textContent,
          target: g.state.target && {
            q: g.state.target.q,
            y: g.state.target.y,
            r: g.state.target.r,
            place: g.state.target.place,
          },
        };
      }),
      null,
      2,
    ),
  );
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
  expect(consoleErrors).toEqual([]);
  await writeFile(
    info.outputPath('grass-ecology.json'),
    JSON.stringify(
      { ...manifest, paused: true, streamed: true, continued: true, errors },
      null,
      2,
    ),
  );
});
