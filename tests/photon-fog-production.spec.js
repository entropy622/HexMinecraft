import { test, expect } from './browser-fixture.js';
import { readFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('production rain and snow scenes render through native v16 imports and retain weather, pose and edits on export', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  for (const [label, scene] of [
    ['rain', referenceScenes[0]],
    // Keep the native import clear of this snow column's natural tree. The
    // normal loader correctly relocates a colliding pose to the spawn point.
    ['snow', { eye: [-250, 45, -180], look: [-230, 13, -180] }],
  ]) {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.__hexwild)).toBe(
      'undefined',
    );
    await page.evaluate(() => {
      const hud = document.querySelector('#hud'),
        observer = new MutationObserver(() => {
          if (hud.classList.contains('hidden')) return;
          observer.disconnect();
          for (const type of ['keydown', 'keyup'])
            document.body.dispatchEvent(
              new KeyboardEvent(type, {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              }),
            );
        });
      observer.observe(hud, { attributes: true, attributeFilter: ['class'] });
    });
    const input = referenceSave(scene);
    input.time = 120;
    input.weather = {
      kind: 'rain',
      remaining: 3600,
      sequence: 0,
      rain: 1,
      storm: 0,
      wetness: 1,
    };
    await page.locator('#save-file').setInputFiles({
      name: `${label}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(input)),
    });
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect(page.locator('#quality')).toHaveValue('1.7');
    await expect(page.locator('#biome-name')).toHaveText(
      label === 'snow' ? '雪原' : '森林',
    );
    await expect(page.locator('#weather-hud')).toContainText(
      label === 'snow' ? '降雪' : '降雨',
    );
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 35);
    expect(
      await page.evaluate(() =>
        document.querySelector('#world').getContext('webgl2').getError(),
      ),
    ).toBe(0);
    if (label === 'rain') {
      // Exercise the shipped bundle through the canvas and visible UI only;
      // the development API remains absent throughout restoration.
      await page.evaluate(async () => {
        const canvas = document.querySelector('#world'),
          extension = canvas
            .getContext('webgl2')
            .getExtension('WEBGL_lose_context');
        if (!extension) throw Error('WEBGL_lose_context unavailable');
        window.productionRecoveryExtension = extension;
        await new Promise((resolve) => {
          canvas.addEventListener('webglcontextlost', resolve, { once: true });
          extension.loseContext();
        });
      });
      await expect(page.locator('#render-recovery')).toBeVisible();
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          document
            .querySelector('#world')
            .addEventListener('webglcontextrestored', resolve, { once: true });
          window.productionRecoveryExtension.restoreContext();
        });
      });
      await expect(page.locator('#render-recovery')).toBeHidden({
        timeout: 120000,
      });
      await expect(page.locator('#pause-overlay')).toBeVisible();
      expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(
        false,
      );
      const restoredAt = await page.evaluate(
        () => window.__photonProbe.rendered,
      );
      await expect
        .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
          timeout: 90000,
        })
        .toBeGreaterThan(restoredAt + 35);
      expect(await page.evaluate(() => typeof window.__hexwild)).toBe(
        'undefined',
      );
      expect(
        await page.evaluate(() =>
          document.querySelector('#world').getContext('webgl2').getError(),
        ),
      ).toBe(0);
    }
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const file = info.outputPath(`${label}-v16.json`);
    await download.saveAs(file);
    const output = JSON.parse(await readFile(file, 'utf8'));
    expect(output.version).toBe(16);
    expect(output.time).toBe(input.time);
    expect(output.position).toEqual(input.position);
    expect(output.weather).toEqual(input.weather);
    expect(output.dimensions.overworld.edits).toEqual(
      input.dimensions.overworld.edits,
    );
    await page.screenshot({
      path: info.outputPath(`${label}-production-controls.png`),
    });
  }
  expect(messages).toEqual([]);
});
