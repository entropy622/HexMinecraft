import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { DataUtils } from 'three';

test.setTimeout(240000);
test('a survival player crafts blue dye and eight stained glass through real inventory and workbench UI', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -4; q <= 4; q++)
      for (let r = -4; r <= 4; r++) {
        g.state.world.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) g.state.world.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.state.world.set(0, 40, 0, 'workbench');
    cells.push([0, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-2, 40, 0);
    g.give('lapis', 1);
    g.give('glass', 8);
  });
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('蓝色染料');
  const dye = page.locator('[data-recipe]').filter({ hasText: /^蓝色染料/ });
  await expect(dye).toBeVisible();
  await dye.click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.blueDye),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.lapis || 0),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.lookAt(0, 40.5, 0));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('workbench');
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
  await page.locator('#recipe-search').fill('蓝色染色玻璃');
  await page
    .locator('[data-recipe]')
    .filter({ hasText: /^蓝色染色玻璃/ })
    .click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  const stock = await page.evaluate(() => {
    const g = window.__hexwild;
    return {
      glass: g.state.inventory.glass || 0,
      dye: g.state.inventory.blueDye || 0,
      blue: g.state.inventory.blueStainedGlass || 0,
    };
  });
  expect(stock).toEqual({ glass: 0, dye: 0, blue: 8 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('blueStainedGlass');
    g.lookAt(-1, 39.9, 1);
  });
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /蓝色染色玻璃/,
  );
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('stone');
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 1)),
    )
    .toBe('blueStainedGlass');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(-1, 40, 1)),
  ).toBe('blueStainedGlass');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.inventory.blueStainedGlass,
    ),
  ).toBe(7);
  await page.screenshot({ path: info.outputPath('crafted-blue-glass.png') });
  await writeFile(
    info.outputPath('blue-glass-crafting.json'),
    JSON.stringify(
      {
        spent: { lapis: 1, glass: 8 },
        produced: 8,
        placed: 1,
        remaining: 7,
        continued: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
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
async function pointer(page, button, down) {
  await page.evaluate(
    ({ button, down }) =>
      document.querySelector('#world').dispatchEvent(
        new MouseEvent(down ? 'mousedown' : 'mouseup', {
          button,
          bubbles: true,
        }),
      ),
    { button, down },
  );
}

test('real harvesting supplies red dye and removing cactus sand drops the complete unsupported column', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => window.__hexwild.graphics.setQuality(1.7));
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 4; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 38, r, 'stone');
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(0, 39, 0, 'grass');
    w.set(0, 40, 0, 'poppy');
    w.set(2, 39, 0, 'sand');
    for (let y = 40; y <= 42; y++) {
      w.set(2, y, 0, 'cactus');
      cells.push([2, y, 0]);
    }
    cells.push([0, 39, 0], [0, 40, 0], [2, 39, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-2, 40, 0);
    g.lookAt(0, 40.45, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('poppy');
  const cutout = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      pass = g.composer.passes[0],
      target = pass.target,
      renderer = g.renderer,
      previous = renderer.getRenderTarget();
    let flower;
    g.terrain.traverse((o) => {
      const p = o.userData.shaped;
      if (p?.q === 0 && p.y === 40 && p.r === 0) flower = o;
    });
    const read = () => {
      pass.beauty.render(renderer, null, target);
      return [
        [0, 40.15, 0.26],
        [0, 40.65, 0],
      ].map(([x, y, z]) => {
        const p = g.camera.position.clone().set(x, y, z).project(g.camera),
          pixels = new Uint16Array(3 * 3 * 4);
        renderer.readRenderTargetPixels(
          target,
          Math.round((p.x * 0.5 + 0.5) * target.width) - 1,
          Math.round((p.y * 0.5 + 0.5) * target.height) - 1,
          3,
          3,
          pixels,
        );
        return Array.from(pixels);
      });
    };
    try {
      const visible = read();
      flower.visible = false;
      return {
        visible,
        background: read(),
        gl: renderer.getContext().getError(),
      };
    } finally {
      flower.visible = true;
      read();
      renderer.setRenderTarget(previous);
    }
  });
  const difference = cutout.visible.map(
    (pixels, sample) =>
      pixels.reduce(
        (sum, value, i) =>
          sum +
          (i % 4 === 3
            ? 0
            : Math.abs(
                DataUtils.fromHalfFloat(value) -
                  DataUtils.fromHalfFloat(cutout.background[sample][i]),
              )),
        0,
      ) / 27,
  );
  await writeFile(
    info.outputPath('flower-cutout.json'),
    JSON.stringify(
      {
        transparentRegionDifference: difference[0],
        petalDifference: difference[1],
        gl: cutout.gl,
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: info.outputPath('pigment-plants.png') });
  expect(cutout.gl).toBe(0);
  expect(difference[0]).toBeLessThan(0.02);
  expect(difference[1]).toBeGreaterThan(0.04);
  await pointer(page, 0, true);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0) || null),
    )
    .toBe(null);
  await pointer(page, 0, false);
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 0));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.poppy || 0),
    )
    .toBe(1);
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('红色染料');
  await page
    .locator('[data-recipe]')
    .filter({ hasText: /^红色染料/ })
    .click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redDye),
  ).toBe(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(3, 40, 2);
    g.lookAt(2.47, 39.99, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.y, t.r || 0, t.type];
      }),
    )
    .toEqual([2, 39, 0, 'sand']);
  await pointer(page, 0, true);
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.world.get(2, 39, 0) || null),
      { timeout: 15000 },
    )
    .toBe(null);
  await pointer(page, 0, false);
  expect(
    await page.evaluate(() =>
      [40, 41, 42].map(
        (y) => window.__hexwild.state.world.get(2, y, 0) || null,
      ),
    ),
  ).toEqual([null, null, null]);
  await page.evaluate(() => window.__hexwild.teleport(2, 40, 0));
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.state.inventory.cactus || 0),
      { timeout: 15000 },
    )
    .toBe(3);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('pigment-harvest.json'),
    JSON.stringify(
      {
        harvestedPoppy: 1,
        redDye: 1,
        unsupportedCactus: 3,
        collectedCactus: 3,
        errors,
      },
      null,
      2,
    ),
  );
});

