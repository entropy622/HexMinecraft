import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { validateSave } from '../src/save.js';
import { emissionGallery } from './fixtures/emission-gallery.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('native emissive gallery retains textured housings, source radiance and device recovery', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    {
      ...referenceSettings,
      post: { ...referenceSettings.post, clouds: false },
    },
  );
  await page.goto('/');
  const scene = emissionGallery();
  await page.locator('#save-file').setInputFiles({
    name: 'emission-gallery-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene.save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => {
    const api = window.__hexwild;
    api.setPlaying(false);
    api.graphics.outline.visible = api.graphics.shapeOutline.visible = false;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 180000 },
    )
    .toBe(true);
  await page.keyboard.press('F1');
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('gallery.png') });
  const state = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return {
      gl: g.renderer.getContext().getError(),
      lamp: g.world.state(2, 40, -3),
      furnace: g.world.furnaces.get('0,40,-3'),
    };
  });
  await writeFile(
    info.outputPath('gallery.json'),
    JSON.stringify(
      {
        state,
        messages,
        baseline: process.env.PHOTON_EMISSION_BASELINE === '1',
      },
      null,
      2,
    ),
  );
  expect(state.lamp.powered).toBe(true);
  expect(state.furnace.burn).toBeGreaterThan(0);
  expect(state.gl).toBe(0);
  expect(messages).toEqual([]);
  if (process.env.PHOTON_EMISSION_BASELINE === '1') return;
  const probe = () =>
    page.evaluate(async (models) => {
      const { readNativeEmission } =
        await import('/tests/fixtures/native-emission-probe.js');
      return readNativeEmission(window.__hexwild.graphics, models);
    }, scene.models);
  const check = (result) => {
    expect(result.gl).toBe(0);
    for (const model of result.models) {
      expect(model.samples, model.type).toBeGreaterThan(100);
      expect(model.emitting, model.type).toBeGreaterThan(5);
      expect(model.maxError, JSON.stringify(model.worst)).toBeLessThan(0.0002);
      expect(model.invalid, model.type).toBe(0);
      expect(model.minBeautyMargin, model.type).toBeGreaterThan(-0.0002);
    }
    for (const type of ['torch', 'endRod', 'caveVinesBerries', 'furnace'])
      expect(
        result.models.find((model) => model.type === type).classes[0],
        type + ' housing/stem',
      ).toBeGreaterThan(5);
  };
  const first = await probe();
  await writeFile(
    info.outputPath('emission.json'),
    JSON.stringify({ first, messages }, null, 2),
  );
  check(first);
  await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      canvas = g.renderer.domElement,
      ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) throw Error('WEBGL_lose_context unavailable');
    window.__emissionContext = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const g = window.__hexwild.graphics;
      await new Promise((resolve) => {
        g.renderer.domElement.addEventListener(
          'webglcontextrestored',
          resolve,
          { once: true },
        );
        window.__emissionContext.restoreContext();
      });
      return g.recovery;
    }),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.recovering))
    .toBe(false);
  const restored = await probe();
  await writeFile(
    info.outputPath('emission.json'),
    JSON.stringify({ first, restored, messages }, null, 2),
  );
  check(restored);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await page.locator('#resume').click();
  await page.mouse.move(450, 325);
  await page.evaluate(() => {
    const api = window.__hexwild;
    api.teleport(3, 40, 0);
    api.lookAt(3, 40.2, -3);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type), {
      timeout: 30000,
    })
    .toBe('lever');
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.world.state(2, 40, -3).powered,
      ),
    )
    .toBe(false);
  await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      { tickFurnace } = await import('/src/furnaces.js');
    api.setPlaying(false);
    const furnace = w.furnaces.get('0,40,-3');
    const duration = furnace.burn + 0.1;
    for (let elapsed = 0; elapsed < duration; elapsed += 0.05)
      tickFurnace(furnace, Math.min(0.05, duration - elapsed));
    g.updateBlock(0, 40, -3);
    g.updateVoxelLight(true);
  });
  await expect
    .poll(
      () => page.evaluate(() => !window.__hexwild.graphics.relightQueue.size),
      { timeout: 60000 },
    )
    .toBe(true);
  const cold = await page.evaluate(async (models) => {
    const { readNativeEmission } =
      await import('/tests/fixtures/native-emission-probe.js');
    return readNativeEmission(
      window.__hexwild.graphics,
      models.filter((m) => ['redstoneLamp', 'furnace'].includes(m.type)),
    );
  }, scene.models);
  await writeFile(
    info.outputPath('emission.json'),
    JSON.stringify({ first, restored, cold, messages }, null, 2),
  );
  expect(cold.gl).toBe(0);
  for (const model of cold.models) {
    expect(model.samples).toBeGreaterThan(100);
    expect(model.emitting, model.type).toBe(0);
  }
  await page.keyboard.press('Escape');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const output = info.outputPath('cold-gallery-v16.json');
  await download.saveAs(output);
  validateSave(JSON.parse(await readFile(output, 'utf8')));
  expect(messages).toEqual([]);
});
