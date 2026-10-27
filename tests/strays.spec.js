import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(180000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});
async function waitGame(page, seconds) {
  const start = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(
      () =>
        page.evaluate((start) => window.__hexwild.state.time - start, start),
      { timeout: Math.max(20000, seconds * 4000) },
    )
    .toBeGreaterThanOrEqual(seconds);
}
async function skeletonRoom(page) {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world,
      { hash } = await import('/src/core.js'),
      cells = [];
    g.setPlaying(false);
    for (let q = -7; q <= 7; q++)
      for (let r = -5; r <= 5; r++) {
        w.set(q, 39, r, 'stone');
        w.set(q, 44, r, 'glass');
        for (let y = 40; y < 44; y++) w.set(q, y, r, null);
        cells.push([q, 39, r], [q, 44, r]);
      }
    let q = 0;
    while (Math.floor(hash(q, 17, 0, w.seed) * 3) !== 1) q++;
    if (q > 5) throw Error('Skeleton spawner site outside fixture');
    w.set(q, 40, 0, 'spawner');
    cells.push([q, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(-3, 40, 0);
    g.give('shield', 1);
    g.selectItem('shield');
    g.step(120 - g.state.time);
    g.setPlaying(true);
  });
  await page.keyboard.down('KeyR');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__hexwild.graphics.scene.children.filter(
              (m) => m.userData.kind === 'skeleton',
            ).length,
        ),
      { timeout: 40000 },
    )
    .toBeGreaterThan(0);
  return page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world,
      { worldToAxial, DIRECTIONS } = await import('/src/core.js');
    g.setPlaying(false);
    const m = g.graphics.scene.children.find(
        (m) => m.userData.kind === 'skeleton',
      ),
      a = worldToAxial(m.position.x, m.position.z),
      cells = [];
    window.coldSkeleton = m;
    window.coldInitial = { position: m.position.toArray(), cell: a };
    for (const k of [...w.spawners]) {
      const c = k.split(',').map(Number);
      w.set(...c, null);
      cells.push(c);
    }
    for (const [dq, dr] of [[0, 0], ...DIRECTIONS])
      for (let y = 40; y <= 42; y++) {
        w.set(a.q + dq, y, a.r + dr, 'powderSnow');
        cells.push([a.q + dq, y, a.r + dr]);
      }
    w.set(a.q, 43, a.r, 'glass');
    cells.push([a.q, 43, a.r]);
    g.graphics.updateCells(cells);
    g.teleport(a.q - 4, 40, a.r);
    g.lookAt(a.q, 41, a.r);
    g.setPlaying(true);
    return a;
  });
}

async function walkingSpeed(page) {
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-3, 40, -3);
    g.lookAt(5, 41.65, -3);
  });
  await waitGame(page, 0.6);
  const before = await page.evaluate(() => ({
    position: window.__hexwild.state.position,
    time: window.__hexwild.state.time,
  }));
  await page.keyboard.down('KeyW');
  await waitGame(page, 1.5);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => ({
    position: window.__hexwild.state.position,
    time: window.__hexwild.state.time,
  }));
  return (
    Math.hypot(
      after.position[0] - before.position[0],
      after.position[2] - before.position[2],
    ) /
    (after.time - before.time)
  );
}

