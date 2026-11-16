import { test, expect } from './browser-fixture.js';
import { parallaxScene } from './fixtures/parallax-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { writeFile } from 'node:fs/promises';

async function settle(page, frames = 48) {
  const start = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThan(start + frames);
}

async function gpuFrame(page) {
  // Median of real scene draws with a timer query; null where unsupported.
  return page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      gl = g.renderer.getContext(),
      ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const samples = [];
    for (let i = 0; i < 15; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      g.renderer.render(g.scene, g.camera);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      await new Promise((resolve) => {
        const poll = () =>
          gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)
            ? resolve()
            : setTimeout(poll, 4);
        poll();
      });
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
        samples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    samples.sort((a, b) => a - b);
    return samples[samples.length >> 1] ?? null;
  });
}

for (const time of [24, 46])
  test(`parallax occlusion and self-shadow at time ${time}`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
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
      name: 'parallax.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(parallaxScene({ time }))),
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
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending
            );
          }),
        { timeout: 300000 },
      )
      .toBe(true);
    const distance = await page.evaluate(
      () =>
        window.__hexwild.graphics.textures.materials.uniforms
          .surfaceParallaxDistance.value,
    );
    expect(distance).toBe(32);
    const capture = async (value, name) => {
      await page.evaluate((v) => {
        const g = window.__hexwild.graphics;
        g.textures.materials.uniforms.surfaceParallaxDistance.value = v;
        g.composer?.effects.temporal.reset();
      }, value);
      await settle(page);
      await page
        .locator('#world')
        .screenshot({ path: info.outputPath(name + '.png') });
    };
    await capture(0, `time-${time}-pom-off`);
    await capture(32, `time-${time}-pom-on`);
    // Interleaved rounds so clock and thermal drift affect both sides alike.
    const samples = { off: [], on: [] };
    for (let round = 0; round < 4; round++)
      for (const [key, value] of [
        ['off', 0],
        ['on', 32],
      ]) {
        await page.evaluate((v) => {
          window.__hexwild.graphics.textures.materials.uniforms.surfaceParallaxDistance.value =
            v;
        }, value);
        await settle(page, 8);
        samples[key].push(await gpuFrame(page));
      }
    const median = (list) =>
      list.includes(null)
        ? null
        : [...list].sort((a, b) => a - b)[list.length >> 1];
    await writeFile(
      info.outputPath('timing.json'),
      JSON.stringify(
        {
          time,
          sceneMsOff: median(samples.off),
          sceneMsOn: median(samples.on),
          samples,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  });