test('an actual fishing cast and timely reel preserve ten ink sacs through the game callback and dye crafting', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 720, height: 540 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -8; q <= 8; q++)
      for (let r = -8; r <= 8; r++) {
        w.set(q, 37, r, 'stone');
        for (let y = 38; y <= 45; y++) w.set(q, y, r, null);
        if (Math.max(Math.abs(q), Math.abs(r)) === 8)
          for (let y = 38; y <= 40; y++) w.set(q, y, r, 'stone');
        else {
          w.fluids.source(q, 38, r, 'water');
          w.fluids.source(q, 39, r, 'water');
        }
        cells.push([q, 37, r], [q, 39, r]);
      }
    w.set(0, 39, 5, 'stone');
    cells.push([0, 39, 5]);
    g.graphics.updateCells(cells);
    g.fluidStep(2);
    g.teleport(0, 40, 5);
    g.give('fishingRod', 1);
    g.selectItem('fishingRod');
    g.lookAt(0, 39.7, 0);
  });
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /鱼竿/,
  );
  await frames(page);
  await pointer(page, 2, true);
  await pointer(page, 2, false);
  await expect(page.locator('#combat-status')).toContainText('咬钩了', {
    timeout: 120000,
  });
  // Randomness is an external boundary. Only the synchronous real reel input
  // uses this deterministic draw; no owned fishing function or phase is patched.
  await page.evaluate(() => {
    const original = Math.random;
    try {
      Math.random = () => 0.995;
      const canvas = document.querySelector('#world');
      for (const type of ['mousedown', 'mouseup'])
        canvas.dispatchEvent(
          new MouseEvent(type, { button: 2, bubbles: true }),
        );
    } finally {
      Math.random = original;
    }
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.inkSac || 0),
    )
    .toBe(10);
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('黑色染料');
  await page
    .locator('[data-recipe]')
    .filter({ hasText: /^黑色染料/ })
    .click({ modifiers: ['Shift'] });
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.blackDye),
  ).toBe(10);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.inkSac || 0),
  ).toBe(0);
  await page.screenshot({ path: info.outputPath('ink-sac-dye.png') });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('ink-sac-conservation.json'),
    JSON.stringify(
      { caught: 10, spent: 10, blackDye: 10, realCastAndReel: true, errors },
      null,
      2,
    ),
  );
});

// The same UI-only scenario runs against vite preview, without __hexwild.
test('real UI lists sixteen stained colors and places selected red glass in light effects', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.keyboard.press('KeyE');
  await page.locator('#creative-search').fill('染色玻璃');
  await expect(page.locator('[data-creative-item]:visible')).toHaveCount(16);
  await page.locator('[data-creative-item="redStainedGlass"]').click();
  await page.locator('[data-inv-slot="pack:0"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /红色染色玻璃/,
  );
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementY: 500, bubbles: true }),
    ),
  );
  await frames(page, 4);
  await pointer(page, 2, true);
  await pointer(page, 2, false);
  await frames(page, 5);
  await expect(page.locator('#target')).toContainText('红色染色玻璃');
  const runtime = await page.evaluate(() => ({
    developmentFixture: typeof window.__hexwild !== 'undefined',
    origin: location.origin,
    gl: document.querySelector('#world').getContext('webgl2').getError(),
  }));
  await page.screenshot({ path: info.outputPath('shipped-red-glass.png') });
  await writeFile(
    info.outputPath('stained-production-runtime.json'),
    JSON.stringify({ ...runtime, colorsInPalette: 16, errors }, null, 2),
  );
  expect(runtime.gl).toBe(0);
  expect(errors).toEqual([]);
});
