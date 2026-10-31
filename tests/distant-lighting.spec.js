import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('distant canopy lighting follows actual local ambient visibility', async ({
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
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const save = referenceSave({
    eye: [-177.5, 44.65, 54.5],
    look: [-157.5, 33, 54.5],
  });
  save.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'canopy-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  async function ready() {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics,
              f = g.distantTerrain;
            return (
              f.ready &&
              !f.error &&
              f.tiles.size === 169 &&
              !g.recovering &&
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending &&
              g.atmosphere.uniforms.airDistantBlend.value === 1
            );
          }),
        { timeout: 240000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 40);
  }
  await ready();
  const evidence = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      f = g.distantTerrain;
    let vertices = 0,
      withAmbient = 0,
      min = 255,
      max = 0,
      geometryBytes = 0;
    for (const { mesh } of f.tiles.values()) {
      vertices += mesh.geometry.attributes.position.count;
      const a = mesh.geometry.attributes.leafAmbient;
      if (a) {
        withAmbient += a.count;
        for (const v of a.array) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
      geometryBytes +=
        Object.values(mesh.geometry.attributes).reduce(
          (sum, a) => sum + a.array.byteLength,
          0,
        ) + mesh.geometry.index.array.byteLength;
    }
    const native = g.voxelLight.leafAmbient;
    let nativeMax = 0;
    for (const v of native) nativeMax = Math.max(nativeMax, v);
    return {
      vertices,
      withAmbient,
      min,
      max,
      nativeMax,
      geometryBytes,
      tiles: f.tiles.size,
      gameplay: g.world.chunks.size,
      stats: f.stats,
      gl: g.renderer.getContext().getError(),
    };
  });
  expect(evidence.gl).toBe(0);
  expect(evidence.withAmbient).toBe(evidence.vertices);
  expect(evidence.max).toBeGreaterThan(0);
  expect(evidence.tiles).toBe(169);
  expect(evidence.gameplay).toBe(529);
  const response = () =>
    page.evaluate(async () => {
      const { distantLightingProbe } =
        await import('/tests/fixtures/distant-lighting-probe.js');
      return distantLightingProbe(window.__hexwild.graphics);
    });
  const check = (value) => {
    expect(value.brighter).toBeGreaterThan(100);
    expect(value.maxGain).toBeGreaterThan(0.001);
    expect(value.darker).toBe(0);
    expect(value.alphaChanges).toBe(0);
    expect(value.restoredChanges).toBe(0);
    expect(value.invalid).toBe(0);
    expect(value.gl).toBe(0);
  };
  const native = await response();
  check(native);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('canopy-lighting.png') });
  const qualities = [];
  for (const quality of [1, 0.65, 1.7]) {
    await page.evaluate(
      (q) => window.__hexwild.graphics.setQuality(q),
      quality,
    );
    await ready();
    const value = await response();
    check(value);
    qualities.push({ quality, value });
  }
  await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      canvas = g.renderer.domElement;
    const ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) throw Error('WEBGL_lose_context unavailable');
    window.__canopyContext = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const g = window.__hexwild.graphics,
        canvas = g.renderer.domElement;
      await new Promise((resolve) => {
        canvas.addEventListener('webglcontextrestored', resolve, {
          once: true,
        });
        window.__canopyContext.restoreContext();
      });
      return g.recovery;
    }),
  ).toBe(true);
  await ready();
  const recovery = await response();
  check(recovery);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await writeFile(
    info.outputPath('lighting.json'),
    JSON.stringify(
      { evidence, native, qualities, recovery, messages },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
