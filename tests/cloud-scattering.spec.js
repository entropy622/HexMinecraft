import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
function cloudComponents(grid) {
  const { density, width: n, levels, spacing, verticalSpacing } = grid;
  const visited = new Uint8Array(density.length),
    components = [];
  const queue = new Int32Array(density.length);
  let occupied = 0;
  for (let start = 0; start < density.length; start++) {
    if (!(density[start] > 0.04)) continue;
    occupied++;
    if (visited[start]) continue;
    let head = 0,
      tail = 1,
      minY = levels,
      maxY = 0,
      minX = n,
      maxX = 0,
      minZ = n,
      maxZ = 0;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % n,
        z = Math.floor(i / n) % n,
        y = Math.floor(i / (n * n));
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      const add = (j) => {
        if (!visited[j] && density[j] > 0.04) {
          visited[j] = 1;
          queue[tail++] = j;
        }
      };
      if (x > 0) add(i - 1);
      if (x < n - 1) add(i + 1);
      if (z > 0) add(i - n);
      if (z < n - 1) add(i + n);
      if (y > 0) add(i - n * n);
      if (y < levels - 1) add(i + n * n);
    }
    components.push({
      cells: tail,
      height: (maxY - minY + 1) * verticalSpacing,
      width: (maxX - minX + 1) * spacing,
      depth: (maxZ - minZ + 1) * spacing,
    });
  }
  return {
    occupiedFraction: occupied / density.length,
    components: components.sort((a, b) => b.cells - a.cells).slice(0, 32),
    maxHeight: Math.max(
      0,
      ...components.filter((c) => c.cells >= 16).map((c) => c.height),
    ),
  };
}

function observeMessages(page) {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  return messages;
}
async function cloudScene(page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#exposure-toggle').uncheck();
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.setPlaying(false);
    a.step(120 - a.state.time);
    a.teleport(0, 25, 0);
    a.lookAt(100, 65, 0);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            !g.relightQueue.size && g.cloudSystem.worleySeed === g.world.seed
          );
        }),
      { timeout: 90000 },
    )
    .toBe(true);
}

function readDevice() {
  const gl = window.__hexwild.graphics.renderer.getContext(),
    e = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: gl.getParameter(e.UNMASKED_RENDERER_WEBGL),
    error: gl.getError(),
  };
}

test('natural cumulus contains connected cloud bodies hundreds of metres tall', async ({
  page,
}, info) => {
  const messages = observeMessages(page);
  await cloudScene(page);
  const grid = await page.evaluate(async () => {
    const { readCloudShape } =
      await import('/tests/fixtures/cloud-shape-probe.js');
    return readCloudShape(window.__hexwild.graphics);
  });
  const shape = cloudComponents(grid);
  const device = await page.evaluate(readDevice);
  await writeFile(
    info.outputPath('cloud-shape.json'),
    JSON.stringify(
      {
        band: grid.band,
        spacing: [grid.spacing, grid.verticalSpacing],
        shape,
        device,
        messages,
      },
      null,
      2,
    ),
  );
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('cumulus.png') });
  expect(grid.density.every(Number.isFinite)).toBe(true);
  expect(shape.occupiedFraction).toBeGreaterThan(0.005);
  expect(shape.occupiedFraction).toBeLessThan(0.65);
  expect(shape.maxHeight).toBeGreaterThan(25); // 500 m at the shared world scale.
  expect(device.renderer).not.toMatch(/swiftshader/i);
  expect(device.error).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});

test('finite-source phase and cloud transport retain color, darkness and optical composition', async ({
  page,
}, info) => {
  const messages = observeMessages(page);
  await cloudScene(page);
  const transport = await page.evaluate(async () => {
    const { probeCloudTransport } =
      await import('/tests/fixtures/cloud-transport-probe.js');
    return probeCloudTransport(window.__hexwild.graphics.renderer);
  });
  const device = await page.evaluate(readDevice);
  await writeFile(
    info.outputPath('cloud-transport.json'),
    JSON.stringify({ transport, device, messages }, null, 2),
  );
  const c = transport.cases,
    l = (p) => p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
  expect(transport.finite).toBe(true);
  expect(transport.phaseMin).toBeGreaterThan(0);
  // Photon's max of two forward lobes is an artistic phase closure; its
  // sphere integral is bounded but intentionally not exactly one.
  expect(transport.phaseIntegral).toBeGreaterThan(0.9);
  expect(transport.phaseIntegral).toBeLessThan(2);
  expect(c[13][0]).toBeGreaterThan(c[14][0] * 2);
  expect(c[13][0]).toBeLessThan(c[13][1]); // finite disk broadens the point peak
  expect(c[13][0]).toBeLessThan(64);
  expect(c[15][0]).toBeGreaterThan(0);
  for (const index of [0, 8, 9])
    expect(c[index].slice(0, 3)).toEqual([0, 0, 0]);
  expect(l(c[1])).toBeGreaterThan(l(c[2]));
  expect(l(c[2])).toBeGreaterThan(l(c[3]));
  // The deep core receives multiple-scattered light above the independently
  // known Beer-Lambert single-scattering contribution.
  expect(l(c[3])).toBeGreaterThan(0.4 * 0.995 * c[13][0] * Math.exp(-20) * 100);
  expect(l(c[4])).toBeGreaterThan(l(c[5]));
  expect(c[4][2]).toBeGreaterThan(c[4][0] * 2);
  expect(l(c[6])).toBeGreaterThan(l(c[7]));
  expect(c[6][0]).toBeGreaterThan(c[6][2] * 4);
  for (let channel = 0; channel < 3; channel++) {
    const joined = c[11][channel] * (1 + Math.sqrt(0.3));
    expect(Math.abs(joined - c[10][channel])).toBeLessThan(
      Math.max(0.00001, c[10][channel] * 0.0001),
    );
  }
  expect(l(c[12])).toBeGreaterThan(0);
  expect(l(c[12])).toBeLessThan(l(c[10]) * 0.001);
  expect(c[16]).toEqual([0, 0, 0, 1]);
  expect(c[18][3]).toBe(0); // the discarded tail cannot leak an HDR sun disk
  expect(c[19][3]).toBe(0);
  for (const index of [17, 18, 19])
    for (let channel = 0; channel < 3; channel++) {
      const source = [1, 0.5, 0.2][channel];
      expect(
        Math.abs(c[index][channel] + c[index][3] * source - source),
      ).toBeLessThan(0.00001);
    }
  expect(device.renderer).not.toMatch(/swiftshader/i);
  expect(device.error).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
