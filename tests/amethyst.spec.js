import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { amethystScene } from './fixtures/amethyst-save.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('natural crystal harvesting funds real crafting and both-hand spyglass use, cancellation and recovery', async ({
  page,
}, info) => {
  const messages = [];
  const milestones = [];
  const report = async (phase) => {
    milestones.push({
      phase,
      state: await page.evaluate(() => {
        const a = window.__hexwild,
          g = a.graphics;
        return {
          inventory: a.state.inventory,
          position: a.state.position,
          crystals: [...g.chunks.values()]
            .flatMap((chunk) => {
              const found = [];
              chunk.traverse((m) => {
                if (m.userData.shaped?.type !== 'amethystCluster') return;
                const range = (name) => {
                  const a = m.geometry.attributes[name]?.array;
                  return a
                    ? Array.from(a).reduce(
                        (r, x) => [Math.min(r[0], x), Math.max(r[1], x)],
                        [Infinity, -Infinity],
                      )
                    : null;
                };
                if (found.length < 3)
                  found.push({
                    cell: m.userData.shaped,
                    blocklight: range('blocklight'),
                    color: range('color'),
                    ambientOcclusion: range('ambientOcclusion'),
                    uv: range('uv'),
                    defaults: m.material.defaultAttributeValues,
                  });
              });
              return found;
            })
            .slice(0, 6),
        };
      }),
    });
    await writeFile(
      info.outputPath('milestones.json'),
      JSON.stringify({ milestones, messages }, null, 2),
    );
  };
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.mouse.move(450, 325);
  const scene = amethystScene();
  await page.locator('#save-file').setInputFiles({
    name: 'natural-geode-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene.save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 180000 },
    )
    .toBe(true);
  async function pose(data) {
    await page.mouse.move(450, 325);
    await page.evaluate((p) => {
      const a = window.__hexwild;
      a.teleport(p.q, p.y, p.r);
      const [x, y, z] = p.target;
      a.lookAt(x / Math.sqrt(3) - z / 3, y, z / 1.5);
    }, data);
  }
  const count = (id) =>
    page.evaluate((id) => window.__hexwild.state.inventory[id] || 0, id);
  await page.keyboard.press('F1');
  await report('natural-geode');
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('natural-geode.png') });
  await page.keyboard.press('F1');
  for (let i = 0; i < 2; i++) {
    const cluster = scene.clusters[i];
    await pose(cluster.pose);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = window.__hexwild.state.target;
            return t ? [t.q, t.y, t.r, t.type] : null;
          }),
        { timeout: 60000 },
      )
      .toEqual([...cluster.point, 'amethystCluster']);
    await page.mouse.down({ button: 'left' });
    await expect
      .poll(
        () =>
          page.evaluate(
            (p) => window.__hexwild.state.world.get(...p) || null,
            cluster.point,
          ),
        { timeout: 30000 },
      )
      .toBe(null);
    await page.mouse.up({ button: 'left' });
    await report('mined-' + i);
    // The real loot entity has a random initial horizontal impulse. Walk
    // toward the mined cell rather than assuming every drop lands in range.
    const wanted = (i + 1) * 4;
    if ((await count('amethystShard')) !== wanted)
      await page.keyboard.down('KeyW');
    try {
      await expect
        .poll(() => count('amethystShard'), { timeout: 15000 })
        .toBe(wanted);
    } finally {
      await page.keyboard.up('KeyW');
    }
  }
  await pose(scene.clusters[0].pose);
  const bench = scene.bench;
  await page.evaluate(
    (p) => window.__hexwild.lookAt(p[0], p[1] + 0.5, p[2]),
    bench,
  );
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type), {
      timeout: 60000,
    })
    .toBe('workbench');
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#craft-overlay')).toBeVisible();
  for (const name of ['望远镜', '遮光玻璃']) {
    await page.locator('#recipe-search').fill(name);
    await page
      .locator('[data-recipe].can-fill')
      .filter({ hasText: new RegExp('^' + name) })
      .click();
    await page.locator('#craft-button').click({ modifiers: ['Shift'] });
  }
  expect(await count('spyglass')).toBe(1);
  expect(await count('tintedGlass')).toBe(2);
  expect(await count('amethystShard')).toBe(3);
  expect(await count('copperIngot')).toBe(0);
  expect(await count('glass')).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.selectItem('spyglass'));
  await pose(scene.clusters[0].pose);
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.camera.fov))
    .toBeCloseTo(7.2, 5);
  expect(
    await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      return [
        g.hand.visible,
        g.offhandHand.visible,
        g.shield.visible,
        g.mainShield.visible,
      ];
    }),
  ).toEqual([false, false, false, false]);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('spyglass-in-geode.png') });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.camera.fov))
    .toBeCloseTo(72, 3);
  await page.keyboard.press('KeyF');
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('KeyF');
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeVisible();
  await page.mouse.wheel(0, 100);
  await expect(page.locator('#spyglass-view')).toBeHidden();
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => window.__hexwild.selectItem('spyglass'));
  await page.mouse.move(450, 325);
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(page.locator('#spyglass-view')).toBeHidden();
  await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => document.pointerLockElement !== null)).toBe(
    false,
  );
  await page.locator('#resume').click();
  await pose(scene.clusters[0].pose);
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeVisible();
  await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      canvas = g.renderer.domElement,
      ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) throw Error('WEBGL_lose_context unavailable');
    window.__geodeContext = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  await expect(page.locator('#spyglass-view')).toBeHidden();
  await page.mouse.up({ button: 'right' });
  expect(
    await page.evaluate(async () => {
      const g = window.__hexwild.graphics;
      await new Promise((resolve) => {
        g.renderer.domElement.addEventListener(
          'webglcontextrestored',
          resolve,
          { once: true },
        );
        window.__geodeContext.restoreContext();
      });
      return g.recovery;
    }),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.recovering))
    .toBe(false);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  expect(await count('spyglass')).toBe(1);
  expect(await count('tintedGlass')).toBe(2);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const savePath = info.outputPath('geode-v16.json');
  await download.saveAs(savePath);
  const exported = JSON.parse(await readFile(savePath, 'utf8'));
  expect(exported.version).toBe(16);
  expect(exported.seed).toBe(624);
  const savedCounts = Object.fromEntries(
    ['spyglass', 'tintedGlass', 'amethystShard'].map((id) => [
      id,
      exported.inventory.slots
        .filter((s) => s?.item === id)
        .reduce((n, s) => n + s.count, 0),
    ]),
  );
  expect(savedCounts).toEqual({
    spyglass: 1,
    tintedGlass: 2,
    amethystShard: 3,
  });
  await writeFile(
    info.outputPath('geode.json'),
    JSON.stringify(
      { geode: scene.geode, clusters: scene.clusters, savedCounts, messages },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
