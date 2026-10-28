import { test, expect } from './browser-fixture.js';
import { writeFile, readFile } from 'node:fs/promises';
import { DataUtils } from 'three';
import { World } from '../src/world.js';
import { worldToAxial } from '../src/core.js';

test.setTimeout(240000);
const errorsByPage = new WeakMap();
test.beforeEach(async ({ page }) => {
  errorsFor(page);
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
});
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const state = await page
    .evaluate(async () => {
      const g = window.__hexwild;
      if (!g) return { developmentFixture: false };
      const { worldToAxial } = await import('/src/core.js');
      g.save();
      const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
      return {
        fauna: s.dimensions.overworld.fauna,
        inventory: s.inventory,
        support: s.dimensions.overworld.fauna.mobs
          .filter((m) => m.kind === 'sheep')
          .map((m) => {
            const [x, y, z] = m.position,
              a = worldToAxial(x, z);
            return {
              id: m.id,
              cell: a,
              feet: y,
              blockBelow: g.state.world.get(a.q, Math.floor(y) - 1, a.r),
              ground: g.state.world.groundAt(x, z, y - 1, y + 0.1),
            };
          }),
        playing: g.state.playing,
      };
    })
    .catch((e) => ({ error: e.message }));
  await writeFile(
    info.outputPath('failure-state.json'),
    JSON.stringify({ ...state, errors: errorsByPage.get(page) }, null, 2),
  );
  await page.screenshot({ path: info.outputPath('failure.png') });
});
async function use(page) {
  await page.evaluate(() => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
}
async function snapshot(page) {
  return page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
}
async function load(page, saved) {
  saved.time += 2;
  await page.locator('#save-file').setInputFiles({
    name: 'sheep-pasture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time))
    .toBeGreaterThanOrEqual(saved.time);
}
async function pasture(page) {
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -6; q <= 6; q++)
      for (let r = -6; r <= 6; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(-2, 40, 0);
  });
  const saved = await snapshot(page),
    d = saved.dimensions.overworld;
  expect(d.fauna.mobs.length).toBeGreaterThan(0);
  const sheep = {
    ...d.fauna.mobs[0],
    kind: 'sheep',
    position: [0, 40, 0],
    hp: 8,
    baby: 0,
    wool: 0,
    love: 0,
    cooldown: 0,
  };
  delete sheep.color; // An actual pre-feature v16 sheep has no color field.
  d.fauna.mobs = [sheep];
  await load(page, saved);
  return sheep.id;
}
async function equip(page, item, count = 1) {
  await page.evaluate(
    ({ item, count }) => {
      const g = window.__hexwild;
      g.give(item, count);
      g.selectItem(item);
    },
    { item, count },
  );
}
async function aimSheep(page, id, side = -1) {
  await page.evaluate(
    ({ id, side }) => {
      const g = window.__hexwild;
      g.save();
      const m = JSON.parse(
        localStorage.getItem('hexwild-save-v16'),
      ).dimensions.overworld.fauna.mobs.find((m) => m.id === id);
      const [x, y, z] = m.position,
        r = z / 1.5,
        q = x / Math.sqrt(3) - r / 2;
      g.teleport(q + side * 1.5, y, r);
      g.lookAt(q, y + 0.75, r);
    },
    { id, side },
  );
  await frames(page, 3);
  await expect(page.locator('#target')).toContainText('绵羊');
}

test('a player dyes a real sheep, shears colored wool, places it and continues with the same color', async ({
  page,
}, info) => {
  const errors = errorsFor(page);
  const id = await pasture(page);
  await equip(page, 'redDye', 2);
  await aimSheep(page, id);
  await use(page);
  const dyed = await snapshot(page);
  expect(
    dyed.dimensions.overworld.fauna.mobs.find((m) => m.id === id).color,
  ).toBe('red');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redDye),
  ).toBe(1);
  await page.screenshot({ path: info.outputPath('red-sheep.png') });
  await aimSheep(page, id);
  await use(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redDye),
  ).toBe(1);
  await equip(page, 'shears');
  await aimSheep(page, id);
  await use(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redWool),
  ).toBe(3);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-1, 40, 2);
    g.selectItem('redWool');
    g.lookAt(0, 39.9, 2);
  });
  await frames(page, 3);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(0, 40, 2)))
    .toBe('redWool');
  await snapshot(page);
  await page.reload();
  await page.locator('#continue').click();
  const continued = await snapshot(page),
    sheep = continued.dimensions.overworld.fauna.mobs.find((m) => m.id === id);
  expect(sheep.color).toBe('red');
  expect(sheep.wool).toBeGreaterThan(100);
  expect(
    await page.evaluate(() => window.__hexwild.state.world.get(0, 40, 2)),
  ).toBe('redWool');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redWool),
  ).toBe(2);
  await page.screenshot({ path: info.outputPath('placed-red-wool.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-1, 40, 2);
    g.selectItem('shears');
    g.lookAt(0, 40.5, 2);
  });
  await frames(page, 3);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('redWool');
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 40, 2) || null),
    )
    .toBe(null);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
  );
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 2));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.inventory.redWool))
    .toBe(3);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('sheep-wool-conservation.json'),
    JSON.stringify(
      {
        dyeSpent: 1,
        repeatedColorSpent: 0,
        woolProduced: 3,
        woolPlaced: 1,
        woolRemainingAfterPlacement: 2,
        woolRecovered: 1,
        woolRemaining: 3,
        sheepColor: sheep.color,
        shearedAfterContinue: sheep.wool > 100,
        errors,
      },
      null,
      2,
    ),
  );
});

