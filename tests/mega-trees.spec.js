import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('four planted saplings grow real giant trees atomically through bone meal and natural maturity, preserving inventory and exports', async ({
  page,
}, info) => {
  test.setTimeout(420000);
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const save = referenceSave(referenceScenes[0]);
  save.creative = false;
  save.creativeFlying = false;
  save.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'tree-garden-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const settled = async () => {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const begin = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(begin + 35);
  };
  await settled();
  const records = [];
  for (const scenario of [
    { species: 'jungle', q: -119, r: 8, rotation: 0, natural: false },
    { species: 'jungle', q: -93, r: 8, rotation: 2, natural: false },
    { species: 'spruce', q: -72, r: 8, rotation: 1, natural: true },
  ]) {
    const initial = await page.evaluate(async (s) => {
      const a = window.__hexwild,
        w = a.state.world,
        g = a.graphics,
        { megaTreeCells, megaTreeRoots, treeCells } =
          await import('/src/tree-layout.js'),
        { hexDistance, key } = await import('/src/core.js');
      const soil = 25,
        updates = [];
      // An ordinary built planting bed above local terrain keeps other natural
      // trunks/animals out of the test's growth volume. No product seed exception.
      for (let dq = -10; dq <= 10; dq++)
        for (let dr = -10; dr <= 10; dr++)
          if (hexDistance(dq, dr) <= 10) {
            const q = s.q + dq,
              r = s.r + dr;
            for (
              let y = Math.max(1, w.terrainHeight(q, r) - 1);
              y <= soil;
              y++
            ) {
              const type = y === soil ? 'grass' : 'dirt';
              if (w.get(q, y, r) !== type) {
                w.set(q, y, r, type);
                updates.push([q, y, r]);
              }
            }
            for (let y = soil + 1; y < 64; y++)
              if (w.get(q, y, r)) {
                w.set(q, y, r, null);
                updates.push([q, y, r]);
              }
          }
      const stand = [s.q + 14, soil, s.r + 8];
      for (const [dq, dr] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [0, -1],
        [1, -1],
      ]) {
        w.set(stand[0] + dq, soil, stand[2] + dr, 'grass');
        for (let y = soil + 1; y < soil + 5; y++)
          if (w.get(stand[0] + dq, y, stand[2] + dr)) {
            w.set(stand[0] + dq, y, stand[2] + dr, null);
            updates.push([stand[0] + dq, y, stand[2] + dr]);
          }
        updates.push([stand[0] + dq, soil, stand[2] + dr]);
      }
      g.updateCells(updates);
      a.teleport(stand[0], soil + 1, stand[2]);
      a.lookAt(s.q, soil + 12, s.r);
      const roots = megaTreeRoots(s.q, soil, s.r, s.rotation),
        id = s.species === 'jungle' ? 'jungleSapling' : 'spruceSapling';
      a.give(id, 4);
      a.give('boneMeal', 4);
      a.selectItem(id);
      for (const [q, y, r] of roots) {
        a.setTarget({ q, y, r, type: 'grass' });
        a.setPlaying(true);
        a.interact();
        a.setPlaying(false);
      }
      const keys = roots.map((p) => key(...p));
      if (keys.some((k) => !a.state.crops.has(k)))
        throw Error('Four real saplings did not plant');
      if ((a.state.inventory[id] || 0) !== 0)
        throw Error('Planting did not consume exactly four saplings');
      const cells = megaTreeCells(
          s.species,
          s.q,
          soil + 1,
          s.r,
          w.seed,
          s.rotation,
        ),
        single = new Set(
          treeCells(s.species, s.q, soil + 1, s.r, w.seed).map((c) =>
            key(...c.slice(0, 3)),
          ),
        ),
        obstruction = cells.find(
          (c) => c[4] && !single.has(key(...c.slice(0, 3))),
        );
      const use = () => {
        const [q, y, r] = roots[3];
        a.selectItem('boneMeal');
        a.setTarget({ q, y, r, type: 'grass', crop: keys[3] });
        a.setPlaying(true);
        a.interact();
        a.setPlaying(false);
      };
      let blocked = null;
      if (!s.natural) {
        w.set(...obstruction.slice(0, 3), 'glass');
        g.updateCells([obstruction.slice(0, 3)]);
        use();
        blocked = {
          crops: keys.filter((k) => a.state.crops.has(k)).length,
          bone: a.state.inventory.boneMeal,
          root: roots.map(([q, y, r]) => w.get(q, y + 1, r) || null),
        };
        if (
          blocked.crops !== 4 ||
          blocked.bone !== 4 ||
          blocked.root.some(Boolean)
        )
          throw Error('Failed giant growth consumed or replaced a root');
        w.set(...obstruction.slice(0, 3), null);
        g.updateCells([obstruction.slice(0, 3)]);
        use();
      } else {
        a.state.crops.get(keys[3]).age = 210;
        window.__photonFreeze = false;
        a.setPlaying(true);
      }
      window.__megaExpected = { cells, keys };
      return { scenario: s, roots, blocked, cells: cells.length };
    }, scenario);
    if (scenario.natural) {
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                window.__megaExpected.keys.filter((k) =>
                  window.__hexwild.state.crops.has(k),
                ).length,
            ),
          { timeout: 15000 },
        )
        .toBe(0);
      await page.evaluate(() => {
        window.__photonFreeze = true;
        window.__hexwild.setPlaying(false);
      });
    }
    const result = await page.evaluate(() => {
      const a = window.__hexwild,
        w = a.state.world,
        { cells, keys } = window.__megaExpected;
      for (const [q, y, r, type, axis = 0] of cells) {
        if (w.get(q, y, r) !== type) throw Error('Grown cell mismatch');
        if (axis && w.state(q, y, r).axis !== axis)
          throw Error('Grown branch axis mismatch');
      }
      return {
        rootsRemaining: keys.filter((k) => a.state.crops.has(k)).length,
        bone: a.state.inventory.boneMeal,
        branches: cells.filter((c) => c[4]).length,
        time: a.state.time,
        error: a.graphics.renderer.getContext().getError(),
        position: a.state.position,
      };
    });
    expect(result.rootsRemaining).toBe(0);
    expect(result.bone).toBe(scenario.natural ? 4 : 3);
    expect(result.error).toBe(0);
    await settled();
    await page.locator('#world').screenshot({
      path: info.outputPath(`${scenario.species}-${scenario.rotation}.png`),
    });
    records.push({ ...initial, result });
  }
  // A real paused export includes all three trees and the native grown branches.
  await page.evaluate(() => window.__hexwild.save());
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  await download.saveAs(info.outputPath('grown-mega-trees-v16.json'));
  await writeFile(
    info.outputPath('mega-trees.json'),
    JSON.stringify({ records, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
