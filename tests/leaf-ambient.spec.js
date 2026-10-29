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

test('plant sky SSS uses its actual half-strength material and the same upward SH in each camera frame', async ({
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
  const result = await page.evaluate(async () => {
    const { probeLeafAmbient } =
      await import('/tests/fixtures/leaf-ambient-probe.js');
    return probeLeafAmbient(window.__hexwild.graphics, true);
  });
  await writeFile(
    info.outputPath('plant-ambient.json'),
    JSON.stringify({ result, errors, warnings }, null, 2),
  );
  for (const row of result.samples)
    for (let c = 0; c < 3; c++) {
      const up = row.field.base[c] + (2 / 3) * row.field.slope[c],
        expected =
          result.albedo[c] * up * row.sky * (row.byte / 255) * 0.5 * row.shade;
      expect(
        Math.abs(row.on[c] - row.withoutAmbient[c] - expected),
      ).toBeLessThan(0.0006);
    }
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs(
        result.missingAttribute.on[c] -
          result.missingAttribute.off[c] -
          0.75 * result.albedo[c],
      ),
    ).toBeLessThan(0.0006);
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('native flower and new grass meshes receive cached visibility without invalidating optically unchanged ground', async ({
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
  const tuft = await page.evaluate(async () => {
    const { hash } = await import('/src/core.js'),
      g = window.__hexwild,
      w = g.state.world,
      cells = [];
    g.setPlaying(false);
    for (let q = 0; q <= 6; q++)
      for (let r = 0; r <= 6; r++) {
        w.set(q, 44, r, 'calcite');
        for (let y = 45; y <= 49; y++) w.set(q, y, r, null);
        cells.push([q, 44, r]);
      }
    w.set(3, 44, 3, 'dirt');
    w.set(3, 45, 3, 'poppy');
    cells.push([3, 45, 3]);
    g.graphics.updateCells(cells);
    for (let q = 2; q <= 4; q++)
      for (let r = 2; r <= 4; r++)
        if ((q !== 3 || r !== 3) && hash(q, 71, r) > 0.65) return [q, 45, r];
    throw Error('No native tuft candidate');
  });
  const fresh = () =>
    expect
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
  await fresh();
  const replaced = await page.evaluate(([q, y, r]) => {
    const g = window.__hexwild.graphics,
      rev = g.world.lightRevision,
      values = g.voxelLight.leafAmbient,
      version = g.voxelLight.leafAmbientVersion;
    g.world.set(q, y - 1, r, 'grass');
    g.updateCells([[q, y - 1, r]]);
    return {
      revisionUnchanged: g.world.lightRevision === rev,
      valuesUnchanged: g.voxelLight.leafAmbient === values,
      versionUnchanged: g.voxelLight.leafAmbientVersion === version,
    };
  }, tuft);
  expect(replaced).toEqual({
    revisionUnchanged: true,
    valuesUnchanged: true,
    versionUnchanged: true,
  });
  const read = () =>
    page.evaluate((tuft) => {
      const g = window.__hexwild.graphics,
        f = g.voxelLight;
      return [[3, 45, 3], tuft].map(([q, y, r]) => {
        const samples = [];
        for (const mesh of g.chunks.values())
          mesh.traverse((o) => {
            const geo = o.geometry,
              ranges = geo?.userData.leafRanges,
              attr = geo?.attributes.leafAmbient;
            if (o.material !== g.foliageMaterial || !ranges) return;
            for (let j = 0; j < ranges.length; j += 5)
              if (ranges[j] === q && ranges[j + 1] === y && ranges[j + 2] === r)
                samples.push({
                  min: Math.min(
                    ...attr.array.slice(ranges[j + 3], ranges[j + 4]),
                  ),
                  max: Math.max(
                    ...attr.array.slice(ranges[j + 3], ranges[j + 4]),
                  ),
                  normalized: attr.normalized,
                  bytes: attr.array.BYTES_PER_ELEMENT,
                  version: geo.userData.leafAmbientVersion,
                });
          });
        return {
          root: [q, y, r],
          byte: f.leafAmbient[f.index(q, y, r)],
          version: f.leafAmbientVersion,
          samples,
        };
      });
    }, tuft);
  const check = (rows) => {
    for (const row of rows) {
      expect(row.samples).toHaveLength(1);
      expect(row.samples[0]).toEqual({
        min: row.byte,
        max: row.byte,
        normalized: true,
        bytes: 1,
        version: row.version,
      });
    }
  };
  const open = await read();
  check(open);
  for (const row of open) expect(row.byte).toBeGreaterThan(0);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      cells = [];
    for (let q = 1; q <= 5; q++)
      for (let r = 1; r <= 5; r++) {
        g.world.set(q, 46, r, 'stone');
        cells.push([q, 46, r]);
      }
    g.updateCells(cells);
  });
  await fresh();
  const covered = await read();
  check(covered);
  for (let i = 0; i < open.length; i++)
    expect(covered[i].byte).toBeLessThan(open[i].byte);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      cells = [];
    for (let q = 1; q <= 5; q++)
      for (let r = 1; r <= 5; r++) {
        g.world.set(q, 46, r, null);
        cells.push([q, 46, r]);
      }
    g.updateCells(cells);
  });
  await fresh();
  const restored = await read();
  check(restored);
  for (let i = 0; i < open.length; i++)
    expect(restored[i].byte).toBe(open[i].byte);
  const held = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      f = g.voxelLight,
      values = f.leafAmbient,
      version = f.leafAmbientVersion;
    f.setHeld('torch', g.camera.position);
    g.updateVoxelLight(1);
    for (const mesh of g.chunks.values()) f.relight(mesh);
    return {
      same: values === f.leafAmbient,
      version: version === f.leafAmbientVersion,
      gl: g.renderer.getContext().getError(),
    };
  });
  expect(held).toEqual({ same: true, version: true, gl: 0 });
  await writeFile(
    info.outputPath('native-plant-visibility.json'),
    JSON.stringify(
      { tuft, open, covered, restored, held, errors, warnings },
      null,
      2,
    ),
  );
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
