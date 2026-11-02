import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { wetGallery } from './fixtures/wet-gallery.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('native wet materials couple source optics, porous pigment and shared reflection data through recovery', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      messages.push(message.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    {
      ...referenceSettings,
      post: {
        ...referenceSettings.post,
        clouds: false,
        antialias: false,
        occlusion: 0,
        bloom: 0,
      },
    },
  );
  await page.goto('/');
  await page.locator('#save-file').setInputFiles({
    name: 'wet-gallery-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(wetGallery())),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => {
    window.__hexwild.setPlaying(false);
    window.__hexwild.teleport(1, 52.85, 9);
    window.__hexwild.lookAt(0, 49, -1);
    window.__hexwild.graphics.outline.visible = false;
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
    .screenshot({ path: info.outputPath('wet-gallery.png') });
  if (process.env.PHOTON_WET_BASELINE === '1') {
    expect(messages).toEqual([]);
    return;
  }
  const probe = () =>
    page.evaluate(async () => {
      const pass = window.__hexwild.graphics.composer.effects.protection;
      await new Promise((resolve) => {
        const render = pass.render;
        pass.render = function (...args) {
          render.apply(this, args);
          pass.render = render;
          queueMicrotask(resolve);
        };
      });
      const { readNativeWet } =
        await import('/tests/fixtures/native-wet-probe.js');
      return readNativeWet(window.__hexwild.graphics);
    });
  const check = (result) => {
    expect(result.gl).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.attachments).toBe(3);
    expect(result.maxAlbedoError).toBeLessThan(0.006);
    expect(result.maxOpticsError).toBeLessThan(0.00002);
    expect(result.maxCoverageError).toBeLessThan(0.005);
    expect(result.maxNormalError).toBeLessThan(0.006);
    for (const type of ['stone', 'dirt', 'planks', 'ironBlock']) {
      expect(result.groups[type].samples, type).toBeGreaterThan(100);
      expect(result.groups[type].puddled, type).toBeGreaterThan(20);
      expect(result.groups[type].darkening, type).toBeLessThan(0.99);
    }
    expect(result.groups.sheltered.samples).toBeGreaterThan(100);
    expect(result.groups.sheltered.puddled).toBe(0);
    expect(result.groups.sheltered.coverage).toBe(0);
    expect(result.groups.sheltered.darkening).toBe(1);
  };
  const first = await probe();
  await writeFile(
    info.outputPath('wet-material.json'),
    JSON.stringify({ first, messages }, null, 2),
  );
  check(first);
  await page.evaluate(async () => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__wetRestore = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      document
        .querySelector('#world')
        .addEventListener('webglcontextrestored', resolve, { once: true });
      window.__wetRestore.restoreContext();
    });
  });
  await waitForRecoveredRenderer(page);
  await expect(page.locator('#render-recovery')).toBeHidden();
  const restored = await probe();
  await writeFile(
    info.outputPath('wet-material.json'),
    JSON.stringify({ first, restored, messages }, null, 2),
  );
  check(restored);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  expect(messages).toEqual([]);
});
