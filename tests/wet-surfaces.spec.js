import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});
async function fresh(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            g.relightQueue.size === 0
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function scene(page, material = 'stone', biome = null) {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(
    ({ material, biome }) => {
      const g = window.__hexwild,
        w = g.state.world,
        cells = [];
      g.setPlaying(false);
      let origin = { q: 0, r: 0 };
      if (biome) {
        let found;
        for (let q = -64; q <= 64 && !found; q += 8)
          for (let r = -64; r <= 64; r += 8)
            if (w.biome(q, r) === biome) {
              found = { q, r };
              break;
            }
        if (!found) throw Error('No actual biome site');
        origin = found;
      }
      window.wetOrigin = origin;
      g.teleport(origin.q + 3, 32, origin.r - 6);
      g.graphics.setPostOptions({
        occlusion: 0,
        antialias: false,
        bloom: 0,
        exposure: false,
        clouds: false,
      });
      for (let q = -9; q <= 9; q++)
        for (let r = -8; r <= 8; r++) {
          for (let y = 30; y < 64; y++)
            w.set(origin.q + q, y, origin.r + r, y < 32 ? material : null);
          cells.push([origin.q + q, 31, origin.r + r]);
        }
      g.graphics.updateCells(cells);
      g.teleport(window.wetOrigin.q + 3, 32, window.wetOrigin.r - 6);
      g.lookAt(window.wetOrigin.q, 32.5, window.wetOrigin.r);
      g.step(120 - g.state.time);
      g.graphics.stepOffset = 0;
    },
    { material, biome },
  );
  await fresh(page);
}
async function weather(page, wetness, rain = 0) {
  const saved = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
  saved.weather = {
    kind: rain ? 'rain' : 'clear',
    remaining: 180,
    sequence: 0,
    rain,
    storm: 0,
    wetness,
  };
  saved.time += 1;
  await page.locator('#save-file').setInputFiles({
    name: 'wet-weather.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time), {
      timeout: 60000,
    })
    .toBeGreaterThanOrEqual(saved.time);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.teleport(window.wetOrigin.q + 3, 32, window.wetOrigin.r - 6);
    g.lookAt(window.wetOrigin.q, 32.5, window.wetOrigin.r);
    g.step(120 - g.state.time);
    g.graphics.stepOffset = 0;
  });
  await fresh(page);
}
async function wall(page, type) {
  await page.evaluate((type) => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -2; q <= 2; q++)
      for (let y = 32; y <= 37; y++) {
        g.state.world.set(
          window.wetOrigin.q + q,
          y,
          window.wetOrigin.r + 4,
          type,
        );
        cells.push([window.wetOrigin.q + q, y, window.wetOrigin.r + 4]);
      }
    g.graphics.updateCells(cells);
  }, type);
  await fresh(page);
}
async function reflectionPixels(page) {
  await fresh(page);
  const raw = await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      { axialToWorld } = await import('/src/core.js'),
      output = g.composer.passes.find((p) => p.isOutputPass),
      t = [g.composer.renderTarget1, g.composer.renderTarget2].find(
        (t) => t.texture === output.uniforms.tDiffuse.value,
      ),
      data = new Uint16Array(t.width * t.height * 4),
      out = [];
    g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
    for (let q = -2; q <= 2; q += 0.5)
      for (let y = 26.5; y <= 30.5; y += 0.4) {
        const p = axialToWorld(window.wetOrigin.q + q, window.wetOrigin.r + 4),
          v = g.camera.position.clone().set(p.x, y, p.z).project(g.camera),
          x = Math.round((v.x * 0.5 + 0.5) * t.width),
          z = Math.round((v.y * 0.5 + 0.5) * t.height);
        if (x < 2 || z < 2 || x >= t.width - 2 || z >= t.height - 2) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const i = ((z + dy) * t.width + x + dx) * 4;
            out.push(data[i], data[i + 1], data[i + 2]);
          }
      }
    return out;
  });
  return raw.map(DataUtils.fromHalfFloat);
}
const difference = (a, b) =>
  a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

