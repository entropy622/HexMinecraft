import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { DYES } from '../src/dye-data.js';
import { woolItem } from '../src/wool-data.js';

test.setTimeout(240000);
const colors = Object.keys(DYES);
const carpet = (color) => color + 'Carpet';
const cells = colors.map((color, i) => ({
  color,
  q: (i % 4) - 1,
  r: Math.floor(i / 4) - 1,
}));
async function clickWorld(page, button = 2) {
  await page.evaluate((button) => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button, bubbles: true }));
  }, button);
}
async function aim(page, q, y, r, expected) {
  await page.evaluate(({ q, y, r }) => window.__hexwild.lookAt(q, y, r), {
    q,
    y,
    r,
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe(expected);
}
async function save(page) {
  return page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
}
async function platform(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      changed = [];
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 5; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y < 46; y++) w.set(q, y, r, null);
        changed.push([q, 39, r]);
      }
    g.graphics.updateCells(changed);
    g.teleport(-3, 40, 0);
  });
  return errors;
}
async function placeAt(page, id, q, y, r, support) {
  await page.evaluate(
    ({ id, q, y, r }) => {
      const g = window.__hexwild;
      g.teleport(q - 1, 40, r + 1);
      g.selectItem(id);
    },
    { id, q, y, r },
  );
  await aim(
    page,
    q,
    support.endsWith('Carpet') ? y - 0.97 : y - 0.02,
    r,
    support,
  );
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.place))
    .toEqual({ q, y, r });
  await clickWorld(page);
  await expect
    .poll(() =>
      page.evaluate(
        ({ q, y, r }) => window.__hexwild.state.world.get(q, y, r),
        { q, y, r },
      ),
    )
    .toBe(id);
}
async function mineAt(page, q, y, r, type) {
  await aim(page, q, y, r, type);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  try {
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ q, y, r }) =>
              window.__hexwild.state.world.get(q, Math.floor(y), r) || null,
            { q, y, r },
          ),
        { timeout: 15000 },
      )
      .toBe(null);
  } finally {
    await page.evaluate(() =>
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
    );
  }
}

