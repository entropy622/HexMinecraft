import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 720, height: 540 });
});
async function frames(page, n = 3) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const next = () => (--n ? requestAnimationFrame(next) : resolve());
        requestAnimationFrame(next);
      }),
    n,
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
            g.relightQueue.size === 0
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
  await page.evaluate(() => {
    const g = window.__hexwild,
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
        w.set(q, 39, r, 'calcite');
        for (let y = 40; y <= 62; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 45, 0, 'leaves');
    cells.push([0, 45, 0]);
    g.graphics.updateCells(cells);
    g.teleport(0, 43, 3);
    g.lookAt(0, 45.5, 0);
    g.graphics.stepOffset = 0;
  });
  await fresh(page);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      direction = g.sun.position.clone().sub(g.sun.target.position).normalize();
    g.camera.position.set(0, 45.5, 0).addScaledVector(direction, -4);
    window.__hexwild.lookAt(0, 45.5, 0);
    g.camera.updateMatrixWorld();
    window.leafProbeDirection = direction.toArray();
    window.leafProbeCells = [];
    g.renderer.shadowMap.needsUpdate = true;
  });
  await frames(page);
}
async function occluder(page, kind) {
  await page.evaluate(async (kind) => {
    const { worldToAxial } = await import('/src/core.js'),
      g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (const p of window.leafProbeCells) {
      w.set(...p, null);
      cells.push(p);
    }
    window.leafProbeCells = [];
    if (kind) {
      const d = window.leafProbeDirection;
      for (const distance of kind === 'leaves' ? [1.4, 2.7, 4] : [3]) {
        const a = worldToAxial(d[0] * distance, d[2] * distance),
          y = Math.floor(45.5 + d[1] * distance);
        for (
          let dq = kind === 'stone' ? -1 : 0;
          dq <= (kind === 'stone' ? 1 : 0);
          dq++
        )
          for (
            let dr = kind === 'stone' ? -1 : 0;
            dr <= (kind === 'stone' ? 1 : 0);
            dr++
          )
            for (
              let dy = kind === 'stone' ? -1 : 0;
              dy <= (kind === 'stone' ? 1 : 0);
              dy++
            ) {
              const p = [a.q + dq, y + dy, a.r + dr];
              if (p[0] === 0 && p[1] === 45 && p[2] === 0) continue;
              w.set(...p, kind);
              cells.push(p);
              window.leafProbeCells.push(p);
            }
      }
    }
    g.graphics.updateCells(cells);
  }, kind);
  await fresh(page);
}
async function sample(page, component = 'sun') {
  const raw = await page.evaluate((component) => {
    const g = window.__hexwild.graphics,
      t = g.composer.passes[0].target,
      renderer = g.renderer,
      all = new Uint16Array(t.width * t.height * 4),
      uniform =
        component === 'sheen'
          ? g.leafUniforms.leafSheen
          : g.leafUniforms.leafSunColor,
      previous =
        typeof uniform.value === 'number'
          ? uniform.value
          : uniform.value.clone(),
      target = renderer.getRenderTarget(),
      center = g.camera.position.clone().set(0, 45.5, 0).project(g.camera);
    const x = Math.round((center.x * 0.5 + 0.5) * t.width),
      y = Math.round((center.y * 0.5 + 0.5) * t.height);
    const read = () => {
      g.composer.passes[0].beauty.render(renderer, null, t);
      renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, all);
      const pixels = [];
      for (let dy = -15; dy <= 15; dy++)
        for (let dx = -15; dx <= 15; dx++) {
          const i = ((y + dy) * t.width + x + dx) * 4;
          pixels.push(all[i], all[i + 1], all[i + 2]);
        }
      return pixels;
    };
    try {
      const on = read();
      if (typeof uniform.value === 'number') uniform.value = 0;
      else uniform.value.setRGB(0, 0, 0);
      const off = read();
      return {
        on,
        off,
        position: g.camera.position.toArray(),
        direction: window.leafProbeDirection,
        gl: renderer.getContext().getError(),
      };
    } finally {
      if (typeof uniform.value === 'number') uniform.value = previous;
      else uniform.value.copy(previous);
      read();
      renderer.setRenderTarget(target);
    }
  }, component);
  const added = raw.on.map((v, i) =>
    Math.max(
      0,
      DataUtils.fromHalfFloat(v) - DataUtils.fromHalfFloat(raw.off[i]),
    ),
  );
  return { ...raw, added };
}
function energy(sample, mask) {
  return (
    mask.reduce(
      (sum, i) =>
        sum +
        sample.added[i * 3] * 0.2126 +
        sample.added[i * 3 + 1] * 0.7152 +
        sample.added[i * 3 + 2] * 0.0722,
      0,
    ) / mask.length
  );
}
const litPixels = (s) =>
  Array.from({ length: s.added.length / 3 }, (_, i) => i).filter(
    (i) => Math.max(...s.added.slice(i * 3, i * 3 + 3)) > 0.00002,
  );

