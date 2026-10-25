// A raised shield guards a broad forward arc after a short preparation window.
// Keeping this independent of rendering makes damage direction explicit.
export class Combat {
  constructor() {
    this.reset();
  }
  reset() {
    this.hand = this.stack = this.ref = null;
    this.raised = false;
    this.raiseTime = 0;
    this.impact = 0;
  }
  update(dt, requested) {
    this.raised = requested;
    this.raiseTime = requested ? Math.min(0.25, this.raiseTime + dt) : 0;
    this.impact = Math.max(0, this.impact - dt * 5);
  }
  canBlock(position, yaw, source) {
    if (!this.raised || this.raiseTime < 0.25 || !source) return false;
    const dx = source.x - position.x,
      dz = source.z - position.z;
    const length = Math.hypot(dx, dz);
    return (
      length > 0.01 &&
      (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / length > 0.15
    );
  }
}
