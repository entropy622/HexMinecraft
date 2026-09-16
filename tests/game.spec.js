import { test, expect } from '@playwright/test';
test('landing, survival movement, crafting, save round-trip and map', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#start')).toBeVisible();
  await page.screenshot({ path: 'test-results/landing.png' });
  await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/survival.png' });
  const before = await page.evaluate(() => window.__hexwild.state.position);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__hexwild.state.position);
  expect(
    Math.hypot(after[0] - before[0], after[2] - before[2]),
  ).toBeGreaterThan(0.1);
  await page.keyboard.press('KeyB');
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.evaluate(() => {
    window.__hexwild.give('wood', 20);
    window.__hexwild.selectRecipe(0);
  });
  await page.locator('#craft-button').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.planks),
  ).toBe(8);
  await page.locator('[data-recipe="2"]').click();
  await page.locator('#craft-button').click();
  expect(await page.evaluate(() => window.__hexwild.state.tool)).toBe(1);
  await page.screenshot({ path: 'test-results/crafting.png' });
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(await page.evaluate(() => window.__hexwild.state.tool)).toBe(1);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.planks),
  ).toBe(5);
  await page.keyboard.press('KeyM');
  await expect(page.locator('#map-overlay')).toBeVisible();
  await page.screenshot({ path: 'test-results/map.png' });
  expect(errors).toEqual([]);
});
test('farming, food and beacon victory', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('hoe', 1);
    g.give('seed', 3);
    const w = g.state.world;
    g.setTarget({ q: 0, y: w.surface(0, 0) - 1, r: 0, type: 'grass' });
    g.interact();
    g.setTarget({ q: 0, y: w.surface(0, 0) - 1, r: 0, type: 'farmland' });
    g.interact();
    g.step(91);
    g.interact();
  });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.wheat),
  ).toBe(2);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.damage(5);
    g.give('bread', 2);
    g.eat();
  });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.bread),
  ).toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('crystal', 9);
    g.give('stone', 18);
    for (const b of g.state.world.beacons) {
      g.teleport(b.q, b.y, b.r);
      g.setPlaying(true);
      g.interact();
    }
  });
  expect(
    await page.evaluate(() => window.__hexwild.state.activated.length),
  ).toBe(3);
  await expect(page.locator('#station-title')).toHaveText('初光，终于回来了。');
});

test('real ray mining, block placement, player collision and edit persistence', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#start').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('wood');
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.inventory.wood || 0))
    .toBeGreaterThan(0);
  await page.mouse.up();
  const result = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      h = w.surface(0, 0),
      before = g.state.inventory.dirt;
    g.setTarget({ place: { q: 0, y: h, r: 0 } });
    g.place();
    const selfBlocked = !w.get(0, h, 0) && g.state.inventory.dirt === before;
    const y = w.surface(-2, 0);
    g.setTarget({ place: { q: -2, y, r: 0 } });
    g.place();
    g.save();
    return {
      selfBlocked,
      type: w.get(-2, y, 0),
      remaining: g.state.inventory.dirt,
      y,
    };
  });
  expect(result.selfBlocked).toBe(true);
  expect(result.type).toBe('dirt');
  expect(result.remaining).toBe(11);
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(
      (y) => window.__hexwild.state.world.get(-2, y, 0),
      result.y,
    ),
  ).toBe('dirt');
});

test('workbench progression, chest transfer, smelting and interrupted job refund', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('stone', 10);
    g.give('wood', 10);
    g.setTool(1);
    g.open('#craft-overlay');
    g.selectRecipe(3);
  });
  await expect(page.locator('#craft-button')).toBeDisabled();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(
      1,
      Math.floor(g.state.position[1] - 1.65),
      0,
      'workbench',
    );
    g.selectRecipe(3);
  });
  await page.locator('#craft-button').click();
  expect(await page.evaluate(() => window.__hexwild.state.tool)).toBe(2);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(true);
    g.setTarget({ q: 2, y: 10, r: 0, type: 'chest' });
    g.interact();
  });
  await page.locator('[data-store="wood"]').click();
  expect(await page.evaluate(() => window.__hexwild.state.inventory.wood)).toBe(
    0,
  );
  await page.locator('[data-take="wood"]').click();
  expect(await page.evaluate(() => window.__hexwild.state.inventory.wood)).toBe(
    8,
  );
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('iron', 2);
    g.give('coal', 2);
    g.setPlaying(true);
    g.setTarget({ q: 3, y: 10, r: 0, type: 'furnace' });
    g.interact();
  });
  await page.locator('[data-smelt="ingot"]').click();
  await page.locator('#station-overlay [data-close]').click();
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.state.inventory.ingot || 0),
      { timeout: 30000 },
    )
    .toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setTarget({ q: 3, y: 10, r: 0, type: 'furnace' });
    g.interact();
  });
  await page.locator('[data-smelt="ingot"]').click();
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(await page.evaluate(() => window.__hexwild.state.inventory.iron)).toBe(
    1,
  );
  expect(await page.evaluate(() => window.__hexwild.state.inventory.coal)).toBe(
    1,
  );
});

test('camp bed skips night and persists respawn point', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start').click();
  const result = await page.evaluate(() => {
    const g = window.__hexwild;
    g.step(300);
    g.setTarget({ q: 2, y: 10, r: 0, type: 'bed' });
    g.interact();
    g.save();
    return {
      time: g.state.time,
      save: JSON.parse(localStorage.getItem('hexwild-save-v1')),
    };
  });
  expect(result.time % 600).toBeLessThan(100);
  expect(result.save.respawn).toHaveLength(3);
  expect(result.save.respawn[1]).toBe(11.03);
});

test('touch controls enter game, move, open and close workshop', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/');
  await page.locator('#creative').tap();
  await expect(page.locator('#mobile-controls')).toBeVisible();
  expect(await page.evaluate(() => window.__hexwild.state.playing)).toBe(true);
  await page.locator('[data-action="craft"]').tap();
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.locator('#craft-overlay [data-close]').tap();
  await expect(page.locator('#craft-overlay')).toBeHidden();
  await context.close();
});
test('creative material palette and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('KeyB');
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.locator('[data-item="furnace"]').click();
  expect(await page.evaluate(() => window.__hexwild.state.hotbar[0])).toBe(
    'furnace',
  );
  await page.screenshot({ path: 'test-results/mobile-crafting.png' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
