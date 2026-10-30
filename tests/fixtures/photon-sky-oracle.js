// Independent double-precision evaluation of pinned Photon 6e67b36 mapping,
// phases and colour math. Uses the original RGB16F bytes, never production GLSL.
import { DataUtils } from 'three';
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const normalized = (a) => a.map((v) => v / Math.hypot(...a));
const texel = (u, size) => (0.5 + u * (size - 1)) / size;
export function photonUv(view, light) {
  const nu = clamp(dot(view, light), -1, 1),
    mus = light[1];
  let mu = view[1];
  const h = Math.sqrt((1 - mu * mu) * (1 - mus * mus)),
    lo = mu * mus - h,
    hi = mu * mus + h,
    un = texel(lo === hi ? lo : (nu - lo) / (hi - lo), 16);
  if (mu > 0) mu **= 1.25;
  // Work in metres as the pinned source does, independently of the host's km.
  const r = 6371000,
    inner = 6370000,
    outer = 6481000,
    H = Math.sqrt(outer * outer - inner * inner),
    rho = Math.sqrt(r * r - inner * inner),
    discriminant = (r * mu) ** 2 - r * r + inner * inner;
  let um;
  if (mu < 0 && discriminant >= 0) {
    const d = -r * mu - Math.sqrt(discriminant);
    um = 0.5 - 0.5 * texel((d - (r - inner)) / (rho - (r - inner)), 32);
  } else {
    const d = -r * mu + Math.sqrt(discriminant + H * H);
    um = 0.5 + 0.5 * texel((d - (outer - r)) / (rho + H - (outer - r)), 32);
  }
  const distance = (cosine) =>
      -inner * cosine + Math.sqrt((inner * cosine) ** 2 + H * H),
    a = (distance(mus) - (outer - inner)) / (H - (outer - inner)),
    A = (distance(-0.35) - (outer - inner)) / (H - (outer - inner));
  return [un, um, texel(Math.max(0, 1 - a / A) / (1 + a), 32)];
}
export function readTable(bytes, uv, mie) {
  const p = [uv[0] * 0.5 + (mie ? 0.5 : 0), uv[1], uv[2]].map((v, i) =>
      clamp(v * [32, 64, 32][i] - 0.5, 0, [31, 63, 31][i]),
    ),
    low = p.map(Math.floor),
    f = p.map((v, i) => v - low[i]),
    out = [0, 0, 0];
  for (let dz = 0; dz <= 1; dz++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dx = 0; dx <= 1; dx++) {
        const x = Math.min(31, low[0] + dx),
          y = Math.min(63, low[1] + dy),
          z = Math.min(31, low[2] + dz),
          index = ((z * 64 + y) * 32 + x) * 6,
          weight =
            (dx ? f[0] : 1 - f[0]) *
            (dy ? f[1] : 1 - f[1]) *
            (dz ? f[2] : 1 - f[2]);
        for (let c = 0; c < 3; c++)
          out[c] +=
            weight * DataUtils.fromHalfFloat(bytes.readUInt16LE(index + c * 2));
      }
  return out;
}
export function tableFilterBounds(bytes, uv, mie) {
  // Native 3D filtering can quantize each fractional texel coordinate to 8
  // bits and round a half-float result. Bound all corners of that filter box;
  // this is a per-sample precision bound, not a global brightness tolerance.
  const delta = [2 / (256 * 32), 1 / (256 * 64), 1 / (256 * 32)],
    lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  const axes = uv.map((v, c) => {
    const size = [32, 64, 32][c],
      scale = c === 0 ? 0.5 : 1,
      offset = c === 0 && mie ? 0.5 : 0,
      p = (v * scale + offset) * size - 0.5,
      d = delta[c] * scale * size,
      values = [v - delta[c], v + delta[c]];
    // Piecewise trilinear extrema can lie on an internal texel-centre plane.
    for (let k = Math.ceil(p - d); k <= Math.floor(p + d); k++)
      values.push(((k + 0.5) / size - offset) / scale);
    return values;
  });
  for (const x of axes[0])
    for (const y of axes[1])
      for (const z of axes[2]) {
        const rgb = readTable(bytes, [x, y, z], mie);
        for (let c = 0; c < 3; c++) {
          lo[c] = Math.min(lo[c], rgb[c]);
          hi[c] = Math.max(hi[c], rgb[c]);
        }
      }
  return lo.map((v, c) => {
    const magnitude = Math.max(Math.abs(v), Math.abs(hi[c])),
      halfError =
        magnitude < 2 ** -14
          ? 2 ** -14
          : 2 ** (Math.floor(Math.log2(magnitude)) - 10);
    return [v - halfError - 1e-7, hi[c] + halfError + 1e-7];
  });
}
const phase = (nu, g, radius) => {
  const cr = Math.cos(radius),
    mu =
      nu > cr
        ? 1
        : nu * cr + Math.sqrt(Math.max(0, 1 - nu * nu)) * Math.sin(radius),
    gg = g * g;
  return (
    ((1 - gg) * (1 + mu * mu)) /
    (4 * Math.PI * (1 + gg - 2 * g * mu) ** 1.5 * (1 + (1 + 2 * gg) / 3))
  );
};
const toXyz = [
    [0.6369736, 0.1446172, 0.1688585],
    [0.2627066, 0.6779996, 0.0592938],
    [0, 0.0280728, 1.0608437],
  ],
  to709 = [
    [3.2406, -1.5372, -0.4986],
    [-0.9689, 1.8758, 0.0415],
    [0.0557, -0.204, 1.057],
  ],
  from709 = [
    [0.4124, 0.3576, 0.1805],
    [0.2126, 0.7152, 0.0722],
    [0.0193, 0.1192, 0.9505],
  ],
  to2020 = [
    [1.7166084, -0.3556621, -0.2533601],
    [-0.6666829, 1.6164776, 0.0157685],
    [0.0176422, -0.0427763, 0.94222867],
  ],
  matrix = (v, m) => m.map((row) => dot(row, v));
