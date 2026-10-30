// Photon 6e67b36: weather/clouds.glsl, clouds/altocumulus.glsl,
// clouds/cirrus.glsl and default settings. See PHOTON-NOTICE.md.
import { Vector4 } from 'three';

export const CLOUD_METRES_PER_UNIT = 20;
export const CIRRUS_DENSITY = 0.5;
export const CIRROCUMULUS_DENSITY = 1;
const clamp = (x) => Math.max(0, Math.min(1, x));
const linear = (a, b, x) => clamp((x - a) / (b - a));
const smooth = (a, b, x) => {
  const t = linear(a, b, x);
  return t * t * (3 - 2 * t);
};

// x: extinction / metre, y: single-scattering albedo,
// z: stratus for volume decks, source day_factor for the thin high deck.
// w: lower-deck shadow / alto direct boost / cirrus extinction boost.
// Write existing vectors so every material retains its published uniform identity.
export function setCloudOptics(
  target,
  sunDirection,
  rain,
  layers,
  ranges = null,
) {
  const y = sunDirection.y,
    r = clamp(rain),
    day = smooth(0, 0.3, Math.abs(y)),
    c0 = clamp(ranges ? ranges[0].y : layers[0].z),
    c1 = clamp(ranges ? ranges[1].x * 0.25 + ranges[1].y * 0.75 : layers[1].z),
    c2 = clamp(layers[2].z),
    s0 = clamp(layers[0].w),
    s1 = clamp(layers[1].w),
    shadow = linear(0.7, 1, c1 * (1 + s1)) * day * (2 - day),
    extinction =
      (0.05 + 0.05 * day) *
      (1 - 0.33 * r) *
      (1 - 0.6 * shadow) *
      (1 - 0.4 * linear(0.8, 1, c0 * (1 - s0))) *
      (1 - 0.5 * s0),
    fade = y < 0.18 ? 0.37 + 1.2 * Math.max(0, -y) : 1.7,
    edge = sunDirection.x === 0 ? 0 : clamp(1 - fade * Math.abs(y - 0.18)) ** 2,
    noon = y > 0 ? 1 - edge : 0,
    altoBoost = 1 + 0.4 * linear(0.5, 0.6, c1) * noon * (2 - noon),
    cirrusBoost =
      1 +
      0.5 * Math.max(0, smooth(0, 0.15, Math.abs(y)) - smooth(0.5, 0.7, c2));
  target[0].set(extinction, 1 - 0.34 * r, s0, shadow);
  target[1].set(
    (0.08 + 0.08 * day) * 0.1 * (2 - s1),
    1 - 0.25 * r,
    s1,
    altoBoost,
  );
  target[2].set(0.15, 1, day, cirrusBoost);
  return target;
}

export function createCloudOptics() {
  return [
    new Vector4(0.1, 1, 0, 0),
    new Vector4(0.032, 1, 0, 1),
    new Vector4(0.15, 1, 0, 1.5),
  ];
}
