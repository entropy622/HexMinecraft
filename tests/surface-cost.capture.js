import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { daylightSave } from './fixtures/photon-daylight-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installCloudStageProbe } from './fixtures/cloud-stage-probe.js';
import { distribution } from './fixtures/photon-reference-artifacts.js';

test('same-session legacy and owned colour programs publish stage cost windows', async ({
  page,
}, info) => {
  test.skip(
    !process.env.SURFACE_LEGACY_PROGRAMS,
    'Requires a pinned diagnostic shader snapshot',
  );
  const legacy = JSON.parse(
      await readFile(process.env.SURFACE_LEGACY_PROGRAMS, 'utf8'),
    ),
    messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['warning', 'error'].includes(e.type())) messages.push(e.text());
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
  save.time = 72;
  await page.locator('#save-file').setInputFiles({
    name: 'surface-cost.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
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
  await page.evaluate((shaders) => {
    const g = window.__hexwild.graphics;
    window.__surfaceCostMaterials = [
      ['terrain', g.material],
      ['leaf', g.leafMaterials.material],
      ['plant', g.plantMaterials.material],
      ['distant', g.distantTerrain.material],
      ['distant-glass', g.distantTerrain.glassMaterial],
    ].map(([id, material]) => {
      const compile = material.onBeforeCompile,
        key = material.customProgramCacheKey;
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        if (window.__surfaceCostLegacy) {
          shader.vertexShader = shaders[id].vertexShader;
          shader.fragmentShader = shaders[id].fragmentShader;
        }
      };
      material.customProgramCacheKey = () =>
        key.call(material) + '/cost-' + Number(window.__surfaceCostLegacy);
      return material;
    });
  }, legacy.shaders);
  const windows = [];
  for (const [name, enabled] of [
    ['legacy-a', true],
    ['owned', false],
    ['legacy-b', true],
  ]) {
    const start = await page.evaluate((value) => {
      window.__surfaceCostLegacy = value;
      for (const material of window.__surfaceCostMaterials)
        material.needsUpdate = true;
      return window.__cloudStages.rendered;
    }, enabled);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(start + 80);
    await page.evaluate(() => window.__cloudStages.start(120, true, 1024));
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.done), {
        timeout: 90000,
      })
      .toBe(true);
    const result = await page.evaluate(() => window.__cloudStages.result()),
      stages = {};
    for (const row of result.gpu) {
      stages[row.stage] ??= new Map();
      stages[row.stage].set(
        row.index,
        (stages[row.stage].get(row.index) || 0) + row.milliseconds,
      );
    }
    windows.push({
      name,
      stages: Object.fromEntries(
        Object.entries(stages).map(([id, values]) => [
          id,
          distribution([...values.values()]),
        ]),
      ),
      result,
    });
    await writeFile(
      info.outputPath('surface-cost.json'),
      JSON.stringify(
        { legacyCommit: legacy.commit, windows, messages },
        null,
        2,
      ),
    );
    expect(result.frames).toHaveLength(120);
    expect(result.disjoint).toBe(0);
    expect(result.busy).toBe(0);
    expect(
      await page.evaluate(() =>
        window.__hexwild.graphics.renderer.getContext().getError(),
      ),
    ).toBe(0);
  }
  expect(messages).toEqual([]);
});
