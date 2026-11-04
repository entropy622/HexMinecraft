import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { materialDetailGallery } from './fixtures/material-detail-gallery.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { writeFile } from 'node:fs/promises';

async function state(page) {
  return page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      m = g.textures.materials,
      flags = m.uniforms.surfacePackFlags.value.image.data;
    const { axialToWorld } = await import('/src/core.js');
    const center = axialToWorld(-6, -4),
      pixel = g.camera.position
        .clone()
        .set(center.x, 50, center.z)
        .project(g.camera),
      record = new Uint8Array(4);
    const target = g.composer.effects.protection;
    // Dry matte surfaces intentionally do not produce reflection records.
    // Exercise the real wet receiver path without changing the dry screenshot.
    const wet = g.weatherUniforms.terrainWetness.value;
    try {
      g.weatherUniforms.terrainWetness.value = Math.max(wet, 0.02);
      target.render(g.renderer);
      g.renderer.readRenderTargetPixels(
        target.target,
        Math.floor((pixel.x * 0.5 + 0.5) * target.target.width),
        Math.floor((pixel.y * 0.5 + 0.5) * target.target.height),
        1,
        1,
        record,
        0,
        2,
      );
    } finally {
      g.weatherUniforms.terrainWetness.value = wet;
    }
    const channels = (name) => {
      const [u, v] = g.textures.uv(name, 0.5, 0.5),
        l = m.layout;
      const index =
        Math.floor(((1 - v) * l.height) / l.cell) * 8 +
        Math.floor((u * l.width) / l.cell);
      return [...flags.slice(index * 4, index * 4 + 4)];
    };
    return {
      stone: channels('stone:top'),
      dirt: channels('dirt:top'),
      leaves: channels('leaves:top'),
      normalBytes: m.uniforms.surfacePackNormal.value.image.data.byteLength,
      hasSpecular: m.hasSpecular,
      gl: g.renderer.getContext().getError(),
      attachments: g.composer.effects.protection.target.textures.length,
      record: [...record],
    };
  });
}
test('native material detail draws, yields to imported colour and survives default reset and device recovery', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#save-file').setInputFiles({
    name: 'materials.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(materialDetailGallery())),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.distantTerrain.ready &&
            g.distantTerrain.tiles.size === 169 &&
            !g.relightQueue.size &&
            !g.skyEnvironment.atmosphere.pending
          );
        }),
      { timeout: 300000 },
    )
    .toBe(true);
  const start = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThan(start + 50);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('gallery-after.png') });
  const native = await state(page);
  await writeFile(
    info.outputPath('native-before-import.json'),
    JSON.stringify(native, null, 2),
  );
  expect(native.stone).toEqual([255, 0, 255, 0]);
  expect(native.dirt).toEqual([255, 0, 255, 0]);
  expect(native.leaves).toEqual([0, 0, 0, 0]);
  expect(native.hasSpecular).toBe(false);
  expect(native.attachments).toBe(3);
  expect(native.record[3]).toBeGreaterThan(180);
  expect(native.record[3]).toBeLessThan(230);
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([180, 130, 80, 255], i);
  await page.locator('#material-pack-file').setInputFiles({
    name: 'colour-only.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'assets/minecraft/textures/block/stone.png': encode({
          width: 16,
          height: 16,
          channels: 4,
          data,
        }),
      }),
    ),
  });
  await expect(page.locator('#material-pack-status')).toContainText(
    'colour-only.zip',
  );
  const imported = await state(page);
  expect(imported.stone).toEqual([0, 0, 0, 0]);
  expect(imported.dirt).toEqual(native.dirt);
  expect(imported.record[3]).toBe(0);
  await page.locator('#material-pack-reset').evaluate((b) => b.click());
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  await page.evaluate(() => {
    const r = window.__hexwild.graphics.renderer;
    r.forceContextLoss();
    setTimeout(() => r.forceContextRestore(), 500);
  });
  await waitForRecoveredRenderer(page);
  const restoredStart = await page.evaluate(
    () => window.__photonProbe.rendered,
  );
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThan(restoredStart + 20);
  const restored = await state(page);
  expect(restored).toEqual(native);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('native-detail.json'),
    JSON.stringify({ native, imported, restored, errors }, null, 2),
  );
});