test('native leaf sheen uses real sun energy, canopy thickness and raw-sky eligibility', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  const source = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return {
      leaf: g.leafUniforms.leafSunColor.value.toArray(),
      actual: g.sun.color.clone().multiplyScalar(g.sun.intensity).toArray(),
      amount: g.leafUniforms.leafSheen.value,
    };
  });
  expect(source.amount).toBe(0.5);
  source.leaf.forEach((v, i) =>
    expect(Math.abs(v - source.actual[i])).toBeLessThan(1e-7),
  );
  const thin = await sample(page, 'sheen'),
    mask = litPixels(thin);
  expect(mask.length).toBeGreaterThan(30);
  expect(energy(thin, mask)).toBeGreaterThan(0.0001);
  await occluder(page, 'leaves');
  const thick = await sample(page, 'sheen');
  await occluder(page, 'stone');
  const blocked = await sample(page, 'sheen');
  expect(energy(thick, mask) / energy(thin, mask)).toBeLessThan(0.65);
  expect(energy(blocked, mask) / energy(thin, mask)).toBeLessThan(0.03);
  await occluder(page, null);
  const rawSky = [];
  for (const raw of [1, 2]) {
    await page.evaluate((raw) => {
      const g = window.__hexwild.graphics;
      g.chunks.get('0,0').traverse((o) => {
        if (!o.geometry?.attributes.leafAmbient) return;
        const a = o.geometry.attributes.skylight;
        a.array.fill((raw / 15) ** 2);
        a.needsUpdate = true;
      });
    }, raw);
    rawSky.push({ raw, energy: energy(await sample(page, 'sheen'), mask) });
  }
  expect(rawSky[0].energy).toBeLessThan(1e-7);
  expect(rawSky[1].energy).toBeGreaterThan(0.0001);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.voxelLight.relight(g.chunks.get('0,0'));
    const d = g.sun.position.clone().sub(g.sun.target.position).normalize();
    g.camera.position.set(0, 45.5, 0).addScaledVector(d, 4);
    window.__hexwild.lookAt(0, 45.5, 0);
    g.camera.updateMatrixWorld();
  });
  await frames(page);
  const front = await sample(page, 'sheen');
  expect(Math.max(...front.added)).toBeLessThan(1e-7);
  await writeFile(
    info.outputPath('native-leaf-sheen.json'),
    JSON.stringify(
      {
        source,
        thin: energy(thin, mask),
        thick: energy(thick, mask),
        blocked: energy(blocked, mask),
        rawSky,
        frontMaximum: Math.max(...front.added),
        pixels: mask.length,
        errors,
      },
      null,
      2,
    ),
  );
  for (const s of [thin, thick, blocked, front]) expect(s.gl).toBe(0);
  expect(errors).toEqual([]);
});
async function backlight(page, time) {
  await page.evaluate(
    (time) => window.__hexwild.step(time - window.__hexwild.state.time),
    time,
  );
  await frames(page);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      d = g.sun.position.clone().sub(g.sun.target.position).normalize();
    g.camera.position.set(0, 45.5, 0).addScaledVector(d, -4);
    window.__hexwild.lookAt(0, 45.5, 0);
    g.camera.updateMatrixWorld();
    g.renderer.shadowMap.needsUpdate = true;
    window.leafProbeDirection = d.toArray();
  });
  await frames(page);
}

