import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('directional terrain borders meet the visible sky while near surfaces, fog distances and quality transitions remain intact', async ({
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
  await page.locator('#save-file').setInputFiles({
    name: 'border-forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  // This fixture toggles only the new production border contribution. The
  // original updater still publishes all real sky, medium and fog inputs.
  await page.evaluate(() => {
    const air = window.__hexwild.graphics.atmosphere,
      update = air.update.bind(air);
    window.__borderBaseline = false;
    air.update = (state) => {
      update(state);
      if (window.__borderBaseline) air.uniforms.airBorderEnabled.value = 0;
    };
  });
  async function settle() {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending &&
              g.atmosphere.uniforms.airBorderSky.value ===
                g.skyEnvironment.uniforms.skyRadianceMap.value
            );
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 32);
  }
  async function capture(label, baseline) {
    await page.evaluate((v) => {
      window.__borderBaseline = v;
    }, baseline);
    await settle();
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
  }
  await capture('forest-before', true);
  await capture('forest-after', false);
  const morning = await page.evaluate(async () => {
    const { probeBorderSky } =
      await import('/tests/fixtures/border-fog-probe.js');
    return probeBorderSky(window.__hexwild.graphics);
  });
  expect(morning.maxError).toBeLessThan(0.002);
  expect(morning.gl).toBe(0);
  expect(morning.visibilityError).toBeLessThan(0.00001);
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.step(120 - a.state.time);
    a.teleport(-177.5, 43, 54.5);
    a.lookAt(-157.5, 33, 54.5);
    a.graphics.stepOffset = 0;
  });
  await capture('jungle-before', true);
  await capture('jungle-after', false);
  const phases = [];
  for (const quality of [1.7, 1, 0.65]) {
    await page.evaluate(
      (q) => window.__hexwild.graphics.setQuality(q),
      quality,
    );
    await settle();
    const result = await page.evaluate(async () => {
      const g = window.__hexwild.graphics,
        { probeBorderSky, probeBorderSurfaces } =
          await import('/tests/fixtures/border-fog-probe.js');
      return {
        sky: probeBorderSky(g),
        surfaces: probeBorderSurfaces(g),
        quality: g.quality,
        fog: [g.scene.fog.near, g.scene.fog.far],
        exposure: g.renderer.toneMappingExposure,
        far: g.camera.far,
        enabled: g.atmosphere.uniforms.airBorderEnabled.value,
        mapBound:
          g.atmosphere.uniforms.airBorderSky.value ===
          g.skyEnvironment.uniforms.skyRadianceMap.value,
      };
    });
    phases.push(result);
    await writeFile(
      info.outputPath('phase-' + quality + '.json'),
      JSON.stringify(result, null, 2),
    );
    expect(result.sky.maxError).toBeLessThan(0.002);
    expect(result.sky.gl).toBe(0);
    expect(result.sky.visibilityError).toBeLessThan(0.00001);
    expect(result.surfaces.near).toBeGreaterThan(100);
    expect(result.surfaces.nearError).toBe(0);
    expect(result.surfaces.far).toBeGreaterThan(20);
    expect(result.surfaces.farMeanDifference).toBeGreaterThan(0.00001);
    expect(result.surfaces.gl).toBe(0);
    expect(result.fog).toEqual([87.32, 118]);
    expect(result.exposure).toBe(1);
    expect(result.far).toBe(220);
    expect(result.enabled).toBe(1);
    expect(result.mapBound).toBe(true);
    if (quality !== 1.7) await capture('jungle-quality-' + quality, false);
  }
  const bindings = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      gl = g.renderer.getContext(),
      samplerTypes = [
        gl.SAMPLER_2D,
        gl.SAMPLER_3D,
        gl.SAMPLER_CUBE,
        gl.SAMPLER_2D_SHADOW,
        gl.SAMPLER_2D_ARRAY,
      ];
    let programs = 0,
      maximumSamplers = 0;
    for (const p of g.renderer.info.programs) {
      const uniforms = Array.from(
        { length: gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS) },
        (_, i) => gl.getActiveUniform(p.program, i),
      );
      if (!uniforms.some((u) => u.name === 'airBorderSky')) continue;
      programs++;
      maximumSamplers = Math.max(
        maximumSamplers,
        uniforms
          .filter((u) => samplerTypes.includes(u.type))
          .reduce((v, u) => v + u.size, 0),
      );
    }
    return {
      programs,
      maximumSamplers,
      limit: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      gl: gl.getError(),
    };
  });
  expect(bindings.programs).toBeGreaterThan(0);
  expect(bindings.maximumSamplers).toBeLessThanOrEqual(bindings.limit);
  expect(bindings.gl).toBe(0);
  await writeFile(
    info.outputPath('border-fog.json'),
    JSON.stringify({ morning, phases, bindings, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
