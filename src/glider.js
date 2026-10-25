const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function validFlight(s) {
  return (
    s === undefined ||
    !!(
      s &&
      typeof s.active === 'boolean' &&
      typeof s.lowProfile === 'boolean' &&
      (!s.active || s.lowProfile) &&
      ['vx', 'vy', 'vz'].every(
        (k) => Number.isFinite(s[k]) && Math.abs(s[k]) <= 80,
      ) &&
      Number.isFinite(s.boost) &&
      s.boost >= 0 &&
      s.boost <= 2 &&
      Number.isFinite(s.wear) &&
      s.wear >= 0 &&
      s.wear < 1 &&
      Number.isFinite(s.cooldown) &&
      s.cooldown >= 0 &&
      s.cooldown <= 1
    )
  );
}
// Velocities are metres per second. The glide trades downward energy for
// horizontal lift, while pulling up spends speed; steering follows the view.
export class Glider {
  constructor() {
    this.reset();
  }
  reset() {
    this.active = this.lowProfile = false;
    this.vx =
      this.vy =
      this.vz =
      this.boost =
      this.wear =
      this.bank =
      this.cooldown =
        0;
    this.lastYaw = null;
  }
  load(state) {
    this.reset();
    if (state) Object.assign(this, state);
  }
  serialize() {
    return {
      active: this.active,
      lowProfile: this.lowProfile,
      vx: this.vx,
      vy: this.vy,
      vz: this.vz,
      boost: this.boost,
      wear: this.wear,
      cooldown: this.cooldown,
    };
  }
  start(yaw, vx, vy, vz) {
    this.active = this.lowProfile = true;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    if (Math.hypot(vx, vz) < 4) {
      this.vx = -Math.sin(yaw) * 4;
      this.vz = -Math.cos(yaw) * 4;
    }
    this.lastYaw = yaw;
  }
  stop() {
    this.active = false;
    this.boost = this.cooldown = 0;
  }
  rocket() {
    if (!this.active || this.cooldown > 0) return false;
    this.boost = 1.5;
    this.cooldown = 0.5;
    return true;
  }
  kick(x, z, strength) {
    const length = Math.hypot(x, z);
    if (length > 0.01) {
      this.vx += (x / length) * strength;
      this.vz += (z / length) * strength;
    }
  }
  update(dt, yaw, pitch) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) return { dx: 0, dy: 0, dz: 0, wear: 0 };
    const tick = dt * 20,
      horizontal = Math.cos(pitch),
      lookX = -Math.sin(yaw) * horizontal,
      lookY = Math.sin(pitch),
      lookZ = -Math.cos(yaw) * horizontal;
    let x = this.vx / 20,
      y = this.vy / 20,
      z = this.vz / 20;
    const speed = Math.hypot(x, z),
      liftFactor = horizontal * horizontal;
    y += (-0.08 + 0.06 * liftFactor) * tick;
    if (y < 0 && horizontal > 0.001) {
      const lift = -y * 0.1 * liftFactor * tick;
      y += lift;
      x += (lookX / horizontal) * lift;
      z += (lookZ / horizontal) * lift;
    }
    if (pitch > 0 && horizontal > 0.001) {
      const climb = speed * Math.sin(pitch) * 0.04 * tick;
      y += climb * 3.2;
      x -= (lookX / horizontal) * climb;
      z -= (lookZ / horizontal) * climb;
    }
    if (horizontal > 0.001) {
      const steer = 1 - Math.pow(0.9, tick);
      x += ((lookX / horizontal) * speed - x) * steer;
      z += ((lookZ / horizontal) * speed - z) * steer;
    }
    if (this.boost > 0) {
      const push = 1 - Math.pow(0.5, tick);
      x += lookX * 0.1 * tick + (lookX * 1.5 - x) * push;
      y += lookY * 0.1 * tick + (lookY * 1.5 - y) * push;
      z += lookZ * 0.1 * tick + (lookZ * 1.5 - z) * push;
      this.boost = Math.max(0, this.boost - dt);
    }
    this.vx = clamp(x * Math.pow(0.99, tick) * 20, -60, 60);
    this.vy = clamp(y * Math.pow(0.98, tick) * 20, -60, 60);
    this.vz = clamp(z * Math.pow(0.99, tick) * 20, -60, 60);
    const turn =
      this.lastYaw === null
        ? 0
        : Math.atan2(
            Math.sin(yaw - this.lastYaw),
            Math.cos(yaw - this.lastYaw),
          );
    this.bank +=
      (clamp((turn / Math.max(dt, 0.001)) * 0.08, -0.25, 0.25) - this.bank) *
      (1 - Math.exp(-dt * 5));
    this.lastYaw = yaw;
    this.wear += dt;
    const wear = Math.floor(this.wear);
    this.wear -= wear;
    return { dx: this.vx * dt, dy: this.vy * dt, dz: this.vz * dt, wear };
  }
  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }
}
