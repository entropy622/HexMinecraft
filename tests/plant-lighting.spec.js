import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { assertFoliageRange } from './fixtures/far-sss-assert.js';

test.setTimeout(240000);
const issues = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = { errors: [], warnings: [] };
  issues.set(page, messages);
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.setViewportSize({ width: 720, height: 540 });
});
test.afterEach(async ({ page }, info) => {
  await writeFile(
    info.outputPath('messages.json'),
    JSON.stringify(issues.get(page), null, 2),
  );
  expect(issues.get(page)).toEqual({ errors: [], warnings: [] });
});
async function frames(page, count = 4) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () => (--count ? requestAnimationFrame(next) : resolve());
        requestAnimationFrame(next);
      }),
    count,
  );
}
async function fresh(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            !g.relightQueue.size
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await frames(page);
}
async function setup(page) {
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  const plants = await page.evaluate(async () => {
    const { axialToWorld, hash } = await import('/src/core.js'),
      g = window.__hexwild,
      w = g.state.world,
      cells = [];
    g.setPlaying(false);
    g.step(120 - g.state.time);
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: false,
    });
    for (let q = -8; q <= 8; q++)
      for (let r = -8; r <= 8; r++) {
        w.set(q, 44, r, 'calcite');
        for (let y = 45; y <= 63; y++) w.set(q, y, r, null);
        cells.push([q, 44, r]);
      }
    const plants = ['poppy', 'dandelion', 'cactusFlower'].map((kind, i) => {
      const q = i * 3,
        r = 0,
        p = axialToWorld(q, r);
      w.set(q, 44, r, 'dirt');
      w.set(q, 45, r, kind);
      cells.push([q, 45, r]);
      return { kind, position: [p.x, 45.45, p.z] };
    });
    outer: for (let q = -2; q <= 2; q++)
      for (let r = 3; r <= 5; r++) {
        if (hash(q, 71, r) <= 0.65) continue;
        const p = axialToWorld(q, r);
        w.set(q, 44, r, 'grass');
        cells.push([q, 44, r]);
        plants.push({
          kind: hash(q, 92, r) > 0.9 ? 'wildFlower' : 'grassTuft',
          position: [p.x, 45.2, p.z],
        });
        break outer;
      }
    window.plantOccluders = [];
    g.graphics.updateCells(cells);
    g.teleport(0, 45, 4);
    g.graphics.stepOffset = 0;
    return plants;
  });
  await fresh(page);
  return plants;
}
async function aim(page, position, far = false) {
  await page.evaluate(
    ({ position, far }) => {
      const g = window.__hexwild.graphics,
        d = g.leafUniforms.leafSunDirection.value;
      g.camera.fov = far ? 8 : 55;
      g.camera.updateProjectionMatrix();
      g.camera.position.fromArray(position);
      if (far) g.camera.position.set(50, position[1], 50);
      else {
        g.camera.position.addScaledVector(d, -3);
        // A ground plant cannot be viewed from three units below the high sun.
        g.camera.position.y = position[1];
      }
      g.camera.lookAt(...position);
      g.camera.updateMatrixWorld();
      g.renderer.shadowMap.needsUpdate = true;
    },
    { position, far },
  );
  await frames(page);
}
const probe = (page, position, local = false, options = {}) =>
  page.evaluate(
    async ({ position, local, options }) => {
      const { readPlantLighting } =
        await import('/tests/fixtures/plant-lighting-probe.js');
      return readPlantLighting(
        window.__hexwild.graphics,
        position,
        local,
        options,
      );
    },
    { position, local, options },
  );
const mask = (s) =>
  s.on.flatMap((v, i) => (v[3] === 2 && s.off[i][3] === 2 ? [i] : []));
const energy = (s, selected) =>
  selected.reduce(
    (sum, i) =>
      sum +
      [0.2126, 0.7152, 0.0722].reduce(
        (v, weight, c) => v + Math.max(0, s.on[i][c] - s.off[i][c]) * weight,
        0,
      ),
    0,
  ) / selected.length;
function checkHalf(a, b, weight) {
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i][3] !== 2 ||
      b[i][3] !== 2 ||
      Math.max(...a[i].slice(0, 3)) < 0.0001
    )
      continue;
    count++;
    for (let c = 0; c < 3; c++) {
      const expected = a[i][c] * weight,
        ulp =
          expected < 2 ** -14
            ? 2 ** -24
            : 2 ** (Math.floor(Math.log2(expected)) - 10);
      expect(Math.abs(b[i][c] - expected)).toBeLessThanOrEqual(
        ulp * 1.01 + 1e-7,
      );
      if (weight === 1) expect(b[i][c]).toBe(a[i][c]);
    }
  }
  expect(count).toBeGreaterThan(30);
  return count;
}

