import { readFile } from 'node:fs/promises';
import {
  unzipSync,
  zipSync,
  strToU8,
  strFromU8,
} from 'three/addons/libs/fflate.module.js';
import { test, expect } from './browser-fixture.js';
test('back, front and eyes share the same player; inventory shows the actual model', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (location.origin !== 'null')
      localStorage.setItem(
        'hexwild-settings',
        JSON.stringify({ quality: 0.65, sound: false }),
      );
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hexwild, null, { timeout: 150000 });
  await page.locator('#start').click();
  await page.locator('#new-world').click({ timeout: 150000 });
  await page.keyboard.press('F5');
  await expect
    .poll(
      () => page.evaluate(() => window.__hexwild.graphics.avatar?.root.visible),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.keyboard.press('F5');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.viewMode))
    .toBe(2);
  await page.evaluate(() => {
    const h = window.__hexwild,
      w = h.state.world;
    let best = null;
    for (let q = -11; q < 12; q++)
      for (let r = -11; r < 12; r++) {
        const y = w.terrainHeight(q, r);
        if (
          (!best || best.y < y) &&
          [0, 1, 2, 3].every(
            (k) =>
              !w.get(q, y + 1, r + k) &&
              !w.get(q, y + 2, r + k) &&
              !w.get(q, y + 3, r + k),
          )
        )
          best = { q, r, y };
      }
    if (!best) throw Error('No open surface in the test seed');
    const { q, r, y } = best;
    h.teleport(q, y + 1, r);
    h.lookAt(q, y + 2.55, r + 4);
  });
  await page.keyboard.press('F1');
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: testInfo.outputPath('field.png') });
  if (process.env.PEARL_PROFILE) {
    // Sample the same camera and world with only the avatar's mesh layers toggled.
    // A freshly teleported view is still building full terrain meshes, two
    // chunks per frame. Exclude that one-time cost from both timing windows.
    await page.waitForFunction(
      () => !window.__hexwild.graphics.queue.length,
      null,
      { timeout: 120000 },
    );
    const session = process.env.PEARL_CPU_PROFILE
      ? await page.context().newCDPSession(page)
      : null;
    if (session) {
      await session.send('Profiler.enable');
      await session.send('Profiler.start');
    }
    const perf = await page.evaluate(async () => {
      const g = window.__hexwild.graphics,
        gl = g.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info'),
        nodes = [];
      g.avatar.root.traverse((n) => {
        if (n.isMesh && n.visible) nodes.push([n, n.layers.mask]);
      });
      const samples = [[], []],
        next = () => new Promise((resolve) => requestAnimationFrame(resolve));
      try {
        for (const on of [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0]) {
          for (const [n, mask] of nodes) n.layers.mask = on ? mask : 0;
          for (let i = 0; i < 3; i++) await next();
          let prev = await next();
          for (let i = 0; i < 8; i++) {
            const now = await next();
            samples[on].push(now - prev);
            prev = now;
          }
        }
      } finally {
        for (const [n, mask] of nodes) n.layers.mask = mask;
      }
      const stats = (xs) => {
        xs.sort((a, b) => a - b);
        return { median: xs[32], p90: xs[57] };
      };
      return {
        gpu: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        withAvatarMs: stats(samples[1]),
        withoutAvatarMs: stats(samples[0]),
        samplesPerState: 64,
      };
    });
    if (session) {
      const { profile } = await session.send('Profiler.stop');
      await session.detach();
      await testInfo.attach('world.cpuprofile', {
        body: JSON.stringify(profile),
        contentType: 'application/json',
      });
    }
    await testInfo.attach('avatar-frame-times', {
      body: JSON.stringify(perf),
      contentType: 'application/json',
    });
    console.log('F5 avatar frame times', perf);
  }
  // Sample the live bone on animation frames so the test can see the brief startled look.
  const reaction = await page.evaluate(async () => {
    const h = window.__hexwild,
      eyes = h.graphics.avatar.root.getObjectByName('WideEyes');
    const rest = eyes.position.z;
    const next = () => new Promise((done) => requestAnimationFrame(done));
    const before = h.state.health,
      deadline = performance.now() + 45000;
    while (h.state.health === before && performance.now() < deadline) {
      h.damage(1, 'fall');
      await next();
    }
    const peak = eyes.position.z;
    while (eyes.position.z > rest + 0.01 && performance.now() < deadline)
      await next();
    return {
      hit: h.state.health < before,
      wide: peak - rest,
      relaxed: eyes.position.z - rest,
    };
  });
  expect(reaction.hit).toBe(true);
  expect(reaction.wide).toBeGreaterThan(0.15);
  expect(reaction.relaxed).toBeCloseTo(0);

  await page.keyboard.press('F1');
  await page.keyboard.press('F5');
  await expect
    .poll(() =>
      page.evaluate(() => window.__hexwild.graphics.avatar.root.visible),
    )
    .toBe(false);
  await page.keyboard.press('e');
  await expect(page.locator('#character .portrait img')).toBeVisible();
  expect(
    await page.locator('.portrait img').evaluate((img) => img.naturalWidth),
  ).toBe(200);
  const brightness = await page.locator('.portrait img').evaluate((img) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0,
      count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 3] > 240) {
        sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        count++;
      }
    return sum / count;
  });
  expect(brightness).toBeGreaterThan(120);
  await page.screenshot({ path: testInfo.outputPath('inventory.png') });
  expect(errors).toEqual([]);
  await page.goto('about:blank', { waitUntil: 'commit' });
});

test('an imported YSM changes the rig, survives reload and can be reset', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#menu-help').click({ timeout: 120000 });
  const files = unzipSync(await readFile('public/models/pearl-dragon-hy.zip'));
  const manifest = JSON.parse(strFromU8(files['ysm.json']));
  manifest.metadata.name = '靛蓝试装';
  files['ysm.json'] = strToU8(JSON.stringify(manifest));
  const path = manifest.files.player.model.main;
  const g = JSON.parse(strFromU8(files[path]));
  g['minecraft:geometry'][0].bones.find((b) => b.name === 'Head').cubes.pop();
  g['minecraft:geometry'][0].bones.push({
    name: 'IndigoTail',
    parent: 'AllBody',
    pivot: [0, 13, 2],
  });
  files[path] = strToU8(JSON.stringify(g));
  const setPack = (name, buffer) =>
    page
      .locator('#avatar-file')
      .setInputFiles({ name, mimeType: 'application/zip', buffer });
  await setPack('indigo.zip', Buffer.from(zipSync(files)));
  await expect(page.locator('#avatar-status')).toHaveText('当前角色：靛蓝试装');
  const active = () =>
    page.evaluate(async () => {
      const { dragonAvatar } = await import('/src/dragon-avatar.js');
      const rig = dragonAvatar();
      const imported = !!rig.root.getObjectByName('IndigoTail');
      rig.dispose();
      return imported;
    });
  expect(await active()).toBe(true);
  await setPack('bad.zip', Buffer.from('not a pack'));
  await expect(page.locator('#avatar-status')).toContainText(
    '保留当前角色「靛蓝试装」',
  );
  await page.reload();
  await page.locator('#menu-help').click({ timeout: 120000 });
  await expect(page.locator('#avatar-status')).toHaveText('当前角色：靛蓝试装');
  expect(await active()).toBe(true);
  await page.locator('#avatar-reset').click();
  await expect(page.locator('#avatar-status')).toHaveText(
    '当前角色：六野 · 白龙娘',
  );
  expect(await active()).toBe(false);
  expect(errors).toEqual([]);
});
