import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('natural dripstone cave contains pointed formations and remains explorable', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#start').click();
  const cave = await page.evaluate(() =>
    window.__hexwild.state.world
      .caves(0, 0, 160)
      .find((c) => c.kind === 'dripstone'),
  );
  expect(cave).toBeTruthy();
  await page.evaluate((c) => {
    const g = window.__hexwild;
    g.give('torch', 1);
    g.selectItem('torch');
    g.teleport(c.q, c.floor + 1, c.r);
    g.lookAt(c.q + 3, c.floor + 4, c.r + 2);
  }, cave);
  await expect(page.locator('#biome-name')).toHaveText(cave.name);
  await expect
    .poll(() =>
      page.evaluate((c) => {
        const g = window.__hexwild.graphics;
        return g.voxelLight.heldSource?.levels[0] === 14;
      }, cave),
    )
    .toBe(true);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  const formations = await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    return [...w.dripstoneCells].map((k) => ({
      cell: k,
      ...w.state(...k.split(',').map(Number)),
    }));
  });
  expect(formations.some((p) => p.upper)).toBe(true);
  expect(formations.some((p) => !p.upper)).toBe(true);
  await page.screenshot({ path: info.outputPath('dripstone-cave.png') });
  await writeFile(
    info.outputPath('formations.json'),
    JSON.stringify({ cave, formations }, null, 2),
  );
  expect(errors).toEqual([]);
});

async function room(page) {
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -3; q <= 3; q++)
      for (let r = -2; r <= 2; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 49; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.give('pick2', 1);
    g.selectItem('pick2');
    g.teleport(1, 40, 0);
  });
}
async function aim(page, q, y, r, type, cellY = Math.floor(y)) {
  await page.evaluate((p) => window.__hexwild.lookAt(p.q, p.y, p.r), {
    q,
    y,
    r,
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q + 0, t.y, t.r + 0, t.type];
      }),
    )
    .toEqual([q, cellY, r, type]);
}
async function use(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
}
test('mined pointed blocks place on both faces, extend and merge, and restore from a save', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let y = 40; y <= 41; y++) {
      w.set(0, y, 0, 'pointedDripstone');
      w.setState(0, y, 0, { facing: 0, open: false, upper: false });
    }
    w.set(0, 43, 1, 'stone');
    g.graphics.updateCells([
      [0, 40, 0],
      [0, 43, 1],
    ]);
  });
  await aim(page, 0, 40.35, 0, 'pointedDripstone');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0)))
    .toBeUndefined();
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await writeFile(
    info.outputPath('after-mining.json'),
    JSON.stringify(
      await page.evaluate(() => {
        const g = window.__hexwild,
          w = g.state.world;
        return {
          playing: g.state.playing,
          time: g.state.time,
          blocks: [39, 40, 41, 42].map((y) => [
            y,
            w.get(0, y, 0),
            w.state(0, y, 0),
          ]),
          pending: w.gravity.pending.size,
          queued: w.gravity.pending.has('0,41,0'),
          active: w.gravity.serialize(),
        };
      }),
      null,
      2,
    ),
  );
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0)))
    .toBeUndefined();
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 0));
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.state.inventory.pointedDripstone || 0,
      ),
    )
    .toBe(2);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('pointedDripstone');
    g.teleport(1, 40, 0);
  });
  await aim(page, 0, 39.98, 0, 'stone', 39);
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0)))
    .toBe('pointedDripstone');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 40, 0).upper,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.inventory.pointedDripstone,
    ),
  ).toBe(1);
  await page.evaluate(() => window.__hexwild.teleport(1, 40, 1));
  await aim(page, 0, 43.02, 1, 'stone', 43);
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 1)))
    .toBe('pointedDripstone');
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 42, 1).upper,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.inventory.pointedDripstone || 0,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('pointedDripstone', 3);
    g.selectItem('pointedDripstone');
    g.teleport(1, 40, 0);
  });
  await aim(page, 0, 40.6, 0, 'pointedDripstone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0)))
    .toBe('pointedDripstone');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(0, 43, 0, 'stone');
    g.graphics.updateBlock(0, 43, 0);
  });
  await aim(page, 0, 43.02, 0, 'stone', 43);
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)))
    .toBe('pointedDripstone');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 42, 0).upper,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.state(0, 41, 0).upper,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.inventory.pointedDripstone,
    ),
  ).toBe(1);
  await page.screenshot({ path: info.outputPath('placed-formations.png') });
  expect(errors).toEqual([]);
});

