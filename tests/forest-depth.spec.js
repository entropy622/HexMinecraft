import { test, expect } from './browser-fixture.js';
import {
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { writeFile } from 'node:fs/promises';

test('daylight over the natural forest and its distant canopy', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
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
  const save = referenceSave({ eye: [-120, 33, 4], look: [-70, 19, -9] });
  save.time = 70;
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
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
            !g.relightQueue.size &&
            !g.skyEnvironment.atmosphere.pending &&
            g.atmosphere.uniforms.airDistantBlend.value === 1
          );
        }),
      { timeout: 300000 },
    )
    .toBe(true);
  await page.evaluate(async () => {
    const g = window.__hexwild.graphics;
    g.renderer.shadowMap.needsUpdate = true;
    const start = window.__photonProbe.rendered;
    while (window.__photonProbe.rendered < start + 44)
      await new Promise(requestAnimationFrame);
  });
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest.png') });
  const metrics = await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      f = g.distantTerrain;
    let shaded = 0,
      open = 0,
      vertices = 0,
      bytes = 0,
      triangles = 0;
    for (const { mesh } of f.tiles.values()) {
      const geom = mesh.geometry;
      triangles += geom.index.count / 3;
      bytes += geom.index.array.byteLength;
      for (const a of Object.values(geom.attributes))
        bytes += a.array.byteLength;
      for (const value of geom.attributes.skylight.array) {
        vertices++;
        if (value < 200) shaded++;
        if (value === 255) open++;
      }
    }
    const tile = g.textures.materials.tile('jungleLeaves:side');
    const alpha = tile
      .getContext('2d')
      .getImageData(0, 0, tile.width, tile.height).data;
    const holes = alpha.filter((v, i) => i % 4 === 3 && v < 128).length;
    const probe = window.__photonProbe;
    window.__photonFreeze = false;
    api.setPlaying(true);
    probe.start(64);
    while (!probe.done) await new Promise(requestAnimationFrame);
    const sample = probe.result();
    return {
      holes,
      vertices,
      shaded,
      open,
      triangles,
      bytes,
      tiles: f.tiles.size,
      inBand: [...f.tiles.values()].filter((t) => t.mesh.visible).length,
      gpu: sample.gpu.map((v) => v.milliseconds),
      disjoint: sample.disjointEvents,
      gl: g.renderer.getContext().getError(),
    };
  });
  await writeFile(info.outputPath('forest.json'), JSON.stringify(metrics));
  expect(metrics.holes).toBe(59);
  expect(metrics.shaded).toBeGreaterThan(0);
  expect(metrics.inBand).toBeLessThan(metrics.tiles);
  expect(metrics.open).toBeGreaterThan(0);
  expect(metrics.gl).toBe(0);
  expect(errors).toEqual([]);
});
