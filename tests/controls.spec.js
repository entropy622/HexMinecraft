import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

async function doubleTap(page, code) {
  // One browser turn preserves a real double-tap interval on software WebGL.
  await page.evaluate((code) => {
    for (const type of ['keydown', 'keyup', 'keydown'])
      document.body.dispatchEvent(
        new KeyboardEvent(type, {
          code,
          key: code === 'Space' ? ' ' : 'w',
          bubbles: true,
        }),
      );
  }, code);
}
async function releaseTap(page, code) {
  await page.evaluate(
    (code) =>
      document.body.dispatchEvent(
        new KeyboardEvent('keyup', { code, bubbles: true }),
      ),
    code,
  );
}

async function platform(page, creative = false) {
  await page.goto('/');
  await page.locator(creative ? '#creative' : '#start').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -6; q <= 6; q++)
      for (let r = -3; r <= 3; r++) {
        w.set(q, 30, r, 'stone');
        for (let y = 31; y <= 39; y++) w.set(q, y, r, null);
      }
    g.teleport(-2, 31, 0);
    g.graphics.updateCells(
      Array.from({ length: 13 }, (_, i) => i - 6).flatMap((q) =>
        Array.from({ length: 7 }, (_, i) => [q, 30, i - 3]),
      ),
    );
    g.lookAt(5, 32.65, 0);
  });
  await page.waitForTimeout(150);
}

// Failure modes: visual-only crouching, standing through a ceiling, eye-height
// changes moving the feet, dropping off an edge, menu keys leaking into motion,
// and a setting changing only UI text rather than the rendered camera.
test('MC inventory key, physical crouching, ledge protection and view controls', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await platform(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect(page.locator('#craft-overlay')).toBeHidden();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = 0; q <= 3; q++)
      for (let r = -1; r <= 1; r++) {
        w.set(q, 32, r, 'stoneSlab');
        w.setState(q, 32, r, { facing: 0, open: false, upper: true });
      }
    g.teleport(-1, 31, 0);
    g.graphics.updateCells(
      Array.from({ length: 4 }, (_, q) => q).flatMap((q) =>
        [-1, 0, 1].map((r) => [q, 32, r]),
      ),
    );
    g.lookAt(5, 32.65, 0);
  });
  const standing = await page.evaluate(
    () => window.__hexwild.state.position[1],
  );
  await page.keyboard.down('ShiftLeft');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]))
    .toBeLessThan(standing - 0.25);
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[0]), {
      timeout: 10000,
    })
    .toBeGreaterThan(0.2);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const under = await page.evaluate(() => window.__hexwild.state.position);
  expect(under[0]).toBeGreaterThan(-0.4);
  expect(under[1]).toBeLessThan(standing - 0.25);
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.__hexwild.state.position[1]),
  ).toBeLessThan(standing - 0.25);
  await page.screenshot({ path: info.outputPath('low-tunnel.png') });
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  expect(
    await page.evaluate(() => window.__hexwild.state.position[1]),
  ).toBeLessThan(standing - 0.25);
  await page.keyboard.down('KeyS');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[0]), {
      timeout: 10000,
    })
    .toBeLessThan(-1.5);
  await page.keyboard.up('KeyS');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]))
    .toBeGreaterThan(standing - 0.1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(5, 31, 0);
    g.lookAt(10, 32.65, 0);
  });
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[0]), {
      timeout: 10000,
    })
    .toBeGreaterThan(11);
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const edge = await page.evaluate(() => window.__hexwild.state.position);
  expect(edge[1]).toBeGreaterThan(32);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      changed = [];
    for (let q = 0; q <= 3; q++)
      for (let r = -1; r <= 1; r++) {
        w.set(q, 30, r, 'stoneSlab');
        w.setState(q, 30, r, { facing: 0, open: false, upper: false });
        changed.push([q, 30, r]);
      }
    g.teleport(-1, 31, 0);
    g.graphics.updateCells(changed);
    g.lookAt(4, 32.27, 0);
  });
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[0]), {
      timeout: 10000,
    })
    .toBeGreaterThan(0.2);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]))
    .toBeLessThan(32);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('F1');
  await expect(page.locator('#hud')).toBeHidden();
  await page.keyboard.press('F1');
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#fov').evaluate((el) => {
    el.value = '96';
  });
  await page.locator('#fov').dispatchEvent('input');
  await page.locator('#fov').dispatchEvent('change');
  await page.locator('#resume').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.camera.fov))
    .toBeGreaterThan(94);
  await page.screenshot({ path: info.outputPath('crouch-tunnel.png') });
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#fov')).toHaveValue('96');
  await page.locator('#resume').click();
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('result.json'),
    JSON.stringify(
      {
        underCeiling: under[1] < standing - 0.25,
        ledgeProtected: edge[1] > 32,
        fov: 96,
        errors,
      },
      null,
      2,
    ),
  );
});

