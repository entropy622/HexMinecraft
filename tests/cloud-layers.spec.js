import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';
import { referenceSave } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test.setTimeout(300000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});
async function frames(page, count = 32) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () =>
          --count <= 0 ? resolve() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      }),
    count,
  );
}
async function setup(page) {
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#exposure-toggle').uncheck();
  await page.locator('#lightning-toggle').uncheck();
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.step(120 - g.state.time);
    g.graphics.setPostOptions({
      occlusion: 0,
      bloom: 0,
      exposure: false,
      antialias: true,
      clouds: true,
    });
    g.teleport(0, 25, 0);
    g.lookAt(100, 32, 0);
    g.graphics.stepOffset = 0;
  });
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
  await frames(page);
}
async function sample(page) {
  const raw = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      pass = g.composer.passes[0],
      clouds = pass.clouds;
    const read = (source) => {
      const history = clouds.histories.get(source)?.history[0];
      if (!history) return null;
      const color = new Uint16Array(history.width * history.height * 4),
        data = new Uint16Array(color.length);
      g.renderer.readRenderTargetPixels(
        history,
        0,
        0,
        history.width,
        history.height,
        color,
      );
      g.renderer.readRenderTargetPixels(
        history,
        0,
        0,
        history.width,
        history.height,
        data,
        undefined,
        1,
      );
      // Sample a regular grid, retaining actual integration values rather than a screenshot hash.
      const values = [];
      for (let y = 2; y < history.height - 2; y += 4)
        for (let x = 2; x < history.width - 2; x += 4) {
          const i = (y * history.width + x) * 4;
          values.push([...color.slice(i, i + 4), ...data.slice(i, i + 4)]);
        }
      return values;
    };
    const gl = g.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      main: read(pass.target),
      water: read(pass.opaque),
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      error: gl.getError(),
      camera: g.camera.position.toArray(),
      time: window.__hexwild.state.time,
      wind: g.cloudSystem.uniforms.cloudLayerWind.value.map((v) => v.toArray()),
    };
  });
  const summarize = (values) => {
    if (!values) return null;
    const pixels = values.map((p) => p.map(DataUtils.fromHalfFloat));
    const cloud = pixels.filter((p) => p[3] < 0.995 && p[4] > 0);
    return {
      samples: pixels.length,
      finite: pixels.flat().every(Number.isFinite),
      transmission: [
        Math.min(...pixels.map((p) => p[3])),
        Math.max(...pixels.map((p) => p[3])),
      ],
      cloudPixels: cloud.length,
      farCloudPixels: cloud.filter((p) => p[4] > 220).length,
      skyCloudAge: cloud
        .filter((p) => p[5] < 0 && p[4] > 220)
        .reduce((sum, p, _, a) => sum + p[6] / a.length, 0),
      layers: [0, 1, 2].map(
        (layer) => cloud.filter((p) => Math.round(p[7]) === layer).length,
      ),
      field: cloud.map((p) => [p[3], p[4], p[7]]),
    };
  };
  return { ...raw, main: summarize(raw.main), water: summarize(raw.water) };
}
async function gpuCost(page) {
  return page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      pass = g.composer.passes[0],
      gl = g.renderer.getContext();
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const memory = { ...g.renderer.info.memory };
    if (!extension) return { supported: false, memory };
    const original = gl.drawArrays,
      queries = [];
    // Observe only the external WebGL device boundary. The real production
    // pass, view/capture composition, shader and temporal resolve stay intact.
    gl.drawArrays = function (...args) {
      const target = g.renderer.getRenderTarget();
      let stage = target === pass.clouds.target ? 'integration' : null;
      if (
        !stage &&
        [...pass.clouds.histories.values()].some((s) =>
          s.history.includes(target),
        )
      )
        stage = 'resolve';
      if (!stage || queries.length >= 48) return original.apply(this, args);
      const query = gl.createQuery();
      const view =
        pass.clouds.volume.uniforms.sceneDepth.value ===
        pass.target.depthTexture
          ? 'main'
          : 'water';
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      try {
        return original.apply(this, args);
      } finally {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        queries.push({ query, stage, view });
      }
    };
    const wait = () => new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      for (let i = 0; i < 24; i++) await wait();
    } finally {
      gl.drawArrays = original;
    }
    for (
      let i = 0;
      i < 60 &&
      queries.some(
        ({ query }) => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE),
      );
      i++
    )
      await wait();
    const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
    const values = queries
      .filter(({ query }) =>
        gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE),
      )
      .map(({ query, stage, view }) => ({
        stage,
        view,
        milliseconds: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
      }));
    queries.forEach(({ query }) => gl.deleteQuery(query));
    return { supported: true, disjoint, values, memory };
  });
}
async function fieldProbe(page, points = null) {
  return page.evaluate(async (points) => {
    const { probeCloudField } =
      await import('/tests/fixtures/cloud-field-probe.js');
    return probeCloudField(window.__hexwild.graphics, points);
  }, points);
}