test('far native leaves retain real roof, slab and colored-glass occlusion beyond shadow coverage', async ({
  page,
}, info) => {
  const errors = [],
    warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await setup(page);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.camera.fov = 12;
    g.camera.updateProjectionMatrix();
    g.camera.position.set(50, 45.5, 50);
    window.__hexwild.lookAt(0, 45.5, 0);
    g.camera.updateMatrixWorld();
    g.renderer.shadowMap.needsUpdate = true;
  });
  await frames(page);
  const projection = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return g.camera.position
      .clone()
      .set(0, 45.5, 0)
      .applyMatrix4(g.sun.shadow.matrix)
      .toArray();
  });
  expect(projection.some((v) => v < 0 || v > 1)).toBe(true);
  const thin = await sample(page),
    mask = litPixels(thin);
  expect(mask.length).toBeGreaterThan(30);
  expect(energy(thin, mask)).toBeGreaterThan(0.0001);
  await occluder(page, 'leaves');
  const thick = await sample(page);
  expect(energy(thick, mask) / energy(thin, mask)).toBeLessThan(0.65);
  await occluder(page, 'stone');
  const roof = await sample(page);
  expect(energy(roof, mask)).toBeLessThan(0.000001);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    for (const p of window.leafProbeCells) {
      g.world.set(...p, 'stoneSlab');
      g.world.setState(...p, { upper: true, facing: 0, open: false });
    }
    g.updateCells(window.leafProbeCells);
  });
  await fresh(page);
  const slab = await sample(page);
  expect(energy(slab, mask)).toBeLessThan(0.000001);
  const tinted = [];
  for (const kind of ['redStainedGlass', 'blueStainedGlass']) {
    await occluder(page, null);
    await page.evaluate(async (kind) => {
      const { worldToAxial } = await import('/src/core.js'),
        g = window.__hexwild.graphics,
        d = window.leafProbeDirection,
        cells = [];
      for (const distance of [2, 3.5, 5]) {
        const a = worldToAxial(d[0] * distance, d[2] * distance),
          y = Math.floor(45.5 + d[1] * distance);
        for (let dq = -1; dq <= 1; dq++)
          for (let dr = -1; dr <= 1; dr++) {
            const p = [a.q + dq, y, a.r + dr];
            g.world.set(...p, kind);
            cells.push(p);
          }
      }
      window.leafProbeCells = cells;
      g.updateCells(cells);
    }, kind);
    await fresh(page);
    const s = await sample(page);
    tinted.push({
      kind,
      ratio: [0, 1, 2].map(
        (c) =>
          mask.reduce((sum, i) => sum + s.added[i * 3 + c], 0) /
          mask.reduce((sum, i) => sum + thin.added[i * 3 + c], 0),
      ),
      gl: s.gl,
    });
  }
  expect(tinted[0].ratio[0]).toBeGreaterThan(tinted[0].ratio[2] * 1.5);
  expect(tinted[1].ratio[2]).toBeGreaterThan(tinted[1].ratio[0] * 1.5);
  await occluder(page, null);
  const restored = await sample(page);
  expect(
    Math.abs(energy(restored, mask) / energy(thin, mask) - 1),
  ).toBeLessThan(0.03);
  await writeFile(
    info.outputPath('far-native-leaves.json'),
    JSON.stringify(
      {
        projection,
        pixels: mask.length,
        thin: energy(thin, mask),
        thick: energy(thick, mask),
        roof: energy(roof, mask),
        slab: energy(slab, mask),
        restored: energy(restored, mask),
        tinted,
        errors,
        warnings,
      },
      null,
      2,
    ),
  );
  for (const s of [thin, thick, roof, slab, restored, ...tinted])
    expect(s.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('real leaves transmit thin-canopy sunlight while thick foliage attenuates it and opaque roofs stop it', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  const thin = await sample(page),
    mask = Array.from({ length: thin.off.length / 3 }, (_, i) => i).filter(
      (i) => {
        const [r, g, b] = thin.off
          .slice(i * 3, i * 3 + 3)
          .map(DataUtils.fromHalfFloat);
        return g > 0.002 && g > r * 1.15 && g > b * 1.15;
      },
    ),
    coverage =
      mask.filter(
        (i) => Math.max(...thin.added.slice(i * 3, i * 3 + 3)) > 0.00002,
      ).length / mask.length;
  expect(mask.length).toBeGreaterThan(30);
  await occluder(page, 'leaves');
  const thick = await sample(page);
  await occluder(page, 'stone');
  const blocked = await sample(page);
  await page.screenshot({ path: info.outputPath('opaque-roof.png') });
  await occluder(page, null);
  const restored = await sample(page);
  await page.screenshot({ path: info.outputPath('thin-leaf-backlight.png') });
  await occluder(page, 'glass');
  const glass = await sample(page);
  const result = {
    thin: energy(thin, mask),
    thick: energy(thick, mask),
    blocked: energy(blocked, mask),
    restored: energy(restored, mask),
    glassTint: [0, 1, 2].map(
      (c) =>
        mask.reduce((sum, i) => sum + glass.added[i * 3 + c], 0) /
        Math.max(
          0.00000001,
          mask.reduce((sum, i) => sum + thin.added[i * 3 + c], 0),
        ),
    ),
    pixels: mask.length,
    coverage,
    errors,
  };
  await writeFile(
    info.outputPath('canopy-transmission.json'),
    JSON.stringify({ result, thin, thick, blocked, restored }, null, 2),
  );
  expect(result.thin).toBeGreaterThan(0.0005);
  expect(result.coverage).toBeGreaterThan(0.9);
  expect(result.blocked / result.thin).toBeLessThan(0.03);
  expect(result.thick / result.thin).toBeLessThan(0.65);
  expect(Math.abs(result.restored / result.thin - 1)).toBeLessThan(0.03);
  expect(result.glassTint[0]).toBeGreaterThan(result.glassTint[1] + 0.01);
  expect(result.glassTint[1]).toBeGreaterThan(result.glassTint[2] + 0.01);
  expect(result.glassTint[2]).toBeLessThan(0.9);
  for (const s of [thin, thick, blocked, restored, glass]) expect(s.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('a thin slab below an upper canopy blocks transmission and optical media update after removal', async ({
  page,
}, info) => {
  await setup(page);
  const thin = await sample(page),
    mask = litPixels(thin);
  await page.evaluate(async () => {
    const { worldToAxial } = await import('/src/core.js'),
      g = window.__hexwild,
      w = g.state.world,
      d = window.leafProbeDirection,
      cells = [];
    const a = worldToAxial(d[0] * 3, d[2] * 3),
      y = Math.floor(45.5 + d[1] * 3);
    for (let dq = -1; dq <= 1; dq++)
      for (let dr = -1; dr <= 1; dr++) {
        w.set(a.q + dq, y, a.r + dr, 'stoneSlab');
        w.setState(a.q + dq, y, a.r + dr, {
          facing: 0,
          upper: true,
          open: false,
        });
        cells.push([a.q + dq, y, a.r + dr]);
      }
    const b = worldToAxial(d[0] * 4.4, d[2] * 4.4),
      by = Math.floor(45.5 + d[1] * 4.4);
    w.set(b.q, by, b.r, 'leaves');
    cells.push([b.q, by, b.r]);
    window.leafProbeCells = cells;
    window.leafSlab = [a.q, y, a.r];
    g.graphics.updateCells(cells);
  });
  await fresh(page);
  const blocked = await sample(page),
    media = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        field = g.voxelLight;
      const read = (p) => g.dynamicLight.data[field.index(...p) * 4 + 3] & 15;
      return {
        leaf: read([0, 45, 0]),
        slab: read(window.leafSlab),
        waterHeight: window.__hexwild.state.world.fluids.height(0, 45, 0),
      };
    });
  expect(media).toEqual({ leaf: 12, slab: 13, waterHeight: 0 });
  expect(energy(blocked, mask) / energy(thin, mask)).toBeLessThan(0.03);
  await occluder(page, null);
  const restored = await sample(page);
  const clearedMedium = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return (
      g.dynamicLight.data[g.voxelLight.index(...window.leafSlab) * 4 + 3] & 15
    );
  });
  expect(clearedMedium).toBe(15);
  expect(
    Math.abs(energy(restored, mask) / energy(thin, mask) - 1),
  ).toBeLessThan(0.03);
  await writeFile(
    info.outputPath('partial-roof.json'),
    JSON.stringify(
      {
        media,
        thin: energy(thin, mask),
        blocked: energy(blocked, mask),
        restored: energy(restored, mask),
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: info.outputPath('restored-canopy.png') });
});

