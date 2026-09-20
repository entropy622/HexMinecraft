import { test, expect } from '@playwright/test';
async function arena(page, creative = false) {
  await page.goto('/');
  await page.locator(creative ? '#creative' : '#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -8; q <= 8; q++)
      for (let r = -8; r <= 8; r++) w.set(q, 39, r, 'brick');
    g.teleport(0, 40, 3);
    for (const k of g.graphics.chunks.keys()) g.graphics.buildChunk(k);
  });
}
test('survival bucket uses actual fluid ray, exchanges inventory, pours and saves', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await arena(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('bucket', 2);
    g.selectItem('bucket');
    g.state.world.fluids.source(0, 40, 0, 'water');
    g.fluidStep(1);
    g.lookAt(0, 40.85, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.source))
    .toBe(true);
  await page.mouse.click(640, 400, { button: 'right' });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.waterBucket),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.bucket),
  ).toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.lookAt(2, 39.95, 1);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('brick');
  const placed = await page.evaluate(() => window.__hexwild.state.target.place);
  await page.keyboard.press('KeyE');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.waterBucket),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.bucket),
  ).toBe(2);
  expect(
    await page.evaluate(
      (p) => window.__hexwild.state.world.fluids.get(p.q, p.y, p.r)?.source,
      placed,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    window.__hexwild.fluidStep(70);
    window.__hexwild.save();
  });
  await page.screenshot({ path: 'test-results/liquid-bucket.png' });
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(
      (p) => window.__hexwild.state.world.fluids.get(p.q, p.y, p.r)?.type,
      placed,
    ),
  ).toBe('water');
  expect(await page.evaluate(() => window.__hexwild.state.hotbar[0])).toBe(
    'bucket',
  );
  expect(errors).toEqual([]);
});
test('liquids render waterfalls, react, persist across dimensions and allow swimming', async ({
  page,
}) => {
  const errors = [];
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await arena(page, true);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.fluids.source(-4, 44, 0, 'water');
    w.fluids.source(0, 44, 0, 'glow');
    w.fluids.source(4, 44, 0, 'lava');
    g.fluidStep(150);
    g.teleport(2, 44, 7);
    g.lookAt(0, 41, 0);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/liquid-waterfalls.png' });
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(-4, 41, 0)?.type,
    ),
  ).toBe('water');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.fluids.source(6, 40, 0, 'lava');
    g.state.world.fluids.source(6, 41, 0, 'water');
    g.fluidStep(30);
  });
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(6, 40, 0)),
  ).toBe('obsidian');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.travel('nether');
    g.state.world.fluids.source(0, 40, 0, 'lava');
    g.travel('overworld');
  });
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(-4, 44, 0)?.source,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-4, 40, 0);
  });
  await expect(page.locator('#underwater')).toBeVisible();
  expect(errors).toEqual([]);
});
test('bucket recipes consume iron and coolant ingredients and equip the result', async ({
  page,
}) => {
  await arena(page);
  await page.keyboard.press('KeyB');
  await page.evaluate(async () => {
    const g = window.__hexwild,
      { RECIPES } = await import('/src/core.js');
    g.state.world.set(1, 40, 3, 'workbench');
    g.give('ingot', 3);
    g.selectRecipe(RECIPES.findIndex((r) => r.id === 'bucket'));
  });
  await page.locator('#craft-button').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.bucket),
  ).toBe(1);
  await page.evaluate(async () => {
    const g = window.__hexwild,
      { RECIPES } = await import('/src/core.js');
    g.give('waterBucket', 1);
    g.give('crystal', 2);
    g.selectRecipe(RECIPES.findIndex((r) => r.id === 'glowBucket'));
  });
  await page.locator('#craft-button').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.glowBucket),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.waterBucket),
  ).toBe(0);
  expect(await page.evaluate(() => window.__hexwild.state.hotbar[0])).toBe(
    'glowBucket',
  );
});

test('placed water supports swimming and placed lava damages survival players', async ({
  page,
}) => {
  await arena(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.fluids.source(0, 40, 0, 'water');
    g.state.world.fluids.source(0, 41, 0, 'water');
    g.teleport(0, 40, 0);
  });
  await expect(page.locator('#underwater')).toBeVisible();
  const before = await page.evaluate(() => window.__hexwild.state.position[1]);
  await page.keyboard.down('Space');
  await page.waitForTimeout(350);
  await page.keyboard.up('Space');
  expect(
    await page.evaluate(() => window.__hexwild.state.position[1]),
  ).toBeGreaterThan(before + 0.2);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.fluids.source(-7, 40, -7, 'lava');
    g.teleport(-7, 40, -7);
  });
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.fluids.get(-7, 40, -7)?.type,
    ),
  ).toBe('lava');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health))
    .toBeLessThan(19);
});
