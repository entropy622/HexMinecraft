import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { World } from '../src/world.js';
import { DIRECTIONS } from '../src/core.js';

test.setTimeout(180000);
const diagnostics = new WeakMap();
test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const state = await page
    .evaluate(() => {
      const g = window.__hexwild;
      if (!g) return { game: false };
      g.save();
      const gl = g.graphics.renderer.getContext(),
        ext = gl.getExtension('WEBGL_debug_renderer_info'),
        t = g.state.target;
      return {
        playing: g.state.playing,
        position: g.state.position,
        target: t && { q: t.q, y: t.y, r: t.r, type: t.type, place: t.place },
        pod: g.state.world.get(5, 40, 4) || null,
        stage: g.state.world.state(5, 40, 4),
        inventory: {
          cocoaBeans: g.state.inventory.cocoaBeans,
          boneMeal: g.state.inventory.boneMeal,
        },
        renderer: gl.getParameter(
          ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
        ),
        gl: gl.getError(),
        save: JSON.parse(localStorage.getItem('hexwild-save-v16')),
      };
    })
    .catch((error) => ({ error: error.message }));
  await writeFile(
    info.outputPath('diagnostics.json'),
    JSON.stringify({ state, ...diagnostics.get(page) }, null, 2),
  );
});

const cell = (page, q, y, r) =>
  page.evaluate(
    ([q, y, r]) => window.__hexwild.state.world.get(q, y, r) || null,
    [q, y, r],
  );
const logFace = (page) =>
  page.evaluate(() => {
    const t = window.__hexwild.state.target;
    return t && [t.q, t.y, t.r, t.type, t.place.q, t.place.y, t.place.r];
  });
async function click(page, button = 2) {
  for (const type of ['mousedown', 'mouseup'])
    await page.locator('#world').dispatchEvent(type, { button });
}
async function mine(page, q, y, r, type = 'cocoa') {
  await page.evaluate(
    ([q, y, r, type]) => {
      const g = window.__hexwild;
      if (type === 'cocoa') {
        const directions = [
            [1, 0],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [0, -1],
            [1, -1],
          ],
          [dq, dr] = directions[g.state.world.state(q, y, r).facing];
        g.lookAt(q + dq * 0.35, y + 0.5, r + dr * 0.35);
      } else g.lookAt(q, y + 0.5, r);
    },
    [q, y, r, type],
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.y, t.r, t.type];
      }),
    )
    .toEqual([q, y, r, type]);
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  try {
    await expect.poll(() => cell(page, q, y, r)).toBe(null);
  } finally {
    await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  }
}

