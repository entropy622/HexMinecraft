import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { daylightSave } from './fixtures/photon-daylight-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installCloudStageProbe } from './fixtures/cloud-stage-probe.js';
import {
  distribution,
  readReferenceFrame,
  resourceLayout,
} from './fixtures/photon-reference-artifacts.js';

test('natural daylight foliage publishes frozen poses and native stage costs', async ({
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
  await page.addInitScript(installCloudStageProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#save-file').setInputFiles({
    name: 'foliage-daylight-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(daylightSave())),
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
            !g.distantTerrain.error &&
            !g.relightQueue.size &&
            !g.skyEnvironment.atmosphere.pending
          );
        }),
      { timeout: 300000 },
    )
    .toBe(true);
  const poses = [];
  for (const time of [70, 71, 72]) {
    const start = await page.evaluate((time) => {
      window.__hexwild.step(time - window.__hexwild.state.time);
      return window.__cloudStages.rendered;
    }, time);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(start + 80);
    const metadata = await page.evaluate(readReferenceFrame, resourceLayout);
    const wind = await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      return {
        strength: g.leafUniforms.leafWind.value,
        climateWind: g.cloudSystem.climate.wind,
        time: g.leafUniforms.leafTime.value,
      };
    });
    poses.push({ metadata, wind });
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath('forest-' + time + '.png') });
    expect(metadata.terrain.renderedChunks).toBe(441);
    expect(metadata.time).toBe(time);
    expect(metadata.glErrors).toEqual([]);
    expect(metadata.settings.exposure).toBe(1);
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          () => !window.__hexwild.graphics.skyEnvironment.atmosphere.pending,
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  await page.evaluate(() => window.__cloudStages.start(120, true, 1024));
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  const result = await page.evaluate(() => window.__cloudStages.result()),
    byStage = {};
  for (const row of result.gpu) {
    byStage[row.stage] ??= new Map();
    byStage[row.stage].set(
      row.index,
      (byStage[row.stage].get(row.index) || 0) + row.milliseconds,
    );
  }
  const stages = Object.fromEntries(
    Object.entries(byStage).map(([key, values]) => [
      key,
      distribution([...values.values()]),
    ]),
  );
  await writeFile(
    info.outputPath('foliage-motion.json'),
    JSON.stringify({ poses, stages, result, messages }, null, 2),
  );
  expect(result.frames).toHaveLength(120);
  expect(result.disjoint).toBe(0);
  expect(result.busy).toBe(0);
  expect(result.gpu.length).toBeGreaterThan(0);
  expect(messages).toEqual([]);
});
