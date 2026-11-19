import { test, expect } from './browser-fixture.js';

test('above-water branches share sorted opaque draws without changing HDR or depth', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning')
      errors.push(msg.text());
  });
  await page.route('**/water-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Shared water frame probe</title>',
    }),
  );
  await page.goto('/water-fixture');
  const result = await page.evaluate(async () => {
    const { probeSharedWater } =
      await import('/tests/fixtures/water-shared-probe.js');
    return probeSharedWater();
  });
  console.log(JSON.stringify(result));
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  for (const resultCase of result.cases) {
    const { name, main, water, oldDraws, draws, captureScale } = resultCase;
    expect(main, name).toEqual({ color: 0, depth: 0 });
    expect(resultCase.captureMatches, name).toBe(true);
    expect(resultCase.state, name).toBe(true);
    if (name === 'dry') {
      expect(resultCase.captured).toBe(false);
      expect(draws).toBe(1);
      continue;
    }
    expect(water, name).toEqual({ color: 0, depth: 0 });
    expect(resultCase.captured).toBe(true);
    expect(oldDraws, name).toBe(2);
    expect(draws, name).toBe(name === 'submerged' ? 2 : 1);
    expect(captureScale).toBeCloseTo(name === 'submerged' ? 0.4 : 1);
  }
});