async function frames(page, n = 4) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const next = () => (--n ? requestAnimationFrame(next) : resolve());
        requestAnimationFrame(next);
      }),
    n,
  );
}
function errorsFor(page) {
  if (errorsByPage.has(page)) return errorsByPage.get(page);
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  return errors;
}
async function bodyRGB(page, id) {
  await aimSheep(page, id);
  await frames(page);
  const raw = await page.evaluate((id) => {
    const api = window.__hexwild,
      g = api.graphics;
    api.save();
    const record = JSON.parse(
      localStorage.getItem('hexwild-save-v16'),
    ).dimensions.overworld.fauna.mobs.find((m) => m.id === id);
    const point = g.camera.position.clone().fromArray(record.position);
    const roots = g.scene.children.filter((m) => m.userData.kind === 'sheep');
    roots.sort(
      (a, b) =>
        a.position.distanceToSquared(point) -
        b.position.distanceToSquared(point),
    );
    const m = roots[0],
      t = g.composer.passes[0].target,
      previous = g.renderer.getRenderTarget();
    const p = m.position
      .clone()
      .add(g.camera.position.clone().set(0, 0.72, 0))
      .project(g.camera);
    const pixels = new Uint16Array(3 * 3 * 4);
    try {
      g.composer.passes[0].beauty.render(g.renderer, null, t);
      g.renderer.readRenderTargetPixels(
        t,
        Math.round((p.x * 0.5 + 0.5) * t.width) - 1,
        Math.round((p.y * 0.5 + 0.5) * t.height) - 1,
        3,
        3,
        pixels,
      );
      return {
        pixels: Array.from(pixels),
        gl: g.renderer.getContext().getError(),
      };
    } finally {
      g.renderer.setRenderTarget(previous);
    }
  }, id);
  expect(raw.gl).toBe(0);
  return [0, 1, 2].map(
    (c) =>
      raw.pixels.reduce(
        (sum, n, i) => sum + (i % 4 === c ? DataUtils.fromHalfFloat(n) : 0),
        0,
      ) / 9,
  );
}
async function mouthHeight(page) {
  return page.evaluate(() => {
    const g = window.__hexwild.graphics;
    const sheep = g.scene.children.find((m) => m.userData.kind === 'sheep');
    const mouth = sheep.userData.head.localToWorld(
      g.camera.position.clone().set(0, -0.1, -0.21),
    );
    return mouth.y - sheep.position.y;
  });
}