test('native grass tufts and all pigment flowers use Photon plant scattering without changing local point light', async ({
  page,
}, info) => {
  const plants = await setup(page),
    results = [];
  expect(plants).toHaveLength(4);
  for (const plant of plants) {
    await aim(page, plant.position);
    const s = await probe(page, plant.position, plant.kind === 'poppy'),
      selected = mask(s);
    results.push({
      ...plant,
      pixels: selected.length,
      energy: energy(s, selected),
      sample: s,
    });
    await writeFile(
      info.outputPath('native-plants.json'),
      JSON.stringify(results, null, 2),
    );
    expect(selected.length).toBeGreaterThan(30);
    expect(s.strength).toBe(0.5);
    expect(s.sheen).toBe(1);
    expect(energy(s, selected)).toBeGreaterThan(0.00001);
    expect(s.gl).toBe(0);
    if (s.local) checkHalf(s.local.off, s.local.on, 1);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(`${plant.kind}.png`) });
    // The diffuse ratio needs a front-lit view, separate from the solar pair.
    await page.evaluate((position) => {
      const g = window.__hexwild.graphics;
      g.camera.position
        .fromArray(position)
        .addScaledVector(g.leafUniforms.leafSunDirection.value, 3);
      g.camera.lookAt(...position);
      g.camera.updateMatrixWorld();
    }, plant.position);
    await frames(page);
    const front = await probe(page, plant.position);
    checkHalf(front.directBase, front.direct, 0.75);
  }
});

async function occlude(page, kind) {
  await page.evaluate(async (kind) => {
    const { worldToAxial } = await import('/src/core.js'),
      g = window.__hexwild.graphics,
      d = g.leafUniforms.leafSunDirection.value,
      cells = [...window.plantOccluders];
    for (const p of cells) g.world.set(...p, null);
    window.plantOccluders = [];
    if (kind)
      for (const distance of kind === 'leaves'
        ? [1.4, 2.7, 4]
        : kind.includes('Glass')
          ? [2, 3.5, 5]
          : [3]) {
        const a = worldToAxial(d.x * distance, d.z * distance),
          y = Math.floor(45.45 + d.y * distance),
          width = kind === 'leaves' ? 0 : 1;
        for (let dq = -width; dq <= width; dq++)
          for (let dr = -width; dr <= width; dr++)
            for (
              let dy = kind.includes('Glass') || kind === 'leaves' ? 0 : -1;
              dy <= (kind.includes('Glass') || kind === 'leaves' ? 0 : 1);
              dy++
            ) {
              const p = [a.q + dq, y + dy, a.r + dr];
              g.world.set(...p, kind);
              if (kind === 'stoneSlab')
                g.world.setState(...p, { upper: true, facing: 0, open: false });
              cells.push(p);
              window.plantOccluders.push(p);
            }
      }
    g.updateCells(cells);
  }, kind);
  await fresh(page);
}
test('near and far native flower transmission keeps real canopy, opaque roofs, slabs and colored glass', async ({
  page,
}, info) => {
  await setup(page);
  const position = [0, 45.45, 0],
    results = [];
  for (const far of [false, true]) {
    await aim(page, position, far);
    const clear = await probe(page, position),
      selected = mask(clear),
      baseline = energy(clear, selected),
      cases = [];
    results.push({ far, baseline, selected, shadow: clear.shadow, cases });
    expect(selected.length).toBeGreaterThan(30);
    expect(baseline).toBeGreaterThan(0.000001);
    expect(clear.shadow.some((v) => v < 0 || v > 1)).toBe(far);
    const range = () =>
      page.evaluate(async () => {
        const { readFoliageRange } =
          await import('/tests/fixtures/far-sss-probe.js');
        return readFoliageRange(window.__hexwild.graphics, [0, 45.45, 0], true);
      });
    const openRange = far ? assertFoliageRange(await range()) : null;
    for (const kind of [
      'leaves',
      'stone',
      'stoneSlab',
      'redStainedGlass',
      'blueStainedGlass',
      null,
    ]) {
      await occlude(page, kind);
      const s = await probe(page, position),
        value = energy(s, selected),
        ratios = [0, 1, 2].map(
          (c) =>
            selected.reduce((sum, i) => sum + s.filter[i][c], 0) /
            selected.reduce((sum, i) => sum + clear.filter[i][c], 0),
        );
      cases.push({
        kind,
        energy: value,
        ratio: value / baseline,
        filter: ratios,
        sample: s,
      });
      await writeFile(
        info.outputPath('plant-occlusion.json'),
        JSON.stringify(results, null, 2),
      );
      expect(s.gl).toBe(0);
      if (kind === 'leaves') {
        if (!far) expect(value / baseline).toBeLessThan(0.8);
        else {
          const covered = assertFoliageRange(await range());
          expect(covered.ambient).toBeLessThan(openRange.ambient);
        }
      }
      if (kind === 'stone' || kind === 'stoneSlab')
        expect(value).toBeLessThan(0.000001);
      if (kind === 'redStainedGlass')
        expect(ratios[0]).toBeGreaterThan(ratios[2] * 1.5);
      if (kind === 'blueStainedGlass')
        expect(ratios[2]).toBeGreaterThan(ratios[0] * 1.5);
      if (kind === null)
        expect(Math.abs(value / baseline - 1)).toBeLessThan(0.03);
    }
  }
});

