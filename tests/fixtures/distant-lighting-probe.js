import { DataUtils } from 'three';

// Capture the actual far scene three times in one call, with the same camera,
// sky and cloud snapshot. Only its real vertex visibility bytes change.
export function distantLightingProbe(g) {
  const f = g.distantTerrain,
    r = g.renderer;
  const attrs = [...f.tiles.values()].map(
    ({ mesh }) => mesh.geometry.attributes.leafAmbient,
  );
  const originals = attrs.map((a) => a.array.slice());
  const read = () => {
    f.captureKey = null;
    f.render(r, g.camera);
    const pixels = new Uint16Array(f.target.width * f.target.height * 4);
    r.readRenderTargetPixels(
      f.target,
      0,
      0,
      f.target.width,
      f.target.height,
      pixels,
    );
    return pixels;
  };
  const normal = read();
  let without, restored;
  try {
    for (const a of attrs) {
      a.array.fill(0);
      a.needsUpdate = true;
    }
    without = read();
  } finally {
    attrs.forEach((a, i) => {
      a.array.set(originals[i]);
      a.needsUpdate = true;
    });
    restored = read();
  }
  let brighter = 0,
    darker = 0,
    alphaChanges = 0,
    restoredChanges = 0,
    maxGain = 0,
    sumGain = 0,
    invalid = 0;
  for (let i = 0; i < normal.length; i++) {
    restoredChanges += normal[i] !== restored[i];
    if (i % 4 === 3) {
      alphaChanges += normal[i] !== without[i];
      continue;
    }
    const value = DataUtils.fromHalfFloat(normal[i]),
      old = DataUtils.fromHalfFloat(without[i]);
    if (!Number.isFinite(value) || !Number.isFinite(old)) invalid++;
    const gain = value - old;
    if (gain > 0.00001) brighter++;
    if (gain < -0.00001) darker++;
    maxGain = Math.max(maxGain, gain);
    sumGain += gain;
  }
  return {
    brighter,
    darker,
    alphaChanges,
    restoredChanges,
    maxGain,
    sumGain,
    invalid,
    gl: r.getContext().getError(),
  };
}