test('offhand dye affects only the aimed sheep, survives an actual hurt flash and creative dye spends no inventory', async ({
  page,
}, info) => {
  const errors = errorsFor(page),
    id = await pasture(page);
  const s = await snapshot(page),
    d = s.dimensions.overworld;
  const other = {
    ...d.fauna.mobs[0],
    id: d.fauna.nextId++,
    position: [0, 40, 4.5],
  };
  d.fauna.mobs.push(other);
  await load(page, s);
  await page.evaluate(() => window.__hexwild.graphics.setQuality(1.7));
  await equip(page, 'blueDye', 2);
  await page.keyboard.press('KeyF');
  await equip(page, 'stone', 4);
  await aimSheep(page, id);
  await use(page);
  const first = await snapshot(page);
  expect(first.inventory.gear[4]).toMatchObject({ item: 'blueDye', count: 1 });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.stone),
  ).toBe(4);
  expect(
    first.dimensions.overworld.fauna.mobs.find((m) => m.id === id).color,
  ).toBe('blue');
  expect(
    first.dimensions.overworld.fauna.mobs.find((m) => m.id === other.id).color,
  ).toBe('white');
  await aimSheep(page, id);
  await use(page);
  expect((await snapshot(page)).inventory.gear[4].count).toBe(1);
  const blue = await bodyRGB(page, id),
    white = await bodyRGB(page, other.id);
  expect(blue[2]).toBeGreaterThan(Math.max(blue[0], blue[1]) * 1.5);
  expect(Math.max(...white) / Math.min(...white)).toBeLessThan(1.8);
  await aimSheep(page, id);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })),
  );
  await expect
    .poll(
      async () =>
        (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
          (m) => m.id === id,
        ).hp,
    )
    .toBeLessThan(8);
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
  );
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(() =>
      page.evaluate((start) => window.__hexwild.state.time - start, start),
    )
    .toBeGreaterThan(0.5);
  const afterHurt = await bodyRGB(page, id);
  expect(afterHurt[2]).toBeGreaterThan(
    Math.max(afterHurt[0], afterHurt[1]) * 1.5,
  );
  await page.screenshot({ path: info.outputPath('blue-sheep-after-hurt.png') });
  await page.keyboard.press('Escape');
  await page.locator('#mode-toggle').click();
  await page.locator('#resume').click();
  await equip(page, 'redDye');
  await aimSheep(page, id);
  await use(page);
  const creative = await snapshot(page);
  expect(creative.creative).toBe(true);
  expect(
    creative.dimensions.overworld.fauna.mobs.find((m) => m.id === id).color,
  ).toBe('red');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redDye),
  ).toBe(1);
  const red = await bodyRGB(page, id);
  expect(red[0]).toBeGreaterThan(Math.max(red[1], red[2]) * 1.5);
  await page.keyboard.press('Escape');
  await page.locator('[data-dimension="nether"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.dimension))
    .toBe('nether');
  await page.keyboard.press('Escape');
  await page.locator('[data-dimension="overworld"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.dimension))
    .toBe('overworld');
  expect(
    (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
      (m) => m.id === id,
    ).color,
  ).toBe('red');
  const returned = await bodyRGB(page, id);
  expect(returned[0]).toBeGreaterThan(Math.max(returned[1], returned[2]) * 1.5);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('offhand-and-render.json'),
    JSON.stringify(
      {
        offhandDyeSpent: 1,
        repeatSpent: 0,
        mainStone: 4,
        otherSheep: 'white',
        blue,
        white,
        afterHurt,
        red,
        creativeDyeRemaining: 1,
        dimensionRoundTrip: true,
        returned,
        errors,
      },
      null,
      2,
    ),
  );
});

test('real personal crafting recolors actual colored wool and weaving pays four string', async ({
  page,
}, info) => {
  const errors = errorsFor(page);
  await pasture(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('redWool', 2);
    g.give('blueDye', 2);
    g.give('string', 4);
  });
  await page.keyboard.press('KeyE');
  await page.locator('#recipe-search').fill('蓝色羊毛');
  await page
    .locator('[data-recipe]')
    .filter({ hasText: /^蓝色羊毛/ })
    .click({ modifiers: ['Shift'] });
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.blueWool),
  ).toBe(2);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redWool || 0),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.blueDye || 0),
  ).toBe(0);
  await page.locator('#recipe-search').fill('白色羊毛');
  // The available white-wool recipe here is weaving: no white dye was supplied.
  await page
    .locator('[data-recipe].can-fill')
    .filter({ hasText: /^白色羊毛/ })
    .click();
  await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  expect(await page.evaluate(() => window.__hexwild.state.inventory.wool)).toBe(
    1,
  );
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.string || 0),
  ).toBe(0);
  await page.screenshot({ path: info.outputPath('woven-white-wool.png') });
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('wool-crafting.json'),
    JSON.stringify(
      {
        redWoolSpent: 2,
        blueDyeSpent: 2,
        blueWool: 2,
        stringSpent: 4,
        whiteWool: 1,
        workbench: false,
        errors,
      },
      null,
      2,
    ),
  );
});

