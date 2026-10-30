import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { oracleSurfaceOptics } from './fixtures/photon-specular-oracle.js';
test.setTimeout(240000);
const issues = new WeakMap();
test.afterEach(async ({ page }, info) => {
  await writeFile(
    info.outputPath('messages.json'),
    JSON.stringify(issues.get(page), null, 2),
  );
});
const frames = (page, n = 4) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const step = () => (--n ? requestAnimationFrame(step) : resolve());
        requestAnimationFrame(step);
      }),
    n,
  );
async function fresh(page) {
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
  await frames(page);
}
const selected = (s) =>
  s.data.specular.flatMap((p, i) =>
    p[3] === 3 && s.off[i][3] === 3 ? [i] : [],
  );
const average = (s, indices) =>
  [0, 1, 2].map(
    (c) =>
      indices.reduce((n, i) => n + s.data.specular[i][c], 0) / indices.length,
  );
const probe = (page, points, full = true) =>
  page.evaluate(
    async ({ points, full }) => {
      const { readNativeSurfaceOptics } =
        await import('/tests/fixtures/native-surface-optics-probe.js');
      return readNativeSurfaceOptics(window.__hexwild.graphics, points, full);
    },
    { points, full },
  );

test('native metal/gem/wood blocks carry optical bytes into real glints and preserve glass filtering and opaque occlusion', async ({
  page,
}, info) => {
  const messages = { errors: [], warnings: [] };
  issues.set(page, messages);
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#creative').click();
  const points = await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      { axialToWorld } = await import('/src/core.js');
    api.setPlaying(false);
    api.step(120 - api.state.time);
    g.setQuality(1.7);
    g.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: true,
    });
    const cells = [];
    for (let q = -6; q <= 6; q++)
      for (let r = -6; r <= 6; r++) {
        w.set(q, 48, r, 'calcite');
        cells.push([q, 48, r]);
        for (let y = 49; y < 64; y++) {
          w.set(q, y, r, null);
          cells.push([q, y, r]);
        }
      }
    const types = [
      'stone',
      'sand',
      'planks',
      'birchPlanks',
      'ironBlock',
      'goldBlock',
      'copperBlock',
      'diamondBlock',
      'obsidian',
    ];
    const points = types.map((kind, i) => {
      const q = ((i % 3) - 1) * 3,
        r = (Math.floor(i / 3) - 1) * 3,
        p = axialToWorld(q, r);
      w.set(q, 49, r, kind);
      cells.push([q, 49, r]);
      return { kind, cell: [q, 49, r], position: [p.x, 50, p.z] };
    });
    g.updateCells(cells);
    api.teleport(0, 64, 10);
    g.stepOffset = 0;
    return points;
  });
  await fresh(page);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      d = g.leafUniforms.leafSunDirection.value,
      eye = d.clone();
    eye.x *= -1;
    eye.z *= -1;
    eye.multiplyScalar(18).add({ x: 0, y: 50, z: 0 });
    g.camera.position.copy(eye);
    g.camera.lookAt(0, 50, 0);
    g.camera.updateMatrixWorld();
    g.renderer.shadowMap.needsUpdate = true;
  });
  await frames(page);
  const routing = await page.evaluate((points) => {
    const g = window.__hexwild.graphics,
      far = g.ray.far;
    try {
      g.ray.far = 80;
      return points.map((point) => {
        const direction = g.camera.position
          .clone()
          .fromArray(point.position)
          .sub(g.camera.position)
          .normalize();
        g.ray.set(g.camera.position, direction);
        const hit = g.ray
          .intersectObjects(g.terrain.children, true)
          .find(
            (h) =>
              h.object.material === g.material &&
              h.point.distanceTo(
                g.camera.position.clone().fromArray(point.position),
              ) < 0.2,
          );
        if (!hit) return { kind: point.kind, missing: true };
        const attribute = hit.object.geometry.attributes.surfaceOptics;
        return {
          kind: point.kind,
          type: attribute.array.constructor.name,
          itemSize: attribute.itemSize,
          normalized: attribute.normalized,
          values: [hit.face.a, hit.face.b, hit.face.c].map((i) =>
            attribute.getX(i),
          ),
        };
      });
    } finally {
      g.ray.far = far;
    }
  }, points);
  const masks = [0, 7, 10, 9, 12, 12, 12, 13, 11];
  await writeFile(
    info.outputPath('native-optics-routing.json'),
    JSON.stringify({ points, routing }, null, 2),
  );
  routing.forEach((r, i) => {
    expect(r.missing).not.toBe(true);
    expect(r.type).toBe('Uint8Array');
    expect(r.itemSize).toBe(1);
    expect(r.normalized).toBe(false);
    expect(r.values).toEqual([masks[i], masks[i], masks[i]]);
  });
  const clear = await probe(page, points),
    summary = [];
  await writeFile(
    info.outputPath('native-optics-clear.json'),
    JSON.stringify(clear, null, 2),
  );
  let parameterError = 0;
  clear.points.forEach((s, index) => {
    const indices = selected(s);
    expect(indices.length).toBeGreaterThan(5);
    for (const i of indices) {
      expect(s.off[i].slice(0, 3)).toEqual([0, 0, 0]);
      expect(s.data.category[i].slice(0, 3)).toEqual([
        masks[index],
        masks[index],
        masks[index],
      ]);
      for (const channel of s.data.specular[i].slice(0, 3))
        expect(Number.isFinite(channel) && channel >= 0).toBe(true);
      const optical = oracleSurfaceOptics(
          s.data.albedo[i].slice(0, 3),
          masks[index],
        ),
        expected = [optical.roughness, optical.f0, optical.metal];
      for (let c = 0; c < 3; c++)
        parameterError = Math.max(
          parameterError,
          Math.abs(s.data.parameters[i][c] - expected[c]),
        );
    }
    summary.push({
      kind: s.kind,
      pixels: indices.length,
      average: average(s, indices),
    });
  });
  expect(parameterError).toBeLessThan(0.003);
  expect(clear.gl).toBe(0);
  const iron = clear.points[4],
    mask = selected(iron),
    baseline = average(iron, mask);
  expect(Math.min(...baseline)).toBeGreaterThan(0.001);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('material-gallery.png') });
  const controls = [];
  for (const kind of ['redStainedGlass', 'blueStainedGlass', 'stone', null]) {
    await page.evaluate(async (kind) => {
      const g = window.__hexwild.graphics,
        w = g.world,
        { worldToAxial } = await import('/src/core.js'),
        cells = [];
      for (const cell of window.__opticsOccluders || []) {
        w.set(...cell, null);
        cells.push(cell);
      }
      window.__opticsOccluders = [];
      if (kind) {
        const d = g.leafUniforms.leafSunDirection.value,
          distances = kind.includes('Glass') ? [2, 3.5, 5] : [3];
        for (const distance of distances) {
          const p = worldToAxial(d.x * distance, d.z * distance),
            y = Math.floor(50 + d.y * distance);
          for (let dq = -1; dq <= 1; dq++)
            for (let dr = -1; dr <= 1; dr++) {
              const cell = [p.q + dq, y, p.r + dr];
              w.set(...cell, kind);
              cells.push(cell);
              window.__opticsOccluders.push(cell);
            }
        }
      }
      g.updateCells(cells);
    }, kind);
    await fresh(page);
    const value = await probe(page, [points[4]], false),
      s = value.points[0],
      indices = selected(s),
      mean = average(s, indices),
      ratios = mean.map((v, c) => v / baseline[c]);
    controls.push({ kind, pixels: indices.length, mean, ratios, sample: s });
    await writeFile(
      info.outputPath('native-optics-controls.json'),
      JSON.stringify(controls, null, 2),
    );
    expect(indices.length).toBeGreaterThan(5);
    expect(value.gl).toBe(0);
    if (kind === 'redStainedGlass')
      expect(ratios[0]).toBeGreaterThan(ratios[2] * 1.5);
    if (kind === 'blueStainedGlass')
      expect(ratios[2]).toBeGreaterThan(ratios[0] * 1.5);
    if (kind === 'stone') expect(Math.max(...mean)).toBeLessThan(0.000001);
    if (kind === null)
      for (const ratio of ratios)
        expect(Math.abs(ratio - 1)).toBeLessThan(0.03);
  }
  const phases = [];
  for (const [time, phase, radius, enabled] of [
    [120, 0, Math.PI / 90, 1],
    [420, 0, Math.PI / 60, 1],
    [2820, 4, Math.PI / 60, 0],
  ]) {
    await page.evaluate((time) => {
      const api = window.__hexwild;
      api.step(time - api.state.time);
    }, time);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return {
              phase: Math.round(g.skyEnvironment.uniforms.skyMoonPhase.value),
              enabled: g.weatherUniforms.surfaceSpecular.value,
              radius: g.weatherUniforms.surfaceLightRadius.value,
            };
          }),
        { timeout: 60000 },
      )
      .toEqual({ phase, enabled, radius });
    await fresh(page);
    await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        d = g.sun.position.clone().sub(g.sun.target.position).normalize(),
        eye = d.clone();
      eye.x *= -1;
      eye.z *= -1;
      eye.multiplyScalar(18).add({ x: 0, y: 50, z: 0 });
      g.camera.position.copy(eye);
      g.camera.lookAt(0, 50, 0);
      g.camera.updateMatrixWorld();
      g.renderer.shadowMap.needsUpdate = true;
    });
    await frames(page);
    const value = await probe(page, [points[4]], false),
      s = value.points[0],
      indices = selected(s),
      mean = average(s, indices);
    const meta = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        disk =
          g.skyEnvironment.uniforms.skySunDirection.value.y < 0
            ? g.skyEnvironment.moonDisk
            : g.sunDisk;
      return {
        intensity: g.sun.intensity,
        radius: g.weatherUniforms.surfaceLightRadius.value,
        diskAngle: Math.atan(
          disk.geometry.parameters.radius / disk.position.length(),
        ),
        gl: g.renderer.getContext().getError(),
      };
    });
    phases.push({ time, phase, enabled, meta, pixels: indices.length, mean });
    await writeFile(
      info.outputPath('native-optics-phases.json'),
      JSON.stringify(phases, null, 2),
    );
    expect(indices.length).toBeGreaterThan(5);
    expect(value.gl).toBe(0);
    expect(meta.gl).toBe(0);
    expect(Math.abs(meta.diskAngle - radius)).toBeLessThan(1e-12);
    expect(meta.intensity).toBeGreaterThan(0);
    if (enabled) expect(Math.max(...mean)).toBeGreaterThan(0.00001);
    else expect(mean).toEqual([0, 0, 0]);
  }
  await writeFile(
    info.outputPath('native-optics.json'),
    JSON.stringify(
      { routing, summary, parameterError, clear, controls, phases, messages },
      null,
      2,
    ),
  );
  expect(messages).toEqual({ errors: [], warnings: [] });
});