export function oracleWeatherColor(sunHeight, snow, precipitation) {
  const x = clamp((sunHeight + 0.1) / 0.6),
    day = x * x * (3 - 2 * x),
    rain = 0.033 + (0.66 - 0.033) * day,
    floor = precipitation ? 0.5 : 0.06,
    snowfall = floor + (1.6 - floor) * day,
    brightness = rain * (1 - clamp(snow)) + snowfall * clamp(snow),
    rgb = [1.051 * 0.49, 0.985 * 0.65, 0.94].map((v) => v * brightness);
  return matrix(matrix(rgb, toXyz), to709).map((v) => Math.max(0, v));
}
export function oracleSky(bytes, view, group) {
  const sun = group.sun,
    moon = sun.map((v) => -v),
    lighting = oracleLighting(group);
  const single = (light, lunar) => {
    const uv = photonUv(view, light),
      r = readTable(bytes, uv, false),
      m = readTable(bytes, uv, true),
      nu = clamp(dot(view, light), -1, 1);
    let t = group.phase / 4;
    t = t > 1 ? 2 - t : t;
    t = (1 - t) ** 2 * 0.04 + 0.96;
    return r.map(
      (v, c) =>
        v +
        m[c] *
          phase(
            nu,
            lunar ? [0.895, 0.9, 0.905][c] * t : [0.85, 0.86, 0.87][c],
            ((lunar ? 6 : 2) * Math.PI) / 180,
          ) *
          (lunar ? 1.02 : 0.2),
    );
  };
  const s = single(sun, false),
    m = single(moon, true),
    rgb = s.map(
      (v, c) => v * lighting.sunColor[c] + m[c] * lighting.moonColor[c],
    ),
    lum = dot(rgb, [0.2627, 0.678, 0.0593]),
    sat =
      (1.1 + 0.2 * Math.exp(-150 * (sun[1] + 0.07283) ** 2)) * (1 - group.rain),
    result = matrix(
      matrix(
        rgb.map((v) => lum + (v - lum) * sat),
        toXyz,
      ),
      to709,
    );
  return result.map((v) => Math.max(0, v));
}

