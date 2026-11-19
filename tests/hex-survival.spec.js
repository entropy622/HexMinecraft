import { test, expect } from './browser-fixture.js';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.origin === 'null') return;
    localStorage.setItem(
      'hexwild-settings',
      JSON.stringify({ quality: 0.65, sound: false }),
    );
  });
});
test('空手、随身菱形、工作台、第一把镐和第一炉铁', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(String(e));
    console.error(e.stack);
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hexwild, null, { timeout: 150000 });
  await page.locator('#start').click();
  await page.locator('#new-world').click({ timeout: 150000 });
  await page.keyboard.press('e');
  await expect(page.locator('#pattern button')).toHaveCount(4);
  await expect(page.locator('#recipe-book')).toBeHidden();
  const bag = page.locator('#inventory [data-inv-slot^="pack:"]');
  await expect(bag).toHaveCount(36);
  await expect(page.locator('#inventory .mc-slot:not(.empty)')).toHaveCount(0);
  await expect(bag.last()).toBeInViewport();
  await page.keyboard.press('e');
  // Drop the empty-handed player onto a real generated oak trunk. Remove only
  // obstructing canopy above it; breaking, tool speed, drops and pickup are live.
  await page.evaluate(() => {
    const h = window.__hexwild,
      w = h.state.world;
    const col = [...w.blocks].find(([k, v]) => {
      if (v !== 'wood') return false;
      const [q, y, r] = k.split(',').map(Number);
      return (
        Math.abs(q) < 12 &&
        Math.abs(r) < 12 &&
        w.get(q, y - 1, r) === 'wood' &&
        w.get(q, y - 2, r) === 'wood' &&
        w.get(q, y + 1, r) !== 'wood'
      );
    });
    if (!col) throw Error('No oak trunk in fixture seed');
    const [q, y, r] = col[0].split(',').map(Number);
    for (let i = 1; i < 5; i++) w.set(q, y + i, r, null);
    h.graphics.updateBlock(q, y, r);
    h.teleport(q, y + 1.03, r);
    h.lookAt(q, y + 0.8, r);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type), {
      timeout: 20000,
    })
    .toBe('wood');
  await page.mouse.down();
  try {
    await expect
      .poll(
        () => page.evaluate(() => window.__hexwild.state.inventory.wood || 0),
        { timeout: 55000 },
      )
      .toBeGreaterThanOrEqual(3);
  } finally {
    await page.mouse.up();
  }
  await page.keyboard.press('e');
  const choose = async (id) => {
    await page.locator('#recipe-book-toggle[aria-expanded=false]').click();
    await page.locator('#recipe-search').fill(id);
    const index = await page.evaluate(
      async (id) =>
        (await import('/src/core.js')).RECIPES.findIndex((r) => r.id === id),
      id,
    );
    await page.locator('[data-recipe="' + index + '"]').click();
    await page.locator('#recipe-book-toggle').click();
    if (id === 'pick1' || id === 'workbench')
      await page.screenshot({
        path: info.outputPath(
          id === 'pick1' ? 'workbench.png' : 'inventory.png',
        ),
      });
    await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  };
  for (let i = 0; i < 3; i++) await choose('planks');
  await choose('workbench');
  await choose('stick');
  await page.keyboard.press('e');
  const station = async (type, existing = null) =>
    page.evaluate(
      async ({ type, existing }) => {
        const h = window.__hexwild,
          w = h.state.world;
        let pos = existing;
        if (!pos) {
          const { worldToAxial } = await import('/src/core.js'),
            [x, y, z] = h.state.position,
            a = worldToAxial(x, z);
          pos = { q: a.q + 1, y: Math.floor(y - 1.58), r: a.r };
          w.set(pos.q, pos.y - 1, pos.r, 'stone');
          w.set(pos.q, pos.y, pos.r, null);
          h.selectItem(type);
          h.setTarget({
            q: pos.q,
            y: pos.y - 1,
            r: pos.r,
            type: 'stone',
            place: pos,
            normal: { x: 0, y: 1, z: 0 },
          });
          h.place();
          if (w.get(pos.q, pos.y, pos.r) !== type)
            throw Error('Could not place ' + type);
        } else h.teleport(pos.q - 1, pos.y, pos.r);
        h.setTarget({ ...pos, type });
        h.interact(true);
        return pos;
      },
      { type, existing },
    );
  const bench = await station('workbench');
  await expect(page.locator('#pattern button')).toHaveCount(7);
  await choose('pick1');
  await expect(
    page.locator('#inventory button[aria-label^="木镐"]'),
  ).toHaveCount(1);
  await page.keyboard.press('e');
  await expect(page.locator('.hud-top')).toBeHidden();
  await page.screenshot({ path: info.outputPath('hud.png') });
  // Keep physics and mouse input at full speed on software-rendered Edge.
  // The quarry repeats the same camera view; sample the 3D pass at 5 Hz.
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      frame = g.frame.bind(g);
    let next = 0;
    g.frame = (...args) => {
      g.camera.updateMatrixWorld();
      if (performance.now() < next) return;
      frame(...args);
      next = performance.now() + 200;
    };
    window.restoreQuarryFrames = () => {
      g.frame = frame;
    };
  });
  // A deterministic exposed seam avoids a seed search. The mouse actually breaks
  // each block with the crafted tool; inventory changes only through pickup.
  const excavate = async (types, held) => {
    const cells = types.map((type, i) => ({
      q: 4 + (i % 3),
      y: 32,
      r: 2 + Math.floor(i / 3),
      type,
    }));
    await page.mouse.move(683, 384);
    await page.evaluate(
      ({ cells, held }) => {
        const h = window.__hexwild,
          w = h.state.world,
          points = [];
        for (const { q, y, r, type } of cells) {
          for (let offset = -1; offset <= 4; offset++) {
            w.set(
              q,
              y + offset,
              r,
              offset === -1 ? 'stone' : offset === 0 ? type : null,
            );
            points.push([q, y + offset, r]);
          }
        }
        h.graphics.updateCells(points);
        h.selectItem(held);
      },
      { cells, held },
    );
    for (const { q, y, r, type } of cells) {
      const item =
        type === 'stone' ? 'cobble' : type === 'coalOre' ? 'coal' : 'rawIron';
      const before = await page.evaluate(
        ({ q, y, r, item }) => {
          const h = window.__hexwild;
          h.teleport(q, y + 1.03, r);
          h.lookAt(q, y + 0.8, r);
          return h.state.inventory[item] || 0;
        },
        { q, y, r, item },
      );
      await page.waitForFunction(
        ({ q, y, r, type }) => {
          const t = window.__hexwild.state.target;
          return t?.q === q && t.y === y && t.r === r && t.type === type;
        },
        { q, y, r, type },
        { timeout: 30000 },
      );
      await page.mouse.down();
      try {
        await page.waitForFunction(
          ({ q, y, r, type }) =>
            window.__hexwild.state.world.get(q, y, r) !== type,
          { q, y, r, type },
          { timeout: 40000 },
        );
      } catch (err) {
        const observation = await page.evaluate(() => {
          const h = window.__hexwild,
            s = h.state;
          return {
            target: s.target,
            position: s.position,
            playing: s.playing,
            item: s.hotbar[0],
            progress: document.querySelector('#mine-progress i').style.width,
            element: document.elementFromPoint(683, 384)?.id,
          };
        });
        throw Error(
          type + ' at ' + [q, y, r] + ' ' + JSON.stringify(observation),
          { cause: err },
        );
      } finally {
        await page.mouse.up();
      }
      await page.waitForFunction(
        ({ item, before }) =>
          (window.__hexwild.state.inventory[item] || 0) > before,
        { item, before },
        { timeout: 30000 },
      );
    }
  };
  await excavate(Array(9).fill('stone'), 'pick1');
  await station('workbench', bench);
  await choose('pick2');
  await choose('furnace');
  await page.keyboard.press('e');
  await excavate(['coalOre', 'ironOre'], 'pick2');
  await station('furnace');
  await page.evaluate(() => window.restoreQuarryFrames());
  for (const label of ['粗铁', '煤炭'])
    await page
      .locator(
        '#station-content [data-inv-slot^="pack:"][aria-label^="' +
          label +
          '"]',
      )
      .first()
      .click({ modifiers: ['Shift'] });
  const output = page.locator('[data-inv-slot="furnace:output"]');
  await expect(output).toHaveAttribute('aria-label', /铁锭/, {
    timeout: 60000,
  });
  await page.screenshot({ path: info.outputPath('first-iron.png') });
  await output.click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.ingot),
  ).toBe(1);
  expect(errors).toEqual([]);
  await page.goto('about:blank', { waitUntil: 'commit' });
});
test('铁路乘降、工作站和世界列表', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(String(e));
    console.error(e.stack);
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hexwild, null, { timeout: 150000 });
  await page.locator('#start').click();
  await page.locator('#new-world').click({ timeout: 150000 });
  const openStation = async (type) => {
    await page.evaluate((type) => {
      const h = window.__hexwild;
      const q = type === 'chest' ? 2 : 3;
      h.state.world.set(q, 52, 0, type);
      h.setTarget({ q, y: 52, r: 0, type });
      h.setPlaying(true);
      h.interact(true);
    }, type);
  };
  await openStation('chest');
  const packSlot = () =>
    page.locator('#station-content [data-inv-slot="pack:9"]').boundingBox();
  const chestPos = await packSlot();
  await page.screenshot({ path: info.outputPath('chest.png') });
  await page.keyboard.press('Escape');
  await openStation('furnace');
  const furnacePos = await packSlot();
  expect(furnacePos.x).toBeCloseTo(chestPos.x, 0);
  expect(furnacePos.y).toBeCloseTo(chestPos.y, 0);
  await page.screenshot({ path: info.outputPath('furnace.png') });
  await page.keyboard.press('Escape');
  // Build an isolated display siding in this new test world.
  await page.evaluate(async () => {
    const h = window.__hexwild,
      w = h.state.world,
      { connectTrack, planTrack } = await import('/src/rail-track.js');
    const base = w.terrainHeight(1, 0) + 1;
    const route = [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ];
    for (let q = -3; q < 6; q++)
      for (let r = -3; r < 7; r++) {
        w.set(q, base - 1, r, 'stone');
        for (let y = base; y <= base + 7; y++) w.set(q, y, r, null);
      }
    for (const [i, [q, r]] of route.entries()) {
      const p = [q, base, r],
        id = i === 4 ? 'detectorRail' : i === 5 ? 'poweredRail' : 'rail',
        f = i > 2 ? 1 : 0,
        pair = planTrack(w, p, id, f);
      w.set(...p, id);
      w.setState(...p, { facing: f, open: false, track: pair });
      connectTrack(w, p, pair);
    }
    h.carts.spawn([2, base, 1], 'minecart', 1, w);
    h.carts.spawn([0, base, 0], 'chestCart', 0, w);
    h.graphics.updateCells(route.map(([q, r]) => [q, base, r]));
    h.teleport(4, base, -3);
    h.lookAt(1, base + 0.2, 1);
    h.carts.update(0, w, new Set());
    h.save();
  });
  await page.screenshot({ path: info.outputPath('rail.png') });
  const ride = await page.evaluate(() => {
    const h = window.__hexwild,
      c = h.carts.records.find((c) => c.kind === 'minecart');
    h.teleport(c.p[0] + 1, c.p[1], c.p[2]);
    h.lookAt(c.p[0], c.p[1] + 0.43, c.p[2]);
    return c.p.join(',');
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = window.__hexwild;
        return h.carts.target(h.graphics.camera, h.state.target?.distance)
          ?.kind;
      }),
    )
    .toBe('minecart');
  await page.mouse.click(683, 384, { button: 'right' });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.carts.riding?.kind))
    .toBe('minecart');
  await page.keyboard.down('w');
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.carts.riding?.p.join(',')),
      { timeout: 15000 },
    )
    .not.toBe(ride);
  await page.keyboard.up('w');
  await page.keyboard.press('Shift');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.carts.riding))
    .toBe(null);
  await page.evaluate(async () => {
    const { validateSave, SAVE_KEY } = await import('/src/save.js');
    const h = window.__hexwild;
    h.save();
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    validateSave(data);
  });
  await page.keyboard.press('Escape');
  await page.locator('#home').click();
  await page.locator('#start').click();
  await expect(page.locator('#world-list>div')).toHaveCount(1);
  await page.locator('#world-create summary').click();
  await page.locator('#world-mode').selectOption('creative');
  await page.locator('#new-world').click({ timeout: 150000 });
  await page.keyboard.press('e');
  await expect(page.locator('.creative-tabs')).toBeVisible();
  await page.locator('[data-category="机关"]').click();
  await page.locator('#creative-search').fill('铁轨');
  await expect(page.locator('[data-creative-item]:visible')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('creative.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#craft-overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.locator('#home').click();
  await page.locator('#start').click();
  await expect(page.locator('#world-list>div')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('worlds.png') });
  expect(errors).toEqual([]);
  await page.goto('about:blank', { waitUntil: 'commit' });
});
