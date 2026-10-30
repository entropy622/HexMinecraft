import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { DataUtils } from 'three';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('live Photon fog separates morning, noon and rain, keeps distant terrain visible and shares coefficients with the analytic path', async ({
  page,
}, info) => {
  test.setTimeout(480000);
  const messages = [],
    records = [];
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
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const capture = async (label) => {
    const start = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(start + 35);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            return !a.pending && a.key !== null;
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const { photonFogParameters } = await import('/src/photon-fog.js');
            const g = window.__hexwild.graphics,
              air = g.atmosphere,
              u = air.uniforms,
              target = photonFogParameters({
                sunDirection: g.skyEnvironment.uniforms.skySunDirection.value,
                ...g.cloudSystem.climate,
                rain: window.__fogRain || 0,
                biomes: air.biomes.sample(g.world, g.camera.position),
              });
            return Math.abs(u.airMieExtinction.value - target.mieExtinction);
          }),
        { timeout: 60000 },
      )
      .toBeLessThan(1e-7);
    const result = await page.evaluate(() => {
      const app = window.__hexwild,
        g = app.graphics,
        u = g.atmosphere.uniforms,
        a = g.skyEnvironment.atmosphere,
        pass = g.composer?.passes.find(
          (p) => p.constructor.name === 'AtmospherePass',
        );
      const gl = g.renderer.getContext(),
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      const raw = pass
        ? new Uint16Array(pass.target.width * pass.target.height * 4)
        : null;
      if (pass)
        g.renderer.readRenderTargetPixels(
          pass.target,
          0,
          0,
          pass.target.width,
          pass.target.height,
          raw,
        );
      return {
        time: app.state.time,
        position: app.state.position,
        fov: g.camera.fov,
        exposure: g.renderer.toneMappingExposure,
        fog: [g.scene.fog.near, g.scene.fog.far],
        climate: g.cloudSystem.climate,
        biomes: g.atmosphere.biomes.sample(g.world, g.camera.position),
        rayleigh: u.airRayleigh.value.toArray(),
        mie: u.airMieExtinction.value,
        mieScattering: u.airMieScattering.value,
        density: u.airDensity.value,
        direct: u.airDirectMultiplier.value,
        glow: u.airScatterMultiplier.value,
        sun: a.uniforms.skySunDirection.value.toArray(),
        directColor: u.airSunColor.value.toArray(),
        directPower: u.airSunPower.value,
        sh: a.probe.sh.toArray(),
        volume: u.airVolume.value,
        // The real volume, rather than another fog implementation.
        volumePixels: raw ? [...raw] : null,
        volumeSize: pass ? [pass.target.width, pass.target.height] : null,
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        gl: gl.getError(),
      };
    });
    await page.screenshot({ path: info.outputPath(`${label}.png`) });
    if (result.volumePixels) {
      const stats = {
        pixels: result.volumePixels.length / 4,
        minT: 1,
        maxT: 0,
        meanT: 0,
        meanScatter: [0, 0, 0],
        invalid: 0,
      };
      for (let i = 0; i < result.volumePixels.length; i += 4) {
        const t = DataUtils.fromHalfFloat(result.volumePixels[i + 3]);
        stats.minT = Math.min(stats.minT, t);
        stats.maxT = Math.max(stats.maxT, t);
        stats.meanT += t;
        for (let c = 0; c < 3; c++) {
          const value = DataUtils.fromHalfFloat(result.volumePixels[i + c]);
          if (!Number.isFinite(value) || value < 0) stats.invalid++;
          stats.meanScatter[c] += value;
        }
        if (!Number.isFinite(t) || t < 0 || t > 1) stats.invalid++;
      }
      stats.meanT /= stats.pixels;
      stats.meanScatter = stats.meanScatter.map((v) => v / stats.pixels);
      result.volumeStats = stats;
      delete result.volumePixels;
      expect(stats.invalid).toBe(0);
    }
    records.push({ label, ...result });
    await writeFile(
      info.outputPath('fog-weather.json'),
      JSON.stringify({ records, messages }, null, 2),
    );
    expect(result.gl).toBe(0);
    expect(result.exposure).toBe(1);
    expect(result.fov).toBe(72);
    return result;
  };
  const load = async (scene, time = 30, rain = 0) => {
    if (!(await page.locator('#start').isVisible())) {
      await page.keyboard.press('Escape');
      await page.locator('#home').click();
    }
    const save = referenceSave(scene);
    await page.evaluate((rain) => (window.__fogRain = rain), rain);
    save.time = time;
    save.weather = {
      kind: rain ? 'rain' : 'clear',
      remaining: 3600,
      sequence: 0,
      rain,
      storm: 0,
      wetness: rain,
    };
    await page.locator('#save-file').setInputFiles({
      name: 'fog-v16.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await expect(page.locator('#start')).not.toBeVisible();
    if (await page.locator('#hud').isVisible()) await page.keyboard.press('F1');
  };
  await load(referenceScenes[0]);
  const morning = await capture('forest-morning');
  await page.evaluate(() =>
    window.__hexwild.step(120 - window.__hexwild.state.time),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  const noon = await capture('forest-noon');
  expect(morning.mie).toBeGreaterThan(noon.mie * 3);
  expect(morning.fog).toEqual([87.32, 118]);
  expect(noon.fog).toEqual(morning.fog);
  expect(noon.position).toEqual(morning.position);
  await page.setViewportSize({ width: 900, height: 650 });
  // Cloud visibility must not change fog's climate, even when it is rendered
  // by the inexpensive material path instead of the post volume.
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, clouds: false });
    g.setQuality(1);
  });
  const analytic = await capture('forest-noon-analytic-clouds-off');
  expect(analytic.volume).toBe(0);
  expect(analytic.mie).toBeCloseTo(noon.mie, 6);
  expect(analytic.climate).toEqual(noon.climate);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, clouds: true });
    g.setQuality(1.7);
  });
  await page.evaluate(() =>
    window.__hexwild.step(308 - window.__hexwild.state.time),
  );
  const blue = await capture('forest-blue-hour');
  expect(blue.sun[1]).toBeLessThan(0);
  expect(blue.mie).toBeGreaterThan(noon.mie * 3);
  expect(blue.glow).toBeGreaterThan(1.2);
  await load(referenceScenes[0], 120, 1);
  const rain = await capture('forest-rain');
  expect(rain.mie).toBeCloseTo(0.03, 4);
  expect(rain.mieScattering / rain.mie).toBeCloseTo(0.5, 3);
  expect(rain.direct).toBeCloseTo(0.1, 6);
  expect(rain.fog).toEqual([81.32, 111]);
  expect(rain.position).toEqual(morning.position);
  await load(referenceScenes[2]);
  const basin = await capture('low-basin-morning');
  expect(basin.fog).toEqual(morning.fog);
  expect(basin.volume).toBe(1);
  expect(basin.volumeStats.minT).toBeGreaterThan(0);
  expect(basin.volumeStats.minT).toBeLessThan(1);
  await writeFile(
    info.outputPath('fog-weather.json'),
    JSON.stringify({ records, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
