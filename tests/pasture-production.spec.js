import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { World } from '../src/world.js';
import { PlayerInventory } from '../src/inventory.js';

// Native export supplies the schema. Only the external fixture is prepared
// through World; all browser actions use shipped UI and ordinary input events.
test('shipped UI grows cocoa and keeps cactus, carpet and observer through Continue', async ({
  page,
}, info) => {
  const errors = [],
    warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  const exported = async () => {
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    return JSON.parse(await readFile(await (await download).path(), 'utf8'));
  };
  const use = () =>
    page.evaluate(() => {
      for (const type of ['mousedown', 'mouseup'])
        document
          .querySelector('#world')
          .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
    });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#start').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  const saved = await exported(),
    w = new World(saved.seed, 'overworld', {
      ...saved.dimensions.overworld,
      load: false,
    });
  w.ensureAround(0, 0, 1);
  for (let q = -4; q <= 4; q++)
    for (let r = -4; r <= 4; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y < 48; y++) w.set(q, y, r, null);
    }
  w.set(0, 39, 0, 'grass');
  w.set(2, 40, 0, 'jungleWood');
  w.set(1, 40, 0, 'cocoa');
  w.setState(1, 40, 0, { facing: 0, open: false, age: 0 });
  w.set(-2, 38, 0, 'stone');
  w.set(-2, 39, 0, 'sand');
  for (let y = 40; y <= 42; y++) w.set(-2, y, 0, 'cactus');
  // A full-height column at its natural limit keeps the saved tip age stable.
  w.setState(-2, 42, 0, { facing: 0, open: false, age: 15 });
  const pack = new PlayerInventory();
  pack.insert('redCarpet', 3);
  pack.insert('observer', 2);
  pack.insert('boneMeal', 2);
  saved.inventory = pack.serialize();
  saved.selected = 0;
  saved.position = [0, 41.65, 3];
  saved.yaw = 0;
  saved.pitch = Math.atan2(39.99 - 41.65, 3);
  saved.time = 100;
  saved.dimensions.overworld = {
    ...saved.dimensions.overworld,
    ...w.serialize(),
    position: saved.position,
  };
  saved.dimensions.overworld.fauna.mobs = [];
  await page.locator('#save-file').setInputFiles({
    name: 'pasture-native.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#target')).toHaveText('草地');
  await use();
  await expect(page.locator('#target')).toContainText('红色地毯');
  await page.keyboard.press('Digit2');
  await expect(page.locator('#selected-name')).toContainText('侦测器');
  await use();
  // The carpet occupies a full cell in placement; the observer now floats
  // above it. Raise the view through ordinary relative mouse input.
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementY: -230, bubbles: true }),
    ),
  );
  await expect(page.locator('#target')).toContainText('侦测器');
  await page.keyboard.press('Digit3');
  await expect(page.locator('#selected-name')).toContainText('骨粉');
  // Turn to the adjacent log's side pod through ordinary pointer movement.
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        movementX: 338,
        movementY: 111,
        bubbles: true,
      }),
    ),
  );
  await expect(page.locator('#target')).toContainText('可可荚');
  await expect(page.locator('#target')).toContainText('幼荚');
  await use();
  await expect(page.locator('#target')).toContainText('生长中');
  await use();
  await expect(page.locator('#target')).toContainText('成熟');
  await page.keyboard.press('Escape');
  const before = await exported();
  const inventoryCount = (s, item) =>
    s.inventory.slots.reduce(
      (count, stack) => count + (stack?.item === item ? stack.count : 0),
      0,
    );
  const cells = (s) =>
    ['0,39,0', '0,40,0', '0,41,0'].map(
      (cell) => s.dimensions.overworld.edits.find(([k]) => k === cell)?.[1],
    );
  const plantAges = (s) =>
    ['1,40,0', '-2,42,0'].map(
      (cell) =>
        s.dimensions.overworld.blockStates.find(([k]) => k === cell)?.[1].age,
    );
  expect(cells(before)).toEqual(['grass', 'redCarpet', 'observer']);
  expect(inventoryCount(before, 'redCarpet')).toBe(2);
  expect(inventoryCount(before, 'observer')).toBe(1);
  expect(inventoryCount(before, 'boneMeal')).toBe(0);
  expect(plantAges(before)).toEqual([2, 15]);
  await page.locator('#home').click();
  await page.reload();
  await page.locator('#continue').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#target')).toContainText('可可荚');
  await expect(page.locator('#target')).toContainText('成熟');
  await page.screenshot({
    path: info.outputPath('native-garden.png'),
  });
  const runtime = await page.evaluate(() => {
    const gl = document.querySelector('#world').getContext('webgl2'),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      developmentFixture: typeof window.__hexwild !== 'undefined',
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      gl: gl.getError(),
      contextLost: gl.isContextLost(),
    };
  });
  expect(runtime.gl).toBe(0);
  expect(runtime.contextLost).toBe(false);
  expect(runtime.developmentFixture).toBe(false);
  await page.keyboard.press('Escape');
  const after = await exported();
  expect(cells(after)).toEqual(cells(before));
  expect(after.inventory).toEqual(before.inventory);
  expect(plantAges(after)).toEqual(plantAges(before));
  await writeFile(
    info.outputPath('native-pasture.json'),
    JSON.stringify(
      {
        ...runtime,
        cells: cells(after),
        plantAges: plantAges(after),
        inventory: {
          redCarpet: inventoryCount(after, 'redCarpet'),
          observer: inventoryCount(after, 'observer'),
          boneMeal: inventoryCount(after, 'boneMeal'),
        },
        version: after.version,
        errors,
        warnings,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});
