// Independent double-precision reading of pinned Photon material/BSDF/highlight.
// The defined smooth/degenerate limits match the documented WebGL adaptation.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function oracleSurfaceOptics(albedo, mask) {
  const c = Math.max(...albedo),
    v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  const step = (a, b) => clamp((v - a) / (b - a));
  let smooth = 0,
    f0 = 0.02,
    metal = 0;
  if (mask === 0) {
    const t = step(0.2, 0.6);
    smooth = 0.33 * t * t * (3 - 2 * t);
  }
  if (mask === 5) {
    const t = step(0.16, 0.5);
    smooth = 0.5 * t * t * (3 - 2 * t);
  }
  if (mask === 7) smooth = 0.8 * step(0.81, 0.96);
  if (mask === 8) smooth = 0.6 * step(0.4, 0.8) ** 4;
  if (mask === 9 || mask === 17) smooth = 0.4 * step(0.61, 0.85);
  if (mask === 10) smooth = 0.5 * step(0.4, 0.8);
  if (mask === 11) smooth = step(0.02, 0.4);
  if (mask === 12 || mask === 13) {
    smooth = Math.sqrt(step(0.1, 0.9));
    metal = +(mask === 12);
    if (mask === 13) f0 = 0.25;
  }
  let roughness = (1 - smooth) ** 2;
  if (mask === 12 || mask === 13) roughness = Math.max(roughness, 0.04);
  return { roughness, f0, metal };
}
export function oracleDiskNoH2(nl, nv, lv, radius) {
  const c = Math.cos(radius),
    rol = 2 * nl * nv - lv;
  if (rol >= c) return 1;
  const r = Math.sin(radius) / Math.sqrt(Math.max(1 - rol * rol, 1e-12));
  let nr = r * (nv - rol * nl),
    vr = r * (2 * nv * nv - 1 - rol * lv);
  const triple = Math.sqrt(
      clamp(1 - nl * nl - nv * nv - lv * lv + 2 * nl * nv * lv),
    ),
    nb = r * triple,
    vb = r * 2 * triple * nv;
  const a = nl * c + nv + nr,
    b = lv * c + 1 + vr,
    p = nb * b,
    q = a * b,
    s = vb * a;
  const x = q * (-0.5 * p + 0.25 * vb * a),
    y =
      p * p +
      s * (s - 2 * p) +
      a * ((nl * c + nv) * b * b + q * (-0.5 * (b + lv * c) - 0.5));
  const twice = (2 * x) / Math.max(x * x + y * y, 1e-30),
    sin = twice * y,
    cos = 1 - twice * x;
  nr = cos * nr + sin * nb;
  vr = cos * vr + sin * vb;
  return clamp(
    (nv + nl * c + nr) ** 2 / Math.max(2 * (lv * c + vr) + 2, 1e-12),
  );
}
export function oracleSurfaceHighlight(sample) {
  const { albedo, mask, nl, nv, lv, lh, radius } = sample,
    o = oracleSurfaceOptics(albedo, mask);
  if (nl <= 1e-6) return { optics: o, nh2: 0, rgb: [0, 0, 0] };
  let fresnel;
  if (o.metal) {
    const f = (1 - clamp(lh)) ** 5;
    fresnel = albedo.map((c) => f + (1 - f) * c);
  } else {
    const cosine = clamp(lh),
      root = Math.sqrt(o.f0) * 0.99999,
      n = (1 + root) / (1 - root),
      g2 = n * n + cosine * cosine - 1;
    const g = Math.sqrt(Math.max(0, g2)),
      a = g - cosine,
      b = g + cosine;
    const f =
      g2 < 0
        ? 1
        : 0.5 * (a / b) ** 2 * (1 + ((b * cosine - 1) / (a * cosine + 1)) ** 2);
    fresnel = [f, f, f];
  }
  const nh2 = oracleDiskNoH2(nl, nv, lv, radius);
  if (fresnel.every((c) => c < 0.01)) return { optics: o, nh2, rgb: [0, 0, 0] };
  const alpha2 = Math.max(o.roughness ** 2, 1e-8),
    d = alpha2 / (Math.PI * (1 - nh2 + nh2 * alpha2) ** 2),
    l = Math.max(nl, 0.01),
    v = Math.max(nv, 0.01);
  const visibility =
    0.5 /
    (v * Math.sqrt(l * l * (1 - alpha2) + alpha2) +
      l * Math.sqrt(v * v * (1 - alpha2) + alpha2));
  return {
    optics: o,
    nh2,
    rgb: fresnel.map((f) => Math.min(4, nl * d * visibility * f)),
  };
}