test('real colored buildings appear in wet ground reflections while the same dry ground stays unchanged', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await scene(page);
  await weather(page, 1);
  await wall(page, 'crimsonwood');
  const wetRed = await reflectionPixels(page);
  await page.screenshot({ path: info.outputPath('wet-red-building.png') });
  await wall(page, 'diamondBlock');
  const wetBlue = await reflectionPixels(page);
  await page.screenshot({ path: info.outputPath('wet-blue-building.png') });
  await weather(page, 0);
  const dryBlue = await reflectionPixels(page);
  await wall(page, 'crimsonwood');
  const dryRed = await reflectionPixels(page);
  const result = {
    wetColorDifference: difference(wetRed, wetBlue),
    dryColorDifference: difference(dryRed, dryBlue),
    sampleCount: wetRed.length / 3,
    errors,
  };
  await writeFile(
    info.outputPath('actual-reflection.json'),
    JSON.stringify(result, null, 2),
  );
  expect(result.sampleCount).toBeGreaterThan(500);
  expect(result.wetColorDifference).toBeGreaterThan(
    result.dryColorDifference + 0.002,
  );
  expect(result.dryColorDifference).toBeLessThan(0.002);
  expect(errors).toEqual([]);
});

async function maskSamples(page, vertical = false) {
  await fresh(page);
  return page.evaluate(async (vertical) => {
    const g = window.__hexwild.graphics,
      t = g.composer.effects.protection.target,
      { axialToWorld } = await import('/src/core.js'),
      data = new Uint8Array(t.width * t.height * 4),
      values = [],
      points = [];
    g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
    const site = window.wetOrigin;
    for (let q = -2; q <= 2; q++)
      for (let r = -4; r <= 0; r++) {
        const p = axialToWorld(site.q + q, site.r + (vertical ? 4 : r)),
          v = g.camera.position
            .clone()
            .set(p.x, vertical ? 34 : 32, p.z)
            .project(g.camera),
          x = Math.round((v.x * 0.5 + 0.5) * t.width),
          y = Math.round((v.y * 0.5 + 0.5) * t.height);
        if (x < 1 || y < 1 || x >= t.width - 1 || y >= t.height - 1) continue;
        const i = (y * t.width + x) * 4,
          value = data[i + 2] / 255;
        values.push(value);
        points.push({
          q,
          r,
          value,
          reactive: data[i + 1] / 255,
          biome: window.__hexwild.state.world.biome(site.q + q, site.r + r),
        });
      }
    return {
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      count: values.length,
      points,
    };
  }, vertical);
}
async function floorMaterial(page, type) {
  await page.evaluate((type) => {
    const g = window.__hexwild,
      s = window.wetOrigin,
      cells = [];
    for (let q = -9; q <= 9; q++)
      for (let r = -8; r <= 8; r++) {
        g.state.world.set(s.q + q, 31, s.r + r, type);
        cells.push([s.q + q, 31, s.r + r]);
      }
    g.graphics.updateCells(cells);
  }, type);
  await fresh(page);
}