test('a real spawner skeleton converts inside powder snow without freezing to death or duplicating its mesh', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await skeletonRoom(page);
  await waitGame(page, 23);
  await writeFile(
    info.outputPath('contact-trace.json'),
    JSON.stringify(
      await page.evaluate(async () => {
        const g = window.__hexwild,
          m = window.coldSkeleton,
          { worldToAxial } = await import('/src/core.js'),
          a = worldToAxial(m.position.x, m.position.z);
        return {
          initial: window.coldInitial,
          position: m.position.toArray(),
          attached: !!m.parent,
          headBlock: g.state.world.get(
            a.q,
            Math.floor(m.position.y + 1.71),
            a.r,
          ),
          strays: g.graphics.scene.children.filter(
            (m) => m.userData.kind === 'stray',
          ).length,
        };
      }),
      null,
      2,
    ),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__hexwild.graphics.scene.children.filter(
              (m) => m.userData.kind === 'stray',
            ).length,
        ),
      { timeout: 10000 },
    )
    .toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('shield', 1);
    g.selectItem('shield');
  });
  await page.keyboard.down('KeyR');
  await waitGame(page, 0.4);
  const result = await page.evaluate((a) => {
    const g = window.__hexwild,
      stray = g.graphics.scene.children.find(
        (m) => m.userData.kind === 'stray',
      );
    for (let dq = -1; dq <= 1; dq++)
      for (let dr = -1; dr <= 1; dr++)
        for (let y = 40; y <= 42; y++)
          if (g.state.world.get(a.q + dq, y, a.r + dr) === 'powderSnow')
            g.state.world.set(a.q + dq, y, a.r + dr, null);
    g.teleport(a.q - 2, 40, a.r);
    g.graphics.updateCells(
      [40, 41, 42].flatMap((y) => [
        [a.q, y, a.r],
        [a.q - 1, y, a.r],
      ]),
    );
    g.lookAt(a.q, 41, a.r);
    return {
      kind: stray.userData.kind,
      oldMeshRemoved: window.coldSkeleton.parent === null,
      skeletons: g.graphics.scene.children.filter(
        (m) => m.userData.kind === 'skeleton',
      ).length,
      position: stray.position.toArray(),
    };
  }, a);
  expect(result.oldMeshRemoved).toBe(true);
  expect(result.skeletons).toBe(0);
  await expect(page.locator('#target')).toContainText('流浪者');
  await expect(page.locator('#target')).toContainText('16 /');
  await page.keyboard.up('KeyR');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.selectItem('apple');
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: info.outputPath('converted-stray.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.selectItem('shield');
    g.setPlaying(true);
  });
  await page.evaluate((a) => {
    const g = window.__hexwild;
    g.give('shield', 1);
    g.selectItem('shield');
    g.give('milkBucket', 1);
    g.teleport(a.q - 4, 40, a.r);
    g.lookAt(a.q, 41.5, a.r);
    window.strayShieldSeen = false;
    window.strayShieldWatch = true;
    const sample = () => {
      if (!window.strayShieldWatch) return;
      if (g.graphics.shieldImpact > 0) window.strayShieldSeen = true;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, a);
  await page.keyboard.down('KeyR');
  await page.evaluate(async (a) => {
    const g = window.__hexwild,
      { DIRECTIONS } = await import('/src/core.js'),
      cells = [];
    for (const [dq, dr] of DIRECTIONS)
      for (let y = 40; y <= 42; y++) {
        g.state.world.set(a.q + dq, y, a.r + dr, null);
        cells.push([a.q + dq, y, a.r + dr]);
      }
    g.graphics.updateCells(cells);
  }, a);
  await expect
    .poll(() => page.evaluate(() => window.strayShieldSeen), { timeout: 30000 })
    .toBe(true);
  await waitGame(page, 3);
  expect(
    await page.evaluate(
      () => window.__hexwild.state.inventory.slownessArrow || 0,
    ),
  ).toBe(0);
  result.reflectedArrowsUnrecoverable = true;
  expect(await page.evaluate(() => window.__hexwild.state.health)).toBe(20);
  await expect(page.locator('#effect-list')).not.toContainText('缓慢');
  await page.keyboard.up('KeyR');
  await page.evaluate(() => {
    window.strayShieldWatch = false;
  });
  await expect(page.locator('#effect-list')).toContainText('缓慢 I', {
    timeout: 20000,
  });
  // Complete the real acquisition path, with randomness fixed only at its
  // external boundary. The entity still comes from the spawner and conversion.
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('axe4', 1);
    g.selectItem('axe4');
    window.strayRandom = Math.random;
    Math.random = () => 0;
  });
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const g = window.__hexwild,
        p = g.graphics.scene.children.find(
          (m) => m.userData.kind === 'stray',
        ).position;
      g.teleport((p.x - 1.5) / Math.sqrt(3) - p.z / 3, 40, (2 * p.z) / 3);
      g.lookAt(p.x / Math.sqrt(3) - p.z / 3, p.y + 1, (2 * p.z) / 3);
    });
    await waitGame(page, 0.3);
    await page.evaluate(() =>
      document
        .querySelector('#world')
        .dispatchEvent(
          new MouseEvent('mousedown', { button: 0, bubbles: true }),
        ),
    );
    await waitGame(page, 0.2);
    await page.evaluate(() =>
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })),
    );
    await waitGame(page, 1);
  }
  await page.evaluate(() => {
    Math.random = window.strayRandom;
  });
  expect(await kindCount(page, 'stray')).toBe(0);
  const loot = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const drops = JSON.parse(
      localStorage.getItem('hexwild-save-v16'),
    ).dimensions.overworld.drops.filter((d) => d.item === 'slownessArrow');
    const carried = g.state.inventory.slownessArrow || 0;
    if (drops.length) {
      const [x, , z] = drops[0].position;
      g.teleport(x / Math.sqrt(3) - z / 3, 40, (2 * z) / 3);
    }
    return { drops, carried };
  });
  expect(loot.carried + loot.drops.reduce((n, d) => n + d.count, 0)).toBe(1);
  result.lootBeforePickup = loot;
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.state.inventory.slownessArrow || 0,
        ),
      { timeout: 15000 },
    )
    .toBe(1);
  result.playerKillLoot = { slownessArrow: 1 };
  await page.keyboard.press('Escape');
  await page.locator('#home').click();
  await page.locator('#continue').click();
  await expect(page.locator('#effect-list')).toContainText('缓慢 I');
  const effect = await page.evaluate(() => {
    window.__hexwild.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16')).survival.effects
      .slowness;
  });
  expect(effect.rank).toBe(1);
  expect(effect.time).toBeGreaterThan(0);
  expect(effect.time).toBeLessThanOrEqual(30);
  const slow = await walkingSpeed(page);
  await page.evaluate(() => window.__hexwild.selectItem('milkBucket'));
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })),
  );
  await expect(page.locator('#effect-list')).not.toContainText('缓慢', {
    timeout: 15000,
  });
  await page.evaluate(() =>
    document
      .querySelector('#world')
      .dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })),
  );
  const normal = await walkingSpeed(page);
  expect(slow / normal).toBeGreaterThan(0.78);
  expect(slow / normal).toBeLessThan(0.92);
  result.combat = {
    shieldBlockedWithoutSlowness: true,
    savedEffect: effect,
    slowSpeed: slow,
    normalSpeed: normal,
    milkCured: true,
  };
  await writeFile(
    info.outputPath('conversion.json'),
    JSON.stringify({ ...result, healthPreserved: true, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

for (const scenario of [
  { name: 'exposed snow', snow: true, roof: false, kind: 'stray' },
  { name: 'covered snow', snow: true, roof: true, kind: 'skeleton' },
  { name: 'other biomes', snow: false, roof: false, kind: 'skeleton' },
]) {
  test(`natural nighttime archers respect ${scenario.name}`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');
    await page.locator('#start').click();
    const site = await page.evaluate(({ snow, roof }) => {
      const g = window.__hexwild,
        w = g.state.world;
      g.setPlaying(false);
      let site;
      for (let q = -64; q <= 64 && !site; q += 8)
        for (let r = -64; r <= 64; r += 8)
          if (
            (w.biome(q, r) === '雪原') === snow &&
            w.terrainHeight(q, r) > 8
          ) {
            site = { q, r };
            break;
          }
      if (!site) throw Error('No biome site');
      g.teleport(site.q + 5, 40, site.r - 16);
      const h = w.terrainHeight(site.q, site.r),
        cells = [];
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++) {
          w.set(site.q + dq, h - 1, site.r + dr, 'snow');
          for (let y = h; y < 64; y++) w.set(site.q + dq, y, site.r + dr, null);
          if (roof) w.set(site.q + dq, h + 3, site.r + dr, 'glass');
          cells.push(
            [site.q + dq, h - 1, site.r + dr],
            [site.q + dq, h + 3, site.r + dr],
          );
        }
      const center = { q: site.q + 5, r: site.r - 16 };
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++) {
          w.set(center.q + dq, 39, center.r + dr, 'stone');
          for (let y = 40; y < 64; y++)
            w.set(center.q + dq, y, center.r + dr, null);
          cells.push([center.q + dq, 39, center.r + dr]);
        }
      g.graphics.updateCells(cells);
      g.step(400 - g.state.time);
      Math.random = () => 0.3;
      g.setPlaying(true);
      return { ...site, h, biome: w.biome(site.q, site.r) };
    }, scenario);
    await expect
      .poll(
        () =>
          page.evaluate(
            (site) =>
              window.__hexwild.graphics.scene.children
                .filter(
                  (m) =>
                    ['skeleton', 'stray'].includes(m.userData.kind) &&
                    Math.hypot(
                      m.position.x - Math.sqrt(3) * (site.q + site.r / 2),
                      m.position.z - site.r * 1.5,
                    ) < 3,
                )
                .map((m) => m.userData.kind),
            site,
          ),
        { timeout: 40000 },
      )
      .toEqual([scenario.kind]);
    const result = {
      scenario: scenario.name,
      biome: site.biome,
      kind: scenario.kind,
      errors,
    };
    await writeFile(
      info.outputPath('natural-archer.json'),
      JSON.stringify(result, null, 2),
    );
    expect(errors).toEqual([]);
  });
}

