// Independent scalar reference in Photon's own coefficient convention.
export function sourceSkyDirection(i) {
  const g = 1.3247179572,
    a = (0.5 + i / g) % 1,
    b = (0.5 + i / (g * g)) % 1,
    phi = a * Math.PI * 2,
    z = b * 2 - 1,
    s = Math.sqrt(1 - z * z);
  const d = [Math.sin(phi) * s, Math.cos(phi) * s, z];
  return d[1] < 0 ? d.map((v) => -v) : d;
}
export function sourceSkyBasis([x, y, z]) {
  return [
    0.2820947918,
    0.4886025119 * x,
    0.4886025119 * z,
    0.4886025119 * y,
    1.092548431 * x * y,
    1.092548431 * y * z,
    0.3153915653 * (3 * z * z - 1),
    0.772548404 * x * z,
    0.386274202 * (x * x - y * y),
  ];
}
export function sourceSkyProject(sample) {
  const coefficients = Array.from({ length: 9 }, () => [0, 0, 0]);
  for (let i = 0; i < 256; i++) {
    const d = sourceSkyDirection(i),
      basis = sourceSkyBasis(d),
      radiance = sample(d);
    coefficients.forEach((rgb, band) =>
      rgb.forEach(
        (_, c) => (rgb[c] += (radiance[c] * basis[band] * Math.PI * 2) / 256),
      ),
    );
  }
  return coefficients;
}
export function sourceSkyIrradiance(coefficients, normal) {
  const basis = sourceSkyBasis(normal),
    kernels = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
  return [0, 1, 2].map((c) =>
    coefficients.reduce(
      (sum, rgb, i) =>
        sum + rgb[c] * basis[i] * kernels[i === 0 ? 0 : i < 4 ? 1 : 2],
      0,
    ),
  );
}
export function hostCoefficients(source) {
  return [0, 3, 2, 1, 4, 5, 6, 7, 8].flatMap((n, i) =>
    source[n].map((v) => v * (i > 6 ? Math.SQRT1_2 : 1)),
  );
}
export function sampleSkyMap(data, width, height, [x, y, z]) {
  const e = Math.asin(Math.max(-1, Math.min(1, y))),
    u = (x * x + z * z < 1e-10 ? 0 : Math.atan2(z, x)) / (Math.PI * 2) + 0.5,
    v = 0.5 + 0.5 * Math.sign(e) * Math.sqrt(Math.abs(e) / (Math.PI / 2));
  const sx = u * width - 0.5,
    sy = v * height - 0.5,
    x0 = Math.floor(sx),
    y0 = Math.floor(sy),
    fx = sx - x0,
    fy = sy - y0;
  const read = (xx, yy, c) =>
    data[
      (Math.max(0, Math.min(height - 1, yy)) * width +
        (((xx % width) + width) % width)) *
        4 +
        c
    ];
  return [0, 1, 2].map(
    (c) =>
      (read(x0, y0, c) * (1 - fx) + read(x0 + 1, y0, c) * fx) * (1 - fy) +
      (read(x0, y0 + 1, c) * (1 - fx) + read(x0 + 1, y0 + 1, c) * fx) * fy,
  );
}
