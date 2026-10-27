import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

async function use(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
}
async function aim(page, q, y, r, type) {
  await page.evaluate(
    ([q, y, r]) => window.__hexwild.lookAt(q, y, r),
    [q, y, r],
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q || 0, t.r || 0, t.type];
      }),
    )
    .toEqual([q, r, type]);
}
async function platform(page) {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -7; q <= 24; q++)
      for (let r = -5; r <= 5; r++) {
        w.set(q, 30, r, 'stone');
        for (let y = 31; y <= 36; y++) w.set(q, y, r, null);
        cells.push([q, 30, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(-2, 31, -1);
  });
}

test('placed torch inverts a real signal and a player-adjusted repeater restores it', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 31, 0, 'stone');
    w.set(-1, 31, 0, 'lever');
    w.setState(-1, 31, 0, { facing: 0, open: false, mount: 'floor' });
    w.set(2, 31, 0, 'redstoneWire');
    w.set(4, 31, 0, 'redstoneWire');
    w.set(5, 31, 0, 'redstoneLamp');
    g.give('redstoneTorch', 2);
    g.give('repeater', 1);
    g.selectItem('redstoneTorch');
    g.graphics.updateCells([
      [0, 31, 0],
      [-1, 31, 0],
      [2, 31, 0],
      [4, 31, 0],
      [5, 31, 0],
    ]);
    g.teleport(2, 31, 0);
  });
  await aim(page, 0, 31.5, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(1, 31, 0)))
    .toBe('redstoneTorch');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__hexwild.state.world.redstone.power(2, 31, 0),
      ),
    )
    .toBe(15);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('repeater');
    g.teleport(2, 31, 0);
  });
  await aim(page, 3, 31, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(3, 31, 0)))
    .toBe('repeater');
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(5, 31, 0).powered,
      ),
    )
    .toBe(true);
  await aim(page, 3, 31.06, 0, 'repeater');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(3, 31, 0).delay),
    )
    .toBe(2);
  await page.evaluate(() => window.__hexwild.teleport(-2, 31, -1));
  await aim(page, -1, 31.07, 0, 'lever');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(5, 31, 0).powered,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(() => window.__hexwild.graphics.lights.has('1,31,0')),
  ).toBe(false);
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(5, 31, 0).powered,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.__hexwild.save();
    window.__hexwild.teleport(2, 32, -3);
    window.__hexwild.lookAt(2, 31.3, 0);
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('inverter-repeater.png') });
  await page.reload();
  await page.locator('#continue').click();
  const result = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    return {
      delay: w.state(3, 31, 0).delay,
      torch: w.get(1, 31, 0),
      repeater: w.get(3, 31, 0),
      inventory: g.state.inventory.redstoneTorch,
    };
  });
  expect(result).toEqual({
    delay: 2,
    torch: 'redstoneTorch',
    repeater: 'repeater',
    inventory: 1,
  });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('interaction.json'),
    JSON.stringify(
      {
        ...result,
        lampRespondedToInversion: true,
        torchLightExtinguished: true,
        errors,
      },
      null,
      2,
    ),
  );
});

