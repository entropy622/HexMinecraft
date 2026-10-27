import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(180000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});
async function use(page) {
  await page.evaluate(() => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
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
      { timeout: 30000 },
    )
    .toEqual([q, r, type]);
}
async function room(page, snow = false) {
  await page.setViewportSize({ width: 720, height: 520 });
  await page.goto('/');
  await page.locator('#start').click();
  return page.evaluate((snow) => {
    const g = window.__hexwild,
      w = g.state.world;
    g.setPlaying(false);
    let site = { q: 0, r: 0 };
    if (snow) {
      const sites = [];
      for (let q = -64; q <= 64; q += 8)
        for (let r = -64; r <= 64; r += 8)
          if (w.biome(q, r) === '雪原') sites.push({ q, r });
      sites.sort((a, b) => Math.hypot(a.q, a.r) - Math.hypot(b.q, b.r));
      if (!sites.length) throw Error('No snowy fixture site');
      site = sites[0];
    }
    g.teleport(site.q - 2, 40, site.r);
    const cells = [];
    for (let q = site.q - 4; q <= site.q + 5; q++)
      for (let r = site.r - 4; r <= site.r + 4; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 63; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.step(120 - g.state.time);
    g.setPlaying(true);
    return site;
  }, snow);
}
async function held(page, id) {
  await page.evaluate((id) => window.__hexwild.selectItem(id), id);
}
async function snapshot(page) {
  return page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
}

test('actual snowfall fills a cauldron, and buckets move its powder snow through both hands and Continue', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await room(page, true);
  await page.evaluate((s) => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(s.q, 40, s.r, 'cauldron');
    w.set(s.q + 1, 40, s.r, 'comparator');
    w.setState(s.q + 1, 40, s.r, { facing: 0, open: false, output: 0 });
    g.graphics.updateCells([
      [s.q, 40, s.r],
      [s.q + 1, 40, s.r],
    ]);
    g.give('bucket', 1);
    g.give('pick1', 1);
  }, s);
  const saved = await snapshot(page);
  saved.weather = {
    kind: 'rain',
    rain: 1,
    storm: 0,
    wetness: 1,
    remaining: 180,
    sequence: 0,
  };
  saved.time = 180.5;
  await page.locator('#save-file').setInputFiles({
    name: 'snowfall.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time))
    .toBeGreaterThan(180);
  await page.evaluate(() => {
    window.powderRandom = Math.random;
    Math.random = () => 0;
  });
  let collected;
  try {
    await expect
      .poll(
        () =>
          page.evaluate((s) => {
            const w = window.__hexwild.state.world;
            return [w.get(s.q, 40, s.r), w.state(s.q + 1, 40, s.r).output];
          }, s),
        { timeout: 30000 },
      )
      .toEqual(['powderSnowCauldron3', 3]);
  } finally {
    collected = await page.evaluate((s) => {
      const w = window.__hexwild.state.world;
      return {
        biome: w.biome(s.q, s.r),
        type: w.get(s.q, 40, s.r),
        output: w.state(s.q + 1, 40, s.r).output,
      };
    }, s);
    await writeFile(
      info.outputPath('snowfall.json'),
      JSON.stringify(collected, null, 2),
    );
  }
  await page.evaluate((s) => {
    Math.random = window.powderRandom;
    const g = window.__hexwild;
    g.state.world.set(s.q, 44, s.r, 'glass');
    g.graphics.updateCells([[s.q, 44, s.r]]);
  }, s);
  await held(page, 'bucket');
  await aim(page, s.q, 40.8, s.r, 'powderSnowCauldron3');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate((s) => window.__hexwild.state.world.get(s.q, 40, s.r), s),
    )
    .toBe('cauldron');
  expect(
    (await snapshot(page)).inventory.slots.some(
      (v) => v?.item === 'powderSnowBucket',
    ),
  ).toBe(true);
  await page.keyboard.press('KeyF');
  await held(page, 'pick1');
  await page.evaluate(
    (s) => window.__hexwild.teleport(s.q + 1, 40, s.r + 2),
    s,
  );
  await aim(page, s.q + 2, 39.95, s.r + 1, 'stone');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        (s) => window.__hexwild.state.world.get(s.q + 2, 40, s.r + 1),
        s,
      ),
    )
    .toBe('powderSnow');
  await aim(page, s.q + 2, 40.5, s.r + 1, 'powderSnow');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(
        (s) => window.__hexwild.state.world.get(s.q + 2, 40, s.r + 1) || null,
        s,
      ),
    )
    .toBe(null);
  const afterScoop = await snapshot(page);
  expect(afterScoop.inventory.gear[4]?.item).toBe('powderSnowBucket');
  await aim(page, s.q, 40.8, s.r, 'cauldron');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate((s) => window.__hexwild.state.world.get(s.q, 40, s.r), s),
    )
    .toBe('powderSnowCauldron3');
  const before = await snapshot(page);
  await page.reload();
  await page.locator('#continue').click();
  const after = await snapshot(page);
  expect(after.inventory.gear[4]?.item).toBe('bucket');
  for (const k of [`${s.q},40,${s.r}`, `${s.q + 2},40,${s.r + 1}`])
    expect(new Map(after.dimensions.overworld.edits).get(k)).toEqual(
      new Map(before.dimensions.overworld.edits).get(k),
    );
  expect(
    new Map(after.dimensions.overworld.edits).get(`${s.q},40,${s.r}`),
  ).toBe('powderSnowCauldron3');
  await page.screenshot({ path: info.outputPath('powder-snow-cauldron.png') });
  await writeFile(
    info.outputPath('bucket-cycle.json'),
    JSON.stringify(
      {
        collected,
        afterScoop: afterScoop.inventory.gear[4],
        finalHand: after.inventory.gear[4],
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

async function loadFixture(page, saved) {
  const before = await page.evaluate(() => window.__hexwild.state.time);
  saved.time = before + 1;
  await page.locator('#save-file').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time), {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(saved.time);
}
async function equip(page, item, gear) {
  await page.keyboard.press('KeyE');
  await expect(page.locator('#craft-overlay')).toBeVisible();
  const saved = await snapshot(page),
    index = saved.inventory.slots.findIndex((s) => s?.item === item);
  expect(index).toBeGreaterThanOrEqual(0);
  const pack = page.locator(`#craft-overlay [data-inv-slot="pack:${index}"]`);
  await pack.click();
  await page.locator(`#craft-overlay [data-inv-slot="gear:${gear}"]`).click();
  await pack.click();
  await page.keyboard.press('KeyE');
}
async function freezeValue(page) {
  return Number(
    await page.locator('#freeze-bar').getAttribute('aria-valuenow'),
  );
}

test('real powder snow catches a fall, freezes bare skin, and equipped leather and boots provide distinct protection', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -2; q <= 2; q++)
      for (let r = -2; r <= 2; r++)
        for (let y = 40; y <= 42; y++) {
          g.state.world.set(q, y, r, 'powderSnow');
          cells.push([q, y, r]);
        }
    g.graphics.updateCells(cells);
    g.give('leatherChest', 1);
    g.give('leatherFeet', 1);
    g.give('ironFeet', 1);
  });
  const saved = await snapshot(page);
  saved.hunger = 10;
  saved.survival.saturation = 0;
  await loadFixture(page, saved);
  await page.evaluate(() => {
    window.__hexwild.teleport(0, 47, 0);
    window.__hexwild.lookAt(3, 42, 0);
  });
  await expect
    .poll(() => freezeValue(page), { timeout: 30000 })
    .toBeGreaterThan(1);
  const entered = await page.evaluate(() => ({
    position: window.__hexwild.state.position,
    health: window.__hexwild.state.health,
  }));
  expect(entered.health).toBe(20);
  await page.keyboard.press('Escape');
  const pausedCold = await freezeValue(page),
    pausedTime = await page.evaluate(() => window.__hexwild.state.time);
  await page.waitForTimeout(1200);
  expect(await freezeValue(page)).toBe(pausedCold);
  expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(
    pausedTime,
  );
  await page.locator('#resume').click();
  await expect.poll(() => freezeValue(page), { timeout: 40000 }).toBe(7);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health), {
      timeout: 20000,
    })
    .toBeLessThan(20);
  const injured = await page.evaluate(() => window.__hexwild.state.health);
  await page.screenshot({ path: info.outputPath('frozen-in-snow.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  expect(await freezeValue(page)).toBe(7);
  expect(await page.evaluate(() => window.__hexwild.state.health)).toBe(
    injured,
  );
  await page.locator('#resume').click();
  await equip(page, 'leatherChest', 1);
  await expect(page.locator('#freeze-bar')).toBeHidden({ timeout: 30000 });
  const insulated = await snapshot(page);
  expect(insulated.inventory.gear[1]?.item).toBe('leatherChest');
  expect(await page.evaluate(() => window.__hexwild.state.health)).toBe(
    injured,
  );
  // A leather chestplate insulates, but does not provide a top surface.
  await page.evaluate(() => window.__hexwild.teleport(0, 44, 0));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
      timeout: 15000,
    })
    .toBeLessThan(44);
  await equip(page, 'leatherFeet', 3);
  await page.evaluate(() => window.__hexwild.teleport(0, 44, 0));
  await page.waitForTimeout(1800);
  const supported = await page.evaluate(
    () => window.__hexwild.state.position[1],
  );
  expect(supported).toBeGreaterThan(44.5);
  expect(supported).toBeLessThan(44.8);
  await page.keyboard.down('ShiftLeft');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
      timeout: 15000,
    })
    .toBeLessThan(43.8);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.down('Space');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
      timeout: 15000,
    })
    .toBeGreaterThan(44.7);
  await page.keyboard.up('Space');
  // Iron boots do not acquire leather's support merely by occupying the slot.
  await equip(page, 'ironFeet', 3);
  await page.evaluate(() => window.__hexwild.teleport(0, 44, 0));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
      timeout: 15000,
    })
    .toBeLessThan(44);
  await page.keyboard.press('KeyE');
  await page
    .locator('#craft-overlay [data-inv-slot="gear:1"]')
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('KeyE');
  await expect
    .poll(() => freezeValue(page), { timeout: 15000 })
    .toBeGreaterThan(1);
  await writeFile(
    info.outputPath('player-snow.json'),
    JSON.stringify(
      {
        entered,
        pausedCold,
        injured,
        insulatedHealth: insulated.health,
        supported,
        ironBootsFall: true,
        freezeAfterRemovingLeather: await freezeValue(page),
        errors,
      },
      null,
      2,
    ),
  );
  await page.keyboard.press('Escape');
  await page.locator('#home').click();
  await expect(page.locator('#landing')).toBeVisible();
  expect(
    await page.locator('#frost-overlay').evaluate((e) => e.style.opacity),
  ).toBe('0');
  expect(errors).toEqual([]);
});

