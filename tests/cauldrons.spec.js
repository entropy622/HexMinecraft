import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

async function use(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
}
async function aim(page, q, y, r, type) {
  await page.evaluate((p) => window.__hexwild.lookAt(...p), [q, y, r]);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const t = window.__hexwild.state.target;
          return t && [t.q + 0, t.r + 0, t.type];
        }),
      { timeout: 60000 },
    )
    .toEqual([q, r, type]);
}
async function room(page, viewport = { width: 1000, height: 700 }) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -5; q <= 6; q++)
      for (let r = -4; r <= 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 52; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    w.set(-2, 40, 0, 'workbench');
    cells.push([-2, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-1, 40, 0);
  });
}
async function cell(page) {
  return page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0));
}
async function held(page, id) {
  await page.evaluate((id) => window.__hexwild.selectItem(id), id);
}
async function floorColor(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            g.relightQueue.size === 0
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async (png) => {
    const g = window.__hexwild.graphics,
      { axialToWorld } = await import('/src/core.js'),
      world = axialToWorld(2, -1),
      p = g.camera.position
        .clone()
        .set(world.x, 40.01, world.z)
        .project(g.camera);
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const x = Math.round((p.x * 0.5 + 0.5) * c.width),
      y = Math.round((0.5 - p.y * 0.5) * c.height);
    if (x < 5 || y < 5 || x >= c.width - 5 || y >= c.height - 5)
      throw Error('Floor color patch outside viewport');
    const pixels = ctx.getImageData(x - 5, y - 5, 11, 11).data;
    return [0, 1, 2].map(
      (channel) =>
        pixels.reduce((n, v, i) => n + (i % 4 === channel ? v : 0), 0) /
        (121 * 255),
    );
  }, png);
}
test('seven iron becomes a placeable cauldron; bottles and buckets conserve water and survive Continue', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('ingot', 7);
    g.give('glassBottle', 4);
    g.give('waterBucket', 1);
  });
  await aim(page, -2, 40.5, 0, 'workbench');
  await use(page);
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.locator('#recipe-search').fill('炼药锅');
  const recipe = page.locator('[data-recipe]').filter({ hasText: '炼药锅' });
  await expect(recipe).toBeVisible({ timeout: 5000 });
  await recipe.click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => {
      const i = window.__hexwild.state.inventory;
      return [i.cauldron || 0, i.ingot || 0];
    }),
  ).toEqual([1, 0]);
  await page.keyboard.press('Escape');
  await held(page, 'cauldron');
  await aim(page, 0, 39.95, 0, 'stone');
  await use(page);
  await expect.poll(() => cell(page)).toBe('cauldron');
  const states = [];
  await held(page, 'waterBucket');
  await aim(page, 0, 40.8, 0, 'cauldron');
  await use(page);
  await expect.poll(() => cell(page)).toBe('waterCauldron3');
  for (const next of ['waterCauldron2', 'waterCauldron1', 'cauldron']) {
    const current = await cell(page);
    await held(page, 'glassBottle');
    await aim(page, 0, 40.8, 0, current);
    await use(page);
    await expect.poll(() => cell(page)).toBe(next);
    states.push(next);
    if (next === 'waterCauldron2') {
      await held(page, 'bucket');
      await aim(page, 0, 40.8, 0, next);
      await use(page);
      expect(await cell(page)).toBe(next);
    }
  }
  expect(
    await page.evaluate(() => {
      const i = window.__hexwild.state.inventory;
      return [i.waterBottle || 0, i.glassBottle || 0, i.bucket || 0];
    }),
  ).toEqual([3, 1, 1]);
  for (const next of ['waterCauldron1', 'waterCauldron2', 'waterCauldron3']) {
    const current = await cell(page);
    await held(page, 'waterBottle');
    await aim(page, 0, 40.8, 0, current);
    await use(page);
    await expect.poll(() => cell(page)).toBe(next);
    states.push(next);
  }
  await held(page, 'bucket');
  await aim(page, 0, 40.8, 0, 'waterCauldron3');
  await use(page);
  await expect.poll(() => cell(page)).toBe('cauldron');
  await held(page, 'waterBucket');
  await aim(page, 0, 40.8, 0, 'cauldron');
  await use(page);
  await expect.poll(() => cell(page)).toBe('waterCauldron3');
  const before = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return {
      cell: g.state.world.get(0, 40, 0),
      bottles: g.state.inventory.glassBottle,
      bucket: g.state.inventory.bucket,
    };
  });
  await page.reload();
  await page.locator('#continue').click();
  const after = await page.evaluate(() => {
    const g = window.__hexwild;
    return {
      cell: g.state.world.get(0, 40, 0),
      bottles: g.state.inventory.glassBottle,
      bucket: g.state.inventory.bucket,
    };
  });
  await page.screenshot({ path: info.outputPath('water-cauldron.png') });
  await writeFile(
    info.outputPath('manual.json'),
    JSON.stringify({ states, before, after, errors }, null, 2),
  );
  expect(after).toEqual(before);
  expect(after).toEqual({ cell: 'waterCauldron3', bottles: 4, bucket: 1 });
  // A filled internal block must pick and drop the actual empty cauldron item.
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('cauldron', 1);
    g.selectItem('glassBottle');
  });
  await aim(page, 0, 40.8, 0, 'waterCauldron3');
  await page.evaluate(() => {
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }));
    window.__hexwild.save();
  });
  expect(
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
      return s.inventory.slots[s.selected]?.item;
    }),
  ).toBe('cauldron');
  await page.evaluate(() => window.__hexwild.setTool(2));
  await aim(page, 0, 40.8, 0, 'waterCauldron3');
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  try {
    await expect.poll(() => cell(page), { timeout: 60000 }).toBe(undefined);
  } finally {
    await page.evaluate(() =>
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
    );
  }
  const recovered = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    const stacks = [
      ...s.inventory.slots.filter(Boolean),
      ...s.dimensions.overworld.drops.map((d) => ({
        item: d.item,
        count: d.count,
      })),
    ];
    return {
      cauldrons: stacks
        .filter((s) => s.item === 'cauldron')
        .reduce((n, s) => n + s.count, 0),
      variants: stacks.filter((s) => /^(water|lava)Cauldron/.test(s.item)),
      worldFluid: g.state.world.fluids.get(0, 40, 0) || null,
    };
  });
  await writeFile(
    info.outputPath('recovery.json'),
    JSON.stringify({ ...recovered, errors }, null, 2),
  );
  expect(recovered.cauldrons).toBe(2);
  expect(recovered.variants).toEqual([]);
  expect(recovered.worldFluid).toBeFalsy();
  expect(errors).toEqual([]);
});