test('touch controls cycle all repeater delays and support loss washes components away', async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseURL);
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -3; q <= 3; q++)
      for (let r = -2; r <= 2; r++) {
        w.set(q, 30, r, 'stone');
        for (let y = 31; y <= 35; y++) w.set(q, y, r, null);
      }
    w.set(0, 31, 0, 'repeater');
    w.setState(0, 31, 0, { facing: 0, open: false, delay: 1, powered: false });
    w.set(2, 31, 0, 'redstoneTorch');
    w.setState(2, 31, 0, {
      facing: 0,
      open: false,
      powered: true,
      mount: 'floor',
    });
    g.graphics.updateCells([
      [0, 30, 0],
      [2, 30, 0],
    ]);
    g.teleport(-1, 31, 0);
  });
  await aim(page, 0, 31.06, 0, 'repeater');
  const delays = [];
  for (const delay of [2, 3, 4, 1]) {
    await page.locator('[data-action="interact"]').tap();
    await expect
      .poll(() =>
        page.evaluate(() => window.__hexwild.state.world.state(0, 31, 0).delay),
      )
      .toBe(delay);
    delays.push(delay);
  }
  const locked = await page.evaluate(() => !!document.pointerLockElement);
  expect(locked).toBe(false);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 30, 0, null);
    w.fluids.source(2, 31, 0, 'water');
    g.graphics.updateCells([
      [0, 30, 0],
      [2, 31, 0],
    ]);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 31, 0) || null),
    )
    .toBe(null);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(2, 31, 0) || null),
    )
    .toBe(null);
  await writeFile(
    info.outputPath('touch-support-water.json'),
    JSON.stringify(
      {
        delays,
        nativePointerLock: locked,
        supportRemoved: true,
        floodedTorchRemoved: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  await context.close();
});

test('survival recipes require the real workbench and a mined repeater is picked up', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  const recipes = await page.evaluate(async () => {
    const { RECIPES } = await import('/src/core.js'),
      g = window.__hexwild;
    g.give('wood', 2);
    g.give('redstone', 3);
    g.give('stone', 3);
    return ['redstoneTorch', 'repeater'].map((id) =>
      RECIPES.findIndex((r) => r.id === id),
    );
  });
  await page.keyboard.press('KeyE');
  for (let batch = 0; batch < 2; batch++) {
    await page.locator(`[data-recipe="${recipes[0]}"]`).click();
    await expect(page.locator('#craft-button')).toBeEnabled();
    await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  }
  await page.locator(`[data-recipe="${recipes[1]}"]`).click();
  await expect(page.locator('#craft-button')).toBeDisabled();
  await page.keyboard.press('KeyE');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(0, 31, 0, 'workbench');
    g.graphics.updateBlock(0, 31, 0);
    g.teleport(0, 31, -1);
  });
  await page.keyboard.press('KeyE');
  await page.locator(`[data-recipe="${recipes[1]}"]`).click();
  await expect(page.locator('#craft-button')).toBeEnabled();
  await page.screenshot({ path: info.outputPath('repeater-crafting.png') });
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.repeater),
  ).toBe(1);
  await page.keyboard.press('KeyE');
  await page.evaluate(() => {
    window.__hexwild.selectItem('repeater');
    window.__hexwild.teleport(2, 31, 0);
  });
  await aim(page, 3, 31, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(3, 31, 0)))
    .toBe('repeater');
  await aim(page, 3, 31.06, 0, 'repeater');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(3, 31, 0) || null),
    )
    .toBe(null);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.evaluate(() => window.__hexwild.teleport(3, 31, 0));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.repeater || 0),
    )
    .toBe(1);
  const inventory = await page.evaluate(() => {
    const g = window.__hexwild;
    return Object.fromEntries(
      ['wood', 'redstone', 'stone', 'redstoneTorch', 'repeater'].map((id) => [
        id,
        g.state.inventory[id] || 0,
      ]),
    );
  });
  expect(inventory).toEqual({
    wood: 0,
    redstone: 0,
    stone: 0,
    redstoneTorch: 0,
    repeater: 1,
  });
  await writeFile(
    info.outputPath('survival-crafting.json'),
    JSON.stringify(
      { inventory, stationRequired: true, minedAndCollected: true, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('real side input locks output while a feedback clock burns out and pauses across reload', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const put = (q, r, type, state = {}) => {
      w.set(q, 31, r, type);
      w.setState(q, 31, r, { facing: 0, open: false, ...state });
    };
    put(-1, 0, 'lever', { powered: true });
    put(0, 0, 'repeater', { delay: 1 });
    put(1, 0, 'redstoneLamp');
    put(0, 1, 'repeater', { facing: 4, delay: 1 });
    put(0, 2, 'lever', { powered: true });
    put(4, 0, 'stone');
    put(5, 0, 'redstoneTorch', { facing: 3, mount: 'wall', powered: true });
    w.set(5, 32, 0, 'stone');
    w.set(4, 32, 0, 'redstoneWire');
    g.graphics.updateCells([
      [-1, 31, 0],
      [0, 31, 0],
      [1, 31, 0],
      [0, 31, 1],
      [0, 31, 2],
      [4, 31, 0],
      [5, 31, 0],
      [4, 32, 0],
      [5, 32, 0],
    ]);
    g.teleport(-2, 31, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__hexwild.state.world.redstone.locked(0, 31, 0),
      ),
    )
    .toBe(true);
  await aim(page, -1, 31.07, 0, 'lever');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(1, 31, 0).powered,
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__hexwild.teleport(-1, 31, 2));
  await aim(page, 0, 31.07, 2, 'lever');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(1, 31, 0).powered,
      ),
    )
    .toBe(false);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__hexwild.state.world.redstone.burnouts.get('5,31,0')
              ?.cooldown || 0,
        ),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return g.state.world.redstone.burnouts.get('5,31,0').cooldown;
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () =>
        window.__hexwild.state.world.redstone.burnouts.get('5,31,0').cooldown,
    ),
  ).toBe(paused);
  await page.reload();
  const stored = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem('hexwild-save-v16'),
      ).dimensions.overworld.torchBurnouts.find(([k]) => k === '5,31,0')[1]
        .cooldown,
  );
  expect(stored).toBe(paused);
  await page.locator('#continue').click();
  const restored = await page.evaluate(
    () => window.__hexwild.state.world.redstone.burnouts.get('5,31,0').cooldown,
  );
  expect(restored).toBeGreaterThan(paused - 1);
  expect(restored).toBeLessThanOrEqual(paused);
  // Remove only the real feedback wire: after cooldown the torch may relight.
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(4, 32, 0, null);
    g.graphics.updateBlock(4, 32, 0);
    g.teleport(7, 32, -2);
    g.lookAt(5, 31.5, 0);
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.state.world.state(5, 31, 0).powered,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('torch-recovered.png') });
  await writeFile(
    info.outputPath('lock-burnout.json'),
    JSON.stringify(
      {
        lockedInputIgnored: true,
        unlockReleasedOutput: true,
        paused,
        stored,
        restored,
        recovered: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
