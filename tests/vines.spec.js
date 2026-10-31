import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('real vines support paid placement, shearing and climbing, with native jungle cutouts batched by chunk', async ({
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
  save.creative = save.creativeFlying = false;
  save.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'vine-garden-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const placement = await page.evaluate(async () => {
    const a = window.__hexwild,
      w = a.state.world,
      g = a.graphics,
      { DIRECTIONS, axialToWorld } = await import('/src/core.js');
    a.teleport(0, 39, 4);
    a.setPlaying(false);
    const updates = [];
    for (let q = -4; q <= 9; q++)
      for (let r = -4; r <= 8; r++)
        for (let y = 38; y <= 52; y++) {
          w.set(q, y, r, y === 38 ? 'stone' : null);
          updates.push([q, y, r]);
        }
    for (let y = 39; y <= 47; y++) {
      w.set(1, y, 0, 'stone');
      w.set(0, y, 0, 'vine');
      w.setState(0, y, 0, { facing: 0, open: false, faces: 1 });
    }
    for (const [dq, dr] of DIRECTIONS) w.set(4 + dq, 40, 4 + dr, 'stone');
    w.set(4, 41, 4, 'stone');
    g.updateCells(updates);
    a.give('vine', 8);
    a.selectItem('vine');
    const use = (target) => {
      a.setTarget(target);
      a.setPlaying(true);
      a.place();
      a.setPlaying(false);
    };
    for (let side = 0; side < 6; side++) {
      const [dq, dr] = DIRECTIONS[side],
        p = axialToWorld(dq, dr);
      use({
        q: 4 + dq,
        y: 40,
        r: 4 + dr,
        type: 'stone',
        place: { q: 4, y: 40, r: 4 },
        normal: { x: -p.x / Math.sqrt(3), y: 0, z: -p.z / Math.sqrt(3) },
      });
    }
    use({
      q: 4,
      y: 41,
      r: 4,
      type: 'stone',
      place: { q: 4, y: 40, r: 4 },
      normal: { x: 0, y: -1, z: 0 },
    });
    const paid = a.state.inventory.vine;
    use({
      q: 5,
      y: 40,
      r: 4,
      type: 'stone',
      place: { q: 4, y: 40, r: 4 },
      normal: { x: -1, y: 0, z: 0 },
    });
    const duplicate = a.state.inventory.vine;
    a.give('boneMeal', 3);
    a.selectItem('boneMeal');
    use({ q: 4, y: 40, r: 4, type: 'vine' });
    const bone = a.state.inventory.boneMeal;
    a.selectItem('vine');
    use({ q: 4, y: 40, r: 4, type: 'vine' });
    return {
      paid,
      duplicate,
      bone,
      remaining: a.state.inventory.vine || 0,
      faces: w.state(4, 40, 4).faces,
      extension: w.state(4, 39, 4).faces,
    };
  });
  expect(placement).toEqual({
    paid: 1,
    duplicate: 1,
    bone: 3,
    remaining: 0,
    faces: 127,
    extension: 1,
  });
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.give('shears', 1);
    a.selectItem('shears');
    a.teleport(-2, 39, 0);
    a.lookAt(0.48, 40.5, 0);
    window.__photonFreeze = false;
    a.setPlaying(true);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const t = window.__hexwild.state.target;
          return t && [t.q + 0, t.y, t.r + 0, t.type];
        }),
      { timeout: 60000 },
    )
    .toEqual([0, 40, 0, 'vine']);
  await page.locator('#world').dispatchEvent('mousedown', { button: 0 });
  try {
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__hexwild.state.world.get(0, 40, 0) || null,
          ),
        { timeout: 15000 },
      )
      .toBe(null);
  } finally {
    await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  }
  await page.evaluate(() => window.__hexwild.teleport(0, 39, 0));
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.state.inventory.vine || 0),
      { timeout: 15000 },
    )
    .toBe(1);
  const repaired = await page.evaluate(() => {
    const a = window.__hexwild;
    window.__photonFreeze = true;
    a.setPlaying(false);
    a.selectItem('vine');
    a.setTarget({
      q: 1,
      y: 40,
      r: 0,
      type: 'stone',
      place: { q: 0, y: 40, r: 0 },
      normal: { x: -1, y: 0, z: 0 },
    });
    a.setPlaying(true);
    a.place();
    a.setPlaying(false);
    a.selectItem('shears');
    a.teleport(0, 39, 0);
    a.lookAt(1, 41, 0);
    return {
      stock: a.state.inventory.vine || 0,
      type: a.state.world.get(0, 40, 0),
    };
  });
  expect(repaired).toEqual({ stock: 0, type: 'vine' });
  const before = await page.evaluate(() => {
    window.__photonFreeze = false;
    window.__hexwild.setPlaying(true);
    return window.__hexwild.state.position[1];
  });
  await page.keyboard.down('Space');
  try {
    await expect
      .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
        timeout: 15000,
      })
      .toBeGreaterThan(before + 1.2);
  } finally {
    await page.keyboard.up('Space');
  }
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(350);
  const stopped = await page.evaluate(() => window.__hexwild.state.position[1]);
  await page.waitForTimeout(350);
  expect(
    Math.abs(
      (await page.evaluate(() => window.__hexwild.state.position[1])) - stopped,
    ),
  ).toBeLessThan(0.05);
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(350);
  const released = await page.evaluate(
    () => window.__hexwild.state.position[1],
  );
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
      timeout: 15000,
    })
    .toBeLessThan(released - 0.3);
  await page.evaluate(() => {
    window.__photonFreeze = true;
    window.__hexwild.setPlaying(false);
    window.__hexwild.teleport(-4, 40, 1);
    window.__hexwild.lookAt(0.45, 42.5, 0);
  });
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('vine-garden.png') });
  const natural = await page.evaluate(async () => {
    const a = window.__hexwild,
      w = a.state.world,
      { DIRECTIONS, axialToWorld } = await import('/src/core.js');
    a.teleport(-160, 24, 38);
    const roots = [...w.treeLogs]
      .map((k) => k.split(',').map(Number))
      .filter(
        ([q, y, r]) =>
          w.get(q, y, r) === 'jungleWood' &&
          w.tree(q, r) &&
          w.get(q, y + 4, r) === 'jungleWood' &&
          ['jungle', 'giant'].includes(w.naturalTree(q, r)?.form) &&
          w.get(q, y - 1, r) !== 'jungleWood',
      )
      .sort(
        (a, b) =>
          Math.hypot(a[0] + 160, a[2] - 38) - Math.hypot(b[0] + 160, b[2] - 38),
      );
    if (!roots.length) throw Error('No actual native jungle root');
    const [q, y, r] = roots[0];
    const trunk = axialToWorld(q, r),
      feet = y + 3,
      eye = feet + 1.65;
    let view = null;
    search: for (const distance of [6, 5, 4, 7, 8]) {
      for (const side of [3, 2, 4, 0, 1, 5]) {
        const [dq, dr] = DIRECTIONS[side],
          cq = q + dq * distance,
          cr = r + dr * distance,
          p = axialToWorld(cq, cr);
        if (w.columnSolid(p.x, p.z, feet, feet + 1.9)) continue;
        const length = Math.hypot(trunk.x - p.x, trunk.z - p.z),
          steps = Math.ceil(length / 0.25);
        let clear = true;
        for (let i = 1; i / steps < 1 - 1.1 / length; i++) {
          const t = i / steps;
          if (
            w.pointSolid(
              p.x + (trunk.x - p.x) * t,
              eye + (y + 6 - eye) * t,
              p.z + (trunk.z - p.z) * t,
            )
          ) {
            clear = false;
            break;
          }
        }
        if (clear) {
          view = [cq, feet, cr];
          break search;
        }
      }
    }
    if (!view) throw Error('No unobstructed native jungle view');
    a.teleport(...view);
    a.lookAt(q, y + 6, r);
    return {
      root: [q, y, r],
      camera: a.state.position,
      cameraClear: !w.columnSolid(
        a.graphics.camera.position.x,
        a.graphics.camera.position.z,
        feet,
        feet + 1.9,
      ),
      naturalVines: [...w.vineCells].filter((k) => !w.edits.has(k)).length,
    };
  });
  expect(natural.naturalVines).toBeGreaterThan(10);
  expect(natural.cameraClear).toBe(true);
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
    .screenshot({ path: info.outputPath('native-jungle-vines.png') });
  const rendering = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      groups = [...g.chunks.values()].map((m) =>
        m.children.filter((c) => c.userData.vines),
      ),
      batches = groups.flat();
    return {
      batches: batches.length,
      maximumPerChunk: Math.max(...groups.map((a) => a.length)),
      vertices: batches.reduce(
        (n, m) => n + m.geometry.attributes.position.count,
        0,
      ),
      attributes: batches.every(
        (m) =>
          m.geometry.attributes.biomeTint &&
          m.geometry.attributes.leafAmbient &&
          m.geometry.userData.biomeRanges.length &&
          m.customDepthMaterial === g.plantMaterials.depth,
      ),
      gl: g.renderer.getContext().getError(),
    };
  });
  expect(rendering.batches).toBeGreaterThan(0);
  expect(rendering.maximumPerChunk).toBe(1);
  expect(rendering.attributes).toBe(true);
  expect(rendering.gl).toBe(0);
  await page.evaluate(() => window.__hexwild.save());
  await page.keyboard.press('Escape');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  await download.saveAs(info.outputPath('vines-v16.json'));
  await writeFile(
    info.outputPath('vines.json'),
    JSON.stringify(
      {
        placement,
        repaired,
        before,
        stopped,
        released,
        natural,
        rendering,
        messages,
      },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
