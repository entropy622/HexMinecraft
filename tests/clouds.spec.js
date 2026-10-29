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
async function scene(page) {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  const site = await page.evaluate(async () => {
    const g = window.__hexwild,
      { cloudDensity, cloudWeather, CLOUD_RADIUS } =
        await import('/src/cloud-field.js'),
      { axialToWorld, worldToAxial } = await import('/src/core.js');
    g.setPlaying(false);
    g.step(120 - g.state.time);
    g.graphics.setPostOptions({
      occlusion: 0,
      antialias: false,
      bloom: 0,
      exposure: false,
      clouds: true,
    });
    let best = null;
    for (let q = -10; q <= 10; q++)
      for (let r = -10; r <= 10; r++) {
        const density = cloudDensity(q, r, g.state.world.seed),
          score = Math.abs(density - 0.65) + Math.hypot(q, r) * 0.0002;
        if (!best || score < best.score) best = { q, r, density, score };
      }
    const wind = cloudWeather(g.state.world.seed, 120, 0, 0, 0, 0).winds[0],
      p = axialToWorld(best.q, best.r),
      a = worldToAxial(
        p.x * CLOUD_RADIUS + wind[0],
        p.z * CLOUD_RADIUS + wind[1],
      );
    g.teleport(a.q, 42, a.r);
    g.lookAt(a.q, 63, a.r);
    g.graphics.stepOffset = 0;
    return { ...a, density: best.density, macro: [best.q, best.r] };
  });
  await fresh(page);
  return site;
}
async function clouds(page, enabled, site) {
  await page.keyboard.press('Escape');
  await page.locator('#clouds-toggle').setChecked(enabled);
  await page.locator('#resume').click();
  await page.evaluate(
    ({ s, enabled }) => {
      const g = window.__hexwild;
      g.graphics.setPostOptions({
        occlusion: 0,
        antialias: false,
        bloom: 0,
        exposure: false,
        clouds: enabled,
      });
      g.setPlaying(false);
      g.step(120 - g.state.time);
      g.teleport(s.q, 42, s.r);
      g.lookAt(s.q, 63, s.r);
      g.graphics.stepOffset = 0;
    },
    { s: site, enabled },
  );
  await fresh(page);
}
async function roof(page, site, type) {
  await page.evaluate(
    ({ s, type }) => {
      const g = window.__hexwild,
        cells = [];
      for (let q = s.q - 13; q <= s.q + 13; q++)
        for (let r = s.r - 13; r <= s.r + 13; r++) {
          g.state.world.set(q, 63, r, type);
          cells.push([q, 63, r]);
        }
      g.graphics.updateCells(cells);
    },
    { s: site, type },
  );
  await fresh(page);
}
async function pixels(page) {
  await fresh(page);
  const raw = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      t = g.composer.passes[0].target,
      data = new Uint16Array(t.width * t.height * 4),
      out = [];
    g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
    for (let y = Math.floor(t.height * 0.15); y < t.height * 0.85; y += 6)
      for (let x = Math.floor(t.width * 0.15); x < t.width * 0.85; x += 6) {
        const i = (y * t.width + x) * 4;
        out.push(data[i], data[i + 1], data[i + 2]);
      }
    return out;
  });
  return raw.map(DataUtils.fromHalfFloat);
}

test('finite cloud thickness partially transmits a real colored structure instead of only hiding it with opaque faces', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const site = await scene(page);
  await clouds(page, false, site);
  await roof(page, site, 'crimsonwood');
  const clearRed = await pixels(page);
  await roof(page, site, 'snow');
  const clearWhite = await pixels(page);
  await clouds(page, true, site);
  await roof(page, site, 'crimsonwood');
  const cloudRed = await pixels(page);
  await roof(page, site, 'snow');
  const cloudWhite = await pixels(page);
  const ratios = [];
  let finite = true;
  for (let i = 0; i < clearRed.length; i += 3) {
    const input = Math.hypot(
        ...clearRed.slice(i, i + 3).map((v, c) => v - clearWhite[i + c]),
      ),
      output = Math.hypot(
        ...cloudRed.slice(i, i + 3).map((v, c) => v - cloudWhite[i + c]),
      );
    finite &&= Number.isFinite(input) && Number.isFinite(output);
    if (input > 0.003) ratios.push(output / input);
  }
  const partial =
      ratios.filter((t) => t > 0.06 && t < 0.94).length / ratios.length,
    covered = ratios.filter((t) => t < 0.94).length / ratios.length,
    median = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
  await page.screenshot({ path: info.outputPath('cloud-transmission.png') });
  await writeFile(
    info.outputPath('transmission.json'),
    JSON.stringify(
      {
        site,
        samples: ratios.length,
        partial,
        covered,
        median,
        finite,
        errors,
      },
      null,
      2,
    ),
  );
  expect(ratios.length).toBeGreaterThan(1000);
  expect(finite).toBe(true);
  expect(covered).toBeGreaterThan(0.1);
  expect(partial).toBeGreaterThan(0.04);
  expect(errors).toEqual([]);
});