test('all three leaf materials follow actual cloud shadows, moonlight and a paused or advancing wind clock', async ({
  page,
}, info) => {
  await setup(page);
  const species = [];
  for (const id of ['leaves', 'birchLeaves', 'spruceLeaves']) {
    await page.evaluate((id) => {
      const g = window.__hexwild;
      g.state.world.set(0, 45, 0, id);
      g.graphics.updateCells([[0, 45, 0]]);
    }, id);
    await fresh(page);
    const s = await sample(page),
      mask = litPixels(s);
    expect(mask.length).toBeGreaterThan(30);
    expect(energy(s, mask)).toBeGreaterThan(0.0005);
    species.push({ id, energy: energy(s, mask), pixels: mask.length });
  }
  // Select a real three-layer cloud shadow at the leaf height, with native
  // weather and wind. The old 2D-density predictor no longer describes it.
  const cloudCandidates = [];
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ clouds: true }),
  );
  for (let day = 0; day < 16; day++) {
    const time = 120 + day * 600;
    await backlight(page, time);
    const shadow = await page.evaluate(async () => {
      const { probeCloudField } =
        await import('/tests/fixtures/cloud-field-probe.js');
      return probeCloudField(
        window.__hexwild.graphics,
        [[0, 45.5, 0]],
        null,
        45.5,
      ).density[3];
    });
    cloudCandidates.push({ time, shadow });
  }
  const cloudTime = cloudCandidates.reduce((a, b) =>
    a.shadow < b.shadow ? a : b,
  );
  await writeFile(
    info.outputPath('actual-cloud-selection.json'),
    JSON.stringify({ cloudTime, cloudCandidates }, null, 2),
  );
  expect(cloudTime.shadow).toBeLessThan(0.93);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ clouds: false }),
  );
  await backlight(page, cloudTime.time);
  const clear = await sample(page),
    mask = litPixels(clear);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ clouds: true }),
  );
  await frames(page);
  const cloudy = await sample(page),
    ratio = energy(cloudy, mask) / energy(clear, mask);
  expect(ratio).toBeLessThan(0.98);
  expect(ratio).toBeGreaterThan(0.1);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({ clouds: false }),
  );
  await frames(page);
  const restored = await sample(page);
  expect(
    Math.abs(energy(restored, mask) / energy(clear, mask) - 1),
  ).toBeLessThan(0.03);
  await backlight(page, 450);
  const moon = await sample(page),
    moonMask = litPixels(moon),
    moonEnergy = energy(moon, moonMask);
  expect(moonMask.length).toBeGreaterThan(30);
  expect(moonEnergy).toBeGreaterThan(0.00001);
  expect(moonEnergy).toBeLessThan(species[2].energy * 0.7);
  await frames(page, 5);
  const paused = await sample(page);
  expect(Math.abs(energy(paused, moonMask) / moonEnergy - 1)).toBeLessThan(
    0.03,
  );
  await backlight(page, 452);
  const advanced = await sample(page);
  expect(
    advanced.on.every((v) => Number.isFinite(DataUtils.fromHalfFloat(v))),
  ).toBe(true);
  expect(advanced.on.some((v, i) => v !== moon.on[i])).toBe(true);
  await page.screenshot({ path: info.outputPath('moonlit-leaves.png') });
  await writeFile(
    info.outputPath('species-clouds-moon-wind.json'),
    JSON.stringify(
      {
        species,
        cloudTime,
        cloudRatio: ratio,
        moonEnergy,
        pausedEnergy: energy(paused, moonMask),
        gl: [clear.gl, cloudy.gl, moon.gl, advanced.gl],
      },
      null,
      2,
    ),
  );
  for (const s of [clear, cloudy, moon, advanced]) expect(s.gl).toBe(0);
});

