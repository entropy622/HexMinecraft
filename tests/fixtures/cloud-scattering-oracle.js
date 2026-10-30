// Independent CPU reading of pinned Photon's three cloud scattering closures.
const hg = (mu, g) =>
  (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * mu) ** 1.5);
const mix = (a, b, t) => a * (1 - t) + b * t;
export function sourceCloudScattering(s) {
  const {
    layer,
    mu,
    density,
    opacity,
    extinction,
    albedo,
    stratus,
    shadow,
    elevation,
    boost,
  } = s;
  const f = Math.max(0, Math.min(1, mu * 0.5 + 0.5));
  const d = density * (layer === 1 ? 1.5 + 3.5 * stratus : 1 + stratus);
  let powder = mix((Math.PI * d) / (d + 0.15), 1, 0.8 * f * f);
  const ratio = Math.max(
    0,
    Math.min(1, (extinction * albedo) / (layer === 0 ? 0.1 : 0.05)),
  );
  const falloff =
    (layer === 0 ? 0.55 : 0.5) * mix((ratio * 1.33) / (1 + 0.33 * ratio), 1, f);
  let scattering = extinction * albedo,
    extinct = extinction,
    phase = 0.23;
  let g = [0.6, 0.9, 0.3].map((v) => v ** (1 + s.depth[0]));
  if (layer === 2) {
    powder = mix(8 * (1 - Math.exp(-40 * density)), 1, f ** 1.5);
    extinct *= boost;
    g = [0.6, 0.9, 0.3];
  }
  let direct = 0,
    sky = 0;
  for (let n = 0; n < (layer === 2 ? 4 : 8); n++) {
    const t = s.depth.map((v) => Math.exp(-v * extinct));
    direct +=
      scattering *
      phase *
      t[0] *
      (layer === 0 ? 1 - 0.5 * shadow : 1) *
      (layer === 2 ? powder : 1);
    if (layer < 2) {
      direct +=
        ((scattering * t[2]) / (4 * Math.PI)) * ((0.4 * elevation) / Math.PI);
      if (layer === 0)
        direct += ((scattering * t[1]) / (4 * Math.PI)) * shadow * 0.5;
    }
    sky += (scattering * t[1]) / (4 * Math.PI);
    scattering *= layer === 2 ? 0.5 : falloff * powder;
    extinct *= [0.4, 0.45, 0.25][layer];
    powder = (powder + Math.sqrt(powder)) / 2;
    g = g.map((v) => v * [0.8, 0.7, 0.5][layer]);
    phase = 0.65 * hg(mu, g[0]) + 0.1 * hg(mu, g[1]) + 0.25 * hg(mu, -g[2]);
  }
  return [direct, sky].map((v) => (v * opacity) / extinction);
}