test('personal UI crafts all sixteen colors, lays thin wool floors, mines one back and continues the actual v16 save', async ({
  page,
}, info) => {
  const errors = await platform(page);
  await page.evaluate((ids) => {
    for (const id of ids) window.__hexwild.give(id, 2);
  }, colors.map(woolItem));
  await page.keyboard.press('KeyE');
  for (const color of colors) {
    const name = DYES[color].name + '地毯';
    await page.locator('#recipe-search').fill(name);
    await page
      .locator('[data-recipe].can-fill')
      .filter({ hasText: new RegExp('^' + name) })
      .click();
    await page.locator('#craft-button').click({ modifiers: ['Shift'] });
    expect(
      await page.evaluate(
        (id) => window.__hexwild.state.inventory[id] || 0,
        carpet(color),
      ),
    ).toBe(3);
    expect(
      await page.evaluate(
        (id) => window.__hexwild.state.inventory[id] || 0,
        woolItem(color),
      ),
    ).toBe(0);
  }
  await page.keyboard.press('Escape');
  for (const { color, q, r } of cells)
    await placeAt(page, carpet(color), q, 40, r, 'stone');
  const placed = await page.evaluate(
    (cells) =>
      cells.map(({ color, q, r }) => {
        const w = window.__hexwild.state.world;
        return {
          color,
          type: w.get(q, 40, r),
          floor: w.groundAt(Math.sqrt(3) * (q + r / 2), 1.5 * r, 40, 41),
        };
      }),
    cells,
  );
  for (const result of placed) {
    expect(result.type).toBe(carpet(result.color));
    expect(result.floor).toBe(40.0625);
  }
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-3, 40, -1);
    g.lookAt(-1, 41.62, -1);
  });
  await page.keyboard.down('KeyW');
  try {
    await expect
      .poll(
        () => page.evaluate(() => window.__hexwild.state.position[1] - 1.62),
        { timeout: 10000 },
      )
      .toBeCloseTo(40.0625, 3);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-3, 40, 3);
    g.selectItem('blueCarpet');
    g.lookAt(0, 40, 0);
  });
  const held = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      mesh = g.held.children[0];
    mesh.geometry.computeBoundingBox();
    return {
      id: g.heldKey,
      thickness:
        mesh.geometry.boundingBox.max.y - mesh.geometry.boundingBox.min.y,
      sharedAtlas: mesh.material.map === g.textures.atlas,
    };
  });
  expect(held).toEqual({
    id: 'blueCarpet',
    thickness: 0.0625,
    sharedAtlas: true,
  });
  await page.screenshot({ path: info.outputPath('sixteen-wool-carpets.png') });
  const blue = cells.find((cell) => cell.color === 'blue');
  await page.evaluate(({ q, r }) => {
    window.__hexwild.teleport(q - 1, 40.2, r + 1);
  }, blue);
  await mineAt(page, blue.q, 40.03, blue.r, 'blueCarpet');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const drop = window.__hexwild.graphics.scene.children.find(
          (o) => o.userData.enchantHalo,
        );
        if (!drop) return null;
        const mesh = drop.children[0];
        mesh.geometry.computeBoundingBox();
        return (
          mesh.geometry.boundingBox.max.y - mesh.geometry.boundingBox.min.y
        );
      }),
    )
    .toBe(0.0625);
  await page.screenshot({ path: info.outputPath('mined-carpet-drop.png') });
  await page.evaluate(({ q, r }) => window.__hexwild.teleport(q, 40, r), blue);
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.inventory.blueCarpet || 0),
      { timeout: 15000 },
    )
    .toBe(3);
  const before = await save(page);
  await page.reload();
  await page.locator('#continue').click();
  const after = await save(page);
  expect(after.version).toBe(16);
  const continued = await page.evaluate(
    (cells) =>
      cells.map(({ color, q, r }) => ({
        color,
        type: window.__hexwild.state.world.get(q, 40, r) || null,
        inventory: window.__hexwild.state.inventory[color + 'Carpet'] || 0,
      })),
    cells,
  );
  for (const row of continued) {
    expect(row.type).toBe(row.color === 'blue' ? null : carpet(row.color));
    expect(row.inventory).toBe(row.color === 'blue' ? 3 : 2);
  }
  expect(before.inventory).toEqual(after.inventory);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('carpet-lifecycle.json'),
    JSON.stringify(
      {
        costPerColor: 2,
        producedPerColor: 3,
        placed,
        walkingFloor: 40.0625,
        held,
        dropThickness: 0.0625,
        minedBack: 'blueCarpet',
        continued,
        version: after.version,
        errors,
      },
      null,
      2,
    ),
  );
});

test('real support mining drops stacked carpets once and a fence retains its high center collider', async ({
  page,
}, info) => {
  const errors = await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('redCarpet', 3);
    g.give('fence', 1);
    g.give('stone', 2);
    g.give('pick4', 1);
    g.selectItem('redCarpet');
    g.teleport(-3, 40, 0);
  });
  await aim(page, -3, 39.99, 0, 'stone');
  await clickWorld(page);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(-3, 40, 0) || null,
    ),
  ).toBe(null);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redCarpet),
  ).toBe(3);
  await placeAt(page, 'stone', 0, 40, 0, 'stone');
  await placeAt(page, 'redCarpet', 0, 41, 0, 'stone');
  await placeAt(page, 'redCarpet', 0, 42, 0, 'redCarpet');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-1, 40, 0);
    g.selectItem('pick4');
  });
  await mineAt(page, 0, 40.1, 0, 'stone');
  const broken = await save(page);
  const unsupported = await page.evaluate(() =>
    [41, 42].map((y) => window.__hexwild.state.world.get(0, y, 0) || null),
  );
  expect(unsupported).toEqual([null, null]);
  expect(
    broken.dimensions.overworld.drops
      .filter((d) => d.item === 'redCarpet')
      .reduce((n, d) => n + d.count, 0),
  ).toBe(2);
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 0));
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.inventory.redCarpet || 0),
      { timeout: 15000 },
    )
    .toBe(3);
  await placeAt(page, 'fence', 2, 40, 0, 'stone');
  // A fence's visible top extends into the next cell; the target still belongs to the fence cell.
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(1, 40, 1);
    g.selectItem('redCarpet');
  });
  await aim(page, 2, 41.49, 0, 'fence');
  await clickWorld(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(2, 41, 0)))
    .toBe('redCarpet');
  const fence = await page.evaluate(async () => {
    const { axialToWorld } = await import('/src/core.js');
    const w = window.__hexwild.state.world,
      p = axialToWorld(2, 0);
    return {
      center: w.groundAt(p.x, p.z, 40, 42),
      rim: w.groundAt(p.x + 0.5, p.z, 40, 42),
    };
  });
  expect(fence).toEqual({ center: 41.5, rim: 41.0625 });
  await save(page);
  await page.reload();
  await page.locator('#continue').click();
  const continued = await save(page);
  expect(
    continued.dimensions.overworld.drops.filter((d) => d.item === 'redCarpet'),
  ).toHaveLength(0);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redCarpet || 0),
  ).toBe(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('fence-carpet.png') });
  await writeFile(
    info.outputPath('carpet-support.json'),
    JSON.stringify(
      {
        unsupported,
        dropped: 2,
        recovered: 2,
        playerOverlapRejectedWithoutCost: true,
        fence,
        noDuplicateDropsAfterContinue: true,
        errors,
      },
      null,
      2,
    ),
  );
});