test('real source drips fill receivers, respect a cover and pause, drive comparators and supply furnace fuel', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world,
      { DIRECTIONS } = await import('/src/core.js'),
      cells = [];
    for (const [q, r, liquid, length] of [
      [0, 0, 'water', 2],
      [2, 0, 'lava', 1],
      [0, 2, 'water', 2],
    ]) {
      w.set(q, 40, r, 'cauldron');
      cells.push([q, 40, r]);
      for (let y = 44; y < 44 + length; y++) {
        w.set(q, y, r, 'pointedDripstone');
        w.setState(q, y, r, { facing: 0, open: false, upper: true });
        cells.push([q, y, r]);
      }
      w.set(q, 44 + length, r, 'stone');
      cells.push([q, 44 + length, r]);
      for (const [dq, dr] of DIRECTIONS) {
        w.set(q + dq, 45 + length, r + dr, 'stone');
        cells.push([q + dq, 45 + length, r + dr]);
      }
      w.fluids.source(q, 45 + length, r, liquid);
    }
    w.set(0, 42, 2, 'glass');
    cells.push([0, 42, 2]);
    for (const q of [1, 3]) {
      w.set(q, 40, 0, 'comparator');
      w.setState(q, 40, 0, { facing: 0, open: false, output: 0 });
      cells.push([q, 40, 0]);
    }
    w.set(-1, 40, -2, 'furnace');
    cells.push([-1, 40, -2]);
    g.graphics.updateCells(cells);
    g.teleport(1, 40, 1);
    g.lookAt(1, 42, 0);
    window.cauldronRandom = Math.random;
    Math.random = () => 0;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window.__hexwild.state.world;
          return [
            w.get(0, 40, 0),
            w.get(2, 40, 0),
            w.get(0, 40, 2),
            w.state(1, 40, 0).output,
            w.state(3, 40, 0).output,
          ];
        }),
      { timeout: 60000 },
    )
    .toEqual(['waterCauldron3', 'lavaCauldron', 'cauldron', 3, 3]);
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let y = 39; y < 42; y++) {
      g.state.world.set(1, y, 5, 'stone');
      cells.push([1, y, 5]);
    }
    g.graphics.updateCells(cells);
    g.teleport(1, 42, 5);
    g.lookAt(1, 43.5, 0);
  });
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('drip-farm.png') });
  await page.keyboard.press('F1');
  await page.evaluate(() => {
    window.__hexwild.teleport(1, 40, 1);
    window.__hexwild.lookAt(1, 42, 0);
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(0, 42, 2, null);
    g.graphics.updateCells([[0, 42, 2]]);
  });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const next = () =>
          ++frames === 60 ? resolve() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      }),
  );
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 40, 2)),
  ).toBe('cauldron');
  await page.locator('#resume').click();
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 2)),
      { timeout: 60000 },
    )
    .toBe('waterCauldron3');
  await page.evaluate(() => {
    Math.random = window.cauldronRandom;
    const g = window.__hexwild;
    g.give('bucket', 1);
    g.selectItem('bucket');
  });
  await aim(page, 2, 40.8, 0, 'lavaCauldron');
  await use(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild;
          return [
            g.state.inventory.lavaBucket || 0,
            g.state.world.state(3, 40, 0).output,
          ];
        }),
      { timeout: 60000 },
    )
    .toEqual([1, 0]);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('rawIron', 1);
    g.teleport(-1, 40, -1);
  });
  await aim(page, -1, 40.5, -2, 'furnace');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  for (const item of ['rawIron', 'lavaBucket']) {
    const index = await page.evaluate((item) => {
      window.__hexwild.save();
      return JSON.parse(
        localStorage.getItem('hexwild-save-v16'),
      ).inventory.slots.findIndex((s) => s?.item === item);
    }, item);
    expect(index).toBeGreaterThanOrEqual(0);
    await page
      .locator(`#station-overlay [data-inv-slot="pack:${index}"]`)
      .click({ modifiers: ['Shift'] });
  }
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const f = window.__hexwild.state.world.furnaces.get('-1,40,-2');
          return f && [f.output?.item, f.output?.count, f.fuel?.item];
        }),
      { timeout: 60000 },
    )
    .toEqual(['ingot', 1, 'bucket']);
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const w = g.state.world;
    return {
      water: w.get(0, 40, 0),
      other: w.get(0, 40, 2),
      furnace: [
        w.furnaces.get('-1,40,-2').output,
        w.furnaces.get('-1,40,-2').fuel,
      ],
    };
  });
  await page.reload();
  await page.locator('#continue').click();
  const after = await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    return {
      water: w.get(0, 40, 0),
      other: w.get(0, 40, 2),
      furnace: [
        w.furnaces.get('-1,40,-2').output,
        w.furnaces.get('-1,40,-2').fuel,
      ],
    };
  });
  await writeFile(
    info.outputPath('farm.json'),
    JSON.stringify({ before, after, errors }, null, 2),
  );
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('the player enters the real cavity; water extinguishes once while lava burns and fire resistance protects', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(0, 40, 0, 'waterCauldron3');
    w.set(2, 40, 0, 'lavaCauldron');
    const { DIRECTIONS } = await import('/src/core.js');
    for (const [dq, dr] of DIRECTIONS) w.set(4 + dq, 40, 2 + dr, 'stone');
    w.fluids.source(4, 40, 2, 'lava');
    g.graphics.updateCells([
      [0, 40, 0],
      [2, 40, 0],
    ]);
    g.teleport(0, 40.32, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]))
    .toBeGreaterThan(41.9);
  expect(await cell(page)).toBe('waterCauldron3');
  const start = await page.evaluate(() => window.__hexwild.state.health);
  await page.evaluate(() => window.__hexwild.teleport(4, 40, 2));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health), {
      timeout: 60000,
    })
    .toBeLessThan(start);
  await page.evaluate(() => window.__hexwild.teleport(0, 40.32, 0));
  await expect
    .poll(() => cell(page), { timeout: 60000 })
    .toBe('waterCauldron2');
  const wet = await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.fluids.scoop(4, 40, 2);
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      burning: s.survival.burning,
      air: s.survival.air,
      cell: g.state.world.get(0, 40, 0),
      eye: g.state.position[1],
      health: g.state.health,
    };
  });
  expect(wet.burning).toBe(0);
  expect(wet.air).toBe(15);
  expect(wet.eye).toBeCloseTo(41.9625, 1);
  await page.evaluate(() => window.__hexwild.teleport(2, 40.32, 0));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health), {
      timeout: 60000,
    })
    .toBeLessThan(wet.health);
  const lava = await page.evaluate(() => {
    window.__hexwild.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      cell: window.__hexwild.state.world.get(2, 40, 0),
      burning: s.survival.burning,
      health: s.health,
    };
  });
  expect(lava.cell).toBe('lavaCauldron');
  expect(lava.burning).toBeGreaterThan(0);
  await page.evaluate(() => window.__hexwild.teleport(0, 40.32, 0));
  await expect.poll(() => cell(page)).toBe('waterCauldron1');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-2, 40, 0);
    g.lookAt(-2, 46, 0);
    g.give('fireResistancePotion', 1);
    g.selectItem('fireResistancePotion');
    g.eat();
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.state.inventory.fireResistancePotion || 0,
        ),
      { timeout: 60000 },
    )
    .toBe(0);
  await page.evaluate(() => window.__hexwild.teleport(2, 40.32, 0));
  const protectedStart = await page.evaluate(() => ({
    health: window.__hexwild.state.health,
    time: window.__hexwild.state.time,
  }));
  await expect
    .poll(
      () =>
        page.evaluate(
          (s) => window.__hexwild.state.time - s.time,
          protectedStart,
        ),
      { timeout: 60000 },
    )
    .toBeGreaterThan(1.2);
  const protectedEnd = await page.evaluate(() => {
    window.__hexwild.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    return {
      health: s.health,
      burning: s.survival.burning,
      effect: !!s.survival.effects.fireResistance,
    };
  });
  expect(protectedEnd.health).toBeGreaterThanOrEqual(protectedStart.health);
  expect(protectedEnd.burning).toBe(0);
  expect(protectedEnd.effect).toBeTruthy();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(2, 40, -2);
    g.lookAt(2, 40.6, 0);
    g.step(450 - g.state.time);
  });
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('cauldron-contact.png') });
  const litFloor = await floorColor(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('bucket', 1);
    g.selectItem('bucket');
  });
  await aim(page, 2, 40.8, 0, 'lavaCauldron');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(2, 40, 0)))
    .toBe('cauldron');
  // The collected lava bucket is itself a real hand light. Compare the same
  // non-emissive hand item on both sides of the block-light measurement.
  await held(page, 'glassBottle');
  const emptyFloor = await floorColor(page);
  await writeFile(
    info.outputPath('contact.json'),
    JSON.stringify(
      {
        wet,
        lava,
        protectedStart: { health: protectedStart.health },
        protectedEnd,
        litFloor,
        emptyFloor,
        errors,
      },
      null,
      2,
    ),
  );
  expect(litFloor[0]).toBeGreaterThan(emptyFloor[0] + 0.04);
  expect(litFloor[0] / litFloor[2]).toBeGreaterThan(
    emptyFloor[0] / emptyFloor[2] + 0.25,
  );
  expect(errors).toEqual([]);
});

