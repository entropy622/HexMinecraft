import test from 'node:test';
import assert from 'node:assert/strict';
import { Movement } from '../src/movement.js';

// Failure modes: a first press counts twice, the time window expires before
// input is delivered, a long previous frame consumes a fresh tap, a third jump
// retriggers the last pair, and paused input leaks into the next play session.
test('double taps follow input timestamps across frame stalls and resets', () => {
  for (const [gap, expected] of [
    [0, true],
    [299, true],
    [300, true],
    [301, false],
    [1000, false],
  ]) {
    const m = new Movement();
    m.pressForward(1000);
    assert.equal(m.sprintRequested, false);
    m.update(0.25, 0, 0, true, false, false);
    m.update(0.25, 0, 0, true, false, false);
    m.pressForward(1000 + gap);
    assert.equal(m.sprintRequested, expected, `forward gap ${gap}`);
  }
  const m = new Movement();
  assert.equal(m.pressJump(1000), false);
  assert.equal(m.pressJump(1200), true);
  assert.equal(m.pressJump(1250), false);
  assert.equal(m.pressJump(1551), false);
  m.pressForward(1000);
  m.reset();
  m.pressForward(1100);
  assert.equal(m.sprintRequested, false);
  assert.equal(m.pressJump(1600), false);
});
