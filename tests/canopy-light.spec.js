import { test, expect } from './browser-fixture.js';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { writeFile } from 'node:fs/promises';

test('natural backlit canopy: settled frame and moving foliage', async ({
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
  await page.locator('#save-file').setInputFiles({
    name: 'canopy.json',
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
  await page.evaluate(async () => {
    const start = window.__photonProbe.rendered;
    while (window.__photonProbe.rendered < start + 32)
      await new Promise(requestAnimationFrame);
  });
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest.png') });
  const inputs = await page.evaluate(async () => {
    const { readCanopyInputs } =
      await import('/tests/fixtures/canopy-inputs.js');
    return readCanopyInputs(window.__hexwild.graphics);
  });
  expect(inputs.equalAxes.slice(0, 2)).toEqual([166, 166]);
  expect(inputs.cosmetic).toEqual([true, false]);
  expect(inputs.block).toEqual([true, true]);
  expect(inputs.covered).toBeGreaterThan(0);
  expect(inputs.covered).toBeLessThan(inputs.area / 2);
  expect(inputs.fog).toEqual([35.15, 12.15]);
  expect(inputs.extent).toBe(48);
  expect(inputs.mip).toBe(true);
  // Advance world time by exactly 1/12 s per sample with the camera fixed.
  for (let i = 0; i < 36; i++) {
    const png = await page.evaluate(async () => {
      window.__hexwild.step(1 / 12);
      window.__hexwild.graphics.renderer.shadowMap.needsUpdate = true;
      await new Promise(requestAnimationFrame);
      const c = document.querySelector('#world'),
        d = document.createElement('canvas');
      d.width = c.width;
      d.height = c.height;
      d.getContext('2d').drawImage(c, 0, 0);
      return d.toDataURL('image/png').split(',')[1];
    });
    await writeFile(
      info.outputPath('motion-' + String(i).padStart(2, '0') + '.png'),
      Buffer.from(png, 'base64'),
    );
  }
  await page.evaluate(async () => {
    const a = window.__hexwild;
    a.step(37); // dawn 30 + three seconds of wind, then daytime 70
    a.lookAt(-98, 29, -1);
    const first = window.__photonProbe.rendered;
    do {
      await new Promise(requestAnimationFrame);
    } while (
      window.__photonProbe.rendered < first + 40 ||
      a.graphics.skyEnvironment.atmosphere.pending
    );
  });
  // The historical build tracks dt rather than explicit clock jumps. After the
  // new sun is published, refresh both maps and let temporal history settle.
  await page.evaluate(async () => {
    window.__hexwild.graphics.renderer.shadowMap.needsUpdate = true;
    const start = window.__photonProbe.rendered;
    while (window.__photonProbe.rendered < start + 20)
      await new Promise(requestAnimationFrame);
  });
  await page.locator('#world').screenshot({ path: info.outputPath('day.png') });
  const stats = await page.evaluate(async () => {
    const a = window.__hexwild,
      g = a.graphics,
      probe = window.__photonProbe;
    window.__photonFreeze = false;
    a.setPlaying(true);
    probe.start(64);
    while (!probe.done) await new Promise(requestAnimationFrame);
    const sample = probe.result();
    window.__photonFreeze = true;
    a.setPlaying(false);
    return {
      gpuMs: sample.gpu.map((v) => v.milliseconds),
      frameMs: sample.samples
        .map((v) => v.frameIntervalMs)
        .filter(Number.isFinite),
      busy: sample.busy,
      disjoint: sample.disjointEvents,
      shadowExtent: g.sun.shadow.camera.right,
      near: g.chunks.size,
      far: g.distantTerrain.tiles.size,
    };
  });
  await writeFile(info.outputPath('day-timing.json'), JSON.stringify(stats));
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});