async function snowLevel(page, a, head, feet = true) {
  await page.evaluate(
    ({ a, head, feet }) => {
      const g = window.__hexwild;
      for (let y = 40; y <= 42; y++)
        g.state.world.set(
          a.q,
          y,
          a.r,
          (y === 40 ? feet : head) ? 'powderSnow' : null,
        );
      g.graphics.updateCells([40, 41, 42].map((y) => [a.q, y, a.r]));
    },
    { a, head, feet },
  );
}
const kindCount = (page, kind) =>
  page.evaluate(
    (kind) =>
      window.__hexwild.graphics.scene.children.filter(
        (m) => m.userData.kind === kind,
      ).length,
    kind,
  );

test('head exposure resets before shaking, pauses, then a committed conversion finishes outside the snow', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await skeletonRoom(page);
  await snowLevel(page, a, false);
  await waitGame(page, 8);
  expect(await kindCount(page, 'stray')).toBe(0);
  expect(
    await page.evaluate(() => window.coldSkeleton.userData.body.rotation.z),
  ).toBe(0);
  await snowLevel(page, a, true);
  await waitGame(page, 4);
  await snowLevel(page, a, false);
  await waitGame(page, 1);
  await snowLevel(page, a, true);
  await waitGame(page, 4);
  expect(
    await page.evaluate(() => window.coldSkeleton.userData.body.rotation.z),
  ).toBe(0);
  await waitGame(page, 4);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(window.coldSkeleton.userData.body.rotation.z),
      ),
    )
    .toBeGreaterThan(0.001);
  await snowLevel(page, a, false, false);
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => window.__hexwild.state.time);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(paused);
  expect(await kindCount(page, 'stray')).toBe(0);
  await page.locator('#resume').click();
  await waitGame(page, 15);
  expect(await kindCount(page, 'stray')).toBe(1);
  await writeFile(
    info.outputPath('conversion-boundaries.json'),
    JSON.stringify(
      {
        feetOnlyIgnored: true,
        earlyExitReset: true,
        pauseFreezes: true,
        finishesAfterLeaving: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('ordinary skeleton arrows hit through the same collision path without applying slowness', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await skeletonRoom(page);
  await page.evaluate(async (a) => {
    const g = window.__hexwild,
      { DIRECTIONS } = await import('/src/core.js'),
      cells = [];
    for (const [dq, dr] of [[0, 0], ...DIRECTIONS])
      for (let y = 40; y <= 42; y++) {
        g.state.world.set(a.q + dq, y, a.r + dr, null);
        cells.push([a.q + dq, y, a.r + dr]);
      }
    g.graphics.updateCells(cells);
    g.teleport(a.q - 4, 40, a.r);
    g.lookAt(a.q, 41.5, a.r);
  }, a);
  await page.keyboard.up('KeyR');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.health), {
      timeout: 15000,
    })
    .toBeLessThan(20);
  await expect(page.locator('#effect-list')).not.toContainText('缓慢');
  await writeFile(
    info.outputPath('ordinary-arrow.json'),
    JSON.stringify({ hit: true, noSlowness: true, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

test('building into a snowy mob cannot make it fall through the solid trap floor', async ({
  page,
}, info) => {
  const a = await skeletonRoom(page);
  await waitGame(page, 1);
  const before = await page.evaluate(async () => {
    const g = window.__hexwild,
      m = window.coldSkeleton,
      { worldToAxial } = await import('/src/core.js'),
      a = worldToAxial(m.position.x, m.position.z),
      y = Math.floor(m.position.y + 0.5);
    g.state.world.set(a.q, y, a.r, 'glass');
    g.graphics.updateCells([[a.q, y, a.r]]);
    return m.position.y;
  });
  await waitGame(page, 2);
  const after = await page.evaluate(() => window.coldSkeleton.position.y);
  await writeFile(
    info.outputPath('overlap-floor.json'),
    JSON.stringify({ before, after }, null, 2),
  );
  expect(before).toBeGreaterThanOrEqual(40);
  expect(after).toBeGreaterThanOrEqual(40);
});