test('actual exposed top surfaces respect porosity, a built roof, vertical walls and dry weather', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await scene(page);
  await weather(page, 1);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({
      ...window.__hexwild.graphics.postOptions,
      occlusion: 0.6,
    }),
  );
  const stone = await maskSamples(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      s = window.wetOrigin;
    g.teleport(s.q + 4, 32, s.r - 6);
    g.lookAt(s.q, 32.5, s.r);
  });
  const shifted = await maskSamples(page),
    matches = stone.points
      .map((p) => [p, shifted.points.find((v) => v.q === p.q && v.r === p.r)])
      .filter(([, v]) => v);
  expect(matches.length).toBeGreaterThan(12);
  const anchorDelta =
    matches.reduce((sum, [a, b]) => sum + Math.abs(a.value - b.value), 0) /
    matches.length;
  expect(anchorDelta).toBeLessThan(0.025);
  await page.evaluate(() => {
    const g = window.__hexwild,
      s = window.wetOrigin;
    g.teleport(s.q + 3, 32, s.r - 6);
    g.lookAt(s.q, 32.5, s.r);
  });
  const seam = await seamSamples(page);
  expect(seam.length).toBeGreaterThan(2);
  expect(seam.reduce((sum, v) => sum + v, 0) / seam.length).toBeLessThan(0.06);
  await floorMaterial(page, 'dirt');
  const soil = await maskSamples(page);
  await wall(page, 'crimsonwood');
  const soilRed = await reflectionPixels(page);
  await wall(page, 'diamondBlock');
  const soilBlue = await reflectionPixels(page);
  await floorMaterial(page, 'planks');
  const wood = await maskSamples(page),
    woodBlue = await reflectionPixels(page);
  await wall(page, 'crimsonwood');
  const woodRed = await reflectionPixels(page);
  const soilReflectionDifference = difference(soilRed, soilBlue),
    woodReflectionDifference = difference(woodRed, woodBlue);
  expect(woodReflectionDifference).toBeGreaterThan(0.001);
  expect(soilReflectionDifference).toBeLessThan(
    woodReflectionDifference * 0.45,
  );
  expect(stone.mean).toBeGreaterThan(0.08);
  expect(soil.mean).toBeLessThan(stone.mean * 0.15);
  expect(wood.mean).toBeLessThan(stone.mean * 0.65);
  expect(wood.mean).toBeGreaterThan(soil.mean * 2);
  await floorMaterial(page, 'stone');
  await wall(page, 'crimsonwood');
  const wallMask = await maskSamples(page, true);
  expect(wallMask.max).toBe(0);
  await page.evaluate(() => {
    const g = window.__hexwild,
      s = window.wetOrigin,
      cells = [];
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 1; r++) {
        g.state.world.set(s.q + q, 36, s.r + r, 'planks');
        cells.push([s.q + q, 36, s.r + r]);
      }
    g.graphics.updateCells(cells);
  });
  const sheltered = await maskSamples(page);
  expect(sheltered.max).toBe(0);
  const roofRed = await reflectionPixels(page);
  await wall(page, 'diamondBlock');
  const roofBlue = await reflectionPixels(page);
  const roofReflectionDifference = difference(roofRed, roofBlue);
  expect(roofReflectionDifference).toBeLessThan(0.002);
  await page.evaluate(() => {
    const g = window.__hexwild,
      s = window.wetOrigin,
      cells = [];
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 1; r++) {
        g.state.world.set(s.q + q, 36, s.r + r, null);
        cells.push([s.q + q, 36, s.r + r]);
      }
    g.graphics.updateCells(cells);
  });
  const reopened = await maskSamples(page);
  expect(reopened.mean).toBeCloseTo(stone.mean, 2);
  await weather(page, 0);
  const dry = await maskSamples(page);
  expect(dry.max).toBe(0);
  await writeFile(
    info.outputPath('exposure-materials.json'),
    JSON.stringify(
      {
        stone,
        soil,
        wood,
        wallMask,
        sheltered,
        reopened,
        dry,
        anchorDelta,
        seam,
        soilReflectionDifference,
        woodReflectionDifference,
        roofReflectionDifference,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

for (const biome of ['沙漠', '雪原'])
  test(`actual ${biome} surfaces never receive rain puddles`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await scene(page, 'stone', biome);
    await weather(page, 1, 1);
    const mask = await maskSamples(page);
    const climatePoints = mask.points.filter((p) => p.biome === biome);
    expect(climatePoints.length).toBeGreaterThan(10);
    expect(Math.max(...climatePoints.map((p) => p.value))).toBe(0);
    const actual = await page.evaluate(() => {
      const g = window.__hexwild,
        s = window.wetOrigin;
      return g.state.world.biome(s.q, s.r);
    });
    expect(actual).toBe(biome);
    await writeFile(
      info.outputPath('climate.json'),
      JSON.stringify(
        {
          biome: actual,
          climatePoints,
          adjacent: mask.points.filter((p) => p.biome !== biome),
          errors,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  });

async function frames(page, count = 24) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () => {
          if (--count <= 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}

test('rain ripples freeze with simulation time and shared masks survive resize, quality changes and submersion', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await scene(page);
  await wall(page, 'crimsonwood');
  await weather(page, 1, 1);
  await frames(page);
  const rainy = await reflectionPixels(page);
  await frames(page, 5);
  const paused = await reflectionPixels(page);
  await page.evaluate(() => window.__hexwild.step(0.6));
  const moved = await reflectionPixels(page);
  await weather(page, 1, 0);
  await frames(page);
  const calm = await reflectionPixels(page);
  await page.evaluate(() => window.__hexwild.step(0.6));
  const calmLater = await reflectionPixels(page);
  const rainDelta = difference(rainy, moved),
    calmDelta = difference(calm, calmLater),
    pauseDelta = difference(rainy, paused);
  expect(rainDelta).toBeGreaterThan(calmDelta * 1.5 + 0.0001);
  expect(pauseDelta).toBeLessThan(rainDelta * 0.25);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    window.wetMaterialDisposed = false;
    g.composer.effects.wet.material.addEventListener('dispose', () => {
      window.wetMaterialDisposed = true;
    });
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1');
  await page.locator('#resume').click();
  expect(await page.evaluate(() => window.__hexwild.graphics.composer)).toBe(
    null,
  );
  expect(await page.evaluate(() => window.wetMaterialDisposed)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await page.setViewportSize({ width: 720, height: 540 });
  await fresh(page);
  const size = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return {
      mask: [
        g.composer.effects.protection.target.width,
        g.composer.effects.protection.target.height,
      ],
      frame: [
        g.composer.passes[0].target.width,
        g.composer.passes[0].target.height,
      ],
    };
  });
  expect(size.mask).toEqual(size.frame);
  await page.evaluate(() => {
    const g = window.__hexwild,
      s = window.wetOrigin,
      w = g.state.world;
    g.teleport(s.q + 3, 32, s.r - 6);
    w.fluids.source(s.q + 3, 33, s.r - 6, 'water');
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.graphics.fluidRenderer.medium),
    )
    .toBe('water');
  expect(
    await page.evaluate(
      () => window.__hexwild.graphics.composer.effects.wet.enabled,
    ),
  ).toBe(false);
  await writeFile(
    info.outputPath('ripple-lifecycle.json'),
    JSON.stringify(
      {
        rainDelta,
        calmDelta,
        pauseDelta,
        disposed: true,
        size,
        waterDisablesGroundReflection: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

async function seamSamples(page) {
  await fresh(page);
  return page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      t = g.composer.effects.protection.target,
      { axialToWorld } = await import('/src/core.js'),
      s = window.wetOrigin,
      data = new Uint8Array(t.width * t.height * 4),
      out = [];
    g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
    for (let r = -4; r <= 0; r++) {
      const p = axialToWorld(s.q - 0.5, s.r + r),
        pair = [];
      for (const dx of [-0.045, 0.045]) {
        const v = g.camera.position
            .clone()
            .set(p.x + dx, 32, p.z)
            .project(g.camera),
          x = Math.round((v.x * 0.5 + 0.5) * t.width),
          y = Math.round((v.y * 0.5 + 0.5) * t.height);
        if (x < 1 || y < 1 || x >= t.width - 1 || y >= t.height - 1) continue;
        pair.push(data[(y * t.width + x) * 4 + 2] / 255);
      }
      if (pair.length === 2) out.push(Math.abs(pair[0] - pair[1]));
    }
    return out;
  });
}

test('wet reflected colors stay current when temporal antialiasing is enabled', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await scene(page);
  await weather(page, 1);
  await wall(page, 'crimsonwood');
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({
      ...window.__hexwild.graphics.postOptions,
      antialias: true,
    }),
  );
  await frames(page, 16);
  const red = await reflectionPixels(page);
  await wall(page, 'diamondBlock');
  const resolved = await reflectionPixels(page);
  await frames(page, 32);
  const current = await reflectionPixels(page),
    mask = await maskSamples(page),
    reflective = mask.points.filter((p) => p.value > 0.03);
  const temporalError = difference(current, resolved);
  expect(reflective.length).toBeGreaterThan(5);
  expect(reflective.every((p) => p.reactive > 0.99)).toBe(true);
  // Reject old reflected color, independently of normal TAA/SMAA luminance jitter.
  const chroma = (pixels) =>
    pixels.reduce(
      (sum, v, i) => sum + (i % 3 === 0 ? v : i % 3 === 2 ? -v : 0),
      0,
    ) /
    (pixels.length / 3);
  const colorContrast = Math.abs(chroma(red) - chroma(current)),
    oldColorResidual =
      Math.abs(chroma(resolved) - chroma(current)) / colorContrast;
  expect(colorContrast).toBeGreaterThan(0.005);
  expect(oldColorResidual).toBeLessThan(0.2);
  await writeFile(
    info.outputPath('wet-temporal.json'),
    JSON.stringify(
      {
        temporalError,
        colorContrast,
        oldColorResidual,
        reactiveSamples: reflective.length,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