test('explore a jungle, harvest and replant cocoa with inventory costs, stages and persistence', async ({
  page,
}, info) => {
  const errors = [];
  const warnings = [];
  diagnostics.set(page, { errors, warnings });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  const seed = await page.evaluate(() => window.__hexwild.state.world.seed);
  const world = new World(seed, 'overworld', { load: false });
  let jungle;
  for (let q = -220; q <= 220 && !jungle; q += 8)
    for (let r = -220; r <= 220 && !jungle; r += 8) {
      if (world.biome(q, r) !== '丛林') continue;
      world.ensureAround(q, r, 1);
      for (const [k, type] of world.blocks) {
        if (type !== 'cocoa') continue;
        const p = k.split(',').map(Number),
          [a, y, c] = p,
          [dq, dr] = DIRECTIONS[world.state(...p).facing],
          view = [
            a - dq * 2,
            world.terrainHeight(a - dq * 2, c - dr * 2),
            c - dr * 2,
          ];
        if (
          Math.abs(view[1] - y) > 2 ||
          world.biome(view[0], view[2]) !== '丛林' ||
          world.get(view[0], view[1], view[2]) ||
          world.get(a - dq, y, c - dr)
        )
          continue;
        jungle = { pod: p, trunk: [a + dq, y, c + dr], view };
        break;
      }
    }
  expect(jungle).toBeTruthy();
  await page.evaluate(({ view, pod: [q, y, r] }) => {
    const g = window.__hexwild;
    g.teleport(...view);
    g.lookAt(q, y + 0.5, r);
  }, jungle);
  expect(
    await page.evaluate(
      ({ view }) => window.__hexwild.state.world.biome(view[0], view[2]),
      jungle,
    ),
  ).toBe('丛林');
  await page.screenshot({ path: info.outputPath('natural-jungle.png') });
  await page.evaluate(({ trunk: [q, y, r] }) => {
    const g = window.__hexwild,
      w = g.state.world;
    g.teleport(
      q + 12,
      Math.max(w.surface(q + 12, r + 4), w.surface(q, r)) + 10,
      r + 4,
    );
    g.lookAt(q, w.surface(q, r) - 2, r);
  }, jungle);
  await page.screenshot({ path: info.outputPath('jungle-canopy.png') });
  await page.evaluate((p) => window.__hexwild.teleport(...p), jungle.view);
  const before = await page.evaluate(
    () => window.__hexwild.state.inventory.cocoaBeans || 0,
  );
  await mine(page, ...jungle.pod);
  await page.evaluate(
    ([q, y, r]) => window.__hexwild.teleport(q, y, r),
    jungle.pod,
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans || 0),
    )
    .toBeGreaterThan(before);
  await page.evaluate((p) => window.__hexwild.teleport(...p), jungle.view);
  await mine(page, ...jungle.trunk, 'jungleWood');
  await page.evaluate((p) => window.__hexwild.teleport(...p), jungle.trunk);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.jungleWood || 0),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('丛林木板');
  await page
    .locator('[data-recipe].can-fill')
    .filter({ hasText: /^丛林木板/ })
    .click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.junglePlanks),
  ).toBe(4);
  await page.locator('#craft-overlay [data-close]').click();

  // A constructed farm is a normal player save, with no special product mode.
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const cells = [];
    g.teleport(4, 40, 4);
    for (let q = 0; q <= 7; q++)
      for (let r = 0; r <= 7; r++) {
        w.set(q, 39, r, 'stone');
        cells.push([q, 39, r]);
        for (let y = 40; y <= 44; y++) {
          w.set(q, y, r, null);
          cells.push([q, y, r]);
        }
      }
    w.set(4, 40, 4, 'jungleWood');
    w.set(5, 40, 5, 'observer');
    w.setState(5, 40, 5, { facing: 4, open: false, powered: false });
    w.set(5, 40, 6, 'redstoneLamp');
    g.graphics.updateCells(cells);
    g.give('boneMeal', 3);
    g.selectItem('cocoaBeans');
    g.teleport(6, 40, 4);
    g.lookAt(4, 40.25, 4);
  });
  await expect
    .poll(() => logFace(page))
    .toEqual([4, 40, 4, 'jungleWood', 5, 40, 4]);
  const stock = await page.evaluate(
    () => window.__hexwild.state.inventory.cocoaBeans,
  );
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(4.7, 40, 4);
    g.lookAt(4, 39, 4);
  });
  await expect
    .poll(() => logFace(page))
    .toEqual([4, 40, 4, 'jungleWood', 5, 40, 4]);
  await click(page);
  expect(await cell(page, 5, 40, 4)).toBe(null);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans),
  ).toBe(stock);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(6, 40, 4);
    g.lookAt(4, 40.25, 4);
  });
  await expect
    .poll(() => logFace(page))
    .toEqual([4, 40, 4, 'jungleWood', 5, 40, 4]);
  await click(page);
  await expect.poll(() => cell(page, 5, 40, 4)).toBe('cocoa');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans),
  ).toBe(stock - 1);
  await page.screenshot({ path: info.outputPath('cocoa-stage-0.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('boneMeal');
    g.lookAt(4.65, 40.5, 4);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('cocoa');
  for (const age of [1, 2]) {
    const pulse = page.waitForFunction(
      () => {
        const w = window.__hexwild.state.world;
        return w.state(5, 40, 5).powered && w.state(5, 40, 6).powered;
      },
      null,
      { polling: 'raf' },
    );
    await click(page);
    await expect
      .poll(() =>
        page.evaluate(() => window.__hexwild.state.world.state(5, 40, 4).age),
      )
      .toBe(age);
    await pulse;
    await page.screenshot({ path: info.outputPath(`cocoa-stage-${age}.png`) });
    await page.waitForTimeout(200);
    if (age === 1) {
      await page.keyboard.press('Escape');
      const paused = await page.evaluate(() => window.__hexwild.state.time);
      await expect(page.locator('#pause-overlay')).toBeVisible();
      await page.waitForTimeout(1200);
      expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(
        paused,
      );
      expect(
        await page.evaluate(
          () => window.__hexwild.state.world.state(5, 40, 4).age,
        ),
      ).toBe(1);
      await page.locator('#resume').click();
    }
  }
  const meal = await page.evaluate(
    () => window.__hexwild.state.inventory.boneMeal || 0,
  );
  await click(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.boneMeal || 0),
  ).toBe(meal);
  expect(meal).toBe(1);
  const streamed = await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(180, 45, 180);
    return !g.state.world.loaded(5, 4);
  });
  expect(streamed).toBe(true);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__hexwild.teleport(6, 40, 4));
  expect(
    await page.evaluate(() => window.__hexwild.state.world.state(5, 40, 4).age),
  ).toBe(2);
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(await cell(page, 5, 40, 4)).toBe('cocoa');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.state(5, 40, 4).age),
  ).toBe(2);
  await mine(page, 5, 40, 4);
  await page.evaluate(() => window.__hexwild.teleport(5, 40, 4));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans),
    )
    .toBe(stock + 2);
  const replant = async () => {
    await page.evaluate(() => {
      const g = window.__hexwild;
      g.selectItem('cocoaBeans');
      g.teleport(6, 40, 4);
      g.lookAt(4, 40.25, 4);
    });
    await expect
      .poll(() => logFace(page))
      .toEqual([4, 40, 4, 'jungleWood', 5, 40, 4]);
    await click(page);
    await expect.poll(() => cell(page, 5, 40, 4)).toBe('cocoa');
    expect(
      await page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans),
    ).toBe(stock + 1);
  };
  await replant();
  await mine(page, 5, 40, 4);
  await page.evaluate(() => window.__hexwild.teleport(5, 40, 4));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans),
    )
    .toBe(stock + 2);
  await replant();
  await page.evaluate(() => window.__hexwild.teleport(4, 40, 6));
  await mine(page, 4, 40, 4, 'jungleWood');
  await expect.poll(() => cell(page, 5, 40, 4)).toBe(null);
  await page.evaluate(() => window.__hexwild.teleport(5, 40, 4));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cocoaBeans),
    )
    .toBe(stock + 2);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(4, 40, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.jungleWood || 0),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('jungleWood');
    g.teleport(6, 40, 4);
    g.lookAt(4, 39.99, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const p = window.__hexwild.state.target?.place;
        return p && [p.q, p.y, p.r];
      }),
    )
    .toEqual([4, 40, 4]);
  await click(page);
  await expect.poll(() => cell(page, 4, 40, 4)).toBe('jungleWood');
  await replant();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('waterBucket', 1);
    g.selectItem('waterBucket');
    g.lookAt(5, 39.99, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const p = window.__hexwild.state.target?.place;
        return p && [p.q, p.y, p.r];
      }),
    )
    .toEqual([5, 40, 4]);
  await click(page);
  await expect.poll(() => cell(page, 5, 40, 4)).toBe(null);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.inventory.waterBucket || 0,
    ),
  ).toBe(0);
  await page.screenshot({ path: info.outputPath('water-harvest.png') });
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild,
      gl = g.graphics.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    g.save();
    return {
      harvested: g.state.inventory.cocoaBeans,
      pod: g.state.world.get(5, 40, 4) || null,
      version: JSON.parse(localStorage.getItem('hexwild-save-v16')).version,
      renderer: gl.getParameter(
        ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
      gl: gl.getError(),
    };
  });
  expect(manifest.gl).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('jungle-cocoa.json'),
    JSON.stringify(
      {
        naturalPod: true,
        naturalJungleLog: true,
        craftedPlanks: 4,
        observerPoweredLamp: true,
        occupiedPlacementPreservedBean: true,
        immatureBeanRefund: true,
        supportRemoval: true,
        waterHarvest: true,
        streamed,
        stages: [0, 1, 2],
        continued: true,
        ...manifest,
        errors,
      },
      null,
      2,
    ),
  );
});