test('normal piston retraction and a real water bucket remove unsupported or flooded carpet exactly once', async ({
  page,
}, info) => {
  const errors = await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    // A production-shaped circuit fixture; player use and the real scheduler drive it.
    w.set(-1, 40, 0, 'piston');
    w.setState(-1, 40, 0, { facing: 0, open: false, powered: false });
    w.set(0, 40, 0, 'stone');
    w.set(-1, 40, 1, 'lever');
    w.setState(-1, 40, 1, {
      facing: 0,
      open: false,
      powered: false,
      mount: 'floor',
    });
    g.graphics.updateCells([
      [-1, 40, 0],
      [0, 40, 0],
      [-1, 40, 1],
    ]);
    g.give('redCarpet', 1);
    g.give('blueCarpet', 1);
    g.give('lever', 1);
    g.give('waterBucket', 1);
  });
  await placeAt(page, 'redCarpet', 0, 41, 0, 'stone');
  await page.evaluate(() => window.__hexwild.teleport(-2, 40, 2));
  await aim(page, -1, 40.2, 1, 'lever');
  await clickWorld(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(-1, 40, 0).open),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0)),
  ).toBe('redCarpet');
  await clickWorld(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.state(-1, 40, 0).open),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 41, 0) || null),
    )
    .toBe(null);
  await placeAt(page, 'blueCarpet', 3, 40, 0, 'stone');
  await page.evaluate(() => window.__hexwild.selectItem('lever'));
  await aim(page, 3, 40.03, 0, 'blueCarpet');
  await clickWorld(page);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(3, 41, 0) || null,
    ),
  ).toBe(null);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.lever),
  ).toBe(1);
  await page.evaluate(() => window.__hexwild.selectItem('waterBucket'));
  await clickWorld(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.world.get(3, 40, 0) || null),
      { timeout: 15000 },
    )
    .toBe(null);
  const before = await save(page);
  const totals = (saved) =>
    ['redCarpet', 'blueCarpet'].map((item) => ({
      item,
      count:
        saved.inventory.slots
          .filter((s) => s?.item === item)
          .reduce((n, s) => n + s.count, 0) +
        saved.dimensions.overworld.drops
          .filter((d) => d.item === item)
          .reduce((n, d) => n + d.count, 0),
    }));
  expect(totals(before)).toEqual([
    { item: 'redCarpet', count: 1 },
    { item: 'blueCarpet', count: 1 },
  ]);
  await page.reload();
  await page.locator('#continue').click();
  const after = await save(page);
  expect(totals(after)).toEqual(totals(before));
  expect(errors).toEqual([]);
  await page.screenshot({
    path: info.outputPath('water-and-piston-carpet.png'),
  });
  await writeFile(
    info.outputPath('carpet-world-updates.json'),
    JSON.stringify(
      {
        remainedOnExtendedHead: true,
        droppedAfterRetraction: true,
        redstoneFullFaceRejected: true,
        washedByBucket: true,
        before: totals(before),
        after: totals(after),
        errors,
      },
      null,
      2,
    ),
  );
});
