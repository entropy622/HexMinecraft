import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

// Previously no scenario covered a naturally generated, traversable cave or
// harvesting its surfaces through the player's actual mining ray.
test('natural cave route, mining, building, save and light-effects lifecycle', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/');
  await page.locator('#start').click();
  const cave = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const c = w.caves(0, 0, 160).find((c) => c.kind === 'lush');
    g.teleport(c.q, c.floor + 1, c.r);
    g.lookAt(c.q, c.floor, c.r);
    return c;
  });
  await expect(page.locator('#biome-name')).toHaveText(cave.name);
  // Explore the actual generated cells with a two-block body and one-block
  // steps. This catches sealed mouths, chunk seams and discontinuous slopes.
  const route = await page.evaluate((c) => {
    const w = window.__hexwild.state.world,
      end = c.path.at(-1),
      directions = [
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [0, -1],
        [1, -1],
      ],
      queue = [[c.q, c.floor + 1, c.r]],
      seen = new Set();
    for (let i = 0; i < queue.length && i < 20000; i++) {
      const [q, y, r] = queue[i];
      if (q === end.q && r === end.r && y >= end.floor) return true;
      for (const [dq, dr] of directions)
        for (const dy of [0, 1, -1]) {
          const nq = q + dq,
            ny = y + dy,
            nr = r + dr,
            id = `${nq},${ny},${nr}`;
          if (
            seen.has(id) ||
            ny < 2 ||
            Math.abs(nq - c.q) > 24 ||
            Math.abs(nr - c.r) > 24
          )
            continue;
          if (
            !w.solid(nq, ny - 1, nr) ||
            w.solid(nq, ny, nr) ||
            w.solid(nq, ny + 1, nr)
          )
            continue;
          seen.add(id);
          queue.push([nq, ny, nr]);
        }
    }
    return false;
  }, cave);
  expect(route).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('mossBlock');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.mossBlock || 0),
    )
    .toBeGreaterThan(0);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.evaluate(() => window.__hexwild.selectItem('mossBlock'));
  await page.evaluate((c) => {
    window.__hexwild.teleport(c.q + c.radius - 2, c.floor + 1, c.r);
    window.__hexwild.lookAt(c.q + c.radius, c.floor + 2.5, c.r);
  }, cave);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.place?.y))
    .toBe(cave.floor + 2);
  const placed = await page.evaluate(() => window.__hexwild.state.target.place);
  // Place the harvested material on a real cave wall, away from the body.
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect
    .poll(() =>
      page.evaluate(
        (p) => window.__hexwild.state.world.get(p.q, p.y, p.r),
        placed,
      ),
    )
    .toBe('mossBlock');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(
      (p) => window.__hexwild.state.world.get(p.q, p.y, p.r),
      placed,
    ),
  ).toBe('mossBlock');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(
    (c) => window.__hexwild.lookAt(c.q + 3, c.floor + 3, c.r - 3),
    cave,
  );
  await page.waitForTimeout(1200);
  const adapted = await page.screenshot({
    path: testInfo.outputPath('cave-adapted.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#exposure-toggle').uncheck();
  await page.locator('#resume').click();
  await page.waitForTimeout(300);
  const fixed = await page.screenshot({
    path: testInfo.outputPath('cave-fixed.png'),
  });
  const brightness = [];
  for (const png of [adapted, fixed])
    brightness.push(
      await page.evaluate(async (data) => {
        const image = await createImageBitmap(
            await (await fetch('data:image/png;base64,' + data)).blob(),
          ),
          canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          image,
          image.width * 0.2,
          image.height * 0.2,
          image.width * 0.6,
          image.height * 0.4,
          0,
          0,
          64,
          64,
        );
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4)
          sum +=
            pixels[i] * 0.2126 +
            pixels[i + 1] * 0.7152 +
            pixels[i + 2] * 0.0722;
        image.close();
        return Math.round((sum / 4096) * 100) / 100;
      }, png.toString('base64')),
    );
  expect(brightness[0]).toBeGreaterThan(brightness[1] * 1.1);
  await page.keyboard.press('Escape');
  await page.locator('#exposure-toggle').check();
  await page.locator('#quality').selectOption('1');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = window.__hexwild,
      c = g.state.world.caves(0, 0, 160).find((c) => c.kind === 'limestone');
    g.teleport(c.q, c.floor + 1, c.r);
    g.lookAt(c.q + 3, c.floor + 3, c.r - 3);
    g.give('torch', 1);
    g.selectItem('torch');
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('#biome-name')).toHaveText('方解石溶洞');
  await page.screenshot({ path: testInfo.outputPath('limestone-torch.png') });
  const entrance = await page.evaluate(() => {
    const g = window.__hexwild,
      c = g.state.world.caves(0, 0, 160).find((c) => c.kind === 'lush'),
      p = c.path.at(-1),
      prior = c.path.at(-3);
    g.teleport(p.q, p.floor + 1, p.r);
    g.lookAt(prior.q, prior.floor + 2, prior.r);
    return p;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('cave-entrance.png') });
  await page.keyboard.press('KeyM');
  await expect(page.locator('#map-overlay')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cave-map.png') });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  const manifest = JSON.stringify(
    {
      seed: 624,
      cave: { q: cave.q, r: cave.r, kind: cave.kind },
      route,
      entrance,
      brightness: { adapted: brightness[0], fixed: brightness[1] },
      errors,
    },
    null,
    2,
  );
  await writeFile(testInfo.outputPath('result.json'), manifest);
  await testInfo.attach('cave-route', {
    body: manifest,
    contentType: 'application/json',
  });
});