// Observe the real HDR composition and its existing temporal history. Alpha in
// the scene buffer is cloud transmission; negative history alpha rejects motion.
async function sample(page, { point = null, opaque = false } = {}) {
  await fresh(page);
  const raw = await page.evaluate(
    ({ point, opaque }) => {
      const g = window.__hexwild.graphics,
        f = g.composer.passes[0],
        target = opaque ? f.opaque : f.target,
        p = point
          ? g.camera.position.clone().fromArray(point).project(g.camera)
          : null,
        x = p
          ? Math.round((p.x * 0.5 + 0.5) * target.width)
          : Math.floor(target.width / 2),
        y = p
          ? Math.round((p.y * 0.5 + 0.5) * target.height)
          : Math.floor(target.height / 2),
        data = new Uint16Array(11 * 11 * 4),
        history = new Uint16Array(data.length);
      if (x < 5 || y < 5 || x >= target.width - 5 || y >= target.height - 5)
        throw Error('Sample outside viewport');
      g.renderer.readRenderTargetPixels(target, x - 5, y - 5, 11, 11, data);
      if (g.composer.effects.temporal.enabled)
        g.renderer.readRenderTargetPixels(
          g.composer.effects.temporal.history[0],
          x - 5,
          y - 5,
          11,
          11,
          history,
        );
      return {
        data: Array.from(data),
        history: Array.from(history),
        error: g.renderer.getContext().getError(),
      };
    },
    { point, opaque },
  );
  const rgb = [0, 0, 0],
    values = raw.data.map(DataUtils.fromHalfFloat);
  let transmission = 0,
    freshRatio = 0;
  for (let i = 0; i < values.length; i += 4) {
    for (let c = 0; c < 3; c++) rgb[c] += values[i + c] / 121;
    transmission += values[i + 3] / 121;
    if (raw.history[i + 3] & 0x8000) freshRatio += 1 / 121;
  }
  return {
    rgb,
    transmission,
    freshRatio,
    finite: values.every(Number.isFinite),
    error: raw.error,
  };
}
async function view(page, site, feet, aim, time = 120) {
  await page.evaluate(
    ({ site, feet, aim, time }) => {
      const g = window.__hexwild;
      g.setPlaying(false);
      g.step(time - g.state.time);
      g.teleport(site.q, feet, site.r);
      g.lookAt(aim.q, aim.y, aim.r);
      g.graphics.stepOffset = 0;
    },
    { site, feet, aim, time },
  );
  await fresh(page);
}
const brightness = (p) => p.rgb.reduce((a, b) => a + b, 0);
function errorsIn(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  return errors;
}

