import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { DataUtils } from 'three';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('cloud fill follows the same atmospheric moonlight instead of a white night floor', async ({
  page,
}, info) => {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  const input = referenceSave(referenceScenes[1]);
  input.time = 450;
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
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
    name: 'moon-cloud-forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(input)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const captures = [];
  try {
    for (const [name, time, illumination] of [
      ['full-moon', 450, 1],
      ['new-moon', 2850, 0],
    ]) {
      await page.evaluate((time) => {
        const a = window.__hexwild;
        a.setPlaying(false);
        a.step(time - a.state.time);
      }, time);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
              return a.pending ? -1 : a.uniforms.skyMoonIllumination.value;
            }),
          { timeout: 60000 },
        )
        .toBe(illumination);
      const start = await page.evaluate(() => window.__photonProbe.rendered);
      await expect
        .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
          timeout: 60000,
        })
        .toBeGreaterThanOrEqual(start + 40);
      const sample = await page.evaluate(() => {
        const g = window.__hexwild.graphics,
          a = g.skyEnvironment.atmosphere,
          pass = g.composer.passes[0],
          target = pass.clouds.histories.get(pass.target).history[0],
          pixels = new Uint16Array(target.width * target.height * 4),
          gl = g.renderer.getContext(),
          ext = gl.getExtension('WEBGL_debug_renderer_info');
        g.renderer.readRenderTargetPixels(
          target,
          0,
          0,
          target.width,
          target.height,
          pixels,
        );
        return {
          time: window.__hexwild.state.time,
          exposure: g.renderer.toneMappingExposure,
          ambient: g.cloudSystem.uniforms.cloudAmbient.value.toArray(),
          sky: a.zenith.toArray(),
          direct: g.cloudSystem.uniforms.cloudDirect.value.toArray(),
          sunDirection: a.uniforms.skySunDirection.value.toArray(),
          moon: a.uniforms.skyMoonIllumination.value,
          renderer: ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          gl: gl.getError(),
          pixels: Array.from(pixels),
        };
      });
      const pixels = sample.pixels.map(DataUtils.fromHalfFloat);
      delete sample.pixels;
      sample.cloud = {
        finite: pixels.every(Number.isFinite),
        count: pixels.filter((x, i) => i % 4 === 3 && x < 0.995).length,
        maximum: pixels.reduce((a, x) => Math.max(a, x), 0),
      };
      captures.push({ name, ...sample });
      await page
        .locator('#world')
        .screenshot({ path: info.outputPath(`${name}.png`) });
      expect(sample.gl).toBe(0);
      expect(sample.cloud.finite).toBe(true);
      expect(sample.cloud.count).toBeGreaterThan(100);
      expect(sample.exposure).toBe(1);
    }
    const luminance = (rgb) =>
      rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const [full, dark] = captures;
    expect(luminance(dark.sky)).toBeLessThan(luminance(full.sky) * 0.65);
    expect(luminance(dark.ambient)).toBeLessThan(
      luminance(full.ambient) * 0.65,
    );
    full.sunDirection.forEach((v, i) =>
      expect(Math.abs(v - dark.sunDirection[i])).toBeLessThan(0.00001),
    );
    expect(messages.errors).toEqual([]);
  } finally {
    await writeFile(
      info.outputPath('cloud-sky.json'),
      JSON.stringify({ captures, messages }, null, 2),
    );
  }
});
