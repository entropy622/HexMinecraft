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
  await page.evaluate((p) => window.__hexwild.lookAt(...p), [q, y, r]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.r, t.type];
      }),
    )
    .toEqual([q, r, type]);
}
async function platform(page, creative = false) {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator(creative ? '#creative' : '#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -6; q <= 6; q++)
      for (let r = -3; r <= 3; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 49; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(-2, 40, 0);
    g.lookAt(5, 41.65, 0);
  });
}
async function waitGame(page, seconds) {
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(
      () =>
        page.evaluate((start) => window.__hexwild.state.time - start, start),
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(seconds);
}

test('a natural mine contains connected exploration routes, cobwebs and recoverable supplies', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto('/');
  await page.locator('#start').click();
  const mine = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      s = w.structures(0, 0, 160).find((s) => s.kind === 'mine');
    g.teleport(s.q, s.y + 1, s.r);
    const route = s.mine.paths[0].points,
      view = route.at(-1);
    g.give('torch', 1);
    g.selectItem('torch');
    g.lookAt(view.q, view.floor + 2, view.r);
    return { id: s.id, q: s.q, r: s.r, y: s.y };
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...window.__hexwild.state.world.blocks.values()].filter(
            (t) => t === 'cobweb',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const result = await page.evaluate(async (mine) => {
    const { structureLoot } = await import('/src/structures.js'),
      g = window.__hexwild,
      w = g.state.world,
      s = w.structures(mine.q, mine.r, 0).find((s) => s.id === mine.id);
    return {
      mine,
      webs: [...w.blocks.values()].filter((t) => t === 'cobweb').length,
      supplies: structureLoot(w, s).map((p) => ({
        q: p.q,
        y: p.y,
        r: p.r,
        type: w.get(p.q, p.y, p.r),
      })),
      spawners: [...w.spawners].filter((k) => {
        const [q, , r] = k.split(',').map(Number);
        return Math.hypot(q - s.q, r - s.r) < 25;
      }),
    };
  }, mine);
  expect(result.supplies.length).toBeGreaterThan(1);
  expect(result.supplies.every((p) => p.type === 'chest')).toBe(true);
  expect(result.spawners.length).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.graphics.relightQueue.size),
      { timeout: 30000 },
    )
    .toBe(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.graphics.composer.effects.temporal.frames,
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(24);
  await waitGame(page, 0.5);
  const webTexture = await page.evaluate(() => {
    const canvas =
        window.__hexwild.graphics.textures.single('cobweb:side').image,
      rgba = canvas.getContext('2d').getImageData(0, 0, 16, 16).data;
    return {
      png: canvas.toDataURL(),
      transparent:
        Array.from({ length: 256 }, (_, i) => rgba[i * 4 + 3]).filter(
          (a) => a === 0,
        ).length / 256,
    };
  });
  await writeFile(
    info.outputPath('web-tile.png'),
    Buffer.from(webTexture.png.split(',')[1], 'base64'),
  );
  result.webTransparentFraction = webTexture.transparent;
  await page.screenshot({ path: info.outputPath('natural-mine.png') });
  const chest = result.supplies[0];
  await page.evaluate(
    (p) => window.__hexwild.teleport(p.q - 1, p.y, p.r),
    chest,
  );
  await aim(page, chest.q, chest.y + 0.5, chest.r, 'chest');
  await use(page);
  await expect(page.locator('#station-overlay')).toBeVisible();
  const slots = await page.evaluate(
    (p) =>
      window.__hexwild.state.chests
        .get(`${p.q},${p.y},${p.r}`)
        .map((s, i) => (s ? i : -1))
        .filter((i) => i >= 0),
    chest,
  );
  for (const slot of slots)
    await page
      .locator(`[data-inv-slot="box:${slot}"]`)
      .click({ modifiers: ['Shift'] });
  const empty = () =>
    page.evaluate(
      (p) =>
        window.__hexwild.state.chests
          .get(`${p.q},${p.y},${p.r}`)
          .every((s) => s === null),
      chest,
    );
  expect(await empty()).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  await expect.poll(empty).toBe(true);
  await writeFile(
    info.outputPath('mine.json'),
    JSON.stringify(
      { ...result, lootedAndRestoredEmpty: true, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('actual player movement is slowed by webs and a falling body is caught', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await platform(page, true);
  const walk = async () => {
    await page.evaluate(() => {
      const g = window.__hexwild;
      g.teleport(-2, 40, 0);
      g.lookAt(5, 41.65, 0);
    });
    await waitGame(page, 0.25);
    const start = await page.evaluate(() => ({
      p: window.__hexwild.state.position,
      t: window.__hexwild.state.time,
    }));
    await page.keyboard.down('KeyW');
    await waitGame(page, 0.8);
    await page.keyboard.up('KeyW');
    return page.evaluate((start) => {
      const s = window.__hexwild.state;
      return (
        Math.hypot(s.position[0] - start.p[0], s.position[2] - start.p[2]) /
        (s.time - start.t)
      );
    }, start);
  };
  const free = await walk();
  await page.evaluate(() => {
    const g = window.__hexwild;
    for (let q = -4; q <= 4; q++)
      for (const y of [40, 41]) g.state.world.set(q, y, 0, 'cobweb');
    g.graphics.updateCells(Array.from({ length: 9 }, (_, i) => [i - 4, 40, 0]));
  });
  const web = await walk();
  expect(web / free).toBeLessThan(0.4);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(3, 44, 0, 'cobweb');
    g.graphics.updateBlock(3, 44, 0);
    g.teleport(3, 46, 0);
  });
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.state.position[1] - 1.65),
      { timeout: 15000 },
    )
    .toBeLessThan(45);
  const caught = await page.evaluate(() => ({
    y: window.__hexwild.state.position[1] - 1.65,
    time: window.__hexwild.state.time,
  }));
  await waitGame(page, 1);
  const after = await page.evaluate(() => ({
      y: window.__hexwild.state.position[1] - 1.65,
      time: window.__hexwild.state.time,
    })),
    descentSpeed = (caught.y - after.y) / (after.time - caught.time);
  expect(caught.y).toBeGreaterThan(44.5);
  expect(descentSpeed).toBeLessThan(0.6);
  await page.screenshot({ path: info.outputPath('caught-in-web.png') });
  await writeFile(
    info.outputPath('web-movement.json'),
    JSON.stringify(
      { free, web, ratio: web / free, caught, after, descentSpeed, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('sword yields string, shears recover a placeable web and saved mining remains removed', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('sword', 1);
    g.give('shears', 1);
    g.give('cobweb', 1);
    g.state.world.set(0, 40, 0, 'cobweb');
    g.graphics.updateBlock(0, 40, 0);
    g.teleport(1, 40, 0);
    g.selectItem('sword');
  });
  const wear = () =>
    page.evaluate(async () => {
      const { wearValue } = await import('/src/enchanting-data.js');
      window.__hexwild.save();
      const slots = JSON.parse(localStorage.getItem('hexwild-save-v16'))
        .inventory.slots;
      return Object.fromEntries(
        ['sword', 'shears'].map((id) => [
          id,
          wearValue(slots.find((s) => s?.item === id)?.wear),
        ]),
      );
    });
  const before = await wear();
  await aim(page, 0, 40.5, 0, 'cobweb');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(0, 40, 0) || null),
    )
    .toBe(null);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.evaluate(() => window.__hexwild.teleport(0, 40, 0));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.string || 0),
    )
    .toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(1, 40, 0);
    g.selectItem('cobweb');
  });
  await aim(page, 2, 40, 0, 'stone');
  await use(page);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.get(2, 40, 0)))
    .toBe('cobweb');
  await page.evaluate(() => window.__hexwild.selectItem('shears'));
  await aim(page, 2, 40.5, 0, 'cobweb');
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.world.get(2, 40, 0) || null),
    )
    .toBe(null);
  await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  await page.evaluate(() => window.__hexwild.teleport(2, 40, 0));
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.state.inventory.cobweb || 0),
    )
    .toBe(1);
  const after = await wear();
  expect(before.sword - after.sword).toBe(2);
  expect(before.shears - after.shears).toBe(1);
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(
      () => window.__hexwild.state.world.get(2, 40, 0) || null,
    ),
  ).toBe(null);
  await writeFile(
    info.outputPath('web-harvest.json'),
    JSON.stringify(
      { before, after, string: 1, web: 1, minedEditRestored: true, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('a natural cave spider bite respects a raised shield, poisons after lowering, and milk cures saved poison', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  const nest = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      s = w.structures(0, 0, 160).find((s) => s.kind === 'mine'),
      n = s.mine.nest;
    g.teleport(n.q, n.y, n.r);
    // Wait above the natural nest so a bite cannot precede shield alignment.
    w.set(n.q, n.y + 4, n.r, 'stone');
    for (let y = n.y + 5; y <= n.y + 7; y++) w.set(n.q, y, n.r, null);
    g.graphics.updateBlock(n.q, n.y + 4, n.r);
    g.teleport(n.q, n.y + 5, n.r);
    g.give('shield', 1);
    g.give('milkBucket', 1);
    g.selectItem('shield');
    return n;
  });
  await page.keyboard.down('KeyR');
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__hexwild.graphics.scene.children.some(
            (m) => m.userData.kind === 'caveSpider',
          ),
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.evaluate(async (n) => {
    const { axialToWorld } = await import('/src/core.js'),
      { findFloor } = await import('/src/grounding.js'),
      g = window.__hexwild,
      w = g.state.world,
      m = g.graphics.scene.children.find(
        (m) => m.userData.kind === 'caveSpider',
      ),
      p = m.position.clone(),
      s = w
        .structures(n.q, n.r, 0)
        .find(
          (s) =>
            s.kind === 'mine' && s.mine.nest.q === n.q && s.mine.nest.r === n.r,
        );
    w.set(n.q, n.y + 1, n.r, 'torch');
    g.graphics.updateBlock(n.q, n.y + 1, n.r);
    for (const c of s.mine.columns.values()) {
      const at = axialToWorld(c.q, c.r),
        distance = Math.hypot(at.x - p.x, at.z - p.z);
      if (distance < 1.7 || distance > 3.5) continue;
      const floor = findFloor(w, at.x, at.z, p.y, {
        step: 1,
        drop: 1,
        height: 1.8,
        radius: 0.24,
      });
      if (floor === null) continue;
      g.teleport(c.q, floor, c.r);
      g.lookAt(p.x / Math.sqrt(3) - p.z / 3, p.y + 0.3, p.z / 1.5);
      return;
    }
    throw new Error('No standing clearance beside the natural cave spider');
  }, nest);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild,
            m = g.graphics.scene.children.find(
              (m) => m.userData.kind === 'caveSpider',
            );
          if (m) {
            const p = m.position;
            g.lookAt(p.x / Math.sqrt(3) - p.z / 3, p.y + 0.3, p.z / 1.5);
          }
          return g.graphics.shieldImpact > 0;
        }),
      { timeout: 25000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => window.__hexwild.state.health)).toBe(20);
  expect(await page.locator('#effect-list').innerText()).not.toContain('中毒');
  await page.keyboard.up('KeyR');
  await page.evaluate(() => window.__hexwild.selectItem('milkBucket'));
  await expect(page.locator('#effect-list')).toContainText('中毒', {
    timeout: 15000,
  });
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -2; q <= 2; q++)
      for (let r = -2; r <= 2; r++) {
        g.state.world.set(q, 39, r, 'stone');
        for (let y = 40; y < 44; y++) g.state.world.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(0, 40, 0);
  });
  await page.keyboard.press('Escape');
  const saved = await page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
  expect(saved.survival.effects.poison.time).toBeGreaterThan(3);
  await page.reload();
  await page.locator('#continue').click();
  await expect(page.locator('#effect-list')).toContainText('中毒');
  await page.evaluate(() => window.__hexwild.selectItem('milkBucket'));
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__hexwild.state.inventory.milkBucket || 0),
      { timeout: 15000 },
    )
    .toBe(0);
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  const elapsed = await page.evaluate(
    (start) => window.__hexwild.state.time - start,
    start,
  );
  expect(elapsed).toBeLessThan(saved.survival.effects.poison.time);
  await expect(page.locator('#effect-list')).not.toContainText('中毒');
  await writeFile(
    info.outputPath('poison-shield-milk.json'),
    JSON.stringify(
      {
        shieldBlocked: true,
        poisonSaved: saved.survival.effects.poison.time,
        milkTime: elapsed,
        curedBeforeExpiration: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