test('a mined ceiling releases a damaging stalactite while ordinary landings are harmless', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => window.__hexwild.teleport(1, 43, 1));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]))
    .toBeLessThan(41.8);
  expect(await page.evaluate(() => window.__hexwild.state.health)).toBe(20);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 44, 0, 'stone');
    w.set(0, 43, 0, 'pointedDripstone');
    w.setState(0, 43, 0, { facing: 0, open: false, upper: true });
    g.graphics.updateCells([[0, 44, 0]]);
    g.teleport(0, 40, 0);
  });
  await page.evaluate(() => window.__hexwild.lookAt(0.35, 44.2, 0));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q + 0, t.y, t.r + 0, t.type];
      }),
    )
    .toEqual([0, 44, 0, 'stone']);
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 44, 0)))
    .toBeUndefined();
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health))
    .toBeLessThan(20);
  const afterFall = await page.evaluate(() => ({
    health: window.__hexwild.state.health,
    time: window.__hexwild.state.time,
    cause: document.querySelector('#damage').dataset.cause,
  }));
  expect(afterFall.cause).toBe('fallingBlock');
  expect(afterFall.health).toBeGreaterThan(0);
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await writeFile(
    info.outputPath('falling-hazard.json'),
    JSON.stringify({ ordinaryLanding: 20, afterFall }, null, 2),
  );
  await page.screenshot({ path: info.outputPath('falling-impact.png') });
  expect(errors).toEqual([]);
});

test('a real landing on a sharp tip hurts and resting on it causes no repeated damage', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 40, 1, 'pointedDripstone');
    w.setState(0, 40, 1, { facing: 0, open: false, upper: false });
    g.graphics.updateBlock(0, 40, 1);
    g.teleport(0, 43, 1);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health))
    .toBeLessThan(20);
  const afterSpike = await page.evaluate(() => ({
    health: window.__hexwild.state.health,
    time: window.__hexwild.state.time,
    position: window.__hexwild.state.position,
    hurts: window.__hexwild.audio.events.hurt || 0,
  }));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time))
    .toBeGreaterThan(afterSpike.time + 1);
  expect(
    await page.evaluate(() => window.__hexwild.state.health),
  ).toBeGreaterThanOrEqual(afterSpike.health);
  expect(
    await page.evaluate(() => window.__hexwild.audio.events.hurt || 0),
  ).toBe(afterSpike.hurts);
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await writeFile(
    info.outputPath('hazards.json'),
    JSON.stringify({ afterSpike }, null, 2),
  );
  await page.screenshot({ path: info.outputPath('sharp-landing.png') });
  expect(errors).toEqual([]);
});

test('a sealed water source feeds growth through the game loop, stops at seven and saves', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 49, 0, 'dripstoneBlock');
    w.set(0, 48, 0, 'pointedDripstone');
    w.setState(0, 48, 0, { facing: 0, open: false, upper: true });
    for (const [q, r] of [
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ])
      w.set(q, 50, r, 'stone');
    w.set(0, 51, 0, 'stone');
    w.fluids.source(0, 50, 0, 'water');
    g.graphics.updateCells([[0, 48, 0]]);
    g.teleport(1, 40, 0);
    g.lookAt(0, 45, 0);
    window.ecologyRandom = Math.random;
    Math.random = () => 0;
  });
  try {
    await expect
      .poll(
        () => page.evaluate(() => window.__hexwild.state.world.get(0, 42, 0)),
        { timeout: 20000 },
      )
      .toBe('pointedDripstone');
    const time = await page.evaluate(() => window.__hexwild.state.time);
    await expect
      .poll(() => page.evaluate(() => window.__hexwild.state.time))
      .toBeGreaterThan(time + 1.1);
    expect(
      await page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0)),
    ).toBeUndefined();
  } finally {
    await page.evaluate(() => {
      Math.random = window.ecologyRandom;
      delete window.ecologyRandom;
    });
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.graphics.dripstoneEffects.geometry.drawRange.count,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        window.__hexwild.graphics.dripstoneEffects.geometry.attributes.position
          .count,
    ),
  ).toBe(96);
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  const grown = await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    return {
      cells: [...w.dripstoneCells].filter((k) => /^0,4[2-8],0$/.test(k)).sort(),
      source: w.fluids.get(0, 50, 0),
      limitCell: w.get(0, 41, 0),
    };
  });
  expect(grown.cells.length).toBe(7);
  expect(grown.source.source).toBe(true);
  expect(grown.limitCell).toBeUndefined();
  await writeFile(
    info.outputPath('water-fed-growth.json'),
    JSON.stringify(grown, null, 2),
  );
  await page.screenshot({ path: info.outputPath('water-fed-growth.png') });
  expect(errors).toEqual([]);
});
