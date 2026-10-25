// Minecraft's documented one-second pull curve, expressed in seconds for the
// web simulation. Bow state, input routing and projectile code are original.
export function bowPull(seconds) {
  const t = Math.max(0, Math.min(1, seconds));
  return (t * t + 2 * t) / 3;
}

export function arrowDamage(speed, power = 0, critical = false) {
  const base = 2 + (power > 0 ? (power + 1) * 0.5 : 0);
  const damage = Math.ceil((speed / 20) * base);
  return (
    damage +
    (critical ? Math.floor(Math.random() * (Math.floor(damage / 2) + 2)) : 0)
  );
}
