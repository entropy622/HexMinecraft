import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

const clickUse = async (page) => {
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
};
async function renderedLight(page) {
  return page.evaluate(() => {
    const gfx = window.__hexwild.graphics,
      field = gfx.voxelLight;
    const geometry = gfx.chunks.get(gfx.chunkKey(3, 0)).geometry;
    const j = geometry.userData.lightSamples.indices.indexOf(
      field.index(3, 31, 0),
    );
    if (j < 0) return null;
    return [0, 1, 2].map(
      (c) => geometry.attributes.blocklight.array[j * 3 + c],
    );
  });
}

test('touch interaction operates a lever without pointer lock', async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await scene(page, baseURL);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 31, 0, 'lever');
    w.set(1, 31, 0, 'redstoneLamp');
    g.graphics.updateCells([
      [0, 31, 0],
      [1, 31, 0],
    ]);
  });
  await aim(page, 0, 31.07, 0, 'lever');
  await page.locator('[data-action="interact"]').tap();
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(1, 31, 0).powered,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.graphics.lights.has('1,31,0')),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('touch-circuit-verification.json'),
    JSON.stringify(
      { activatedByTouch: true, nativePointerLock: false, errors },
      null,
      2,
    ),
  );
  await context.close();
});

test('wall and ceiling controls mount to the clicked face and drop with support', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await scene(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(1, 32, 0, 'stone');
    w.set(2, 32, 0, 'redstoneLamp');
    w.set(4, 34, 0, 'stone');
    g.give('lever', 1);
    g.give('stoneButton', 1);
    g.selectItem('lever');
    g.graphics.updateCells([
      [1, 32, 0],
      [2, 32, 0],
      [4, 34, 0],
    ]);
    g.teleport(-1, 31, 0);
  });
  await aim(page, 1, 32.5, 0, 'stone');
  await clickUse(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(0, 32, 0).mount),
    )
    .toBe('wall');
  await page.evaluate(() => window.__hexwild.lookAt(0.4, 32.5, 0));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('lever');
  await clickUse(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(2, 32, 0).powered,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('wall-lever.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(4, 31, -1);
    g.selectItem('stoneButton');
  });
  await aim(page, 4, 34, 0, 'stone');
  await clickUse(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(4, 33, 0).mount),
    )
    .toBe('ceiling');
  await aim(page, 4, 33.97, 0, 'stoneButton');
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, bubbles: true }),
    );
    canvas.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, bubbles: true }),
    );
    window.__hexwild.setPlaying(false);
  });
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(4, 33, 0).powered,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('ceiling-button.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(1, 32, 0, null);
    g.state.world.set(4, 34, 0, null);
    g.setPlaying(true);
  });
  await expect
    .poll(() =>
      page.evaluate(() => [
        window.__hexwild.state.world.get(0, 32, 0) || null,
        window.__hexwild.state.world.get(4, 33, 0) || null,
      ]),
    )
    .toEqual([null, null]);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('mount-verification.json'),
    JSON.stringify(
      {
        wallLeverPowersThroughSupport: true,
        ceilingButtonPressed: true,
        supportDropsBoth: true,
        errors,
      },
      null,
      2,
    ),
  );
});
async function scene(page, url = '/') {
  await page.goto(url);
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 8; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 30, r, 'stone');
        for (let y = 31; y <= 38; y++) w.set(q, y, r, null);
        cells.push([q, 30, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(0, 31, -1);
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

// Production ray, inventory consumption, signal propagation, visible lamp/light,
// manual door control, support loss, flooding, and save/reload form one route.
test('build a working circuit by ray, light the scene, break and restore it', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await scene(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (const q of [2, 3]) w.set(q, 31, 0, 'redstoneWire');
    w.set(4, 31, 0, 'redstoneLamp');
    g.give('redstone', 8);
    g.give('lever', 1);
    g.selectItem('redstone');
    g.graphics.updateCells([
      [2, 31, 0],
      [3, 31, 0],
      [4, 31, 0],
    ]);
  });
  await aim(page, 1, 31, 0, 'stone');
  await clickUse(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(1, 31, 0)))
    .toBe('redstoneWire');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redstone),
  ).toBe(7);
  await page.evaluate(() => window.__hexwild.selectItem('lever'));
  await aim(page, 0, 31, 0, 'stone');
  await clickUse(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 31, 0)))
    .toBe('lever');
  await aim(page, 0, 31.07, 0, 'lever');
  await clickUse(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(4, 31, 0).powered,
      ),
    )
    .toBe(true);
  const on = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    return {
      levels: [1, 2, 3].map((q) => w.redstone.power(q, 31, 0)),
      light: !!g.graphics.lights.get('4,31,0'),
      save: w.serialize().blockStates,
    };
  });
  expect(on.levels).toEqual([15, 14, 13]);
  expect(on.light).toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -4; q <= 8; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 35, r, 'stone');
        if (q === -4 || q === 8 || Math.abs(r) === 4)
          for (let y = 31; y < 35; y++) w.set(q, y, r, 'stone');
        cells.push([q, 35, r]);
      }
    g.step(300);
    g.graphics.updateCells(cells);
  });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(1, 31, -3);
    g.lookAt(2, 31, 0);
    g.save();
  });
  await aim(page, 2, 31, 0, 'redstoneWire');
  await expect
    .poll(async () => (await renderedLight(page))?.[0] || 0)
    .toBeGreaterThan(0.5);
  const renderedOn = await renderedLight(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('powered-circuit.png') });
  await page.reload();
  await page.locator('#continue').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__hexwild.state.world.redstone.power(3, 31, 0),
      ),
    )
    .toBe(13);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 31, -1);
  });
  await aim(page, 0, 31.07, 0, 'lever');
  await clickUse(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(4, 31, 0).powered,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(() => window.__hexwild.graphics.lights.has('4,31,0')),
  ).toBe(false);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(1, 31, -3);
    g.lookAt(2, 31, 0);
  });
  await aim(page, 2, 31, 0, 'redstoneWire');
  await expect.poll(() => renderedLight(page)).toEqual([0, 0, 0]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('unpowered-circuit.png') });
  await page.evaluate(() => window.__hexwild.teleport(0, 31, -1));
  await aim(page, 0, 31.07, 0, 'lever');
  await clickUse(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__hexwild.state.world.redstone.power(3, 31, 0),
      ),
    )
    .toBe(13);
  // Remove a supporting floor through the real World API; the production
  // maintenance loop must drop dust and disconnect the consumer.
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(2, 30, 0, null);
    g.graphics.updateBlock(2, 30, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(2, 31, 0) || null),
    )
    .toBe(null);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(4, 31, 0).powered,
      ),
    )
    .toBe(false);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(2, 30, 0, 'stone');
    w.set(2, 31, 0, 'redstoneWire');
    w.fluids.source(2, 31, 0, 'water');
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(2, 31, 0) || null),
    )
    .toBe(null);
  await page.evaluate(() => window.__hexwild.save());
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hexwild-save-v16')),
  );
  expect(
    saved.dimensions.overworld.drops.some((d) => d.item === 'redstone'),
  ).toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(5, 31, 0, 'lever');
    w.set(6, 30, 0, 'trapdoor');
    w.setState(6, 30, 0, { facing: 0, open: false, upper: true });
    w.set(6, 31, 0, 'redstoneWire');
    w.set(7, 31, 0, 'redstoneLamp');
    w.redstone.activate(5, 31, 0);
    g.graphics.updateCells([
      [5, 31, 0],
      [6, 30, 0],
      [6, 31, 0],
      [7, 31, 0],
    ]);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(6, 31, 0) || null),
    )
    .toBe(null);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__hexwild.state.world.redstone.power(6, 31, 0),
      ),
    )
    .toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(7, 31, 0).powered,
      ),
    )
    .toBe(false);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('circuit-verification.json'),
    JSON.stringify(
      {
        on,
        renderedOn,
        renderedOff: [0, 0, 0],
        droppedDust: true,
        supportDisconnect: true,
        waterDisconnect: true,
        trapdoorFeedbackClears: true,
        errors,
      },
      null,
      2,
    ),
  );
});