test('clouds cast world-anchored shadows, stop at foreground depth and reject cloud history from below, inside and above', async ({
  page,
}, info) => {
  const errors = errorsIn(page),
    site = await scene(page);
  const floor = await page.evaluate(async (s) => {
    const g = window.__hexwild,
      { axialToWorld, worldToAxial } = await import('/src/core.js'),
      d = g.graphics.cloudSystem.uniforms.cloudLightDirection.value,
      p = axialToWorld(s.q, s.r),
      reach = (53.5 - 40) / d.y,
      a = worldToAxial(p.x - d.x * reach, p.z - d.z * reach),
      cells = [];
    for (let q = a.q - 8; q <= a.q + 8; q++)
      for (let r = a.r - 8; r <= a.r + 8; r++) {
        g.state.world.set(q, 39, r, 'calcite');
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    return a;
  }, site);
  await clouds(page, false, site);
  await view(page, floor, 45, { ...floor, y: 40 });
  const unshadowed = await sample(page);
  await clouds(page, true, site);
  await view(page, floor, 45, { ...floor, y: 40 });
  const shaded = await sample(page);
  await view(page, { ...floor, q: floor.q + 3 }, 45, { ...floor, y: 40 });
  const shiftedShaded = await sample(page);
  await clouds(page, false, site);
  await view(page, { ...floor, q: floor.q + 3 }, 45, { ...floor, y: 40 });
  const shiftedClear = await sample(page);
  const shadow = brightness(shaded) / brightness(unshadowed),
    shiftedShadow = brightness(shiftedShaded) / brightness(shiftedClear);
  await clouds(page, true, site);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ antialias: true }),
  );
  await view(page, floor, 45, { ...floor, y: 40 });
  const stableForeground = await sample(page);
  await view(page, site, 42, { ...site, y: 65 });
  const below = await sample(page);
  await view(page, site, 51, { ...site, q: site.q + 15, y: 53 });
  const inside = await sample(page);
  const cloudTop = await page.evaluate(() => {
    const band =
      window.__hexwild.graphics.cloudSystem.uniforms.cloudLayers.value[0];
    return band.x + band.y;
  });
  await view(page, site, cloudTop + 10, { ...site, y: 40 });
  const above = await sample(page);
  await writeFile(
    info.outputPath('cloud-depth-shadow.json'),
    JSON.stringify(
      {
        site,
        floor,
        unshadowed,
        shaded,
        shiftedShaded,
        shiftedClear,
        shadow,
        shiftedShadow,
        stableForeground,
        below,
        inside,
        above,
        errors,
      },
      null,
      2,
    ),
  );
  expect(shadow).toBeLessThan(0.98);
  expect(Math.abs(shadow - shiftedShadow)).toBeLessThan(0.08);
  expect(shaded.transmission).toBeCloseTo(1, 3);
  expect(stableForeground.freshRatio).toBe(0);
  for (const p of [below, inside, above]) {
    expect(p.transmission).toBeLessThan(0.94);
    expect(p.freshRatio).toBeGreaterThan(0.9);
    expect(p.finite).toBe(true);
    expect(p.error).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('cloud thickness and illumination follow imported weather, world seed and night lighting', async ({
  page,
}, info) => {
  const errors = errorsIn(page),
    site = await scene(page),
    day = await sample(page);
  // Follow the same moving cloud column to isolate lighting from advection.
  const nightSite = await page.evaluate(async (s) => {
    const { axialToWorld, worldToAxial } = await import('/src/core.js'),
      { cloudWeather } = await import('/src/cloud-field.js'),
      p = axialToWorld(...s.macro),
      wind = cloudWeather(window.__hexwild.state.world.seed, 450, 0, 0, 0, 0)
        .winds[0];
    return worldToAxial(p.x * 4 + wind[0], p.z * 4 + wind[1]);
  }, site);
  await view(page, nightSite, 42, { ...nightSite, y: 65 }, 450);
  const night = await sample(page);
  const saved = await page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
  saved.weather = {
    kind: 'storm',
    remaining: 180,
    sequence: 0,
    rain: 1,
    storm: 1,
    wetness: 1,
  };
  saved.time = 120.5;
  await page.locator('#save-file').setInputFiles({
    name: 'storm.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time), {
      timeout: 60000,
    })
    .toBeLessThan(130);
  await view(page, site, 42, { ...site, y: 65 });
  const storm = await sample(page);
  await page.keyboard.press('F1');
  await view(page, site, 48, { q: site.q + 24, y: 58, r: site.r + 5 });
  await page.screenshot({ path: info.outputPath('storm-clouds.png') });
  // A new world changes the seeded table through the real new-world UI.
  await page.keyboard.press('Escape');
  await page.locator('#seed').fill('625');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#new-world').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.seed))
    .toBe(625);
  await view(page, site, 42, { ...site, y: 65 });
  const otherSeed = await sample(page);
  await page.keyboard.press('F1');
  await view(page, site, 35, { q: site.q + 24, y: 54, r: site.r + 5 });
  await page.screenshot({ path: info.outputPath('day-clouds.png') });
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({
      antialias: true,
      occlusion: 0.6,
      exposure: true,
      bloom: 0.24,
    }),
  );
  await view(page, site, 30, { q: site.q + 30, y: 40, r: site.r + 5 });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 12;
        const frame = () =>
          --n > 0 ? requestAnimationFrame(frame) : resolve();
        requestAnimationFrame(frame);
      }),
  );
  await page.screenshot({ path: info.outputPath('cloud-landscape.png') });
  const nightRatio = brightness(night) / brightness(day);
  await writeFile(
    info.outputPath('cloud-environment.json'),
    JSON.stringify(
      { day, night, nightRatio, storm, otherSeed, errors },
      null,
      2,
    ),
  );
  expect(nightRatio).toBeLessThan(0.4);
  expect(storm.transmission).toBeLessThan(day.transmission * 0.5);
  expect(Math.abs(otherSeed.transmission - day.transmission)).toBeGreaterThan(
    0.05,
  );
  for (const p of [day, night, storm, otherSeed]) {
    expect(p.finite).toBe(true);
    expect(p.error).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('water captures the same clouds and cloud targets resize and dispose with the quality preset', async ({
  page,
}, info) => {
  const errors = errorsIn(page),
    site = await scene(page);
  await page.evaluate((s) => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = s.q - 8; q <= s.q + 8; q++)
      for (let r = s.r - 8; r <= s.r + 8; r++) {
        w.set(q, 37, r, 'stone');
        for (let y = 38; y <= 44; y++) w.set(q, y, r, null);
        for (let y = 38; y <= 40; y++) w.fluids.source(q, y, r, 'water');
        cells.push([q, 40, r]);
      }
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
  }, site);
  await view(page, site, 43, { q: site.q + 8, y: 49, r: site.r });
  expect(
    await page.evaluate(
      () =>
        window.__hexwild.graphics.fluidRenderer.waterUniforms.waterSceneReady
          .value,
    ),
  ).toBe(1);
  const capture = await sample(page, { opaque: true });
  expect(capture.transmission).toBeLessThan(0.99);
  const waterPoint = await page.evaluate(async (s) => {
    const { axialToWorld } = await import('/src/core.js'),
      p = axialToWorld(s.q + 8, s.r);
    return [p.x, 40.88, p.z];
  }, site);
  const reflected = await sample(page, { point: waterPoint });
  await clouds(page, false, site);
  await view(page, site, 43, { q: site.q + 8, y: 49, r: site.r });
  const clearCapture = await sample(page, { opaque: true });
  const clearWater = await sample(page, { point: waterPoint });
  const difference = Math.hypot(
    ...capture.rgb.map((v, c) => v - clearCapture.rgb[c]),
  );
  await clouds(page, true, site);
  await view(page, site, 43, { q: site.q + 8, y: 49, r: site.r });
  await view(page, site, 38.6, { q: site.q + 8, y: 49, r: site.r });
  expect(
    await page.evaluate(() => window.__hexwild.graphics.fluidRenderer.medium),
  ).toBe('water');
  const underwaterCapture = await sample(page, { opaque: true });
  expect(underwaterCapture.transmission).toBeLessThan(0.99);
  // Inject only at the external Three.js renderer boundary. The game keeps
  // its actual cloud/capture composition and must recover on the next frame.
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ antialias: true }),
  );
  await fresh(page);
  const failure = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__hexwild.graphics,
          r = g.renderer,
          before = g.camera.projectionMatrix.toArray(),
          beforeInverse = g.camera.projectionMatrixInverse.toArray(),
          original = r.setRenderTarget,
          autoClear = r.autoClear;
        r.setRenderTarget = function (target, ...args) {
          if (target === g.composer.passes[0].clouds.target) {
            r.setRenderTarget = original;
            throw Error('cloud GPU boundary failure');
          }
          return original.call(this, target, ...args);
        };
        requestAnimationFrame(() =>
          resolve({
            before,
            beforeInverse,
            projection: g.camera.projectionMatrix.toArray(),
            inverse: g.camera.projectionMatrixInverse.toArray(),
            autoClearBefore: autoClear,
            autoClear: r.autoClear,
            targetRestored: r.getRenderTarget() === g.composer.passes[0].opaque,
            allWaterVisible: [...g.fluidRenderer.meshes.values()].every(
              (group) => group.children.every((o) => o.visible),
            ),
            valid: g.composer.effects.temporal.valid,
            cloudHistoryReset: [
              ...g.composer.passes[0].clouds.histories.values(),
            ].every((s) => s.frames === 0),
          }),
        );
      }),
  );
  expect(failure.projection).toEqual(failure.before);
  expect(failure.inverse).toEqual(failure.beforeInverse);
  expect(failure.autoClear).toBe(failure.autoClearBefore);
  expect(failure.targetRestored).toBe(true);
  expect(failure.allWaterVisible).toBe(true);
  expect(failure.valid).toBe(false);
  expect(failure.cloudHistoryReset).toBe(true);
  await fresh(page);
  const recovered = await sample(page, { opaque: true });
  expect(recovered.transmission).toBeLessThan(0.99);
  await page.setViewportSize({ width: 801, height: 603 });
  await fresh(page);
  const size = await page.evaluate(() => {
    const f = window.__hexwild.graphics.composer.passes[0];
    f.clouds.target.addEventListener('dispose', () => {
      window.cloudDisposed = true;
    });
    const states = [...f.clouds.histories.values()],
      targets = states.flatMap((s) => s.history);
    window.cloudHistoryDisposed = 0;
    for (const t of targets)
      t.addEventListener('dispose', () => window.cloudHistoryDisposed++);
    return {
      scene: [f.target.width, f.target.height],
      cloud: [f.clouds.target.width, f.clouds.target.height],
      history: targets.map((t) => [t.width, t.height]),
      independent: new Set(targets.flatMap((t) => t.textures)).size,
      scaleRatio:
        f.clouds.histories.get(f.opaque).scale.x /
        f.clouds.histories.get(f.target).scale.x,
    };
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1');
  await page.locator('#resume').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const medium = await page.evaluate(() => ({
    disposed: window.cloudDisposed,
    historyDisposed: window.cloudHistoryDisposed,
    composer: !!window.__hexwild.graphics.composer,
    geometry: window.__hexwild.graphics.clouds.visible,
  }));
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await view(page, site, 43, { q: site.q + 8, y: 49, r: site.r });
  const rebuilt = await sample(page, { opaque: true });
  await page.keyboard.press('Escape');
  await page.locator('[data-dimension="nether"]').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await fresh(page);
  const nether = await page.evaluate(() => ({
    volume:
      window.__hexwild.graphics.cloudSystem.uniforms.cloudVolumetric.value,
    geometry: window.__hexwild.graphics.clouds.visible,
  }));
  await writeFile(
    info.outputPath('cloud-water-lifecycle.json'),
    JSON.stringify(
      {
        capture,
        clearCapture,
        reflected,
        clearWater,
        underwaterCapture,
        failure,
        recovered,
        difference,
        size,
        medium,
        rebuilt,
        nether,
        errors,
      },
      null,
      2,
    ),
  );
  expect(reflected.transmission).toBeCloseTo(1, 3);
  expect(
    Math.hypot(...reflected.rgb.map((v, c) => v - clearWater.rgb[c])),
  ).toBeGreaterThan(0.005);
  expect(clearCapture.transmission).toBeCloseTo(1, 3);
  expect(difference).toBeGreaterThan(0.01);
  expect(size.cloud).toEqual(size.scene.map((n) => Math.ceil(n / 2)));
  expect(size.history).toHaveLength(4);
  expect(
    size.history.every((s) => s[0] === size.cloud[0] && s[1] === size.cloud[1]),
  ).toBe(true);
  expect(size.independent).toBe(8);
  expect(size.scaleRatio).toBeCloseTo(0.4, 2);
  expect(medium).toEqual({
    disposed: true,
    historyDisposed: 4,
    composer: false,
    geometry: true,
  });
  expect(rebuilt.finite).toBe(true);
  expect(rebuilt.error).toBe(0);
  expect(nether).toEqual({ volume: 0, geometry: false });
  expect(errors).toEqual(['cloud GPU boundary failure']);
});