test('actual flower pixels follow Photon thickness and visibility continuously across the real shadow-camera edge', async ({
  page,
}, info) => {
  test.setTimeout(360000);
  await setup(page);
  const position = [0, 45.45, 0],
    rows = [];
  await aim(page, position);
  const camera = await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      c = g.sun.shadow.camera;
    return {
      left: c.left,
      right: c.right,
      center: g.camera.position
        .clone()
        .set(0, 45.45, 0)
        .applyMatrix4(g.sun.shadow.matrix).x,
    };
  });
  try {
    for (let i = 0; i <= 24; i++) {
      const edge = 0.88 + i * 0.006;
      await page.evaluate(
        ({ camera, edge }) => {
          const g = window.__hexwild.graphics,
            c = g.sun.shadow.camera,
            shift =
              (camera.right - camera.left) * (camera.center - 0.5 + edge * 0.5);
          c.left = camera.left + shift;
          c.right = camera.right + shift;
          c.updateProjectionMatrix();
          g.renderer.shadowMap.needsUpdate = true;
        },
        { camera, edge },
      );
      const sample = await page.evaluate(async (position) => {
          const { readFoliageRange } =
            await import('/tests/fixtures/far-sss-probe.js');
          return readFoliageRange(window.__hexwild.graphics, position, true);
        }, position),
        summary = assertFoliageRange(sample, 0.06);
      rows.push({ edge, ...summary });
      await writeFile(
        info.outputPath('native-shadow-edge.json'),
        JSON.stringify(rows, null, 2),
      );
    }
  } finally {
    if (!page.isClosed())
      await page.evaluate((camera) => {
        const g = window.__hexwild.graphics,
          c = g.sun.shadow.camera;
        c.left = camera.left;
        c.right = camera.right;
        c.updateProjectionMatrix();
        g.renderer.shadowMap.needsUpdate = true;
      }, camera);
  }
  await writeFile(
    info.outputPath('native-shadow-edge.json'),
    JSON.stringify(rows, null, 2),
  );
  expect(rows[0].fadeMax).toBe(0);
  expect(rows.at(-1).fadeMin).toBe(1);
  expect(rows.some((r) => r.fadeMin > 0 && r.fadeMax < 1)).toBe(true);
  for (let i = 1; i < rows.length; i++)
    expect(rows[i].fadeMin).toBeGreaterThanOrEqual(rows[i - 1].fadeMin);
});