test('actual feeding breeds orange from red and yellow, then a nonmixing pair inherits only a parent color', async ({
  page,
}, info) => {
  const errors = errorsFor(page),
    a = await pasture(page);
  const s = await snapshot(page),
    d = s.dimensions.overworld;
  d.fauna.mobs[0].position = [-1.2, 40, 0];
  const b = d.fauna.nextId++;
  d.fauna.mobs.push({ ...d.fauna.mobs[0], id: b, position: [1.2, 40, 0] });
  await load(page, s);
  await equip(page, 'redDye');
  await aimSheep(page, a);
  await use(page);
  await equip(page, 'yellowDye');
  await aimSheep(page, b, 1);
  await use(page);
  await equip(page, 'wheat', 2);
  await aimSheep(page, a);
  await use(page);
  await aimSheep(page, b, 1);
  await use(page);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).dimensions.overworld.fauna.mobs.filter(
          (m) => m.kind === 'sheep' && m.baby > 0,
        ).length,
      { timeout: 30000 },
    )
    .toBe(1);
  const born = await snapshot(page),
    lamb = born.dimensions.overworld.fauna.mobs.find((m) => m.baby > 0);
  expect(lamb.color).toBe('orange');
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.wheat || 0),
  ).toBe(0);
  await aimSheep(page, lamb.id);
  await page.screenshot({ path: info.outputPath('orange-lamb.png') });
  await page.reload();
  await page.locator('#continue').click();
  expect(
    (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
      (m) => m.id === lamb.id,
    ).color,
  ).toBe('orange');
  const second = await snapshot(page),
    parents = second.dimensions.overworld.fauna.mobs.filter(
      (m) => m.id === a || m.id === b,
    );
  parents.forEach((m, i) => {
    m.love = 0;
    m.cooldown = 0;
    m.position = [i ? 1.2 : -1.2, 40, 0];
  });
  second.dimensions.overworld.fauna.mobs = parents;
  await load(page, second);
  await equip(page, 'blueDye');
  await aimSheep(page, a);
  await use(page);
  await equip(page, 'wheat', 2);
  await aimSheep(page, a);
  await use(page);
  await aimSheep(page, b, 1);
  await use(page);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).dimensions.overworld.fauna.mobs.filter(
          (m) => m.baby > 0,
        ).length,
      { timeout: 30000 },
    )
    .toBe(1);
  const inherited = (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
    (m) => m.baby > 0,
  ).color;
  expect(['blue', 'yellow']).toContain(inherited);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('breeding-colors.json'),
    JSON.stringify(
      {
        firstParents: ['red', 'yellow'],
        firstLamb: 'orange',
        continuedLamb: 'orange',
        secondParents: ['blue', 'yellow'],
        inheritedParent: ['blue', 'yellow'].includes(inherited),
        wheatSpent: 4,
        errors,
      },
      null,
      2,
    ),
  );
});

test('a sheared sheep waits on stone and in a paused menu, eats real grass and regrows the same blue coat', async ({
  page,
}, info) => {
  const errors = errorsFor(page),
    id = await pasture(page);
  await equip(page, 'wheat', 1);
  const s = await snapshot(page),
    sheep = s.dimensions.overworld.fauna.mobs[0];
  sheep.position = [0, 40, 0];
  sheep.color = 'blue';
  sheep.wool = 1.7;
  await load(page, s);
  await page.evaluate(() => window.__hexwild.teleport(-1, 40, 0));
  await aimSheep(page, id);
  await frames(page, 15);
  expect(
    (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
      (m) => m.id === id,
    ).wool,
  ).toBe(1.7);
  await page.keyboard.press('Escape');
  const grassCell = await page.evaluate(async (id) => {
    const g = window.__hexwild,
      { worldToAxial } = await import('/src/core.js');
    g.save();
    const sheep = JSON.parse(
      localStorage.getItem('hexwild-save-v16'),
    ).dimensions.overworld.fauna.mobs.find((m) => m.id === id);
    const [x, y, z] = sheep.position,
      a = worldToAxial(x, z);
    const ground = g.state.world.groundAt(x, z, y - 0.25, y + 0.25);
    const cell = [a.q, Math.round(ground) - 1, a.r];
    g.state.world.set(...cell, 'grass');
    g.graphics.updateBlock(...cell);
    return cell;
  }, id);
  expect(grassCell[1]).toBe(39);
  const paused = (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
    (m) => m.id === id,
  ).wool;
  await page.waitForTimeout(1000);
  expect(
    (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
      (m) => m.id === id,
    ).wool,
  ).toBe(paused);
  await page.locator('#resume').click();
  await expect
    .poll(() => mouthHeight(page), { timeout: 15000 })
    .toBeLessThan(0.35);
  expect(await mouthHeight(page)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('grazing-blue-sheep.png') });
  await expect
    .poll(
      () =>
        page.evaluate(
          (cell) => window.__hexwild.state.world.get(...cell),
          grassCell,
        ),
      { timeout: 20000 },
    )
    .toBe('dirt');
  const grown = (await snapshot(page)).dimensions.overworld.fauna.mobs.find(
    (m) => m.id === id,
  );
  expect(grown.color).toBe('blue');
  expect(grown.wool).toBe(0);
  await page.screenshot({ path: info.outputPath('regrown-blue-sheep.png') });
  await equip(page, 'shears');
  await aimSheep(page, id);
  await use(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.blueWool),
  ).toBe(3);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('grazing-and-regrowth.json'),
    JSON.stringify(
      {
        stonePausedAt: 1.7,
        menuPaused: true,
        mouthNearGrass: true,
        grassBecame: 'dirt',
        regrownColor: 'blue',
        shearedBlueWool: 3,
        errors,
      },
      null,
      2,
    ),
  );
});

