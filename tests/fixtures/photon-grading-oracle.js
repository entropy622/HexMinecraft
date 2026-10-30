// Independent double-precision reading of pinned Photon 6e67b36 c19, final,
// tonemap_operators, utility/color and ACES utility. No production imports.
const xyz709 = [
  0.4124, 0.3576, 0.1805, 0.2126, 0.7152, 0.0722, 0.0193, 0.1192, 0.9505,
];
const xyz2020 = [
  0.6369736, 0.1446172, 0.1688585, 0.2627066, 0.6779996, 0.0592938, 0,
  0.0280728, 1.0608437,
];
const to2020 = [
  1.7166084, -0.3556621, -0.2533601, -0.6666829, 1.6164776, 0.0157685,
  0.0176422, -0.0427763, 0.94222867,
];
const to709 = [
  3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057,
];
const bradford = [
  0.8951, -0.7502, 0.0389, 0.2664, 1.7135, -0.0685, -0.1614, 0.0367, 1.0296,
];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const dot = (v, m) => [
  v[0] * m[0] + v[1] * m[1] + v[2] * m[2],
  v[0] * m[3] + v[1] * m[4] + v[2] * m[5],
  v[0] * m[6] + v[1] * m[7] + v[2] * m[8],
];
function inverse(m) {
  // Solve the source's row-vector transform by independent Gaussian elimination.
  const a = [0, 1, 2].map((r) => [
    m[r],
    m[3 + r],
    m[6 + r],
    ...[0, 1, 2].map((c) => +(c === r)),
  ]);
  for (let c = 0; c < 3; c++) {
    let pivot = c;
    for (let r = c + 1; r < 3; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const divisor = a[c][c];
    a[c] = a[c].map((x) => x / divisor);
    for (let r = 0; r < 3; r++)
      if (r !== c) {
        const factor = a[r][c];
        a[r] = a[r].map((x, k) => x - factor * a[c][k]);
      }
  }
  return [0, 1, 2].flatMap((c) => [0, 1, 2].map((r) => a[r][c + 3]));
}
const bradfordInverse = inverse(bradford);
function white(t) {
  const raw = [660, 550, 440].map(
    (w) =>
      (w ** 5 / (2 * 6.63e-16 * 3e17 ** 2)) *
      (Math.exp((6.63e-16 * 3e17) / (1.38e-5 * w * t)) - 1),
  );
  return raw.map((x) => Math.min(...raw) / x);
}
function balance(rgb, t) {
  if (t === 6500) return rgb;
  const src = dot(dot(white(t), xyz2020), bradford),
    dst = dot(dot(white(6500), xyz2020), bradford);
  let lms = dot(dot(rgb, xyz2020), bradford).map(
    (x, i) => (x * dst[i]) / src[i],
  );
  return dot(dot(lms, bradfordInverse), to2020);
}
function hsv([r, g, b]) {
  const v = Math.max(r, g, b),
    d = v - Math.min(r, g, b),
    den = 6 * d + 1e-6;
  let h;
  if (r >= g && r >= b) h = g >= b ? (g - b) / den : 1 - (b - g) / den;
  else if (g >= b) h = 1 / 3 - (r - b) / den;
  else h = 2 / 3 + (r - g) / den;
  return [h, d / (v + 1e-6), v];
}
function rgb([h, s, v]) {
  h = ((h % 1) + 1) % 1;
  s = clamp(s);
  v = clamp(v);
  const x = h * 6,
    i = Math.floor(x),
    f = x - i,
    p = v * (1 - s),
    q = v * (1 - s * f),
    t = v * (1 - s * (1 - f));
  return [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
}
function isolate(hsv, center, width) {
  if (hsv[1] < 0.01 || hsv[2] < 0.01) return 0;
  const x = clamp(
    Math.abs(((((hsv[0] * 360 - center + 180) % 360) + 360) % 360) - 180) /
      width,
  );
  return 1 - x * x * (3 - 2 * x);
}
export const sourceColorDefaults = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  whiteBalance: 6500,
  orangeSaturation: 0,
  tealSaturation: 0.1,
  greenSaturation: 0,
  greenHue: 0,
};
export function oracleGrade(input, options = {}, exposure = 1) {
  const s = { ...sourceColorDefaults, ...options };
  let c = dot(
    dot(
      input.map((x) => Math.max(0, x * exposure)),
      xyz709,
    ),
    to2020,
  );
  c = c.map((x) => Math.max(0, x) * 0.83 * s.brightness);
  c = c.map((x) =>
    Math.max(
      0,
      2 **
        (s.contrast * (Math.log2(x + 1e-6) - Math.log2(0.18)) +
          Math.log2(0.18)) -
        1e-6,
    ),
  );
  const lum = c.reduce((a, x, i) => a + x * [0.2627, 0.678, 0.0593][i], 0);
  c = c.map((x) => Math.max(0, lum + (x - lum) * 0.98 * s.saturation));
  c = balance(c, s.whiteBalance).map((x) => Math.max(0, x));
  const a = 1.5,
    ad = a * 0.91,
    hm = 8,
    mi = 0.26,
    mo = 0.32;
  const den = (hm ** ad - mi ** ad) * mo,
    b = (-(mi ** a) + hm ** a * mo) / den,
    k = (hm ** ad * mi ** a - hm ** a * mi ** ad * mo) / den;
  c = c.map((x) => x ** a / (x ** ad * b + k));
  c = dot(dot(c, xyz2020), to709).map((x) => Math.sqrt(clamp(x)));
  let h = hsv(c);
  h[1] *= 1 + s.orangeSaturation * isolate(h, 30, 20);
  h[1] *= 1 + s.tealSaturation * isolate(h, 210, 20);
  const green = isolate(h, 90, 44);
  h[0] += (s.greenHue / 360) * green;
  h[1] *= 1 + s.greenSaturation * green;
  c = rgb(h)
    .map((x) =>
      x < 0.5 ? 0.5 * (2 * x) ** 1.05 : 1 - 0.5 * (2 - 2 * x) ** 1.05,
    )
    .map((x) => x * x);
  return c.map((x) => 1.14374 * (-0.126893 * clamp(x) + Math.sqrt(clamp(x))));
}