test('plant scattering follows native clouds, moon and wind and survives quality, water capture and context restoration', async ({
  page,
}, info) => {
  test.setTimeout(360000);
  await setup(page);
  const position = [0, 45.45, 0],
    results = {};
  const solar = () => probe(page, position, false, { full: false });
  await page.evaluate(() =>
    window.__hexwild.step(6720 - window.__hexwild.state.time),
  );
  await aim(page, position);
  const clear = await solar(),
    selected = mask(clear),
    daylight = energy(clear, selected);
  expect(selected.length).toBeGreaterThan(30);
  expect(daylight).toBeGreaterThan(0.00001);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ clouds: true }),
  );
  await frames(page, 8);
  const cloud = await page.evaluate(async () => {
      const { probeCloudField } =
        await import('/tests/fixtures/cloud-field-probe.js');
      return probeCloudField(
        window.__hexwild.graphics,
        [[0, 45.45, 0]],
        null,
        45.45,
      ).density[3];
    }),
    cloudy = await solar();
  results.cloud = {
    transmission: cloud,
    ratio: energy(cloudy, selected) / daylight,
  };
  expect(cloud).toBeLessThan(0.93);
  expect(results.cloud.ratio).toBeLessThan(0.98);
  expect(results.cloud.ratio).toBeGreaterThan(0.1);
  await page.evaluate(() => {
    window.__hexwild.graphics.setPostOptions({ clouds: false });
    window.__hexwild.step(450 - window.__hexwild.state.time);
  });
  await aim(page, position);
  const moon = await solar(),
    moonMask = mask(moon),
    moonlight = energy(moon, moonMask);
  expect(moonMask.length).toBeGreaterThan(30);
  expect(moonlight).toBeGreaterThan(0.000001);
  expect(moonlight).toBeLessThan(daylight * 0.7);
  await frames(page, 5);
  const paused = await solar();
  expect(Math.abs(energy(paused, moonMask) / moonlight - 1)).toBeLessThan(0.03);
  await page.evaluate(() => window.__hexwild.step(2));
  await frames(page);
  const advanced = await solar();
  expect(advanced.on.flat().every(Number.isFinite)).toBe(true);
  expect(
    advanced.on.some((v, i) => v.some((c, k) => c !== moon.on[i][k])),
  ).toBe(true);
  results.moon = { daylight, moonlight, paused: energy(paused, moonMask) };
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    g.step(120 - g.state.time);
    for (let q = 1; q <= 4; q++)
      for (let r = 2; r <= 4; r++) {
        g.state.world.set(q, 42, r, 'calcite');
        g.state.world.set(q, 44, r, null);
        g.state.world.fluids.source(q, 43, r, 'water');
        cells.push([q, 43, r]);
      }
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(
      g.state.world,
      new Set(g.graphics.chunks.keys()),
      true,
    );
  });
  await fresh(page);
  await aim(page, position);
  results.quality = [];
  for (const quality of [1.7, 1, 0.65, 1.7]) {
    await page.evaluate(
      (quality) => window.__hexwild.graphics.setQuality(quality),
      quality,
    );
    await frames(page, 5);
    const s = await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      return {
        quality: g.quality,
        amount: g.plantUniforms.leafSssAmount.value,
        source: g.plantUniforms.leafSunColor.value.toArray(),
        gl: g.renderer.getContext().getError(),
      };
    });
    results.quality.push(s);
    expect(s.amount).toBe(quality === 1.7 ? 0.5 : 0);
    if (quality < 1.7) expect(s.source).toEqual([0, 0, 0]);
    expect(s.gl).toBe(0);
  }
  await page.setViewportSize({ width: 713, height: 509 });
  await frames(page, 5);
  const captured = await probe(page, position, false, {
      full: false,
      water: true,
    }),
    waterMask = mask(captured);
  expect(captured.captureReady).toBe(1);
  expect(waterMask.length).toBeGreaterThan(30);
  expect(energy(captured, waterMask)).toBeGreaterThan(0.000001);
  results.water = {
    pixels: waterMask.length,
    energy: energy(captured, waterMask),
  };
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) throw Error('Real graphics context restoration unavailable');
    window.plantRestored = false;
    g.renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => (window.plantRestored = true),
      { once: true },
    );
    window.restorePlantContext = () => ext.restoreContext();
    ext.loseContext();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restorePlantContext());
  await expect
    .poll(() => page.evaluate(() => window.plantRestored), { timeout: 30000 })
    .toBe(true);
  await frames(page, 8);
  const restored = await solar(),
    restoredMask = mask(restored);
  expect(restoredMask.length).toBeGreaterThan(30);
  expect(energy(restored, restoredMask)).toBeGreaterThan(0.00001);
  results.restored = {
    pixels: restoredMask.length,
    energy: energy(restored, restoredMask),
  };
  for (const s of [clear, cloudy, moon, paused, advanced, captured, restored])
    expect(s.gl).toBe(0);
  await writeFile(
    info.outputPath('plant-clouds-moon-lifecycle.json'),
    JSON.stringify(results, null, 2),
  );
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('restored-plants.png') });
});
