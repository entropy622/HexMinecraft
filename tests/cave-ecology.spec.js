import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('lush cave contains harvestable ceiling vines, flowers and ambient bats', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#start').click();
  const cave = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const c = w.caves(0, 0, 160).find((c) => c.kind === 'lush');
    g.teleport(c.q, c.floor + 1, c.r);
    return c;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...window.__hexwild.state.world.blocks.values()].filter(
            (t) => t === 'caveVinesBerries',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const berry = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const candidates = [...w.hangingPlants]
      .filter((k) => w.blocks.get(k) === 'caveVinesBerries')
      .map((k) => {
        const [q, y, r] = k.split(',').map(Number);
        return { q, y, r };
      })
      .filter((p) => p.y < 11)
      .sort((a, b) => a.y - b.y);
    const p =
      candidates.find((p) => !w.get(p.q + 1, p.y, p.r)) || candidates[0];
    let floor = p.y - 1;
    while (floor > 0 && !w.solid(p.q + 1, floor, p.r)) floor--;
    g.teleport(p.q + 1, floor + 1, p.r);
    g.lookAt(p.q, p.y + 0.3, p.r);
    return { ...p, floor };
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.y, t.r, t.type];
      }),
    )
    .toEqual([berry.q, berry.y, berry.r, 'caveVinesBerries']);
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect
    .poll(() =>
      page.evaluate(
        (p) => window.__hexwild.state.world.get(p.q, p.y, p.r),
        berry,
      ),
    )
    .toBe('caveVines');
  await page.evaluate(
    (p) => window.__hexwild.teleport(p.q, p.floor + 1, p.r),
    berry,
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.glowBerries || 0),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.graphics.scene.children.filter(
            (m) => m.userData.kind === 'bat',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(
    (c) => window.__hexwild.lookAt(c.q + 3, c.floor + 4, c.r + 2),
    cave,
  );
  await page.screenshot({ path: testInfo.outputPath('lush-ecology.png') });
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild;
    return {
      berries: g.state.inventory.glowBerries,
      bats: g.graphics.scene.children
        .filter((m) => m.userData.kind === 'bat')
        .map((m) => ({
          position: m.position.toArray(),
          resting: m.userData.resting,
        })),
      particles: g.graphics.caveAmbience.geometry.drawRange.count,
    };
  });
  const bat = await page.evaluate(() => {
    const g = window.__hexwild,
      m = g.graphics.scene.children.find(
        (m) => m.userData.kind === 'bat' && m.userData.resting,
      );
    const r = Math.round(m.position.z / 1.5),
      q = Math.round(m.position.x / Math.sqrt(3) - r / 2);
    const result = { uuid: m.uuid, position: m.position.toArray() };
    g.teleport(q, m.position.y - 2.5, r);
    return result;
  });
  await expect
    .poll(() =>
      page.evaluate(
        (b) =>
          window.__hexwild.graphics.scene.children.find(
            (m) => m.uuid === b.uuid,
          )?.userData.resting,
        bat,
      ),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate((b) => {
        const m = window.__hexwild.graphics.scene.children.find(
          (m) => m.uuid === b.uuid,
        );
        return m
          ? Math.hypot(...m.position.toArray().map((v, i) => v - b.position[i]))
          : 0;
      }, bat),
    )
    .toBeGreaterThan(0.3);
  await writeFile(
    testInfo.outputPath('ecology.json'),
    JSON.stringify(manifest, null, 2),
  );
  expect(errors).toEqual([]);
});

