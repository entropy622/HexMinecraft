import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { DataUtils } from 'three';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { setSurfaceDiffuseControl } from './fixtures/surface-diffuse-control.js';

test('natural forest lighting provenance at a fixed native camera', async ({
  page,
}, info) => {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => {
    window.__photonFreeze = true;
  });
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  const first = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(first + 120);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest.png') });
  // Same native camera/time/exposure. Let the existing temporal sampling settle
  // at each setting; these screenshots are not exact frozen-HDR pixel pairs.
  for (const enabled of [false, true]) {
    const at = await page.evaluate((enabled) => {
      const g = window.__hexwild.graphics;
      g.setPostOptions({ ...g.postOptions, sharpening: enabled });
      return window.__photonProbe.rendered;
    }, enabled);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 60000,
      })
      .toBeGreaterThanOrEqual(at + 16);
    await page.locator('#world').screenshot({
      path: info.outputPath(
        enabled ? 'forest-cas-on.png' : 'forest-cas-off.png',
      ),
    });
  }
  for (const enabled of [false, true]) {
    expect(await page.evaluate(setSurfaceDiffuseControl, enabled)).toBe(
      enabled ? 1 : 0,
    );
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 60000,
      })
      .toBeGreaterThanOrEqual(at + 120);
    await page.locator('#world').screenshot({
      path: info.outputPath(
        enabled ? 'forest-diffuse-on.png' : 'forest-diffuse-off.png',
      ),
    });
  }
  const result = await page.evaluate(async () => {
    const { readForestLighting } =
      await import('/tests/fixtures/forest-lighting-probe.js');
    return readForestLighting(window.__hexwild.graphics);
  });
  for (const map of result.maps) {
    await writeFile(
      info.outputPath(`${map.name}.png`),
      Buffer.from(map.png, 'base64'),
    );
    delete map.png;
  }
  await writeFile(
    info.outputPath('lighting.json'),
    JSON.stringify({ result, messages }, null, 2),
  );
  expect(result.leafPixels).toBeGreaterThan(100);
  expect(result.restored).toBe(true);
  expect(result.gl).toBe(0);
  for (const m of result.maps) if (m.stats) expect(m.stats.finite).toBe(true);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
  // Observe the shipped default separately, then exercise optional adaptation.
  const adaptAt = await page.evaluate(async () => {
    const { DEFAULT_POST_SETTINGS } = await import('/src/render-settings.js');
    window.__hexwild.graphics.setPostOptions({
      exposure: DEFAULT_POST_SETTINGS.exposure,
    });
    return window.__photonProbe.rendered;
  });
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 60000,
    })
    .toBeGreaterThanOrEqual(adaptAt + 16);
  const adapted = await page.evaluate(async () => {
    const { readForestExposure } =
      await import('/tests/fixtures/forest-lighting-probe.js');
    return readForestExposure(window.__hexwild.graphics);
  });
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('default-exposure.png') });
  await writeFile(
    info.outputPath('default-exposure.json'),
    JSON.stringify({ adapted, messages }, null, 2),
  );
  expect(adapted.enabled).toBe(false);
  expect(adapted.ready).toBe(false);
  expect(adapted.exposure).toBe(1);
  expect(adapted.gl).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
  const autoAt = await page.evaluate(() => {
    window.__hexwild.graphics.setPostOptions({ exposure: true });
    return window.__photonProbe.rendered;
  });
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 60000,
    })
    .toBeGreaterThanOrEqual(autoAt + 16);
  const automatic = await page.evaluate(async () => {
    const { readForestExposure } =
      await import('/tests/fixtures/forest-lighting-probe.js');
    return readForestExposure(window.__hexwild.graphics);
  });
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('optional-adaptation.png') });
  await writeFile(
    info.outputPath('optional-adaptation.json'),
    JSON.stringify({ automatic, messages }, null, 2),
  );
  expect(automatic.enabled).toBe(true);
  expect(automatic.ready).toBe(true);
  // The history is RGBA16F. Bound its representable interval, including a
  // round-down at the configured 0.72 lower limit; keep the runtime limits.
  expect(automatic.exposure).toBeGreaterThanOrEqual(
    DataUtils.fromHalfFloat(DataUtils.toHalfFloat(0.72)),
  );
  expect(automatic.exposure).toBeLessThanOrEqual(
    DataUtils.fromHalfFloat(DataUtils.toHalfFloat(2.8) + 1),
  );
  expect(automatic.gl).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
