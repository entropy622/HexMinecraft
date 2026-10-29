import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('leaf sky SSS uses actual SH, geometry bytes, sky units and camera-independent irradiance', async ({
  page,
}, info) => {
  const errors = [],
    warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            !g.relightQueue.size &&
            g.voxelLight.revision === g.world.lightRevision
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { probeLeafAmbient } =
      await import('/tests/fixtures/leaf-ambient-probe.js');
    return probeLeafAmbient(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('leaf-ambient.json'),
    JSON.stringify({ result, errors, warnings }, null, 2),
  );
  for (const row of result.samples)
    for (let c = 0; c < 3; c++) {
      const upward = row.field.base[c] + (2 / 3) * row.field.slope[c],
        expected =
          result.albedo[c] *
          upward *
          row.sky *
          (0.5 * row.ao + row.byte / 255) *
          row.shade;
      expect(Math.abs(row.on[c] - row.off[c] - expected)).toBeLessThan(0.0006);
    }
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs(
        result.missingAttribute.on[c] -
          result.missingAttribute.off[c] -
          0.5 * result.albedo[c],
      ),
    ).toBeLessThan(0.0006);
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('native leaf geometry follows openings and opaque edits while held RGB reuses cached visibility', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const app = window.__hexwild,
      w = app.state.world,
      cells = [];
    app.setPlaying(false);
    for (let q = 0; q <= 6; q++)
      for (let r = 0; r <= 6; r++)
        for (let y = 42; y <= 48; y++) {
          w.set(q, y, r, null);
          if (w.fluids.get(q, y, r)) w.fluids.write(q, y, r, null);
          cells.push([q, y, r]);
        }
    w.set(3, 45, 3, 'leaves');
    app.graphics.updateCells(cells);
  });
  const fresh = () =>
    expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              g.voxelLight.revision === g.world.lightRevision
            );
          }),
        { timeout: 60000 },
      )
      .toBe(true);
  await fresh();
  const read = () =>
    page.evaluate(() => {
      const g = window.__hexwild.graphics,
        f = g.voxelLight,
        samples = [];
      g.chunks.get('0,0').traverse((o) => {
        const geo = o.geometry,
          ranges = geo?.userData.leafRanges,
          a = geo?.attributes.leafAmbient;
        if (!ranges) return;
        for (let j = 0; j < ranges.length; j += 5)
          if (ranges[j] === 3 && ranges[j + 1] === 45 && ranges[j + 2] === 3) {
            samples.push({
              min: Math.min(...a.array.slice(ranges[j + 3], ranges[j + 4])),
              max: Math.max(...a.array.slice(ranges[j + 3], ranges[j + 4])),
              normalized: a.normalized,
              version: a.version,
            });
          }
      });
      return {
        cell: f.leafAmbient[f.index(3, 45, 3)],
        fieldVersion: f.leafAmbientVersion,
        samples,
        gl: g.renderer.getContext().getError(),
      };
    });
  const open = await read();
  expect(open.cell).toBe(255);
  expect(open.samples.length).toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      w = g.world,
      cells = [];
    for (let q = 1; q <= 5; q++)
      for (let r = 1; r <= 5; r++)
        for (let y = 43; y <= 47; y++) {
          if (q === 3 && r === 3 && y === 45) continue;
          w.set(q, y, r, 'stone');
          cells.push([q, y, r]);
        }
    g.updateCells(cells);
  });
  await fresh();
  const closed = await read();
  expect(closed.cell).toBe(0);
  expect(closed.fieldVersion).toBeGreaterThan(open.fieldVersion);
  // A completely enclosed leaf is culled. Reopen a real two-cell tunnel so
  // the edited leaf has visible triangles and its new byte upload is observed.
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      cells = [
        [4, 45, 3],
        [5, 45, 3],
      ];
    for (const cell of cells) g.world.set(...cell, null);
    g.updateCells(cells);
  });
  await fresh();
  const reopened = await read();
  expect(reopened.cell).toBeGreaterThan(0);
  expect(reopened.cell).toBeLessThan(255);
  expect(reopened.samples.length).toBe(1);
  expect(reopened.fieldVersion).toBeGreaterThan(closed.fieldVersion);
  const held = await page.evaluate(async () => {
    const { axialToWorld } = await import('/src/core.js'),
      g = window.__hexwild.graphics,
      f = g.voxelLight,
      field = f.leafAmbient,
      version = f.leafAmbientVersion;
    f.setHeld('torch', { ...axialToWorld(3, 3), y: 45 });
    f.update(1);
    f.relight(g.chunks.get('0,0'));
    return {
      same: field === f.leafAmbient,
      version: version === f.leafAmbientVersion,
    };
  });
  expect(held).toEqual({ same: true, version: true });
  const afterHeld = await read();
  expect(afterHeld.samples).toEqual(reopened.samples);
  for (const result of [open, closed, reopened, afterHeld]) {
    expect(result.gl).toBe(0);
    for (const sample of result.samples) {
      expect(sample.normalized).toBe(true);
      expect(sample.min).toBe(result.cell);
      expect(sample.max).toBe(result.cell);
    }
  }
  await writeFile(
    info.outputPath('native-leaf-ambient.json'),
    JSON.stringify(
      { open, closed, reopened, afterHeld, held, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