test('a real canopy and water capture survive quality, context restoration and dimension changes with voxel transport outside the shadow map', async ({
  page,
}, info) => {
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning' && warnings.length < 80) warnings.push(e.text());
  });
  await setup(page);
  await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [],
      { TREES } = await import('/src/wood-data.js');
    for (const [q, r, species] of [
      [-3, 0, 'oak'],
      [0, 2, 'birch'],
      [3, 0, 'spruce'],
    ]) {
      const { log, leaves: leaf } = TREES[species];
      for (let y = 40; y <= 44; y++) {
        w.set(q, y, r, log);
        cells.push([q, y, r]);
      }
      for (let dq = -1; dq <= 1; dq++)
        for (let dr = -1; dr <= 1; dr++)
          for (let y = 44; y <= 46; y++) {
            if (Math.abs(dq + dr) > 1) continue;
            w.set(q + dq, y, r + dr, leaf);
            cells.push([q + dq, y, r + dr]);
          }
    }
    for (let q = 1; q <= 4; q++)
      for (let r = 3; r <= 5; r++) w.fluids.source(q, 40, r, 'water');
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(2, 42, 7);
    g.lookAt(0, 44, 1);
    g.graphics.stepOffset = 0;
    g.graphics.renderer.shadowMap.needsUpdate = true;
  });
  await fresh(page);
  const states = [];
  for (const quality of [1.7, 1, 0.65, 1.7]) {
    await page.evaluate(
      (quality) => window.__hexwild.graphics.setQuality(quality),
      quality,
    );
    await frames(page, 5);
    const state = await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      return {
        quality: g.quality,
        leafLight: g.leafUniforms.leafSunColor.value.toArray(),
        textures: g.renderer.info.memory.textures,
        capture: g.fluidRenderer.waterUniforms.waterSceneReady.value,
        gl: g.renderer.getContext().getError(),
      };
    });
    states.push(state);
    expect(state.gl).toBe(0);
    if (quality < 1.7) expect(state.leafLight).toEqual([0, 0, 0]);
    else expect(state.capture).toBe(1);
  }
  await page.setViewportSize({ width: 800, height: 600 });
  await frames(page, 3);
  const capture = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      c = g.leafUniforms.leafSunColor.value,
      previous = c.clone(),
      renderer = g.renderer,
      old = renderer.getRenderTarget();
    const read = () => {
      g.composer.render(0);
      const t = g.composer.passes[0].opaque,
        data = new Uint16Array(t.width * t.height * 4);
      renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
      return Array.from(data);
    };
    try {
      const on = read();
      c.setRGB(0, 0, 0);
      const off = read();
      return {
        on,
        off,
        ready: g.fluidRenderer.waterUniforms.waterSceneReady.value,
      };
    } finally {
      c.copy(previous);
      g.composer.render(0);
      renderer.setRenderTarget(old);
    }
  });
  let transmitted = 0;
  for (let i = 0; i < capture.on.length; i += 4)
    if (
      Math.max(
        ...capture.on
          .slice(i, i + 3)
          .map(
            (v, c) =>
              DataUtils.fromHalfFloat(v) -
              DataUtils.fromHalfFloat(capture.off[i + c]),
          ),
      ) > 0.00002
    )
      transmitted++;
  expect(transmitted).toBeGreaterThan(30);
  expect(capture.ready).toBe(1);
  await page.screenshot({ path: info.outputPath('canopy-and-water.png') });
  const supported = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      e = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!e) return false;
    window.leafContextRestored = false;
    g.renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => (window.leafContextRestored = true),
      { once: true },
    );
    window.restoreLeafContext = () => e.restoreContext();
    e.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreLeafContext());
  await expect
    .poll(() => page.evaluate(() => window.leafContextRestored), {
      timeout: 30000,
    })
    .toBe(true);
  await frames(page, 8);
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.camera.position.set(50, 45.5, 50);
    window.__hexwild.lookAt(0, 45.5, 0);
    g.camera.updateMatrixWorld();
    g.renderer.shadowMap.needsUpdate = true;
  });
  await frames(page);
  const visibleLeaf = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      ray = g.ray,
      far = ray.far;
    try {
      ray.far = 220;
      ray.setFromCamera({ x: 0, y: 0 }, g.camera);
      return ray
        .intersectObjects(g.terrain.children, true)
        .some((h) => h.object.material === g.leafMaterials.material);
    } finally {
      ray.far = far;
    }
  });
  expect(visibleLeaf).toBe(true);
  const outside = await sample(page);
  expect(Math.max(...outside.added)).toBeGreaterThan(0.00002);
  await page.evaluate(() => window.__hexwild.travel('nether'));
  await frames(page, 5);
  const netherGl = await page.evaluate(() =>
    window.__hexwild.graphics.renderer.getContext().getError(),
  );
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.leafUniforms.leafSunColor.value.toArray(),
    ),
  ).toEqual([0, 0, 0]);
  await page.evaluate(() => window.__hexwild.travel('overworld'));
  await frames(page, 5);
  const finalGl = await page.evaluate(() =>
    window.__hexwild.graphics.renderer.getContext().getError(),
  );
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      e = g.renderer.getContext().getExtension('WEBGL_lose_context');
    window.leafContextRestored = false;
    g.renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => (window.leafContextRestored = true),
      { once: true },
    );
    window.restoreLeafContext = () => e.restoreContext();
    e.loseContext();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreLeafContext());
  await expect
    .poll(() => page.evaluate(() => window.leafContextRestored), {
      timeout: 30000,
    })
    .toBe(true);
  await frames(page, 8);
  await page.evaluate(() => window.__hexwild.travel('end'));
  await frames(page, 5);
  const secondRestorationGl = await page.evaluate(() =>
    window.__hexwild.graphics.renderer.getContext().getError(),
  );
  await writeFile(
    info.outputPath('canopy-lifecycle.json'),
    JSON.stringify(
      {
        states,
        waterCaptureTransmittingPixels: transmitted,
        contextRestored: true,
        outsideMapMax: Math.max(...outside.added),
        errors,
        warnings,
        finalGl,
        outsideMapGl: outside.gl,
        netherGl,
        secondRestorationGl,
      },
      null,
      2,
    ),
  );
  expect(outside.gl).toBe(0);
  expect(netherGl).toBe(0);
  expect(finalGl).toBe(0);
  expect(secondRestorationGl).toBe(0);
  expect(errors).toEqual([]);
});