test('ceiling planting, bone meal, light removal, blossom and reload use real interaction rays', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -2; q <= 3; q++)
      for (let r = -2; r <= 2; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
      }
    w.set(0, 43, 0, 'stone');
    w.set(0, 43, 1, 'stone');
    g.graphics.updateCells([
      [0, 43, 0],
      [0, 43, 1],
    ]);
    g.give('glowBerries', 3);
    g.give('boneMeal', 3);
    g.give('sporeBlossom', 1);
    g.selectItem('glowBerries');
    g.teleport(1, 40, 0);
    g.lookAt(0, 43.02, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.place))
    .toEqual({ q: 0, y: 42, r: 0 });
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)))
    .toBe('caveVines');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('boneMeal');
    g.lookAt(0, 42.5, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('caveVines');
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)))
    .toBe('caveVinesBerries');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.boneMeal),
  ).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.graphics.lights.has('0,42,0')),
    )
    .toBe(true);
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.graphics.lights.has('0,42,0')),
    )
    .toBe(false);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('sporeBlossom');
    g.lookAt(0, 43.02, 1);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.place))
    .toEqual({ q: 0, y: 42, r: 1 });
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 1)))
    .toBe('sporeBlossom');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.graphics.caveAmbience.geometry.drawRange.count,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.__hexwild.graphics.lights.has('0,42,1')),
  ).toBe(false);
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)))
    .toBe('caveVines');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 42, 1)),
  ).toBe('sporeBlossom');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.boneMeal),
  ).toBe(2);
  await page.screenshot({ path: testInfo.outputPath('ceiling-garden.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('pick2', 1);
    g.selectItem('pick2');
    g.teleport(1, 40, 0);
    g.lookAt(0, 43.3, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('stone');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)))
    .toBeUndefined();
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  expect(errors).toEqual([]);
});

test('touch interaction ripens and harvests berries without native pointer lock', async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.locator('#start').tap();
    await page.evaluate(() => {
      const g = window.__hexwild,
        w = g.state.world;
      for (let q = -1; q <= 2; q++)
        for (let r = -1; r <= 1; r++) {
          w.set(q, 39, r, 'stone');
          for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
        }
      w.set(0, 43, 0, 'stone');
      w.set(0, 42, 0, 'caveVines');
      g.graphics.updateCells([[0, 42, 0]]);
      g.give('boneMeal', 2);
      g.selectItem('boneMeal');
      g.teleport(1, 40, 0);
      g.lookAt(0, 42.5, 0);
    });
    await expect
      .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
      .toBe('caveVines');
    await page.locator('[data-action="interact"]').tap();
    await expect
      .poll(() =>
        page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)),
      )
      .toBe('caveVinesBerries');
    await page.locator('[data-action="interact"]').tap();
    await expect
      .poll(() =>
        page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)),
      )
      .toBe('caveVines');
    expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(
      false,
    );
    expect(
      await page.evaluate(() => window.__hexwild.state.inventory.boneMeal),
    ).toBe(1);
    await page.screenshot({ path: testInfo.outputPath('touch-berries.png') });
  } finally {
    await context.close();
  }
});

test('berries feed the player and a planted vine chain supports climbing', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.locator('#start').click();
  const foodSave = await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('glowBerries', 2);
    g.selectItem('glowBerries');
    g.save();
    const save = JSON.parse(localStorage.getItem('hexwild-save-v15'));
    save.hunger = 16;
    save.survival.saturation = 0;
    save.survival.exhaustion = 0;
    return save;
  });
  // beforeunload saves the live game. Seed the next document after that hook,
  // then let the normal Continue flow validate and restore this hungry player.
  await page.addInitScript(
    (save) => localStorage.setItem('hexwild-save-v15', JSON.stringify(save)),
    foodSave,
  );
  await page.reload();
  await page.locator('#continue').click();
  expect(await page.evaluate(() => window.__hexwild.state.hunger)).toBe(16);
  await page.evaluate(() => window.__hexwild.lookAt(1, 70, 0));
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.hunger))
    .toBe(18);
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.glowBerries),
  ).toBe(1);
  const startY = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -1; q <= 1; q++)
      for (let r = -1; r <= 1; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
      }
    w.set(0, 46, 0, 'stone');
    for (let y = 40; y <= 45; y++) w.set(0, y, 0, 'caveVines');
    g.graphics.updateCells([[0, 40, 0]]);
    g.teleport(0, 40, 0);
    g.lookAt(2, 43, 0);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }),
    );
    return g.state.position[1];
  });
  try {
    await expect
      .poll(() => page.evaluate(() => window.__hexwild.state.position[1]))
      .toBeGreaterThan(startY + 0.8);
  } finally {
    await page.evaluate(() =>
      document.body.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }),
      ),
    );
  }
  const g = await page.evaluate(() => ({
    position: window.__hexwild.state.position,
    hunger: window.__hexwild.state.hunger,
    berries: window.__hexwild.state.inventory.glowBerries,
  }));
  await writeFile(
    testInfo.outputPath('food-and-climbing.json'),
    JSON.stringify({ startY, ...g }, null, 2),
  );
});
