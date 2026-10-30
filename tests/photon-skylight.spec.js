import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('Photon hemisphere projection excludes lower radiance and drives real Lambert surfaces in source SH convention', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.goto('/');
  const data = await page.evaluate(async () => {
    const { probePhotonSkylight } =
      await import('/tests/fixtures/photon-skylight-probe.js');
    return probePhotonSkylight(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('hemisphere-contract.json'),
    JSON.stringify({ data, messages }, null, 2),
  );
  for (const field of data.fields) {
    for (let i = 0; i < 27; i++)
      expect(
        Math.abs(field.coefficients[i] - field.expected[i]) /
          Math.max(1, Math.abs(field.expected[i])),
      ).toBeLessThan(0.003);
    for (const sample of field.samples)
      for (let c = 0; c < 3; c++)
        expect(
          Math.abs(sample.actual[c] - sample.expected[c]) /
            Math.max(1, sample.expected[c]),
        ).toBeLessThan(0.004);
  }
  expect(data.fields[0].coefficients).toEqual(data.fields[1].coefficients);
  expect(data.gl).toBe(0);
  expect(messages).toEqual([]);
});

test('fixed native forest compares hemisphere sky with the prior full-sphere path without changing sun or exposure', async ({
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
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  for (const [label, enabled] of [
    ['legacy', false],
    ['hemisphere', true],
    ['restored', false],
  ]) {
    await page.evaluate(async (enabled) => {
      const { setSkylightControl } =
        await import('/tests/fixtures/photon-skylight-probe.js');
      await setSkylightControl(window.__hexwild.graphics, enabled);
    }, enabled);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics,
              a = g.skyEnvironment.atmosphere;
            return !!a.key && !a.pending && !g.relightQueue.size;
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    records.push(
      await page.evaluate((label) => {
        const g = window.__hexwild.graphics,
          a = g.skyEnvironment.atmosphere;
        return {
          label,
          time: window.__hexwild.state.time,
          position: g.camera.position.toArray(),
          fov: g.camera.fov,
          exposure: g.renderer.toneMappingExposure,
          post: g.postOptions,
          fog: [g.scene.fog.near, g.scene.fog.far],
          direct: a.directLight.toArray(),
          zenith: a.zenith.toArray(),
          sh: a.probe.sh.toArray(),
          skyUp: a.probe.sh
            .getIrradianceAt(
              { x: 0, y: 1, z: 0 },
              a.probe.sh.coefficients[0].clone(),
            )
            .toArray(),
          targets: a.targets.map((t) => [t.width, t.height]),
        };
      }, label),
    );
  }
  await writeFile(
    info.outputPath('native-forest.json'),
    JSON.stringify({ records, messages }, null, 2),
  );
  expect(messages).toEqual([]);
  for (const row of records.slice(1))
    for (const key of [
      'time',
      'position',
      'fov',
      'exposure',
      'post',
      'fog',
      'direct',
      'zenith',
      'targets',
    ])
      expect(row[key]).toEqual(records[0][key]);
  expect(records[0].sh).toEqual(records[2].sh);
  expect(records[1].sh).not.toEqual(records[0].sh);
  // A separately labelled daylight comparison diagnoses time-of-day color.
  // The canonical dawn camera/time above is retained unchanged.
  await page.evaluate(() => {
    const api = window.__hexwild;
    api.step(120 - api.state.time);
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const daylight = [];
  for (const [label, enabled] of [
    ['day-legacy', false],
    ['day-hemisphere', true],
  ]) {
    await page.evaluate(async (enabled) => {
      const { setSkylightControl } =
        await import('/tests/fixtures/photon-skylight-probe.js');
      await setSkylightControl(window.__hexwild.graphics, enabled);
    }, enabled);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            return !!a.key && !a.pending;
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    const snapshot = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        a = g.skyEnvironment.atmosphere;
      return {
        time: window.__hexwild.state.time,
        position: g.camera.position.toArray(),
        direction: a.uniforms.skySunDirection.value.toArray(),
        direct: a.directLight.toArray(),
        exposure: g.renderer.toneMappingExposure,
        sh: a.probe.sh.toArray(),
        fog: [g.scene.fog.near, g.scene.fog.far],
      };
    });
    daylight.push(snapshot);
    await writeFile(
      info.outputPath(label + '.json'),
      JSON.stringify(snapshot, null, 2),
    );
  }
  expect(daylight[0].time).toBe(120);
  for (const key of [
    'time',
    'position',
    'direction',
    'direct',
    'exposure',
    'fog',
  ])
    expect(daylight[1][key]).toEqual(daylight[0][key]);
  expect(messages).toEqual([]);
});
