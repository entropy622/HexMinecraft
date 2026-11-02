import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { amethystScene } from './fixtures/amethyst-save.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { PlayerInventory } from '../src/inventory.js';
import { axialToWorld } from '../src/core.js';
import { validateSave } from '../src/save.js';

test('release UI crafts a spyglass and tinted glass, draws the narrowed projection and exports real inventory', async ({
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
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.addInitScript(() => {
    window.__amethystDevice = {
      last: null,
      projections: [],
      serial: 0,
      scopeSerial: 0,
      normalSerial: 0,
    };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = get.apply(this, args);
      if (
        this.id === 'world' &&
        args[0] === 'webgl2' &&
        gl &&
        !gl.__amethystObserved
      ) {
        gl.__amethystObserved = true;
        const locations = new WeakMap(),
          location = gl.getUniformLocation.bind(gl),
          matrix = gl.uniformMatrix4fv.bind(gl);
        gl.getUniformLocation = (program, name) => {
          const result = location(program, name);
          if (result) locations.set(result, name);
          return result;
        };
        gl.uniformMatrix4fv = (loc, transpose, values, ...rest) => {
          if (
            locations.get(loc) === 'projectionMatrix' &&
            Math.abs(values[11] + 1) < 1e-5
          ) {
            const value = Number(values[5].toFixed(5)),
              d = window.__amethystDevice;
            d.serial++;
            if (Math.abs(value - 1 / Math.tan((3.6 * Math.PI) / 180)) < 0.001)
              d.scopeSerial = d.serial;
            if (Math.abs(value - 1 / Math.tan((36 * Math.PI) / 180)) < 0.001)
              d.normalSerial = d.serial;
            if (d.last !== value) {
              d.last = value;
              if (d.projections.length < 40) d.projections.push(value);
            }
          }
          return matrix(loc, transpose, values, ...rest);
        };
      }
      return gl;
    };
  });
  const scene = amethystScene(),
    input = scene.save,
    pack = new PlayerInventory();
  pack.insert('pick2', 1);
  pack.insert('copperIngot', 2);
  pack.insert('glass', 1);
  pack.insert('amethystShard', 8);
  input.inventory = pack.serialize();
  const bench = axialToWorld(scene.bench[0], scene.bench[2]),
    dx = bench.x - input.position[0],
    dz = bench.z - input.position[2];
  input.yaw = Math.atan2(-dx, -dz);
  input.pitch = Math.atan2(
    scene.bench[1] + 0.5 - input.position[1],
    Math.hypot(dx, dz),
  );
  validateSave(input);
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.__hexwild)).toBe('undefined');
  await page.mouse.move(450, 325);
  await page.locator('#save-file').setInputFiles({
    name: 'geode-crafting-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(input)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#target')).toContainText('工作台', {
    timeout: 180000,
  });
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
  await page.keyboard.press('Escape');
  const spyglassSlot = Number(
    await page
      .locator('#hotbar button[aria-label*="望远镜"]')
      .getAttribute('data-slot'),
  );
  await page.keyboard.press('Digit' + (spyglassSlot + 1));
  await expect(page.locator('#selected-name')).toHaveText('望远镜');
  await expect
    .poll(() => page.evaluate(() => !!document.pointerLockElement))
    .toBe(true);
  await page.mouse.move(450, 325);
  // Crouch-use bypasses the workbench, just as it does during normal play.
  await page.keyboard.down('ShiftLeft');
  const beforeScope = await page.evaluate(() => window.__amethystDevice.serial);
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__amethystDevice.scopeSerial), {
      timeout: 60000,
    })
    .toBeGreaterThan(beforeScope);
  await page.screenshot({ path: info.outputPath('production-spyglass.png') });
  const beforeRelease = await page.evaluate(
    () => window.__amethystDevice.serial,
  );
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#spyglass-view')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__amethystDevice.normalSerial))
    .toBeGreaterThan(beforeRelease);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const savePath = info.outputPath('production-geode-v16.json');
  await download.saveAs(savePath);
  const output = JSON.parse(await readFile(savePath, 'utf8'));
  expect(output.version).toBe(16);
  expect(output.seed).toBe(624);
  const counts = Object.fromEntries(
    ['spyglass', 'tintedGlass', 'amethystShard', 'copperIngot', 'glass'].map(
      (id) => [
        id,
        output.inventory.slots
          .filter((s) => s?.item === id)
          .reduce((n, s) => n + s.count, 0),
      ],
    ),
  );
  expect(counts).toEqual({
    spyglass: 1,
    tintedGlass: 2,
    amethystShard: 3,
    copperIngot: 0,
    glass: 0,
  });
  expect(await page.evaluate(() => typeof window.__hexwild)).toBe('undefined');
  await writeFile(
    info.outputPath('production.json'),
    JSON.stringify(
      {
        counts,
        device: await page.evaluate(() => window.__amethystDevice),
        messages,
      },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
