import { expect } from '../browser-fixture.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const ulp = (x) =>
  Math.abs(x) < 2 ** -14
    ? 2 ** -24
    : 2 ** (Math.floor(Math.log2(Math.abs(x))) - 10);
const interval = (x) => [Math.max(0, x - ulp(x)), x + ulp(x)];

// Interval bounds account for each independently read half-float input and
// output. The expected Photon formula never imports the production kernels.
export function assertFoliageRange(probe, microThickness = null) {
  const samples = [];
  let invalidFades = 0,
    badChannels = 0,
    firstBad = null,
    maxExcess = -Infinity;
  for (let i = 0; i < probe.inputs.length; i++) {
    if (
      [probe.inputs, probe.transmission, probe.albedo, probe.fade].some(
        (map) => map[i][3] !== 2,
      )
    )
      continue;
    const [ao, ambient, NoL] = probe.inputs[i],
      fade = probe.fade[i][0],
      [a0, a1] = interval(ao),
      [b0, b1] = interval(ambient),
      [n0, n1] = interval(NoL),
      [f0, f1] = interval(fade).map(clamp),
      low = (a0 + Math.PI * b0) * (0.8 * clamp(n0) + 0.2),
      high =
        (Math.min(1, a1) + Math.PI * Math.min(0.5, b1)) *
        (0.8 * clamp(n1) + 0.2),
      responseLow = Math.min(1 + (low - 1) * f0, 1 + (low - 1) * f1),
      responseHigh = Math.max(1 + (high - 1) * f0, 1 + (high - 1) * f1);
    const colors = probe.albedo[i].slice(0, 3).map(interval),
      weights = [0.2126, 0.7152, 0.0722],
      lumLo = colors.reduce((s, c, k) => s + c[0] * weights[k], 0),
      lumHi = colors.reduce((s, c, k) => s + c[1] * weights[k], 0);
    if (microThickness === null && fade !== 1) invalidFades++;
    for (let c = 0; c < 3; c++) {
      let tLo = 1,
        tHi = 1;
      if (microThickness !== null) {
        const tintLo = clamp(colors[c][0] / Math.sqrt(lumHi + 1e-6)),
          tintHi = clamp(colors[c][1] / Math.sqrt(lumLo + 1e-6));
        tLo =
          2 **
          (((-14 * (1 - 0.75 * tintLo)) / probe.amount) *
            microThickness *
            (1 - f0) *
            0.2);
        tHi =
          2 **
          (((-14 * (1 - 0.75 * tintHi)) / probe.amount) *
            microThickness *
            (1 - f1) *
            0.2);
      }
      const value = probe.transmission[i][c],
        error = ulp(value) + 1e-6,
        lower = tLo * responseLow - error,
        upper = tHi * responseHigh + error;
      if (!(
        Number.isFinite(value) &&
        Number.isFinite(lower) &&
        Number.isFinite(upper) &&
        value >= lower &&
        value <= upper
      )) {
        badChannels++;
        firstBad ??= {
          pixel: i,
          channel: c,
          value,
          lower,
          upper,
          fade,
          ao,
          ambient,
          NoL,
        };
      }
      maxExcess = Math.max(maxExcess, lower - value, value - upper);
    }
    samples.push({ fade, ambient, response: probe.transmission[i][0] });
  }
  expect({ invalidFades, badChannels, firstBad }).toEqual({
    invalidFades: 0,
    badChannels: 0,
    firstBad: null,
  });
  expect(samples.length).toBeGreaterThan(30);
  expect(probe.gl).toBe(0);
  return {
    pixels: samples.length,
    checkedChannels: samples.length * 3,
    maxExcess,
    fadeMin: Math.min(...samples.map((s) => s.fade)),
    fadeMax: Math.max(...samples.map((s) => s.fade)),
    ambient: samples.reduce((s, p) => s + p.ambient, 0) / samples.length,
    response: samples.reduce((s, p) => s + p.response, 0) / samples.length,
  };
}
