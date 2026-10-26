// Short input windows preserve intent around a landing or the edge of a block.
export class Movement {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = this.z = this.jumpBuffer = this.coyote = 0;
    this.kickX = this.kickZ = 0;
    this.forwardTap = this.jumpTap = -Infinity;
    this.sprintRequested = false;
  }
  kick(x, z, strength) {
    const length = Math.hypot(x, z);
    if (length < 0.01) return;
    this.kickX = Math.max(
      -7,
      Math.min(7, this.kickX + (x / length) * strength),
    );
    this.kickZ = Math.max(
      -7,
      Math.min(7, this.kickZ + (z / length) * strength),
    );
  }
  jump() {
    this.jumpBuffer = 0.14;
  }
  pressForward(now) {
    if (now - this.forwardTap <= 300) this.sprintRequested = true;
    this.forwardTap = now;
  }
  pressJump(now) {
    const twice = now - this.jumpTap <= 300;
    this.jumpTap = twice ? -Infinity : now;
    return twice;
  }
  update(dt, x, z, grounded, swimming, flying) {
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = grounded ? 0.1 : Math.max(0, this.coyote - dt);
    const response = flying ? 14 : swimming ? 8 : grounded ? 20 : 7;
    const blend = 1 - Math.exp(-response * dt);
    this.x += (x - this.x) * blend;
    this.z += (z - this.z) * blend;
    const result = {
      dx: (this.x + this.kickX) * dt,
      dz: (this.z + this.kickZ) * dt,
    };
    const damping = Math.exp(-7 * dt);
    this.kickX *= damping;
    this.kickZ *= damping;
    return result;
  }
  takeJump(held, grounded) {
    if (this.coyote > 0 && (this.jumpBuffer > 0 || (held && grounded))) {
      this.jumpBuffer = this.coyote = 0;
      return true;
    }
    return false;
  }
}
