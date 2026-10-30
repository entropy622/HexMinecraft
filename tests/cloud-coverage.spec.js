import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test.setTimeout(300000);
function messagesIn(page) {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  return messages;
}
async function ready(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.cloudSystem.uniforms.cloudCoverageReady.value === 1 &&
            !g.relightQueue.size &&
            !g.skyEnvironment.atmosphere.pending
          );
        }),
      { timeout: 90000 },
    )
    .toBe(true);
}
async function setup(page) {
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
  await ready(page);
}
async function sample(page, anchors = null) {
  return page.evaluate(async (anchors) => {
    const { readCloudCoverage } =
      await import('/tests/fixtures/cloud-coverage-probe.js');
    return readCloudCoverage(window.__hexwild.graphics, anchors);
  }, anchors);
}
function accuracy(sample) {
  const layers = [];
  for (let layer = 0; layer < 2; layer++) {
    let maximum = 0,
      squares = 0,
      outside = 0,
      outsideMaximum = 0;
    for (let i = 0; i < 4096; i++) {
      const x = i % 64,
        y = Math.floor(i / 64),
        offset = (layer * 4096 + i) * 4;
      const point = [
        sample.anchors[layer][0] +
          ((x + 0.5) / 64 - 0.5) * sample.spans[layer] * 1.2 +
          0.123,
        sample.anchors[layer][1] +
          ((y + 0.5) / 64 - 0.5) * sample.spans[layer] * 1.2 +
          0.371,
      ];
      const isOutside = point.some(
        (v, c) =>
          Math.abs(v - sample.origins[layer][c]) > sample.spans[layer] * 0.5,
      );
      for (let c = 0; c < 2; c++) {
        const error = Math.abs(
          sample.output[offset + c] - sample.output[offset + c + 2],
        );
        maximum = Math.max(maximum, error);
        squares += error * error;
        if (isOutside) outsideMaximum = Math.max(outsideMaximum, error);
      }
      outside += isOutside;
    }
    layers.push({
      maximum,
      rms: Math.sqrt(squares / 8192),
      outside,
      outsideMaximum,
    });
  }
  return layers;
}
test('real coverage atlas preserves the seed, bounded macro error, analytic exterior and world grid', async ({
  page,
}, info) => {
  const messages = messagesIn(page);
  await setup(page);
  const before = await sample(page),
    errors = accuracy(before);
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.teleport(-96, 22.5, 4);
    a.lookAt(-74, 17, -4);
    a.graphics.stepOffset = 0;
  });
  await ready(page);
  const after = await sample(page, before.anchors);
  let stableMaximum = 0,
    stablePoints = 0;
  let worstStable = null;
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i < 4096; i++) {
      const point = [
        before.anchors[layer][0] +
          (((i % 64) + 0.5) / 64 - 0.5) * before.spans[layer] * 1.2 +
          0.123,
        before.anchors[layer][1] +
          ((Math.floor(i / 64) + 0.5) / 64 - 0.5) * before.spans[layer] * 1.2 +
          0.371,
      ];
      if (
        ![before, after].every((s) =>
          point.every(
            (v, c) =>
              Math.abs(v - s.origins[layer][c]) < s.spans[layer] * 0.5 - 16,
          ),
        )
      )
        continue;
      stablePoints++;
      for (let c = 0; c < 2; c++) {
        const offset = (layer * 4096 + i) * 4 + c;
        if (
          Math.abs(before.output[offset] - after.output[offset]) > stableMaximum
        )
          worstStable = {
            layer,
            point,
            c,
            before: before.output.slice(offset - c, offset - c + 4),
            after: after.output.slice(offset - c, offset - c + 4),
          };
        stableMaximum = Math.max(
          stableMaximum,
          Math.abs(before.output[offset] - after.output[offset]),
        );
      }
    }
  await writeFile(
    info.outputPath('coverage-accuracy.json'),
    JSON.stringify(
      {
        before: { ...before, output: undefined },
        after: { ...after, output: undefined },
        errors,
        afterErrors: accuracy(after),
        stableMaximum,
        stablePoints,
        worstStable,
        messages,
      },
      null,
      2,
    ),
  );
  expect(before.headerMismatches).toBe(0);
  expect(after.headerMismatches).toBe(0);
  expect(before.size).toEqual([1024, 1152]);
  expect(before.samplerPrograms.length).toBeGreaterThan(0);
  for (const p of before.samplerPrograms)
    expect(p).toEqual(['cloudNoise', 'cloudWorley']);
  for (const e of [...errors, ...accuracy(after)]) {
    expect(e.maximum).toBeLessThan(0.002);
    expect(e.outside).toBeGreaterThan(100);
    expect(e.outsideMaximum).toBeLessThan(0.000001);
  }
  expect(stablePoints).toBeGreaterThan(1000);
  expect(stableMaximum).toBeLessThan(0.0001);
  for (const layer of after.atlasOverlap) expect(layer.differences).toBe(0);
  expect(before.gl).toBe(0);
  expect(after.gl).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});

test('real quality controls, native seed import and device restoration rebuild coverage without stale bindings', async ({
  page,
}, info) => {
  const messages = messagesIn(page),
    stages = [];
  await setup(page);
  stages.push({
    name: 'initial',
    sample: { ...(await sample(page)), output: undefined },
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1');
  await page.locator('#resume').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = window.__hexwild.graphics,
          u = g.cloudSystem.uniforms;
        return (
          !g.composer &&
          u.cloudCoverageReady.value === 0 &&
          u.cloudNoise.value === u.cloudSeedNoise.value
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await ready(page);
  const resized = await sample(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await ready(page);
  stages.push({
    name: 'quality-resize',
    sample: { ...(await sample(page)), output: undefined },
  });
  const save = referenceSave(referenceScenes[0]);
  save.seed = 841;
  await page.locator('#save-file').setInputFiles({
    name: 'other-seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await ready(page);
  const other = await sample(page);
  stages.push({ name: 'native-seed', sample: { ...other, output: undefined } });
  expect(other.seed).toBe(841);
  expect(other.seedVersion).toBeGreaterThan(resized.seedVersion);
  expect(other.headerMismatches).toBe(0);
  await page.evaluate(() => {
    const gl = window.__hexwild.graphics.renderer.getContext(),
      extension = gl.getExtension('WEBGL_lose_context');
    window.restoreCoverageContext = () => extension.restoreContext();
    extension.loseContext();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreCoverageContext());
  await waitForRecoveredRenderer(page);
  await ready(page);
  const restored = await sample(page);
  stages.push({
    name: 'context-restored',
    sample: { ...restored, output: undefined },
  });
  await writeFile(
    info.outputPath('coverage-lifecycle.json'),
    JSON.stringify({ stages, messages }, null, 2),
  );
  for (const stage of stages) {
    expect(stage.sample.headerMismatches).toBe(0);
    expect(stage.sample.gl).toBe(0);
    expect(stage.sample.size).toEqual([1024, 1152]);
  }
  expect(restored.seed).toBe(841);
  expect(restored.seedVersion).toBe(other.seedVersion);
  const timer = await page.evaluate(() => window.__photonProbe.result());
  expect(timer.extension).toBe(true);
  expect(timer.counterBits).toBeGreaterThan(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
