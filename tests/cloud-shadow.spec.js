import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('prepared cloud shadows cache a paused world and update during real advancing gameplay', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const save = referenceSave(referenceScenes[0]);
  save.time = 60;
  await page.locator('#save-file').setInputFiles({
    name: 'forest-v16.json',
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
            !g.relightQueue.size &&
            !g.skyEnvironment.atmosphere.pending &&
            g.cloudSystem.uniforms.cloudShadowReady.value === 1
          );
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  const begin = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThan(begin + 40);
  await page.evaluate(() => {
    const a = window.__hexwild,
      c = a.graphics.composer.passes[0].clouds.coverage,
      original = c.prepare;
    window.__shadowBakeCount = 0;
    c.prepare = function (...args) {
      const key = this.shadowKey;
      const result = original.apply(this, args);
      if (key !== this.shadowKey) window.__shadowBakeCount++;
      return result;
    };
    window.__shadowSnapshot = () => {
      const c = a.graphics.composer.passes[0].clouds.coverage,
        t = c.target,
        bytes = new Uint16Array(256 * 512 * 4);
      a.graphics.renderer.readRenderTargetPixels(t, 768, 0, 256, 512, bytes);
      let hash = 2166136261;
      for (const v of bytes) hash = Math.imul(hash ^ v, 16777619);
      return {
        time: a.state.time,
        eye: a.graphics.camera.position.toArray(),
        wind: a.graphics.cloudSystem.uniforms.cloudLayerWind.value.map((v) =>
          v.toArray(),
        ),
        hash: hash >>> 0,
        bakes: window.__shadowBakeCount,
        error: a.graphics.renderer.getContext().getError(),
      };
    };
  });
  const windows = [];
  for (const advancing of [false, true]) {
    const before = await page.evaluate((advancing) => {
      window.__photonFreeze = !advancing;
      window.__hexwild.setPlaying(advancing);
      return window.__shadowSnapshot();
    }, advancing);
    await page.evaluate(() => window.__photonProbe.start(60));
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.done), {
        timeout: 90000,
      })
      .toBe(true);
    const measured = await page.evaluate(() => window.__photonProbe.result());
    const after = await page.evaluate(() => {
      window.__photonFreeze = true;
      window.__hexwild.setPlaying(false);
      return window.__shadowSnapshot();
    });
    windows.push({ advancing, before, after, measured });
    expect(measured.busy).toBe(0);
    expect(measured.disjointEvents).toBe(0);
    if (measured.extension) expect(measured.gpu).toHaveLength(60);
    expect(before.error).toBe(0);
    expect(after.error).toBe(0);
    expect(after.eye).toEqual(before.eye);
    if (advancing) {
      expect(after.time).toBeGreaterThan(before.time);
      expect(after.bakes - before.bakes).toBeGreaterThanOrEqual(60);
      expect(after.hash).not.toBe(before.hash);
      expect(after.wind).not.toEqual(before.wind);
    } else {
      expect(after.time).toBe(before.time);
      expect(after.bakes).toBe(before.bakes);
      expect(after.hash).toBe(before.hash);
    }
  }
  await writeFile(
    info.outputPath('cloud-shadow-frame-cost.json'),
    JSON.stringify({ windows, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