test('walking on a pressure plate opens a door and a button pulse pauses with the menu', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await scene(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 31, 0, 'stonePressurePlate');
    w.set(1, 31, 0, 'door');
    w.set(1, 32, 0, 'doorTop');
    w.setState(1, 31, 0, { facing: 0, open: false });
    w.set(3, 31, 0, 'stoneButton');
    w.set(4, 31, 0, 'redstoneLamp');
    g.graphics.updateCells([
      [0, 31, 0],
      [1, 31, 0],
      [3, 31, 0],
      [4, 31, 0],
    ]);
    g.teleport(-1, 31, 0);
    g.lookAt(4, 32.65, 0);
  });
  await page.keyboard.down('KeyW');
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.world.state(1, 31, 0).open),
      { timeout: 10000 },
    )
    .toBe(true);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: info.outputPath('pressure-door.png') });
  await page.evaluate(() => window.__hexwild.teleport(-2, 31, -1));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(1, 31, 0).open),
    )
    .toBe(false);
  await page.evaluate(() => window.__hexwild.teleport(3, 31, -1));
  await aim(page, 3, 31.07, 0, 'stoneButton');
  // Press and pause in the same browser turn so software WebGL cannot spend the
  // entire one-second pulse between two CDP calls.
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, bubbles: true }),
    );
    canvas.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'Escape', bubbles: true }),
    );
  });
  await page.waitForTimeout(1300);
  const paused = await page.evaluate(() => ({
    powered: window.__hexwild.state.world.state(3, 31, 0).powered,
    timer: window.__hexwild.state.world.redstone.timers.get('3,31,0'),
  }));
  expect(paused.powered).toBe(true);
  expect(paused.timer).toBeGreaterThan(0.5);
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => !!window.__hexwild.state.world.state(3, 31, 0).powered,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () => !!window.__hexwild.state.world.state(4, 31, 0).powered,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('pressure-button-verification.json'),
    JSON.stringify({ paused, releasedAfterReload: true, errors }, null, 2),
  );
});
