import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { daylightSave } from './fixtures/photon-daylight-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('foliage uses shared continuous weather, native wind and shadow vertices through device recovery', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['warning', 'error'].includes(e.type())) messages.push(e.text());
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
    name: 'wind-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(daylightSave())),
  });
  await expect(page.locator('#hud')).toBeVisible();
  async function ready() {
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
  }
  await ready();
  const probe = () =>
    page.evaluate(async () => {
      const { probeFoliageWind } =
        await import('/tests/fixtures/foliage-wind-probe.js');
      return probeFoliageWind(window.__hexwild.graphics);
    });
  function check(result) {
    expect(result.gl).toBe(0);
    expect(result.sharedNoise).toBe(true);
    for (const row of result.rows) {
      for (let c = 0; c < 3; c++)
        expect(
          Math.abs(row.actual[c] - row.expected[c]),
          JSON.stringify(row),
        ).toBeLessThan(0.0006);
      if (row.sky === 0 || (row.name.startsWith('plant') && row.index === 3))
        expect(row.actual).toEqual([0, 0, 0]);
      if (!row.name.endsWith('shadow')) {
        const shadow = result.rows.find(
          (s) =>
            s.name === row.name + '-shadow' &&
            s.time === row.time &&
            s.offset === row.offset &&
            s.index === row.index,
        );
        expect(row.actual).toEqual(shadow.actual);
      }
    }
  }
  const first = await probe();
  await writeFile(
    info.outputPath('foliage-wind.json'),
    JSON.stringify({ first, messages }, null, 2),
  );
  check(first);
  const weather = await page.evaluate(async () => {
    const { WeatherColumns } = await import('/src/weather.js');
    const columns = new WeatherColumns();
    const g = window.__hexwild.graphics,
      rows = [];
    for (const quality of [1.7, 1, 0.65, 1.7]) {
      g.setQuality(quality);
      for (const [time, rain, wetness] of [
        [70, 0, 0],
        [70, 1, 1],
        [700, 0, 0],
      ]) {
        g.frame(
          0,
          time,
          false,
          false,
          false,
          { rain, storm: 0, wetness },
          columns,
        );
        rows.push({
          quality,
          time,
          rain,
          wind: g.cloudSystem.climate.wind,
          strength: g.leafUniforms.leafWind.value,
          noise: g.leafUniforms.leafNoise.value === g.cloudSystem.noise,
        });
      }
    }
    return rows;
  });
  for (const row of weather) {
    expect(row.strength).toBeCloseTo(
      (0.25 + 0.66 * row.rain) * (0.5 + row.wind),
      12,
    );
    expect(row.noise).toBe(true);
  }
  expect(weather[1].strength).toBeGreaterThan(weather[0].strength);
  expect(weather[0].wind).not.toBe(weather[2].wind);
  await page.evaluate(async () => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__windRestore = ext;
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
      window.__windRestore.restoreContext();
    });
  });
  await waitForRecoveredRenderer(page);
  await ready();
  const restored = await probe();
  await writeFile(
    info.outputPath('foliage-wind.json'),
    JSON.stringify({ first, weather, restored, messages }, null, 2),
  );
  check(restored);
  expect(messages).toEqual([]);
});
