// Short input windows preserve intent around a landing or the edge of a block.
export class Movement {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = this.z = this.jumpBuffer = this.coyote = 0;
  }
  jump() {
    this.jumpBuffer = 0.14;
  }
  update(dt, x, z, grounded, swimming, flying) {
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = grounded ? 0.1 : Math.max(0, this.coyote - dt);
    const response = flying ? 14 : swimming ? 8 : grounded ? 20 : 7;
    const blend = 1 - Math.exp(-response * dt);
    this.x += (x - this.x) * blend;
    this.z += (z - this.z) * blend;
    return { dx: this.x * dt, dz: this.z * dt };
  }
  takeJump(held, grounded) {
    if (this.coyote > 0 && (this.jumpBuffer > 0 || (held && grounded))) {
      this.jumpBuffer = this.coyote = 0;
      return true;
    }
    return false;
  }
}
