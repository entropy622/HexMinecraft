// Independent CPU reading of the pinned source thresholds in host linear RGB.
const clamp = (x) => Math.max(0, Math.min(1, x));
const step = (a, b, x) => clamp((x - a) / (b - a));
export function oracleEmission(albedo, category) {
  const c = albedo.map((v) =>
      v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055,
    ),
    v = Math.max(...c),
    low = Math.min(...c),
    d = v - low,
    s = d / (v + 1e-6);
  let h = 0;
  if (d > 0) {
    h =
      v === c[0]
        ? (c[1] - c[2]) / (6 * d + 1e-6)
        : v === c[1]
          ? 1 / 3 + (c[2] - c[0]) / (6 * d + 1e-6)
          : 2 / 3 + (c[0] - c[1]) / (6 * d + 1e-6);
    h = (h + 1) % 1;
  }
  let scale = 0;
  if (category === 33) scale = 0.66 * step(0.75, 0.9, v);
  if (category === 35) scale = 0.85 * v * step(0.4, 0.6, 0.2 * s + 0.55 * v);
  if (category === 36) scale = 0.85 * step(0.78, 0.85, v);
  if (category === 37) {
    const hueDistance = Math.abs(((h * 360 - 200 + 540) % 360) - 180) / 30,
      blue =
        s < 0.01 || v < 0.01 || hueDistance > 1
          ? 0
          : 1 - hueDistance * hueDistance * (3 - 2 * hueDistance);
    scale = 0.8 * step(0.47, 0.5, 0.2 * s + 0.5 * v + 0.1 * blue);
  }
  if (category === 55) return [1, 1, 1].map(() => 0.2 * (0.1 + 0.9 * v));
  return albedo.map((x) => Math.sqrt(Math.max(x, 0)) * scale);
}
