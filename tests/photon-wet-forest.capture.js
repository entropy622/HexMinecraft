import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installCloudStageProbe } from './fixtures/cloud-stage-probe.js';
import { distribution } from './fixtures/photon-reference-artifacts.js';

test('natural wet forest keeps the native scene while measuring material and reflection work', async ({
  page,
}, info) => {
  test.setTimeout(600000);
  const messages = [],
    windows = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      messages.push(message.text());
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
  const save = referenceSave(referenceScenes[0]);
  save.weather.wetness = 1;
  await page.locator('#save-file').setInputFiles({
    name: 'natural-wet-forest-v16.json',
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
            !g.skyEnvironment.atmosphere.pending &&
            !g.recovering
          );
        }),
      { timeout: 300000 },
    )
    .toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      uniform = g.weatherUniforms.terrainWetness;
    window.__wetProfileValue = 1;
    window.__wetProfileDescriptor = Object.getOwnPropertyDescriptor(
      uniform,
      'value',
    );
    Object.defineProperty(uniform, 'value', {
      configurable: true,
      get: () => window.__wetProfileValue,
      set: () => {},
    });
    g.composer.passes.forEach((pass, index) => {
      const render = pass.render;
      pass.render = function (...args) {
        window.__profilePass =
          index === 0
            ? 'scene-main'
            : pass === g.composer.effects.protection
              ? 'surface-data'
              : pass === g.composer.effects.wet
                ? 'surface-reflection'
                : this.material?.name || 'post-' + index;
        try {
          return render.apply(this, args);
        } finally {
          window.__profilePass = null;
        }
      };
    });
  });
  async function warm(n) {
    const at = await page.evaluate(() => window.__cloudStages.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + n);
  }
  for (const [name, wet, gpu] of [
    ['wet', 1, true],
    ['dry', 0, true],
    ['wet-restored', 1, true],
    ['passive', 1, false],
  ]) {
    await page.evaluate((wet) => (window.__wetProfileValue = wet), wet);
    await warm(40);
    await page.evaluate((gpu) => window.__cloudStages.start(120, gpu), gpu);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.done), {
        timeout: 120000,
      })
      .toBe(true);
    const measured = await page.evaluate(() => window.__cloudStages.result());
    const stages = {};
    for (const row of measured.gpu) {
      stages[row.stage] ??= new Map();
      stages[row.stage].set(
        row.index,
        (stages[row.stage].get(row.index) || 0) + row.milliseconds,
      );
    }
    const totals = measured.frames.map((frame) =>
      measured.gpu
        .filter((row) => row.index === frame.index)
        .reduce((sum, row) => sum + row.milliseconds, 0),
    );
    const state = await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      const target = g.composer.effects.protection.target,
        pixels = new Uint8Array(target.width * target.height * 4);
      g.renderer.readRenderTargetPixels(
        target,
        0,
        0,
        target.width,
        target.height,
        pixels,
      );
      let wetPixels = 0;
      for (let i = 2; i < pixels.length; i += 4) if (pixels[i] > 0) wetPixels++;
      return {
        wetness: g.weatherUniforms.terrainWetness.value,
        time: window.__hexwild.state.time,
        position: g.camera.position.toArray(),
        chunks: g.chunks.size,
        loadedChunks: g.world.chunks.size,
        wetPixels,
        far: g.distantTerrain.tiles.size,
        gl: g.renderer.getContext().getError(),
        draw: [g.renderer.domElement.width, g.renderer.domElement.height],
        attachments: g.composer.effects.protection.target.textures.length,
      };
    });
    const result = {
      name,
      wet,
      gpu,
      state,
      total: gpu ? distribution(totals) : null,
      stages: Object.fromEntries(
        Object.entries(stages).map(([label, frames]) => [
          label,
          distribution([...frames.values()]),
        ]),
      ),
      cpu: distribution(measured.frames.map((row) => row.cpuSubmitMs)),
      raf: distribution(
        measured.frames
          .slice(1)
          .map((row, i) => row.timestamp - measured.frames[i].timestamp),
      ),
      measured,
    };
    windows.push(result);
    await writeFile(
      info.outputPath(name + '.json'),
      JSON.stringify(result, null, 2),
    );
    expect(state.gl).toBe(0);
    expect(state.wetness).toBe(wet);
    expect(state.chunks).toBe(441);
    expect(state.loadedChunks).toBeGreaterThanOrEqual(529);
    if (wet) expect(state.wetPixels).toBeGreaterThan(100);
    else expect(state.wetPixels).toBe(0);
    expect(state.far).toBe(169);
    expect(state.draw).toEqual([1920, 1080]);
    expect(state.attachments).toBe(3);
    expect(measured.frames).toHaveLength(120);
    expect(measured.disjoint).toBe(0);
    expect(measured.busy).toBe(0);
    if (gpu) expect(measured.gpu.length).toBeGreaterThan(0);
    if (name !== 'passive')
      await page
        .locator('#world')
        .screenshot({ path: info.outputPath(name + '.png') });
  }
  await page.evaluate(() =>
    Object.defineProperty(
      window.__hexwild.graphics.weatherUniforms.terrainWetness,
      'value',
      window.__wetProfileDescriptor,
    ),
  );
  await writeFile(
    info.outputPath('summary.json'),
    JSON.stringify(
      {
        windows: windows.map(({ measured, ...row }) => row),
        messages,
        scope:
          'Natural seed624 fixed forest, 1080p, unchanged terrain and sky. A/B/A toggles only the actual wetness uniform; no geometry or shader replacement. Separate no-query CPU/RAF window; screenshots/readback outside measured windows. Not a rain-weather or old-release comparison.',
      },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
