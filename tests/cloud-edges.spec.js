import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  daylightSave,
  daylightScenes,
} from './fixtures/photon-daylight-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('native daylight cloud edges reconstruct missed samples without painting foreground', async ({
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
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    {
      ...referenceSettings,
      post: { ...referenceSettings.post, antialias: false, sharpening: false },
    },
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#save-file').setInputFiles({
    name: 'daylight-cloud-edges-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(daylightSave())),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await page.evaluate(
    (scene) => window.__hexwild.lookAt(...scene.look),
    daylightScenes[1],
  );
  async function warm() {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending &&
              !g.recovering
            );
          }),
        { timeout: 180000 },
      )
      .toBe(true);
    const start = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(start + 80);
  }
  await warm();
  const probe = () =>
    page.evaluate(async () => {
      const { probeCloudEdges } =
        await import('/tests/fixtures/cloud-edge-probe.js');
      return probeCloudEdges(window.__hexwild.graphics);
    });
  const check = (result) => {
    expect(result.gl).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.foregroundLeaks).toBe(0);
    expect(result.pixels).toBeGreaterThan(100);
    expect(result.supportedCount).toBeGreaterThan(200);
    expect(result.newHoles).toBeLessThan(result.oldHoles * 0.8);
    expect(result.newError).toBeLessThan(result.oldError);
  };
  const first = await probe();
  await writeFile(
    info.outputPath('cloud-edges.json'),
    JSON.stringify({ first, messages }, null, 2),
  );
  check(first);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('cloud-edges.png') });
  await page.evaluate(async () => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__edgeRestore = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      document
        .querySelector('#world')
        .addEventListener('webglcontextrestored', resolve, { once: true });
      window.__edgeRestore.restoreContext();
    });
  });
  await waitForRecoveredRenderer(page);
  await warm();
  const restored = await probe();
  await writeFile(
    info.outputPath('cloud-edges.json'),
    JSON.stringify({ first, restored, messages }, null, 2),
  );
  check(restored);
  expect(messages).toEqual([]);
});
