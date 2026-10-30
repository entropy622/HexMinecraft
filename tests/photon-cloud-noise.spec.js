import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { decode } from 'fast-png';

const coverageImage = decode(
  await readFile(new URL('../src/assets/photon-noise.png', import.meta.url)),
).data;
function sampleCoverage(point) {
  const p = point.map((v) => v * 512 - 0.5),
    cell = p.map(Math.floor),
    f = p.map((v, i) => v - cell[i]),
    result = [0, 0, 0, 0],
    wrap = (v) => ((v % 512) + 512) % 512;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      const weight = (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]),
        index = (wrap(cell[1] + y) * 512 + wrap(cell[0] + x)) * 4;
      result.forEach(
        (_, c) => (result[c] += (weight * coverageImage[index + c]) / 255),
      );
    }
  return result;
}

const baseline = process.env.PHOTON_CLOUD_NOISE_BASELINE === '1';
const volumes = await Promise.all(
  ['bubbly', 'swirley'].map((name) =>
    readFile(
      new URL(`../src/assets/photon-worley-${name}.dat`, import.meta.url),
    ),
  ),
);
function sampleVolume(bytes, point) {
  const p = point.map((v) => v * 64 - 0.5),
    cell = p.map(Math.floor),
    f = p.map((v, i) => v - cell[i]),
    wrap = (v) => ((v % 64) + 64) % 64;
  let value = 0;
  for (let z = 0; z < 2; z++)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const weight =
          (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]) * (z ? f[2] : 1 - f[2]);
        const index =
          (wrap(cell[2] + z) * 64 + wrap(cell[1] + y)) * 64 + wrap(cell[0] + x);
        value += (weight * bytes[index]) / 255;
      }
  return value;
}
test('fixed forest and sky show actual cloud detail at unchanged camera, light and exposure', async ({
  page,
}, info) => {
  test.setTimeout(480000);
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
  await page.locator('#save-file').setInputFiles({
    name: 'forest-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const settle = async () => {
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
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending &&
              !!g.skyEnvironment.atmosphere.fogSnapshot
            );
          }),
        { timeout: 90000 },
      )
      .toBe(true);
  };
  const shots = [];
  for (const [label, time, sky, width, height] of [
    ['forest-morning', 30, false, 900, 650],
    ['sky-morning', 30, true, 900, 650],
    ['forest-day', 120, false, 900, 650],
    ['sky-day', 120, true, 900, 650],
    ['forest-morning-1080p', 30, false, 1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      ({ time, sky }) => {
        const a = window.__hexwild;
        a.setPlaying(false);
        a.step(time - a.state.time);
        a.lookAt(-98, sky ? 52 : 17, -4);
        a.graphics.stepOffset = 0;
      },
      { time, sky },
    );
    await settle();
    const state = await page.evaluate(() => {
      const a = window.__hexwild,
        g = a.graphics,
        texture = g.cloudSystem.worley;
      return {
        time: a.state.time,
        eye: g.camera.position.toArray(),
        rotation: g.camera.quaternion.toArray(),
        fov: g.camera.fov,
        exposure: g.renderer.toneMappingExposure,
        fog: [g.scene.fog.near, g.scene.fog.far],
        texture: {
          width: texture.image.width,
          height: texture.image.height,
          depth: texture.image.depth,
          format: texture.format,
          bytes: texture.image.data.byteLength,
        },
        light: g.cloudSystem.uniforms.cloudLightDirection.value.toArray(),
        coverageRange: g.cloudSystem.uniforms.cloudCoverageRange.value.map(
          (v) => v.toArray(),
        ),
        climate: g.cloudSystem.climate,
        error: g.renderer.getContext().getError(),
      };
    });
    expect(state.time).toBe(time);
    expect(state.fov).toBe(72);
    expect(state.exposure).toBe(1);
    expect(state.fog[0]).toBeCloseTo(87.32, 5);
    expect(state.fog[1]).toBe(118);
    expect(state.error).toBe(0);
    await page.screenshot({ path: info.outputPath(`${label}.png`) });
    shots.push({ label, width, height, ...state });
    if (label === 'forest-morning') {
      await page.evaluate(() => window.__photonProbe.start(60));
      await expect
        .poll(() => page.evaluate(() => window.__photonProbe.done), {
          timeout: 90000,
        })
        .toBe(true);
      const performance = await page.evaluate(() =>
        window.__photonProbe.result(),
      );
      await writeFile(
        info.outputPath('frame-cost.json'),
        JSON.stringify(performance, null, 2),
      );
      expect(performance.disjointEvents).toBe(0);
      expect(performance.busy).toBe(0);
      if (performance.extension) expect(performance.gpu).toHaveLength(60);
    }
  }
  let sampling = null;
  if (!baseline) {
    const points = [
      [0, 0, 0],
      [1, 1, 1],
      [0.5 / 64, 1.5 / 64, 2.5 / 64],
      [0.123, 0.456, 0.789],
      [-0.23, 1.12, -1.34],
      [2.2, -3.7, 5.1],
      [0.999, 0.001, 0.517],
      [0.41, 0.73, 0.29],
    ].map((p) => p.map(Math.fround));
    const actual = await page.evaluate(async (points) => {
      const { readCloudDetail } =
        await import('/tests/fixtures/cloud-noise-probe.js');
      return readCloudDetail(window.__hexwild.graphics, points);
    }, points);
    const expected = points.map((p) =>
      volumes.map((bytes) => sampleVolume(bytes, p)),
    );
    let error = 0;
    for (let i = 0; i < points.length; i++)
      for (let c = 0; c < 2; c++)
        error = Math.max(
          error,
          Math.abs(actual.values[i * 4 + c] - expected[i][c]),
        );
    sampling = { points, expected, actual, error };
  }
  const coveragePoints = [
    [0, 0],
    [1, 1],
    [0.5 / 512, 511.5 / 512],
    [0.123, 0.456],
    [-0.23, 2.17],
    [0.9999, -0.0001],
  ].map((p) => p.map(Math.fround));
  const coverage = await page.evaluate(
    async ({ points, sourceBytes }) => {
      const { readCloudCoverageNoise } =
        await import('/tests/fixtures/cloud-noise-probe.js');
      return readCloudCoverageNoise(
        window.__hexwild.graphics,
        points,
        sourceBytes,
      );
    },
    { points: coveragePoints, sourceBytes: Array.from(coverageImage) },
  );
  const coverageExpected = coveragePoints.flatMap(sampleCoverage);
  const coverageErrors = coverage.outputs.map((values) =>
    Math.max(...values.map((v, i) => Math.abs(v - coverageExpected[i]))),
  );
  const referenceErrors = coverage.outputs
    .slice(1)
    .map((values) =>
      Math.max(...values.map((v, i) => Math.abs(v - coverage.outputs[0][i]))),
    );
  await writeFile(
    info.outputPath('coverage-noise.json'),
    JSON.stringify(
      {
        points: coveragePoints,
        expected: coverageExpected,
        ...coverage,
        errors: coverageErrors,
        referenceErrors,
      },
      null,
      2,
    ),
  );
  expect(coverage.error).toBe(0);
  // Preserve the strict packing/atlas threshold against an independently
  // uploaded original source texture, rather than requiring hardware RGBA8
  // interpolation to equal ideal double precision. Record both comparisons.
  for (const error of referenceErrors) expect(error).toBeLessThan(0.0005);
  for (const error of coverageErrors)
    expect(error).toBeLessThan(1 / 255 + 0.0005);
  await writeFile(
    info.outputPath('cloud-detail.json'),
    JSON.stringify({ baseline, shots, sampling, messages }, null, 2),
  );
  if (sampling) {
    expect(sampling.actual.error).toBe(0);
    // The source bytes are exact; hardware trilinear filtering can quantize
    // interpolation weights. Still reject a wrong channel, layout or wrap.
    expect(sampling.error).toBeLessThan(0.001);
    expect(shots[0].texture.bytes).toBe(64 * 64 * 132);
  }
  expect(messages).toEqual([]);
});
