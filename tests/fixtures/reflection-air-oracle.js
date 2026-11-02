// Independent midpoint quadrature over the measured receiver-to-hit segment.
// Uses the shared model's published coefficients, not the product's integral.
export function referenceReflectionAir(sample, c, sky = c.sky) {
  const delta = sample.end.map((v, i) => v - sample.origin[i]),
    length = Math.hypot(...delta),
    ray = delta.map((v) => v / length),
    columns = [0, 0],
    steps = 1024;
  for (let i = 0; i < steps; i++) {
    const height = sample.origin[1] + (ray[1] * (i + 0.5) * length) / steps;
    for (let component = 0; component < 2; component++)
      columns[component] +=
        (Math.min(
          1,
          Math.exp(-(height - c.base[component]) * c.falloff[component]),
        ) *
          length) /
        steps;
  }
  const cosine = ray.reduce((sum, v, i) => sum + v * c.sunDirection[i], 0),
    shadow = 1 - Math.max(0, cosine) ** 2;
  const hg = (g) =>
    (1 - g * g) /
    (4 * Math.PI * Math.max(0.0001, 1 + g * g - 2 * g * cosine) ** 1.5);
  let phaseR = 0,
    phaseM = 0,
    amount = 1,
    anisotropy = 1;
  for (let i = 0; i < 4; i++) {
    phaseR += amount / (4 * Math.PI);
    phaseM +=
      amount * (0.7 * hg(0.5 * anisotropy) + 0.3 * hg(-0.2 * anisotropy));
    amount *= 0.5;
    anisotropy *= 0.7;
  }
  const transmission = [],
    rgb = sample.raw.map((value, i) => {
      const tau = c.rayleigh[i] * columns[0] + c.mieExtinction * columns[1],
        t = Math.exp(-tau),
        integral = tau > 1e-10 ? -Math.expm1(-tau) / tau : 1;
      const ambient = c.skyMean[i] * c.ambient * sky,
        sun = c.sunColor[i] * c.sunPower * sky * shadow * c.direct;
      const scatter =
        integral *
        (c.rayleigh[i] * columns[0] * (ambient + sun * phaseR) +
          c.mieScattering * columns[1] * (ambient + sun * phaseM)) *
        c.scatter;
      transmission.push(t);
      return Math.max(0, value * t + scatter);
    });
  return { rgb, transmission, length };
}
