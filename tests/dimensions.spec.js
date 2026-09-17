import { test, expect } from '@playwright/test';

test('walking streams new chunks; distant edits survive unloading, return and reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.teleport(80, 30, -30));
  const before = await page.evaluate(() => window.__hexwild.state.position[0]);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyW');
  expect(
    await page.evaluate(() => window.__hexwild.state.position[0]),
  ).toBeGreaterThan(before + 4);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(80, 40, -30, 'glass');
    g.graphics.updateBlock(80, 40, -30);
    g.teleport(5000, 30, -2000);
  });
  const far = await page.evaluate(() => ({
    chunks: window.__hexwild.state.world.chunks.size,
    meshes: window.__hexwild.graphics.chunks.size,
    nearLoaded: window.__hexwild.state.world.loaded(80, -30),
    radii: [...window.__hexwild.graphics.chunks.values()].map(
      (m) => m.geometry.boundingSphere.radius,
    ),
  }));
  expect(far.chunks).toBe(81);
  expect(far.meshes).toBeLessThanOrEqual(49);
  expect(far.nearLoaded).toBe(false);
  expect(Math.max(...far.radii)).toBeLessThan(50);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(80, 30, -30);
    g.save();
  });
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(80, 40, -30)),
  ).toBe('glass');
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(80, 40, -30)),
  ).toBe('glass');
  expect(errors).toEqual([]);
});

test('survival portal recipe, actual ray interaction and generated return portal', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('obsidian', 6);
    g.give('crystal', 1);
    g.state.world.set(-1, 11, 0, 'workbench');
    g.open('#craft-overlay');
  });
  await page
    .locator('#recipes button')
    .filter({ hasText: '下界传送门' })
    .click();
  await page.locator('#craft-button').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.obsidian),
  ).toBe(0);
  expect(await page.evaluate(() => window.__hexwild.state.hotbar[0])).toBe(
    'portal',
  );
  await page.locator('#craft-overlay [data-close]').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.playing))
    .toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setTarget({ place: { q: 1, y: 11, r: 0 } });
    g.place();
    g.lookAt(1, 11.5, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('portal');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#dimension-name')).toHaveText('下界');
  const back = await page.evaluate(() => {
    const g = window.__hexwild;
    const [k] = [...g.state.world.edits].find(([, t]) => t === 'portal');
    const [q, y, r] = k.split(',').map(Number);
    g.lookAt(q, y + 0.5, r);
    return k;
  });
  expect(back).toBeTruthy();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('portal');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#dimension-name')).toHaveText('主世界');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(1, 11, 0)),
  ).toBe('portal');
  expect(await page.evaluate(() => window.__hexwild.audio.events.portal)).toBe(
    2,
  );
});

test('creative UI travels across all dimensions with separate edits, positions and save reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#creative').click();
  for (const [id, label] of [
    ['nether', '下界'],
    ['end', '末地'],
    ['overworld', '主世界'],
  ]) {
    await page.keyboard.press('Escape');
    await page.locator(`[data-dimension="${id}"]`).click();
    await expect(page.locator('#dimension-name')).toHaveText(label);
    await page.evaluate((id) => {
      const g = window.__hexwild;
      g.state.world.set(
        2,
        35,
        0,
        id === 'nether' ? 'glass' : id === 'end' ? 'brick' : 'planks',
      );
      g.graphics.updateBlock(2, 35, 0);
    }, id);
    await page.waitForTimeout(950);
    await page.screenshot({ path: `test-results/dimension-${id}.png` });
  }
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.travel('end');
    g.save();
  });
  await page.reload();
  await page.locator('#continue').click();
  await expect(page.locator('#dimension-name')).toHaveText('末地');
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(2, 35, 0)),
  ).toBe('brick');
  expect(
    await page.evaluate(() => window.__hexwild.graphics.water.visible),
  ).toBe(false);
  await page.evaluate(() => window.__hexwild.travel('nether'));
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(2, 35, 0)),
  ).toBe('glass');
  await page.evaluate(() => window.__hexwild.travel('overworld'));
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(2, 35, 0)),
  ).toBe('planks');
  expect(errors).toEqual([]);
});

test('old browser save migrates automatically and the original backup remains intact', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'hexwild-save-v1',
      JSON.stringify({
        version: 1,
        seed: 624,
        edits: [['0,20,0', 'brick']],
        inventory: { wood: 14, dirt: 8 },
        tool: 2,
        creative: true,
        position: [0, 25, 0],
        activated: [0],
        health: 17,
        hunger: 16,
        time: 140,
        hotbar: [
          'dirt',
          'stone',
          'wood',
          'planks',
          'sand',
          'brick',
          'leaves',
          'glass',
          'lantern',
        ],
      }),
    ),
  );
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 20, 0)),
  ).toBe('brick');
  expect(await page.evaluate(() => window.__hexwild.state.inventory.wood)).toBe(
    14,
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('hexwild-save-v2')).version,
    ),
  ).toBe(2);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('hexwild-save-v1')).version,
    ),
  ).toBe(1);
});

test('footsteps and hand animation run; sound settings persist', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#start').click();
  const hand = await page.evaluate(
    () => window.__hexwild.graphics.hand.position.y,
  );
  await page.keyboard.down('KeyA');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.audio.events.step || 0), {
      timeout: 15000,
    })
    .toBeGreaterThan(0);
  await page.keyboard.up('KeyA');
  expect(
    await page.evaluate(() => window.__hexwild.graphics.hand.position.y),
  ).not.toBe(hand);
  await page.keyboard.press('Escape');
  await page.locator('#sound-toggle').click();
  await page.locator('#volume').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.locator('#volume').dispatchEvent('change');
  await page.reload();
  await page.locator('#menu-help').click();
  await expect(page.locator('#sound-toggle')).toHaveText('关闭');
  await expect(page.locator('#volume')).toHaveValue('0.2');
});
