import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { oracleWeatherColor } from './fixtures/photon-sky-oracle.js';

test('Photon rain and snow colors reach native fog, cloud aerial light and precipitation across day and night', async ({
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
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const load = async (scene, time) => {
    if (!(await page.locator('#start').isVisible())) {
      await page.keyboard.press('Escape');
      await page.locator('#home').click();
    }
    const save = referenceSave(scene);
    save.time = time;
    save.weather = {
      kind: 'rain',
      remaining: 3600,
      sequence: 0,
      rain: 1,
      storm: 0,
      wetness: 1,
    };
    await page
      .locator('#save-file')
      .setInputFiles({
        name: 'weather-v16.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
    await expect(page.locator('#start')).not.toBeVisible();
    if (await page.locator('#hud').isVisible()) await page.keyboard.press('F1');
  };
  const capture = async (label) => {
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 35);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            const t = window.__hexwild.state.time,
              angle = ((t % 600) / 600) * Math.PI * 2,
              y = (Math.sin(angle) * 78) / Math.hypot(78, 45);
            return (
              !a.pending &&
              a.key !== null &&
              Math.abs(a.uniforms.skySunDirection.value.y - y) < 0.001
            );
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const record = await page.evaluate(() => {
      const app = window.__hexwild,
        g = app.graphics,
        a = g.skyEnvironment.atmosphere,
        w = g.weatherEffects;
      return {
        time: app.state.time,
        sun: a.uniforms.skySunDirection.value.toArray(),
        rain: (a.uniforms.skyAerosol.value - 1) / 5,
        snow: a.uniforms.skySnowFraction.value,
        ambient: a.fogSnapshot.ambient.toArray(),
        airAmbient: g.atmosphere.uniforms.airSkyMean.value.toArray(),
        cloudFog: g.cloudSystem.uniforms.cloudFogColor.value.toArray(),
        rainColor: a.weatherColors.rain.toArray(),
        snowColor: a.weatherColors.snow.toArray(),
        rainMaterial: w.rain.material.color.toArray(),
        snowMaterial: w.snow.material.color.toArray(),
        splashes: w.splashes.material.color.toArray(),
        counts: {
          rain: w.rain.geometry.drawRange.count,
          snow: w.snow.geometry.drawRange.count,
        },
        fog: [g.scene.fog.near, g.scene.fog.far],
        exposure: g.renderer.toneMappingExposure,
        position: app.state.position,
        summary: [a.targets[2].width, a.targets[2].height],
        gl: g.renderer.getContext().getError(),
      };
    });
    await page.screenshot({ path: info.outputPath(label + '.png') });
    const expectedAmbient = oracleWeatherColor(
        record.sun[1],
        record.snow,
        false,
      ),
      expectedRain = oracleWeatherColor(record.sun[1], 0, true),
      expectedSnow = oracleWeatherColor(record.sun[1], 1, true);
    for (const [actual, expected] of [
      [record.ambient, expectedAmbient],
      [record.rainColor, expectedRain],
      [record.snowColor, expectedSnow],
    ])
      for (let c = 0; c < 3; c++)
        expect(
          Math.abs(actual[c] - expected[c]) / Math.max(1, expected[c]),
        ).toBeLessThan(0.001);
    expect(record.airAmbient).toEqual(record.ambient);
    expect(record.cloudFog).toEqual(record.ambient);
    expect(record.rainMaterial).toEqual(record.rainColor);
    expect(record.snowMaterial).toEqual(record.snowColor);
    expect(record.splashes).toEqual(record.rainColor);
    expect(record.summary).toEqual([22, 1]);
    expect(record.fog).toEqual([81.32, 111]);
    expect(record.exposure).toBe(1);
    expect(record.gl).toBe(0);
    records.push({ label, ...record });
    await writeFile(
      info.outputPath('native-weather-colors.json'),
      JSON.stringify({ records, messages }, null, 2),
    );
    return record;
  };
  await load(referenceScenes[0], 120);
  const day = await capture('forest-rain-day');
  expect(day.counts.rain).toBeGreaterThan(0);
  expect(day.snow).toBe(0);
  // Float32 production GLSL against the pinned source's independent CPU math.
  const cases = [];
  for (const y of [-1, -0.1, 0.18, 0.5, 1])
    for (const snow of [0, 0.4, 1])
      for (const precipitation of [false, true])
        cases.push({ y, snow, precipitation });
  for (const rain of [0, 0.5, 1])
    for (const edge of [0, 1]) cases.push({ aerial: true, rain, edge });
  cases.push({ aerial: true, rain: 1, edge: 1, transmission: 1, empty: true });
  const result = await page.evaluate(async (cases) => {
    const { probeWeatherColor } =
      await import('/tests/fixtures/weather-color-probe.js');
    return probeWeatherColor(window.__hexwild.graphics, cases);
  }, cases);
  let maximum = 0;
  for (let i = 0; i < cases.length; i++) {
    const s = cases[i],
      expected = s.aerial
        ? [0, 1, 2].map((c) => {
            const t =
                [0.2, 0.5, 0.8][c] * (1 - 0.8 * s.rain) + 0.2 * 0.8 * s.rain,
              w = s.rain * (1 - 0.1 * s.edge),
              sky = [0.2, 0.5, 0.8][c] * (1 - w) + [0.1, 0.2, 0.4][c] * w;
            return (
              [0.3, 0.6, 0.9][c] * (s.empty ? 0 : 1) * t +
              sky * (1 - t) * (1 - (s.transmission ?? 0.25))
            );
          })
        : oracleWeatherColor(s.y, s.snow, s.precipitation);
    for (let c = 0; c < 3; c++)
      maximum = Math.max(
        maximum,
        Math.abs(result.pixels[i * 4 + c] - expected[c]),
      );
  }
  await writeFile(
    info.outputPath('weather-kernels.json'),
    JSON.stringify({ cases, result, maximum }, null, 2),
  );
  expect(maximum).toBeLessThan(0.00001);
  expect(result.gl).toBe(0);
  await page.evaluate(() =>
    window.__hexwild.step(450 - window.__hexwild.state.time),
  );
  const night = await capture('forest-rain-night');
  expect(day.rainColor[1] / night.rainColor[1]).toBeCloseTo(20, 1);
  await load({ eye: [-250, 45, -180], look: [-230, 13, -180] }, 450);
  const snow = await capture('snow-night');
  expect(snow.snow).toBe(1);
  expect(snow.counts.snow).toBeGreaterThan(0);
  expect(snow.snowColor[1] / snow.ambient[1]).toBeCloseTo(0.5 / 0.06, 1);
  expect(messages).toEqual([]);
});