test('a production chicken sinks gradually through a deep snow trap, freezes and leaves real loot', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world,
      { axialToWorld, DIRECTIONS } = await import('/src/core.js'),
      cells = [];
    for (let y = 37; y <= 42; y++) {
      w.set(3, y, 0, 'powderSnow');
      cells.push([3, y, 0]);
      for (const [q, r] of DIRECTIONS) {
        w.set(3 + q, y, r, 'glass');
        cells.push([3 + q, y, r]);
      }
    }
    w.set(3, 36, 0, 'stone');
    cells.push([3, 36, 0]);
    g.graphics.updateCells(cells);
    const p = axialToWorld(3, 0);
    window.snowMobPosition = [p.x, 43, p.z];
  });
  const input = await snapshot(page),
    records = input.dimensions.overworld.fauna;
  const template =
    records.mobs.find((m) => m.kind === 'chicken') || records.mobs[0];
  expect(template).toBeTruthy();
  const id = records.nextId++;
  const spawn = await page.evaluate(async () => ({
    position: window.snowMobPosition,
    hp: (await import('/src/mob-data.js')).MOBS.chicken.hp,
  }));
  records.mobs.push({
    ...template,
    id,
    kind: 'chicken',
    hp: spawn.hp,
    position: spawn.position,
    baby: 0,
  });
  await loadFixture(page, input);
  const mob = () =>
    page.evaluate((id) => {
      const g = window.__hexwild;
      g.save();
      const m = JSON.parse(
        localStorage.getItem('hexwild-save-v16'),
      ).dimensions.overworld.fauna.mobs.find((m) => m.id === id);
      return m ? { height: m.position[1], hp: m.hp } : null;
    }, id);
  await expect
    .poll(async () => (await mob())?.height, { timeout: 15000 })
    .toBeLessThan(42.5);
  const sinking = await mob();
  expect(sinking.height).toBeGreaterThan(37.5);
  await expect
    .poll(async () => (await mob())?.hp, { timeout: 40000 })
    .toBeLessThan(4);
  const frozen = await mob();
  expect(frozen.height).toBeGreaterThanOrEqual(37);
  await expect.poll(mob, { timeout: 40000 }).toBe(null);
  const saved = await snapshot(page),
    loot = saved.dimensions.overworld.drops.filter((d) =>
      ['meat', 'feather'].includes(d.item),
    );
  expect(loot.some((d) => d.item === 'feather')).toBe(true);
  await page.screenshot({ path: info.outputPath('snow-trap.png') });
  await writeFile(
    info.outputPath('mob-snow.json'),
    JSON.stringify(
      {
        sinking,
        frozen,
        removed: true,
        loot: loot
          .map(({ item, count }) => ({ item, count }))
          .sort((a, b) => a.item.localeCompare(b.item)),
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('burning contact consumes real snow and water buckets wash it away without an illegal snow item', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-3, 40, -3, 'powderSnow');
    w.fluids.source(4, 40, 3, 'lava');
    g.graphics.updateCells([[-3, 40, -3]]);
    g.teleport(4, 40, 3);
  });
  await expect(page.locator('#fire-overlay')).toHaveClass(/active/, {
    timeout: 15000,
  });
  await page.evaluate(() => window.__hexwild.teleport(-3, 40, -3));
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.state.world.get(-3, 40, -3) || null,
        ),
      { timeout: 15000 },
    )
    .toBe(null);
  await expect(page.locator('#fire-overlay')).not.toHaveClass(/active/);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(-1, 40, -2, 'powderSnow');
    g.graphics.updateCells([[-1, 40, -2]]);
    g.give('waterBucket', 1);
    g.selectItem('waterBucket');
    g.teleport(-2, 40, -2);
  });
  await aim(page, -1, 40.99, -2, 'powderSnow');
  await use(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window.__hexwild.state.world;
          return [
            w.get(-1, 40, -2) || null,
            w.fluids.get(-1, 40, -2)?.type || null,
          ];
        }),
      { timeout: 30000 },
    )
    .toEqual([null, 'water']);
  const saved = await snapshot(page),
    all = [
      ...saved.inventory.slots,
      ...saved.inventory.gear,
      ...saved.dimensions.overworld.drops,
    ].filter(Boolean);
  expect(all.some((s) => s.item === 'powderSnow')).toBe(false);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    w.set(-2, 43, -3, 'stone');
    w.set(-1, 44, -3, 'powderSnow');
    g.graphics.updateCells([
      [-2, 43, -3],
      [-1, 44, -3],
    ]);
    g.teleport(-2, 44, -3);
  });
  await aim(page, -1, 44.5, -3, 'powderSnow');
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.state.world.get(-1, 44, -3) || null,
        ),
      { timeout: 15000 },
    )
    .toBe(null);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
  );
  const mined = await snapshot(page);
  expect(
    [...mined.inventory.slots, ...mined.dimensions.overworld.drops]
      .filter(Boolean)
      .some((s) => s.item === 'powderSnow'),
  ).toBe(false);
  await page.keyboard.press('Escape');
  await page.locator('#mode-toggle').click();
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (const [q, r] of [
      [-2, -3],
      [-2, -2],
    ])
      w.set(q, 43, r, 'stone');
    w.set(-1, 44, -3, 'powderSnow');
    g.graphics.updateCells([
      [-2, 43, -3],
      [-2, 43, -2],
      [-1, 44, -3],
    ]);
    g.teleport(-2, 44, -3);
  });
  await aim(page, -1, 44.5, -3, 'powderSnow');
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true })),
  );
  const picked = await snapshot(page);
  expect(picked.inventory.slots[picked.selected]?.item).toBe(
    'powderSnowBucket',
  );
  expect(picked.inventory.slots[picked.selected]?.count).toBe(1);
  await aim(page, -2, 43.99, -2, 'stone');
  await use(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(-2, 44, -2)),
    )
    .toBe('powderSnow');
  const placed = await snapshot(page);
  expect(placed.inventory.slots[placed.selected]?.item).toBe(
    'powderSnowBucket',
  );
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(-2, 44, -2)),
  ).toBe('powderSnow');
  await page.screenshot({ path: info.outputPath('placed-powder-snow.png') });
  await writeFile(
    info.outputPath('snow-melting.json'),
    JSON.stringify(
      {
        extinguished: true,
        consumedSnow: true,
        washedByWater: true,
        illegalSnowItems: 0,
        minedWithoutInternalItem: true,
        creativePickBucket: true,
        placedSnowSurvivesContinue: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('natural population never creates animals inside a powder-covered surface', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    g.setPlaying(false);
    for (const k of w.chunks.keys()) {
      const [cq, cr] = k.split(',').map(Number);
      for (let q = cq * 8; q < cq * 8 + 8; q++)
        for (let r = cr * 8; r < cr * 8 + 8; r++) {
          const h = w.terrainHeight(q, r);
          if (h > 3) {
            w.set(q, h - 1, r, 'powderSnow');
            w.set(q, h - 2, r, 'powderSnow');
          }
        }
    }
  });
  const input = await snapshot(page);
  input.dimensions.overworld.fauna = { nextId: 1, mobs: [], regions: [] };
  await loadFixture(page, input);
  const saved = await snapshot(page),
    animals = saved.dimensions.overworld.fauna.mobs;
  const observed = await page.evaluate(async (animals) => {
    const { worldToAxial } = await import('/src/core.js');
    return animals.map((m) => {
      const w = window.__hexwild.state.world,
        [x, y, z] = m.position,
        a = worldToAxial(x, z);
      return {
        kind: m.kind,
        position: m.position,
        powder: w.get(a.q, Math.floor(y + 0.01), a.r) === 'powderSnow',
      };
    });
  }, animals);
  await writeFile(
    info.outputPath('snow-spawning.json'),
    JSON.stringify({ animals: observed, errors }, null, 2),
  );
  expect(observed.filter((m) => m.powder)).toHaveLength(0);
  expect(errors).toEqual([]);
});
