import { test, expect } from '@playwright/test';

test('pixel world renders without shader errors across dimensions and quality changes', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const g = window.__hexwild;
    const types = [
      'grass',
      'wood',
      'planks',
      'brick',
      'diamond',
      'workbench',
      'furnace',
      'chest',
      'lantern',
      'glass',
      'obsidian',
      'crimsonwood',
    ];
    types.forEach((type, i) => {
      const q = (i % 6) - 3,
        r = Math.floor(i / 6) * 2;
      g.state.world.set(q, 23, r, type);
      g.graphics.updateBlock(q, 23, r);
    });
    g.teleport(0, 25, 6);
    g.lookAt(0, 23, 0);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/pixel-materials.png' });
  for (const quality of ['0.65', '1']) {
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption(quality);
    await page.locator('#resume').click();
    await page.waitForTimeout(400);
  }
  for (const dimension of ['nether', 'end', 'overworld']) {
    await page.keyboard.press('Escape');
    await page.locator(`[data-dimension="${dimension}"]`).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/pixel-${dimension}.png` });
  }
  expect(errors).toEqual([]);
});
