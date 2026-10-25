// Intersect an upright world column with a yawed box or a pitched convex
// polygon prism. The interval serves both body clearance and floor support.
export function partSpan(x, z, part) {
  const dx = x - part.x,
    dz = z - part.z;
  const c = Math.cos(part.angle),
    s = Math.sin(part.angle);
  const px = dx * c - dz * s,
    pz = dx * s + dz * c;
  if (!part.polygon)
    return Math.abs(px) < part.w / 2 && Math.abs(pz) < part.d / 2
      ? [part.y - part.h / 2, part.y + part.h / 2]
      : null;
  if (!part.pitch) {
    for (let i = 0; i < part.polygon.length; i++) {
      const a = part.polygon[i],
        b = part.polygon[(i + 1) % part.polygon.length];
      if ((b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0]) < -1e-9)
        return null;
    }
    return [part.y - part.h / 2, part.y + part.h / 2];
  }
  const pitch = part.pitch || 0,
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  // Transform the vertical ray into the prism's local coordinates.
  const oy = -part.y * cp + pz * sp,
    oz = part.y * sp + pz * cp;
  const dy = cp,
    dzRay = -sp;
  let low = -Infinity,
    high = Infinity;
  const clip = (a, b) => {
    if (Math.abs(a) < 1e-9) return b >= -1e-9;
    if (a > 0) high = Math.min(high, b / a);
    else low = Math.max(low, b / a);
    return low <= high + 1e-9;
  };
  if (!clip(dy, part.h / 2 - oy) || !clip(-dy, part.h / 2 + oy)) return null;
  const polygon = part.polygon;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const ex = b[0] - a[0],
      ez = b[1] - a[1];
    if (!clip(-ex * dzRay, ez * a[0] - ex * a[1] - ez * px + ex * oz))
      return null;
  }
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}
