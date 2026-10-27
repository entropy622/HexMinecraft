import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

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
      'diamondOre',
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
  for (const quality of ['0.65', '1', '1.7']) {
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

// This same UI-only scenario also runs against `vite preview`, without the
// development fixture API, to verify the shipped bundle and shader integration.
test('the app entry and preset controls render through the real UI', async ({
  page,
}, info) => {
  test.setTimeout(180000);
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
  await expect(page.locator('#hotbar .slot')).toHaveCount(9);
  await page.keyboard.press('KeyE');
  await page.locator('#creative-search').fill('活塞');
  await expect(
    page.locator(
      '[data-creative-item="pistonHead"], [data-creative-item="stickyPistonHead"]',
    ),
  ).toHaveCount(0);
  await page.locator('[data-creative-item="piston"]').click();
  await page.locator('[data-inv-slot="pack:0"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /活塞/,
  );
  for (const quality of ['1.7', '1', '1.7']) {
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption(quality);
    await page.locator('#resume').click();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 12;
          const next = () => (--n ? requestAnimationFrame(next) : resolve());
          requestAnimationFrame(next);
        }),
    );
    expect(
      await page
        .locator('#world')
        .evaluate((canvas) => canvas.getContext('webgl2').getError()),
    ).toBe(0);
  }
  const runtime = await page.evaluate(() => ({
    developmentFixture: typeof window.__hexwild !== 'undefined',
    origin: location.origin,
    pistonSelected: document
      .querySelector('#hotbar .slot.active')
      ?.getAttribute('aria-label')
      ?.includes('活塞'),
  }));
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('compiled-world.png') });
  await writeFile(
    info.outputPath('compiled-runtime.json'),
    JSON.stringify({ ...runtime, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