const pulse = (x, c, w) => {
  const t = clamp(Math.abs(x - c) / w);
  return 1 - t * t * (3 - 2 * t);
};
export function oracleTransmission(mu, height) {
  const r = 6371 + height,
    probe = Math.max(r, 6371.01);
  if (mu < 0 && (probe * mu) ** 2 - probe ** 2 + 6371 ** 2 >= 0)
    return [0, 0, 0];
  const chapman = (x) => {
    const c = Math.sqrt((Math.PI * x) / 2);
    if (mu >= 0) return c / ((c - 1) * mu + 1);
    const s = Math.sqrt(clamp(1 - mu * mu));
    return c / ((c - 1) * mu - 1) + 2 * c * Math.exp(x - x * s) * Math.sqrt(s);
  };
  const columns = [8.4, 1.25].map(
      (H) => H * Math.exp(-height / H) * chapman(r / H),
    ),
    coeffs = [
      [0.008059375432, 0.01671209429, 0.04080133294],
      [0.001666442358, 0.001812685127, 0.001958927896],
      [0.0008304280072, 0.00131491197, 0.00005440679729],
    ].map((v) => matrix(matrix(v, from709), to2020));
  return [0, 1, 2].map((c) =>
    Math.exp(
      -(coeffs[0][c] + coeffs[2][c]) * columns[0] - coeffs[1][c] * columns[1],
    ),
  );
}
export function oracleLighting(group) {
  const y = group.sun[1],
    fade = y < 0.18 ? 0.37 + 1.2 * Math.max(0, -y) : 1.7,
    weight = clamp(1 - fade * Math.abs(y - 0.18)) ** 2,
    blue = clamp((Math.exp(-190 * (y + 0.09604) ** 2) - 0.05) / 0.95),
    sunExposure = 7 * (1 + 0.5 * (group.sun[0] === 0 ? 0 : weight) + 40 * blue),
    phaseBrightness = [1, 0.875, 0.75, 0.625, 0.5, 0.75, 0.875, 1][group.phase],
    moonExposure =
      0.66 * phaseBrightness * (1 + 0.33 / clamp(1.25 * Math.max(-y, 0.1))),
    white = matrix(matrix([1, 1, 1], from709), to2020),
    p = pulse(y, 0.17, 0.4) ** 2,
    sunColor = [1.05, 0.84, 0.93].map(
      (v, c) =>
        (1 + (v * 1.2 - 1) * p) *
        (1 + ([0.95, 0.8, 1][c] - 1) * blue) *
        white[c] *
        sunExposure,
    ),
    moonColor = matrix(
      matrix(
        [0.75, 0.83, 1].map((v) => v ** 2.2),
        from709,
      ),
      to2020,
    ).map((v) => v * moonExposure),
    boost = 1 + 0.5 * clamp((Math.exp(-25 * (y + 0.3) ** 2) - 0.05) / 0.95),
    T = oracleTransmission(Math.abs(y), 0),
    raw = T.map((v, c) => v * [1.051, 0.985, 0.94][c]),
    lum = dot(raw, [0.2627, 0.678, 0.0593]),
    sat = (1.1 + 0.2 * Math.exp(-150 * (y + 0.07283) ** 2)) * (1 - group.rain),
    direct2020 = raw.map(
      (v, c) =>
        (lum + (v - lum) * sat) *
        (y >= 0 ? sunColor : moonColor)[c] *
        clamp(Math.abs(y) / 0.02) *
        (1 - 0.25 * pulse(Math.abs(y), 0.15, 0.11)),
    ),
    direct = matrix(matrix(direct2020, toXyz), to709).map((v) =>
      Math.max(0, v),
    );
  return { sunColor, moonColor, sunExposure, moonExposure, boost, direct };
}
