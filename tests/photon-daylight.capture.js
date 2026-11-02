import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  daylightScenes,
  daylightSave,
} from './fixtures/photon-daylight-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installCloudStageProbe } from './fixtures/cloud-stage-probe.js';
import { distribution } from './fixtures/photon-reference-artifacts.js';
import {
  readReferenceFrame,
  resourceLayout,
} from './fixtures/photon-reference-artifacts.js';

test('daylight forest and open sky preserve natural geometry and publish the same solar epoch', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (row) => {
    if (['error', 'warning'].includes(row.type())) messages.push(row.text());
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
  const save = daylightSave();
  await page.locator('#save-file').setInputFiles({
    name: 'daylight-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
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
  for (const scene of daylightScenes) {
    await page.evaluate((scene) => {
      const a = window.__hexwild;
      a.teleport(scene.eye[0], scene.eye[1] - 1.65, scene.eye[2]);
      a.lookAt(...scene.look);
    }, scene);
    const start = await page.evaluate(() => window.__cloudStages.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(start + 80);
    const metadata = await page.evaluate(readReferenceFrame, resourceLayout);
    await writeFile(
      info.outputPath(scene.id + '.json'),
      JSON.stringify({ scene, metadata, messages }, null, 2),
    );
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(scene.id + '.png') });
    expect(metadata.time).toBe(70);
    expect(metadata.terrain.renderedChunks).toBe(441);
    expect(metadata.sun.elevationDegrees).toBeGreaterThan(30);
    expect(metadata.sun.elevationDegrees).toBeLessThan(45);
    expect(metadata.settings.exposure).toBe(1);
    expect(metadata.settings.post.exposure).toBe(false);
    expect(metadata.glErrors).toEqual([]);
    if (scene.id === 'daylight-forest')
      expect(metadata.sun.inFrustum).toBe(true);
  }
  const windows = [];
  for (const [name, legacy] of [
    ['candidate', false],
    ['legacy', true],
    ['restored', false],
  ]) {
    const start = await page.evaluate((legacy) => {
      const clouds = window.__hexwild.graphics.composer.passes[0].clouds;
      window.__edgeSource ??= clouds.resolve.fragmentShader;
      clouds.resolve.fragmentShader = legacy
        ? window.__edgeSource.replace(
            '// HEX_SPARSE_SKY_HISTORY',
            'if(data.x<=0.0)return;',
          )
        : window.__edgeSource;
      clouds.resolve.needsUpdate = true;
      clouds.reset();
      return window.__cloudStages.rendered;
    }, legacy);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(start + 80);
    await page.evaluate(() => window.__cloudStages.start(120, true));
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
    windows.push({
      name,
      stages: Object.fromEntries(
        Object.entries(byStage).map(([key, values]) => [
          key,
          distribution([...values.values()]),
        ]),
      ),
      cpu: distribution(result.frames.map((row) => row.cpuSubmitMs)),
      result,
    });
    await writeFile(
      info.outputPath('daylight-profile.json'),
      JSON.stringify({ windows, messages }, null, 2),
    );
    expect(result.frames).toHaveLength(120);
    expect(result.disjoint).toBe(0);
    expect(result.busy).toBe(0);
    expect(result.gpu.length).toBeGreaterThan(0);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath('sky-' + name + '.png') });
  }
  expect(messages).toEqual([]);
});