test.describe('touch and precipitation', () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  test('rain reaches an open cauldron; mobile use exchanges offhand bottles even with a full pack', async ({
    page,
  }, info) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await room(page, { width: 390, height: 844 });
    await page.evaluate(() => {
      const g = window.__hexwild,
        w = g.state.world;
      w.set(0, 40, 0, 'cauldron');
      w.set(2, 40, 0, 'cauldron');
      w.set(2, 43, 0, 'glass');
      g.graphics.updateCells([
        [0, 40, 0],
        [2, 40, 0],
        [2, 43, 0],
      ]);
      window.cauldronRandom = Math.random;
      Math.random = () => 0;
    });
    await page.keyboard.press('Escape');
    await page.locator('#mode-toggle').click();
    await page.locator('[data-weather="rain"]').click();
    await page.locator('#resume').click();
    await expect
      .poll(() => cell(page), { timeout: 90000 })
      .toBe('waterCauldron3');
    expect(
      await page.evaluate(() => window.__hexwild.state.world.get(2, 40, 0)),
    ).toBe('cauldron');
    const restored = await page.evaluate(() => {
      Math.random = window.cauldronRandom;
      const g = window.__hexwild,
        w = g.state.world;
      w.set(0, 43, 0, 'glass');
      g.graphics.updateCells([[0, 43, 0]]);
      g.give('glassBottle', 3);
      g.give('pick2', 1);
      g.selectItem('pick2');
      g.save();
      const s = JSON.parse(localStorage.getItem('hexwild-save-v16')),
        bottles = s.inventory.slots.find((s) => s?.item === 'glassBottle'),
        pick = s.inventory.slots.find((s) => s?.item === 'pick2');
      s.creative = false;
      s.creativeFlying = false;
      s.inventory.gear[4] = bottles;
      s.inventory.slots = s.inventory.slots.map((_, i) =>
        i === s.selected ? pick : { item: 'stone', count: 64 },
      );
      return s;
    });
    await page.addInitScript(
      (s) => localStorage.setItem('hexwild-save-v16', JSON.stringify(s)),
      restored,
    );
    await page.reload();
    await page.locator('#continue').click();
    for (const next of ['waterCauldron2', 'waterCauldron1', 'cauldron']) {
      await aim(page, 0, 40.8, 0, await cell(page));
      await page.locator('[data-action="place"]').tap();
      await expect.poll(() => cell(page)).toBe(next);
    }
    const snapshot = await page.evaluate(() => {
      const g = window.__hexwild;
      g.save();
      const s = JSON.parse(localStorage.getItem('hexwild-save-v16')),
        stacks = [
          ...s.inventory.slots.filter(Boolean),
          ...s.inventory.gear.filter(Boolean),
          ...s.dimensions.overworld.drops,
        ];
      return {
        cell: g.state.world.get(0, 40, 0),
        waterBottles: stacks
          .filter((s) => s.item === 'waterBottle')
          .reduce((n, s) => n + s.count, 0),
        glassBottles: stacks
          .filter((s) => s.item === 'glassBottle')
          .reduce((n, s) => n + s.count, 0),
        offhand: s.inventory.gear[4]?.item,
        overflow: document.documentElement.scrollWidth > innerWidth,
        locked: !!document.pointerLockElement,
      };
    });
    await page.screenshot({ path: info.outputPath('touch-cauldron.png') });
    await writeFile(
      info.outputPath('touch-rain.json'),
      JSON.stringify({ ...snapshot, errors }, null, 2),
    );
    expect(snapshot).toEqual({
      cell: 'cauldron',
      waterBottles: 3,
      glassBottles: 0,
      offhand: 'waterBottle',
      overflow: false,
      locked: false,
    });
    expect(errors).toEqual([]);
  });
});
