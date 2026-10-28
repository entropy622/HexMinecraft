import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { World } from '../src/world.js';
import { axialToWorld, RECIPES } from '../src/core.js';

test.setTimeout(240000);
const diagnostics = new WeakMap();
test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const state = await page
    .evaluate(() => {
      const g = window.__hexwild;
      if (!g) return { game: false };
      g.save();
      const saved = JSON.parse(localStorage.getItem('hexwild-save-v16')),
        gl = g.graphics.renderer.getContext(),
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        time: g.state.time,
        position: g.state.position,
        health: g.state.health,
        playing: g.state.playing,
        target: g.state.target && {
          q: g.state.target.q,
          y: g.state.target.y,
          r: g.state.target.r,
          type: g.state.target.type,
          place: g.state.target.place,
        },
        stem: [39, 40, 41].map((y) => g.state.world.get(4, y, 4) || null),
        flower: g.state.world.get(8, 6, 0) || null,
        flowerAge: g.state.world.state(8, 5, 0).age,
        drops: saved.dimensions.overworld.drops,
        fauna: saved.dimensions.overworld.fauna,
        gl: gl.getError(),
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    })
    .catch((error) => ({ error: error.message }));
  await writeFile(
    info.outputPath('diagnostics.json'),
    JSON.stringify(
      { status: info.status, ...diagnostics.get(page), state },
      null,
      2,
    ),
  );
});
test('a survival cactus garden grows, stings real bodies, destroys thrown items, and yields flower dye', async ({
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
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  const saved = await page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
  const w = new World(saved.seed, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  w.ensureAround(4, 4, 1);
  for (let q = 0; q <= 12; q++)
    for (let r = -2; r <= 7; r++) {
      w.set(q, 38, r, 'stone');
      for (let y = 39; y <= 45; y++) w.set(q, y, r, null);
    }
  w.set(4, 37, 4, 'stone');
  w.set(4, 38, 4, 'sand');
  w.set(4, 39, 4, 'cactus');
  // Randomness is the host boundary. A constant .61 chooses local (4,39,4)
  // in every loaded chunk; it does not grant a product-only growth control.
  w.setState(4, 39, 4, { facing: 0, open: false, age: 0 });
  for (let q = 6; q <= 11; q++)
    for (let r = -1; r <= 2; r++) {
      w.set(q, 4, r, 'stone');
      for (let y = 5; y <= 39; y++) w.set(q, y, r, null);
    }
  w.set(8, 3, 0, 'stone');
  w.set(8, 4, 0, 'sand');
  w.set(8, 5, 0, 'cactus');
  w.setState(8, 5, 0, { facing: 0, open: false, age: 8 });
  const sheepPoint = axialToWorld(8, 0),
    fauna = saved.dimensions.overworld.fauna;
  const sheep = {
    ...fauna.mobs[0],
    kind: 'sheep',
    position: [sheepPoint.x, 5.9375, sheepPoint.z],
    hp: 8,
    baby: 0,
    wool: 0,
    love: 0,
    cooldown: 0,
  };
  saved.dimensions.overworld = {
    ...saved.dimensions.overworld,
    ...w.serialize(),
    fauna: { ...fauna, mobs: [sheep] },
  };
  const playerPoint = axialToWorld(2, 4);
  saved.position = [playerPoint.x, 40.65, playerPoint.z];
  saved.time = 100;
  saved.health = 20;
  await page.evaluate(() => {
    Math.random = () => 0.61;
  });
  await page.locator('#save-file').setInputFiles({
    name: 'cactus-garden.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  const cell = (q, y, r) =>
    page.evaluate(
      ([q, y, r]) => window.__hexwild.state.world.get(q, y, r) || null,
      [q, y, r],
    );
  await expect.poll(() => cell(4, 40, 4), { timeout: 30000 }).toBe('cactus');
  expect(await cell(4, 41, 4)).toBe(null);
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.__hexwild.save();
        return JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
          .overworld.fauna.mobs[0]?.hp;
      }),
    )
    .toBeLessThan(8);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const pausedTime = await page.evaluate(() => window.__hexwild.state.time);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(
    pausedTime,
  );
  await page.locator('#resume').click();

  const topHealth = await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(4, 41, 4);
    return g.state.health;
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health), {
      timeout: 10000,
    })
    .toBeLessThan(topHealth);
  const contactCause = await page.locator('#damage').getAttribute('data-cause');
  expect(contactCause).toBe('cactus');
  await page.evaluate(() => window.__hexwild.lookAt(4, 40.95, 4));
  await page.screenshot({ path: info.outputPath('cactus-top-contact.png') });

  const sideHealth = await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(3, 39, 4);
    g.lookAt(4, 40.3, 4);
    return g.state.health;
  });
  await page.keyboard.down('KeyW');
  try {
    await expect
      .poll(() => page.evaluate(() => window.__hexwild.state.health), {
        timeout: 10000,
      })
      .toBeLessThan(sideHealth);
  } finally {
    await page.keyboard.up('KeyW');
  }
  expect(await page.locator('#damage').getAttribute('data-cause')).toBe(
    'cactus',
  );
  await page.screenshot({ path: info.outputPath('cactus-side-contact.png') });

  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(3, 39, 4);
    g.give('diamond', 1);
    g.lookAt(4, 40.4, 4);
  });
  await page.keyboard.press('KeyE');
  await page
    .locator('#craft-overlay [data-inv-slot][aria-label^="钻石"]')
    .hover();
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /钻石/,
  );
  await page.keyboard.press('KeyQ');
  const thrownStock = await page.evaluate(
    () => window.__hexwild.state.inventory.diamond || 0,
  );
  expect(thrownStock).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.__hexwild.save();
        return JSON.parse(
          localStorage.getItem('hexwild-save-v16'),
        ).dimensions.overworld.drops.filter((d) => d.item === 'diamond').length;
      }),
    )
    .toBe(0);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.diamond || 0),
  ).toBe(0);
  await page.evaluate(() => window.__hexwild.lookAt(4, 39.25, 4));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('cactus');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  try {
    await expect.poll(() => cell(4, 39, 4)).toBe(null);
  } finally {
    await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  }
  await expect.poll(() => cell(4, 40, 4)).toBe(null);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cactus || 0),
    )
    .toBe(2);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('cactus');
    g.lookAt(4, 38.99, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const p = window.__hexwild.state.target?.place;
        return p && [p.q, p.y, p.r];
      }),
    )
    .toEqual([4, 39, 4]);
  for (const type of ['mousedown', 'mouseup'])
    await page.locator('#world').dispatchEvent(type, { button: 2 });
  await expect.poll(() => cell(4, 39, 4)).toBe('cactus');

  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(7, 5, 0);
    g.lookAt(8, 5.7, 0);
    Math.random = () => 0.09;
  });
  await expect
    .poll(() => cell(8, 6, 0), { timeout: 30000 })
    .toBe('cactusFlower');
  await page.screenshot({ path: info.outputPath('cactus-flower.png') });
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(await cell(8, 6, 0)).toBe('cactusFlower');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.state(8, 5, 0).age),
  ).toBe(9);
  // Break the supporting stem, then pick up both real falling entities. Leaving
  // the flower on a live cactus can naturally destroy its dropped item.
  await page.evaluate(() => window.__hexwild.lookAt(8, 5.25, 0));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('cactus');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  try {
    await expect.poll(() => cell(8, 5, 0)).toBe(null);
  } finally {
    await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  }
  await expect.poll(() => cell(8, 6, 0)).toBe(null);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cactusFlower || 0),
    )
    .toBe(1);
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('粉红色染料');
  const flowerRecipe = RECIPES.findIndex(
    (recipe) => recipe.cost.cactusFlower === 1,
  );
  await page.locator(`[data-recipe="${flowerRecipe}"]`).click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  await page.screenshot({ path: info.outputPath('cactus-flower-dye.png') });
  const manifest = await page.evaluate((contactCause) => {
    const g = window.__hexwild;
    const gl = g.graphics.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      planted: g.state.world.get(4, 39, 4),
      flowerHarvested: !g.state.world.get(8, 6, 0),
      flowerStock: g.state.inventory.cactusFlower || 0,
      pinkDye: g.state.inventory.pinkDye || 0,
      destroyedDiamond: (g.state.inventory.diamond || 0) === 0,
      damageCause: contactCause,
      gl: gl.getError(),
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  }, contactCause);
  expect(manifest.planted).toBe('cactus');
  expect(manifest.flowerHarvested).toBe(true);
  expect(manifest.flowerStock).toBe(0);
  expect(manifest.pinkDye).toBe(1);
  expect(manifest.destroyedDiamond).toBe(true);
  expect(manifest.damageCause).toBe('cactus');
  expect(manifest.gl).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('cactus-ecology.json'),
    JSON.stringify(
      { ...manifest, paused: true, continued: true, errors, warnings },
      null,
      2,
    ),
  );
});