// Actual inventory stacks must survive pick-block; creative flight must stay
// inside collision, stop on landing, and reload with its saved ability state.
test('pick block preserves survival stacks; creative flight toggles and collides', async ({
  page,
}, info) => {
  await platform(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    for (const id of [
      'wood',
      'planks',
      'sand',
      'brick',
      'leaves',
      'glass',
      'lantern',
      'tuff',
    ])
      g.give(id, 1);
    g.give('calcite', 3);
    g.state.world.set(1, 32, 0, 'calcite');
    g.graphics.updateBlock(1, 32, 0);
    g.lookAt(1, 32.5, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('calcite');
  await page.locator('#world').dispatchEvent('mousedown', { button: 1 });
  await expect(page.locator('#hotbar .active')).toHaveAttribute(
    'aria-label',
    /方解石/,
  );
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.calcite),
  ).toBe(3);
  await page.locator('#world').dispatchEvent('mousedown', { button: 1 });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.calcite),
  ).toBe(3);
  await page.keyboard.press('Escape');
  await page.locator('#mode-toggle').click();
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(1, 32, 0, 'mossBlock');
    g.graphics.updateBlock(1, 32, 0);
    g.lookAt(1, 32.5, 0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('mossBlock');
  await page.locator('#world').dispatchEvent('mousedown', { button: 1 });
  expect(
    await page.evaluate(() => window.__hexwild.state.inventory.mossBlock),
  ).toBe(64);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-2, 31, 0);
    g.lookAt(4, 32.65, 0);
  });
  await page.waitForTimeout(200);
  const ground = await page.evaluate(() => window.__hexwild.state.position[1]);
  await doubleTap(page, 'Space');
  await page.waitForTimeout(600);
  await releaseTap(page, 'Space');
  const airborne = await page.evaluate(
    () => window.__hexwild.state.position[1],
  );
  expect(airborne).toBeGreaterThan(ground + 2);
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => window.__hexwild.state.position[1]),
  ).toBeCloseTo(airborne, 1);
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  const reloaded = await page.evaluate(
    () => window.__hexwild.state.position[1],
  );
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => window.__hexwild.state.position[1]),
  ).toBeCloseTo(reloaded, 1);
  const ceilingY = await page.evaluate(() => {
    const g = window.__hexwild;
    const y = Math.ceil(g.state.position[1] + 2);
    g.state.world.set(-2, y, 0, 'stone');
    g.graphics.updateBlock(-2, y, 0);
    return y;
  });
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  const ceiling = await page.evaluate(() => window.__hexwild.state.position[1]);
  expect(ceiling).toBeLessThan(ceilingY);
  await doubleTap(page, 'Space');
  await releaseTap(page, 'Space');
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.position[1]), {
      timeout: 10000,
    })
    .toBeLessThan(ground + 0.1);
  await writeFile(
    info.outputPath('flight.json'),
    JSON.stringify(
      {
        survivalPickCount: 3,
        flightRises: airborne > ground + 2,
        flightCeiling: ceiling < ceilingY,
        reloadStable: true,
      },
      null,
      2,
    ),
  );
});

test('Ctrl and double forward sprint; right-click interacts and Shift builds alongside', async ({
  page,
}, info) => {
  await platform(page);
  async function speed(mode) {
    await page.evaluate(() => {
      const g = window.__hexwild;
      g.teleport(-2, 31, 0);
      g.lookAt(5, 32.65, 0);
    });
    if (mode === 'ctrl') await page.keyboard.down('ControlLeft');
    if (mode === 'tap') {
      await doubleTap(page, 'KeyW');
    } else await page.keyboard.down('KeyW');
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => ({
      x: window.__hexwild.state.position[0],
      t: window.__hexwild.state.time,
    }));
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({
      x: window.__hexwild.state.position[0],
      t: window.__hexwild.state.time,
    }));
    if (mode === 'tap') await releaseTap(page, 'KeyW');
    else await page.keyboard.up('KeyW');
    await page.keyboard.up('ControlLeft');
    await page.waitForTimeout(350);
    return (after.x - before.x) / (after.t - before.t);
  }
  const walk = await speed('walk'),
    ctrl = await speed('ctrl'),
    tap = await speed('tap');
  expect(ctrl).toBeGreaterThan(walk * 1.3);
  expect(tap).toBeGreaterThan(walk * 1.3);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-2, 31, 0);
    g.state.world.set(1, 31, 0, 'workbench');
    g.graphics.updateBlock(1, 31, 0);
    g.lookAt(1, 31.8, 0);
    g.selectItem('dirt');
  });
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('workbench');
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await expect(page.locator('#craft-overlay')).toBeVisible();
  await page.keyboard.press('KeyE');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(200);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('workbench');
  const at = await page.evaluate(() => window.__hexwild.state.target.place);
  await page.locator('#world').dispatchEvent('mousedown', { button: 2 });
  await page.locator('#world').dispatchEvent('mouseup', { button: 2 });
  await page.keyboard.up('ShiftLeft');
  await expect(page.locator('#craft-overlay')).toBeHidden();
  expect(
    await page.evaluate(
      (p) => window.__hexwild.state.world.get(p.q, p.y, p.r),
      at,
    ),
  ).toBe('dirt');
  const validation = await page.evaluate(async () => {
    const { SAVE_KEY, validateSave } = await import('/src/save.js');
    window.__hexwild.save();
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    const rejected = [];
    for (const mutate of [
      (s) => (s.creativeFlying = 'true'),
      (s) => {
        s.creative = false;
        s.creativeFlying = true;
      },
      (s) => (s.dimensions[s.dimension].crouching = 'yes'),
    ]) {
      const copy = structuredClone(data);
      mutate(copy);
      try {
        validateSave(copy);
        rejected.push(false);
      } catch {
        rejected.push(true);
      }
    }
    return { version: data.version, valid: !!validateSave(data), rejected };
  });
  expect(validation).toEqual({
    version: 14,
    valid: true,
    rejected: [true, true, true],
  });
  await writeFile(
    info.outputPath('interactions.json'),
    JSON.stringify(
      {
        walk: Math.round(walk * 100) / 100,
        ctrl: Math.round(ctrl * 100) / 100,
        tap: Math.round(tap * 100) / 100,
        shiftPlaced: true,
        validation,
      },
      null,
      2,
    ),
  );
});