test('a full survival pack spills all colored wool and collecting it after dropping a stack loses nothing', async ({
  page,
}, info) => {
  const errors = errorsFor(page),
    id = await pasture(page);
  await equip(page, 'redDye');
  await aimSheep(page, id);
  await use(page);
  await equip(page, 'shears');
  const s = await snapshot(page),
    tool = s.inventory.slots.find((item) => item?.item === 'shears');
  s.inventory.slots = s.inventory.slots.map(() => ({
    item: 'stone',
    count: 64,
  }));
  s.inventory.slots[0] = tool;
  s.selected = 0;
  await load(page, s);
  await aimSheep(page, id);
  await use(page);
  const spilled = await snapshot(page);
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.redWool || 0),
  ).toBe(0);
  expect(
    spilled.dimensions.overworld.drops
      .filter((d) => d.item === 'redWool')
      .reduce((n, d) => n + d.count, 0),
  ).toBe(3);
  expect(
    spilled.inventory.slots.find((item) => item?.item === 'shears').wear,
  ).toBe(tool.wear - 1);
  await page.screenshot({ path: info.outputPath('spilled-red-wool.png') });
  await page.evaluate(() => window.__hexwild.selectItem('stone'));
  await page.keyboard.press('Control+KeyQ');
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.state.inventory.redWool || 0),
      { timeout: 15000 },
    )
    .toBe(3);
  const collected = await snapshot(page);
  expect(
    collected.dimensions.overworld.drops
      .filter((d) => d.item === 'redWool')
      .reduce((n, d) => n + d.count, 0),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('full-pack-wool.json'),
    JSON.stringify(
      {
        produced: 3,
        spilled: 3,
        collected: 3,
        remainingLoose: 0,
        shearWear: 1,
        errors,
      },
      null,
      2,
    ),
  );
});

// This scenario also runs against vite preview without any development API.
test('real UI lists sixteen wool colors and places blue wool with the shipped light effects', async ({
  page,
}, info) => {
  const errors = errorsFor(page);
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const exported = JSON.parse(
    await readFile(await (await pending).path(), 'utf8'),
  );
  const world = new World(exported.seed, 'overworld', { load: false });
  const natural = exported.dimensions.overworld.fauna.mobs
    .filter((m) => m.kind === 'sheep')
    .map((m) => {
      const a = worldToAxial(m.position[0], m.position[2]),
        biome = world.biome(a.q, a.r);
      const expected =
        biome === '雪原' ? 'black' : biome === '沙漠' ? 'brown' : 'white';
      expect(m.color).toBe(expected);
      return { biome, color: m.color };
    });
  expect(natural.length).toBeGreaterThan(0);
  await page.locator('#resume').click();
  await page.keyboard.press('KeyE');
  await page.locator('#creative-search').fill('羊毛');
  await expect(page.locator('[data-creative-item]:visible')).toHaveCount(16);
  await page.locator('.creative-palette').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('sixteen-wool-colors.png') });
  await page.locator('[data-creative-item="blueWool"]').click();
  await page.locator('[data-inv-slot="pack:0"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementY: 500, bubbles: true }),
    ),
  );
  await frames(page);
  await use(page);
  await frames(page);
  await expect(page.locator('#target')).toContainText('蓝色羊毛');
  const runtime = await page.evaluate(() => ({
    developmentFixture: typeof window.__hexwild !== 'undefined',
    origin: location.origin,
    gl: document.querySelector('#world').getContext('webgl2').getError(),
  }));
  expect(runtime.gl).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('shipped-blue-wool.png') });
  await writeFile(
    info.outputPath('wool-production-runtime.json'),
    JSON.stringify(
      {
        ...runtime,
        colorsInPalette: 16,
        natural: natural.sort((a, b) => a.biome.localeCompare(b.biome)),
        exportedSave: true,
        errors,
      },
      null,
      2,
    ),
  );
});
