import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installCloudStageProbe } from './fixtures/cloud-stage-probe.js';
import {
  distribution,
  readReferenceFrame,
  resourceLayout,
} from './fixtures/photon-reference-artifacts.js';

test('FHD forest real WebGL stage costs', async ({ page }, info) => {
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
  await page.addInitScript(installCloudStageProbe);
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
  const first = await page.evaluate(() => window.__cloudStages.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(first + 120);
  await page.evaluate(() => window.__cloudStages.start(120));
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  const measured = await page.evaluate(() => window.__cloudStages.result());
  const frame = await page.evaluate(readReferenceFrame, resourceLayout);
  const stages = {};
  for (const name of new Set(measured.gpu.map((s) => s.stage))) {
    const totals = measured.frames.map((f) =>
      measured.gpu
        .filter((s) => s.index === f.index && s.stage === name)
        .reduce((a, s) => a + s.milliseconds, 0),
    );
    stages[name] = distribution(totals);
  }
  const result = {
    measured,
    stages,
    cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
    frame,
    messages,
    scope:
      'Actual GPU batches grouped by production render target. Queries end at framebuffer binds; clears before the first draw are excluded. Scene groups include their final cloud copy. No nested whole-frame GPU query or screenshot/readback in the measurement window.',
  };
  await writeFile(
    info.outputPath('cloud-stages.json'),
    JSON.stringify(result, null, 2),
  );
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest.png') });
  expect(frame.time).toBe(30);
  expect(frame.settings.exposure).toBe(1);
  expect(frame.terrain.fogNear).toBe(87.32);
  expect(frame.glErrors).toEqual([]);
  expect(measured.frames).toHaveLength(120);
  expect(measured.counterBits).toBeGreaterThan(0);
  expect(stages['scene-main']?.count).toBe(120);
  expect(stages['cloud-integrate-main']?.median).toBeGreaterThan(0);
  expect(measured.disjoint).toBe(0);
  expect(measured.busy).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
  await page.evaluate(() => {
    window.__cloudStages.start(120);
    const a = window.__hexwild;
    a.teleport(-96, 22.5, 4);
    a.lookAt(-74, 17, -4);
    a.graphics.stepOffset = 0;
  });
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  const moved = await page.evaluate(() => window.__cloudStages.result()),
    rebuilds = moved.gpu.filter((s) => s.stage === 'cloud-coverage');
  await writeFile(
    info.outputPath('coverage-rebuild.json'),
    JSON.stringify(
      {
        moved,
        rebuilds,
        cost: distribution(rebuilds.map((s) => s.milliseconds)),
        messages,
        scope:
          'Native teleport across a snapped tile boundary; actual GPU coverage draw, includes cold target update. This is not a sustained walking FPS measurement.',
      },
      null,
      2,
    ),
  );
  expect(rebuilds.length).toBeGreaterThan(0);
  expect(moved.disjoint).toBe(0);
  expect(moved.busy).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
