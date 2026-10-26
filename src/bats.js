import * as THREE from 'three';
import { axialToWorld, worldToAxial, hash } from './core.js';
import { flyingClear } from './nether-mobs.js';
import { ceilingSupport } from './cave-plants.js';
import { caveColumn } from './caves.js';
import { animateBat } from './bat-graphics.js';

export function batClear(world, p) {
  if (!flyingClear(world, p, 'bat')) return false;
  for (const [dx, dz] of [
    [0, 0],
    [0.18, 0],
    [-0.18, 0],
    [0, 0.18],
    [0, -0.18],
  ]) {
    const a = worldToAxial(p.x + dx, p.z + dz);
    if (
      world.fluids.get(a.q, Math.floor(p.y), a.r) ||
      world.fluids.get(a.q, Math.floor(p.y + 0.6), a.r)
    )
      return false;
  }
  return true;
}
export function spawnCaveBats(fauna, camera) {
  const w = fauna.world,
    a = worldToAxial(camera.position.x, camera.position.z);
  if (camera.position.y > w.terrainHeight(a.q, a.r) - 2) return;
  for (const c of w.caves(a.q, a.r, 18)) {
    const offset = axialToWorld(c.q - a.q, c.r - a.r);
    if (Math.hypot(offset.x, offset.z) > 28) continue;
    const center = axialToWorld(c.q, c.r);
    let count = fauna.active.filter(
      (m) =>
        m.kind === 'bat' &&
        Math.hypot(m.mesh.position.x - center.x, m.mesh.position.z - center.z) <
          c.radius * 2,
    ).length;
    for (let i = 0; i < 20 && count < 2 && fauna.active.length < 72; i++) {
      if (fauna.active.filter((m) => m.kind === 'bat').length >= 8) return;
      const q = c.q + Math.floor(hash(c.q, i, c.r, w.seed + 821) * 7) - 3,
        r = c.r + Math.floor(hash(c.r, i, c.q, w.seed + 822) * 7) - 3,
        column = caveColumn(c, q, r);
      if (!column || !w.loaded(q, r)) continue;
      const p = axialToWorld(q, r),
        position = new THREE.Vector3(p.x, column.ceiling + 0.4, p.z);
      if (
        !ceilingSupport(w, q, column.ceiling + 1, r) ||
        !batClear(w, position) ||
        position.distanceTo(camera.position) < 4
      )
        continue;
      const m = fauna.spawn('bat', position.toArray());
      m.resting = true;
      animateBat(m, 0);
      count++;
    }
  }
}
export function updateBat(fauna, m, dt, time, camera) {
  const w = fauna.world,
    p = m.mesh.position,
    a = worldToAxial(p.x, p.z),
    startled = p.distanceTo(camera.position) < 4 || m.flee > 0,
    roof = Math.round(p.y + 0.6);
  if (m.resting && (!ceilingSupport(w, a.q, roof, a.r) || startled)) {
    m.resting = false;
    m.think = 0;
    m.flee = Math.max(m.flee, 2);
  }
  if (!m.resting) {
    if (
      !m.flightTarget ||
      m.think <= 0 ||
      (!m.roostTarget && p.distanceTo(m.flightTarget) < 0.15)
    ) {
      m.flightTarget = null;
      m.think = 1 + Math.random() * 2;
      for (let i = 0; i < 12; i++) {
        const away = startled
            ? Math.atan2(p.x - camera.position.x, p.z - camera.position.z)
            : Math.random() * Math.PI * 2,
          angle = away + (Math.random() - 0.5) * (startled ? 1.4 : 6),
          candidate = p
            .clone()
            .add(
              new THREE.Vector3(
                Math.sin(angle) * (1 + Math.random() * 3),
                (Math.random() - 0.65) * 3,
                Math.cos(angle) * (1 + Math.random() * 3),
              ),
            ),
          cell = worldToAxial(candidate.x, candidate.z);
        m.roostTarget = false;
        if (!startled && i < 6)
          for (
            let y = Math.floor(candidate.y + 0.6);
            y <= Math.ceil(p.y + 3);
            y++
          ) {
            if (!ceilingSupport(w, cell.q, y, cell.r)) continue;
            const center = axialToWorld(cell.q, cell.r);
            candidate.set(center.x, y - 0.6, center.z);
            m.roostTarget = true;
            break;
          }
        if (batClear(w, candidate)) {
          m.flightTarget = candidate;
          break;
        }
      }
      if (!m.flightTarget) {
        const below = p.clone().add(new THREE.Vector3(0, -0.8, 0));
        if (batClear(w, below)) {
          m.flightTarget = below;
          m.roostTarget = false;
        }
      }
    }
    if (m.flightTarget) {
      const direction = m.flightTarget.clone().sub(p),
        distance = direction.length();
      m.angle = Math.atan2(direction.x, direction.z);
      const movement = direction
          .normalize()
          .multiplyScalar(Math.min(distance, dt * (startled ? 3 : 1.8))),
        steps = Math.max(1, Math.ceil(movement.length() / 0.1));
      for (let i = 0; i < steps; i++) {
        const next = p.clone().addScaledVector(movement, 1 / steps);
        if (!batClear(w, next)) {
          // Cave ceilings step between columns. Descend/slide before trying
          // the next heading instead of remaining trapped under a high tile.
          for (const axis of ['y', 'x', 'z']) {
            const slide = p.clone();
            slide[axis] += movement[axis] / steps;
            if (batClear(w, slide)) p.copy(slide);
          }
          m.think = 0;
          break;
        }
        p.copy(next);
      }
      if (!startled && m.roostTarget && p.distanceTo(m.flightTarget) < 0.05)
        m.resting = true;
    }
  }
  animateBat(m, time);
}