test('sky cloud distance, real foreground depth and three moving cloud layers share a stable production history', async ({
  page,
}, info) => {
  // This now includes two native weather imports; pixel/field gates below stay
  // unchanged. Calm weather is no longer required to contain a high-cloud patch.
  test.setTimeout(420000);
  const errors = [],
    warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await page.addInitScript(installFrameProbe);
  await setup(page);
  await page.evaluate(() => {
    window.__photonFreeze = true;
    window.__layerPostOptions = structuredClone(
      window.__hexwild.graphics.postOptions,
    );
  });
  const observations = [];
  const weatherScenes = [];
  const importWeatherScene = async (wetness, high) => {
    const input = referenceSave({
      eye: [0, high ? 281.65 : 26.65, 0],
      look: [100, high ? 320 : 32, 0],
    });
    input.time = 120;
    input.weather.wetness = wetness;
    await page.evaluate(() => {
      window.__layerOldWorld = window.__hexwild.state.world;
    });
    await page.locator('#save-file').setInputFiles({
      name: 'layer-weather-v16.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(input)),
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__hexwild.state.world !== window.__layerOldWorld,
          ),
        { timeout: 90000 },
      )
      .toBe(true);
    await page.evaluate(() => {
      const a = window.__hexwild;
      a.setPlaying(false);
      a.graphics.setPostOptions({ ...window.__layerPostOptions });
      a.graphics.stepOffset = 0;
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              g.voxelLight.revision === g.world.lightRevision &&
              !g.skyEnvironment.atmosphere.pending
            );
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    await frames(page, 40);
    const climate = await page.evaluate(
      () => window.__hexwild.graphics.cloudSystem.climate,
    );
    if (wetness === 1) expect(climate.humidity).toBe(1);
    else expect(climate.humidity).toBeLessThan(0.9);
    weatherScenes.push({
      time: input.time,
      eye: input.position,
      weather: input.weather,
      climate,
    });
    await writeFile(
      info.outputPath('layer-weather-scenes.json'),
      JSON.stringify(weatherScenes, null, 2),
    );
  };
  let thinAnchor = null;
  const cost = await gpuCost(page);
  for (const [name, feet, target] of [
    ['low-angle', 25, [100, 32, 0]],
    ['cumulus', 43, [30, 63, 0]],
    ['altocumulus', 140, [30, 175, 0]],
    ['cirrus', 280, [15, 323, 0]],
    ['above', 325, [30, 155, 0]],
  ]) {
    if (name === 'cirrus') {
      // Observe a genuine high-cloud patch in wet/windy post-rain weather,
      // from above the two low decks so they cannot hide the thin layer.
      await importWeatherScene(1, true);
      thinAnchor = await page.evaluate(async () => {
        const { probeCloudField } =
          await import('/tests/fixtures/cloud-field-probe.js');
        const { worldToAxial } = await import('/src/core.js');
        const points = probeCloudField(
          window.__hexwild.graphics,
          null,
          2,
        ).points;
        return worldToAxial(points[0][0], points[0][2]);
      });
    }
    await page.evaluate(
      ({ feet, target, anchor }) => {
        const g = window.__hexwild;
        g.teleport(anchor.q, feet, anchor.r);
        g.lookAt(anchor.q + target[0], target[1], anchor.r + target[2]);
        g.graphics.stepOffset = 0;
      },
      {
        feet,
        target,
        anchor: ['cirrus', 'above'].includes(name)
          ? thinAnchor
          : { q: 0, r: 0 },
      },
    );
    await frames(page, 40);
    const result = await sample(page);
    observations.push({ name, ...result });
    await writeFile(
      info.outputPath('cloud-layers.json'),
      JSON.stringify({ observations, cost, errors, warnings }, null, 2),
    );
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
    expect(result.main.finite).toBe(true);
    expect(result.main.transmission[0]).toBeGreaterThanOrEqual(0);
    expect(result.main.transmission[1]).toBeLessThanOrEqual(1);
    expect(result.error).toBe(0);
    expect(result.renderer).not.toMatch(/swiftshader/i);
    if (name === 'cirrus') {
      expect(result.main.layers[2]).toBeGreaterThan(5);
      expect(result.main.layers[0] + result.main.layers[1]).toBe(0);
    }
    if (name === 'above') expect(result.main.layers[2]).toBeGreaterThan(5);
  }
  const low = observations[0].main;
  expect(low.farCloudPixels).toBeGreaterThan(20);
  expect(low.skyCloudAge).toBeGreaterThan(4);
  expect(
    observations.flatMap((o) => o.main.layers).reduce((a, b) => a + b, 0),
  ).toBeGreaterThan(50);
  for (let layer = 0; layer < 3; layer++)
    expect(
      observations.reduce((sum, o) => sum + o.main.layers[layer], 0),
    ).toBeGreaterThan(5);
  // Restore the original calm climate for the far-world field/roof checks.
  await importWeatherScene(0, false);
  for (const q of [-10000, 10000]) {
    await page.evaluate((q) => {
      const g = window.__hexwild;
      g.teleport(q, 25, -q);
      g.lookAt(q + 1000, 32, -q);
      g.graphics.stepOffset = 0;
    }, q);
    await frames(page, 40);
    const distant = await sample(page);
    expect(distant.main.finite).toBe(true);
    expect(distant.error).toBe(0);
    observations.push({ name: `world-${q}`, ...distant });
    await page.screenshot({ path: info.outputPath(`world-${q}.png`) });
    const anchored = await fieldProbe(page);
    const before = distant.camera;
    await page.evaluate((q) => {
      const g = window.__hexwild;
      g.teleport(q + 12, 25, -q);
      g.lookAt(q + 1012, 32, -q);
      g.graphics.stepOffset = 0;
    }, q);
    await frames(page, 16);
    const translated = await sample(page);
    const fixed = await fieldProbe(page, anchored.points);
    const delta = translated.camera.map((v, i) => v - before[i]);
    const moved = await fieldProbe(
      page,
      anchored.points.map((p) => p.map((v, i) => v + delta[i])),
    );
    const error = (a, b) =>
      a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
    const fixedError = error(anchored.density, fixed.density),
      followingError = error(anchored.density, moved.density);
    const productErrors = [];
    const upperInfluence = [];
    for (let i = 0; i < fixed.transmission.length; i += 4) {
      const t = fixed.transmission.slice(i, i + 4);
      productErrors.push(
        Math.abs(fixed.density[i + 3] - (1 - t[3] + t[3] * t[0] * t[1] * t[2])),
      );
      upperInfluence.push(t[3] * t[0] * (1 - t[1] * t[2]));
    }
    const upperGrid = await page.evaluate(async () => {
      const { probeCloudShadowGrid } =
        await import('/tests/fixtures/cloud-shadow-grid-probe.js');
      return probeCloudShadowGrid(window.__hexwild.graphics);
    });
    observations.push({
      name: `world-${q}-field`,
      anchored,
      fixed,
      moved,
      fixedError,
      followingError,
      productErrors,
      upperInfluence,
      upperGrid,
    });
    await writeFile(
      info.outputPath('cloud-layers.json'),
      JSON.stringify({ observations, cost, errors, warnings }, null, 2),
    );
    expect(followingError).toBeGreaterThan(0.008);
    expect(fixedError).toBeLessThan(followingError * 0.6 + 0.002);
    expect(Math.max(...productErrors)).toBeLessThan(0.002);
    expect(upperGrid.finite).toBe(true);
    expect(upperGrid.gl).toBe(0);
    expect(Math.max(...upperInfluence, upperGrid.maximum)).toBeGreaterThan(
      0.005,
    );
    expect(translated.main.finite).toBe(true);
    expect(translated.wind).toEqual(distant.wind);
    observations.push({ name: `world-${q}-translated`, ...translated });
    await page.screenshot({
      path: info.outputPath(`world-${q}-translated.png`),
    });
  }
  // A real solid roof is nearer than every sky layer; clouds must not cover it.
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    g.teleport(0, 25, 0);
    g.lookAt(0, 40, 0);
    g.graphics.stepOffset = 0;
    for (let q = -8; q <= 8; q++)
      for (let r = -8; r <= 8; r++) {
        g.state.world.set(q, 35, r, 'calcite');
        cells.push([q, 35, r]);
      }
    g.graphics.updateCells(cells);
  });
  await frames(page, 3);
  const foreground = await sample(page);
  expect(foreground.main.cloudPixels).toBe(0);
  await page.screenshot({ path: info.outputPath('foreground-depth.png') });
  await writeFile(
    info.outputPath('cloud-layers.json'),
    JSON.stringify(
      { observations, foreground, cost, errors, warnings },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('existing weather controls reshape clouds continuously and keep independent wind deterministic across quality and resize', async ({
  page,
}, info) => {
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await setup(page);
  const stages = [];
  for (const kind of ['clear', 'rain', 'storm', 'clear']) {
    await page.keyboard.press('Escape');
    await page.locator(`[data-weather="${kind}"]`).click();
    await page.locator('#resume').click();
    // Let the real gameplay weather update run. The development time fixture
    // intentionally advances only the day clock and cannot stand in for rain.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              window.__hexwild.graphics.cloudSystem.uniforms.cloudLayers
                .value[0].y,
          ),
        { timeout: 90000, intervals: [250] },
      )
      [kind === 'clear' ? 'toBeLessThan' : 'toBeGreaterThan'](
        kind === 'clear' ? 60.1 : kind === 'rain' ? 71.9 : 79.9,
      );
    await page.evaluate(() => {
      const g = window.__hexwild;
      g.setPlaying(false);
      g.step(120 - g.state.time);
      g.teleport(0, 25, 0);
      g.lookAt(100, 32, 0);
      g.graphics.stepOffset = 0;
    });
    await frames(page, 40);
    stages.push({ kind, ...(await sample(page)) });
    await writeFile(
      info.outputPath('cloud-weather.json'),
      JSON.stringify({ stages, errors, warnings }, null, 2),
    );
    await page.screenshot({
      path: info.outputPath(`weather-${stages.length}-${kind}.png`),
    });
  }
  await page.evaluate(() => window.__hexwild.step(1));
  await frames(page, 32);
  const windFrame = await sample(page);
  const deltas = windFrame.wind.map((v, i) =>
    v.map((n, c) => n - stages.at(-1).wind[i][c]),
  );
  expect(
    Math.abs(deltas[0][0] * deltas[1][1] - deltas[0][1] * deltas[1][0]),
  ).toBeGreaterThan(0.001);
  expect(stages[2].main.cloudPixels).toBeGreaterThan(
    stages[0].main.cloudPixels,
  );
  for (const quality of ['1', '0.65', '1.7']) {
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption(quality);
    await page.locator('#resume').click();
  }
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.step(121 - g.state.time);
    g.teleport(0, 25, 0);
    g.lookAt(100, 32, 0);
    g.graphics.stepOffset = 0;
  });
  await page.setViewportSize({ width: 1100, height: 720 });
  await frames(page, 40);
  const resized = await sample(page);
  expect(resized.main.finite).toBe(true);
  expect(resized.main.cloudPixels).toBeGreaterThan(20);
  expect(resized.error).toBe(0);
  await writeFile(
    info.outputPath('cloud-weather.json'),
    JSON.stringify(
      { stages, windFrame, deltas, resized, errors, warnings },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
