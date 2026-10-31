import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('a native jungle mixes giant crowns, understory and fallen logs while edited natural wood survives streaming and export', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const save = referenceSave(referenceScenes[0]);
  save.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'native-jungle-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const captures = [];
  async function capture(q, r, form, label) {
    const result = await page.evaluate(
      async ({ q, r, form }) => {
        const a = window.__hexwild,
          w = a.state.world,
          { DIRECTIONS, axialToWorld, worldToAxial, key } =
            await import('/src/core.js');
        a.setPlaying(false);
        a.teleport(q, 55, r);
        const tree = w.naturalTree(q, r);
        if (tree?.form !== form) throw Error('Wrong natural tree form');
        const logs = tree.cells.filter(
            (c) => c[3] === 'jungleWood' || c[3] === 'wood',
          ),
          top = Math.max(...tree.cells.map((c) => c[1])),
          own = new Set(tree.cells.map((c) => key(...c.slice(0, 3)))),
          target =
            form === 'fallen'
              ? [
                  logs.reduce((v, c) => v + c[0], 0) / logs.length,
                  logs.reduce((v, c) => v + c[1], 0) / logs.length + 0.6,
                  logs.reduce((v, c) => v + c[2], 0) / logs.length,
                ]
              : [
                  q + (form === 'giant' ? 0.5 : 0),
                  form === 'giant' ? top - 4 : tree.base + 0.8,
                  r + (form === 'giant' ? 0.5 : 0),
                ],
          centre = axialToWorld(target[0], target[2]),
          feet =
            form === 'giant'
              ? top + 6
              : form === 'bush'
                ? tree.base + 1
                : top + 1.7,
          distances =
            form === 'giant'
              ? [20, 16, 24, 12]
              : form === 'bush'
                ? [4, 3, 5, 6]
                : [7, 6, 8, 5];
        let view = null;
        search: for (const distance of distances)
          for (const side of [3, 2, 4, 0, 1, 5]) {
            const [dq, dr] = DIRECTIONS[side],
              cq = target[0] + dq * distance,
              cr = target[2] + dr * distance,
              p = axialToWorld(cq, cr);
            if (
              [
                [0, 0],
                [0.3, 0],
                [-0.3, 0],
                [0, 0.3],
                [0, -0.3],
              ].some(([x, z]) =>
                w.columnSolid(p.x + x, p.z + z, feet, feet + 1.9),
              )
            )
              continue;
            const length = Math.hypot(centre.x - p.x, centre.z - p.z),
              steps = Math.ceil(length / 0.25);
            let visible = false;
            for (let i = 1; i <= steps; i++) {
              const t = i / steps,
                x = p.x + (centre.x - p.x) * t,
                y = feet + 1.65 + (target[1] - feet - 1.65) * t,
                z = p.z + (centre.z - p.z) * t;
              if (w.pointSolid(x, y, z)) {
                const c = worldToAxial(x, z);
                visible = own.has(key(c.q, Math.floor(y), c.r));
                break;
              }
            }
            if (visible) {
              view = [cq, feet, cr];
              break search;
            }
          }
        if (!view) throw Error('No clear view of natural ' + form);
        a.teleport(...view);
        a.lookAt(...target);
        window.__landscapeTrees ??= {};
        window.__landscapeTrees[form] = { tree, view, target };
        const rootType = w.get(q, tree.base, r),
          branches = logs.filter(
            (c) => c[4] && w.state(...c.slice(0, 3)).axis === c[4],
          ).length;
        return {
          form,
          root: [q, tree.base, r],
          rootType,
          top,
          branches,
          view,
          camera: a.state.position,
          quality: a.graphics.quality,
          fog: [a.graphics.scene.fog.near, a.graphics.scene.fog.far],
          exposure: a.graphics.renderer.toneMappingExposure,
          initialEdits: w.edits.size,
          initialEditEntries: [...w.edits],
          nativeVines: [...w.vineCells].filter((k) => !w.edits.has(k)).length,
        };
      },
      { q, r, form },
    );
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
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 30);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    await writeFile(
      info.outputPath(label + '.json'),
      JSON.stringify(result, null, 2),
    );
    expect(result.quality).toBe(1.7);
    expect(result.exposure).toBe(1);
    expect(result.fog).toEqual([87.32, 118]);
    expect(result.initialEdits, JSON.stringify(result.initialEditEntries)).toBe(
      0,
    );
    captures.push(result);
    return result;
  }
  const giant = await capture(-158, 54, 'giant', 'natural-giant');
  expect(giant.top - giant.root[1]).toBeGreaterThan(23);
  expect(giant.branches).toBeGreaterThan(0);
  expect(giant.nativeVines).toBeGreaterThan(0);
  const forms = await page.evaluate(() => {
    const w = window.__hexwild.state.world;
    return [
      [-160, 38],
      [-159, 36],
      [-150, 43],
    ].map(([q, r]) => {
      const t = w.naturalTree(q, r);
      return { form: t?.form, type: w.get(q, t.base, r) };
    });
  });
  expect(forms).toEqual([
    { form: 'bush', type: 'jungleWood' },
    { form: 'jungle', type: 'jungleWood' },
    { form: 'fancy-oak', type: 'wood' },
  ]);
  await capture(-160, 38, 'bush', 'native-understory');
  await capture(-36, 55, 'fallen', 'native-fallen-log');
  const persistence = await page.evaluate(async () => {
    const a = window.__hexwild,
      w = a.state.world,
      { tree, view, target } = window.__landscapeTrees.giant,
      [q, base, r] = [-158, tree.base, 54],
      { tickVines } = await import('/src/vines.js');
    const unloaded = !w.loaded(q, r);
    a.teleport(...view);
    a.lookAt(...target);
    const branch = tree.cells.find(
      (c) =>
        c[4] &&
        w.get(...c.slice(0, 3)) === 'jungleWood' &&
        w.state(...c.slice(0, 3)).axis === c[4],
    );
    if (!branch) throw Error('No actual native branch');
    w.set(q, base + 4, r, null);
    w.set(...branch.slice(0, 3), 'jungleWood');
    w.setState(...branch.slice(0, 3), {
      facing: 0,
      open: false,
      axis: branch[4],
    });
    const pruned = tickVines(w, 0).changed;
    a.graphics.updateCells([
      [q, base + 4, r],
      branch.slice(0, 3),
      ...pruned.map((p) => [p.q, p.y, p.r]),
    ]);
    a.teleport(300, 40, 300);
    const editedUnloaded = !w.loaded(q, r);
    a.teleport(...view);
    a.lookAt(...target);
    return {
      unloaded,
      editedUnloaded,
      removed: w.get(q, base + 4, r) || null,
      axis: w.state(...branch.slice(0, 3)).axis,
      expectedAxis: branch[4],
      pruned: pruned.length,
      unsettledVines: tickVines(w, 0).changed.length,
      gl: a.graphics.renderer.getContext().getError(),
    };
  });
  expect(persistence.unloaded).toBe(true);
  expect(persistence.editedUnloaded).toBe(true);
  expect(persistence.removed).toBe(null);
  expect(persistence.axis).toBe(persistence.expectedAxis);
  expect(persistence.unsettledVines).toBe(0);
  expect(persistence.gl).toBe(0);
  await page.evaluate(() => window.__hexwild.save());
  await page.keyboard.press('Escape');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  await download.saveAs(info.outputPath('natural-jungle-v16.json'));
  await writeFile(
    info.outputPath('landscape.json'),
    JSON.stringify({ captures, forms, persistence, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
