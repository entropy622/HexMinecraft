import * as THREE from 'three';
import { BLOCKS, DIRECTIONS, axialToWorld, worldToAxial } from './core.js';
import { LIQUIDS } from './fluids.js';
import { ENDERMAN_BLOCKS, ENDERMAN_EYES } from './enderman-data.js';
import { animateEnderman } from './enderman-graphics.js';

function rainingAt(fauna, point, weather) {
  const world = fauna.world,
    a = worldToAxial(point.x, point.z);
  return (
    world.dimension === 'overworld' &&
    (weather?.rain || 0) > 0.3 &&
    !['沙漠', '雪原'].includes(world.biome(a.q, a.r)) &&
    fauna.visible(
      point.clone().add(new THREE.Vector3(0, 2.9, 0)),
      new THREE.Vector3(point.x, 65, point.z),
    )
  );
}

// A teleport needs a real floor, three blocks of headroom and dry, loaded
// space. Sampling the whole body also rejects partial door and fence shapes.
function landing(fauna, x, z, referenceY, camera, options) {
  const a = worldToAxial(x, z),
    world = fauna.world;
  if (!world.loaded(a.q, a.r)) return null;
  for (
    let y = Math.min(60, Math.floor(referenceY + 6));
    y >= Math.max(1, Math.floor(referenceY - 10));
    y--
  ) {
    if (!world.solid(a.q, y - 1, a.r)) continue;
    const floor = fauna.floor(x, z, y, 'enderman', 0);
    if (
      floor !== y ||
      Math.hypot(x - camera.position.x, z - camera.position.z) < 2
    )
      continue;
    let clear = true;
    for (const [dx, dz] of [
      [0, 0],
      [0.32, 0],
      [-0.32, 0],
      [0, 0.32],
      [0, -0.32],
    ]) {
      const cell = worldToAxial(x + dx, z + dz);
      if (!world.loaded(cell.q, cell.r)) {
        clear = false;
        break;
      }
      for (const h of [0.05, 0.8, 1.6, 2.2, 2.88]) {
        if (
          world.pointSolid(x + dx, y + h, z + dz) ||
          world.fluids.get(cell.q, Math.floor(y + h), cell.r)
        ) {
          clear = false;
          break;
        }
      }
      if (!clear) break;
    }
    if (!clear) continue;
    const destination = new THREE.Vector3(x, y, z);
    if (options.shelter && rainingAt(fauna, destination, options.weather))
      continue;
    if (
      options.shade &&
      fauna.visible(
        destination.clone().add(new THREE.Vector3(0, 2.9, 0)),
        new THREE.Vector3(x, 65, z),
      )
    )
      continue;
    if (
      fauna.active.some(
        (m) =>
          m.kind === 'enderman' && m.mesh.position.distanceTo(destination) < 1,
      )
    )
      continue;
    return destination;
  }
  return null;
}

export function teleportEnderman(fauna, m, camera, options = {}) {
  if (m.blinkCooldown > 0) return false;
  const center = options.chase ? camera.position : m.mesh.position;
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2,
      radius =
        (options.chase ? 3 : 5) + Math.random() * (options.chase ? 5 : 13);
    const x = center.x + Math.cos(angle) * radius,
      z = center.z + Math.sin(angle) * radius;
    const referenceY = options.chase
      ? camera.position.y - 1.65
      : m.mesh.position.y;
    const destination = landing(fauna, x, z, referenceY, camera, options);
    if (!destination) continue;
    const origin = m.mesh.position.clone();
    m.mesh.position.copy(destination);
    m.blinkCooldown = 1.5;
    m.obstructed = 0;
    m.sightTimer = 0;
    m.rainTimer = 0;
    m.rained = false;
    fauna.remember(m);
    fauna.callbacks.endermanTeleport?.(origin, destination);
    return true;
  }
  m.blinkCooldown = 0.5;
  return false;
}

function moveBlock(fauna, m, camera) {
  if (!fauna.callbacks.moveBlock || (!m.carried && fauna.records.size >= 2048))
    return;
  const world = fauna.world,
    a = worldToAxial(m.mesh.position.x, m.mesh.position.z);
  const first = Math.floor(Math.random() * 6);
  for (let i = 0; i < 6; i++) {
    const [dq, dr] = DIRECTIONS[(first + i) % 6],
      q = a.q + dq,
      r = a.r + dr;
    if (!world.loaded(q, r)) continue;
    const cell = axialToWorld(q, r),
      floor = Math.floor(m.mesh.position.y);
    for (const y of [floor, floor - 1]) {
      const old = world.get(q, y, r);
      if (y < 1 || y > 61 || world.fluids.get(q, y, r)) continue;
      const eye = m.mesh.position
        .clone()
        .add(new THREE.Vector3(0, ENDERMAN_EYES, 0));
      if (!fauna.visible(eye, new THREE.Vector3(cell.x, y + 1.02, cell.z)))
        continue;
      if (!m.carried) {
        if (!ENDERMAN_BLOCKS.includes(old)) continue;
        if (fauna.callbacks.moveBlock(q, y, r, null) === false) continue;
        m.carried = old;
      } else {
        const below = world.get(q, y - 1, r);
        if (old || !below || BLOCKS[below].nonSolid || BLOCKS[below].shape)
          continue;
        if (
          Math.hypot(cell.x - camera.position.x, cell.z - camera.position.z) <
            1.3 &&
          y < camera.position.y + 0.2 &&
          y + 1 > camera.position.y - 1.65
        )
          continue;
        if (
          fauna.active.some(
            (other) =>
              Math.hypot(
                other.mesh.position.x - cell.x,
                other.mesh.position.z - cell.z,
              ) < 1.25 &&
              y < other.mesh.position.y + 3 &&
              y + 1 > other.mesh.position.y,
          )
        )
          continue;
        if (fauna.callbacks.moveBlock(q, y, r, m.carried) === false) continue;
        m.carried = null;
      }
      fauna.remember(m);
      return;
    }
  }
}

export function updateEnderman(
  fauna,
  m,
  dt,
  time,
  camera,
  creative,
  night,
  weather,
) {
  const p = m.mesh.position,
    world = fauna.world;
  m.blinkCooldown = Math.max(0, (m.blinkCooldown || 0) - dt);
  m.ambientTimer = (m.ambientTimer ?? 0.5) - dt;
  if (m.ambientTimer <= 0) {
    m.ambientTimer = 0.55 + Math.random() * 0.5;
    fauna.callbacks.endermanMote?.(
      p
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.7,
            Math.random() * 2.8,
            (Math.random() - 0.5) * 0.7,
          ),
        ),
    );
  }
  const a = worldToAxial(p.x, p.z);
  const fluids = [0.1, 1.4, 2.7].map((h) =>
    world.fluids.get(a.q, Math.floor(p.y + h), a.r),
  );
  m.rainTimer = (m.rainTimer || 0) - dt;
  if (m.rainTimer <= 0) {
    m.rained = rainingAt(fauna, p, weather);
    m.rainTimer = 0.8;
  }
  const wet = m.rained || fluids.some((f) => f && LIQUIDS[f.type].coolant);
  m.waterTimer = (m.waterTimer || 0) - dt;
  if (wet && m.waterTimer <= 0) {
    m.waterTimer = 0.5;
    fauna.hit(m, 1, null, false, false);
    if (!fauna.active.includes(m)) return;
  }
  if (wet || fluids.some(Boolean)) {
    teleportEnderman(fauna, m, camera, { shelter: m.rained, weather });
  }
  const eye = p.clone().add(new THREE.Vector3(0, ENDERMAN_EYES, 0));
  const toEye = eye.clone().sub(camera.position),
    distance = toEye.length();
  const near = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
  let staring = false;
  if (
    !creative &&
    distance > 0.1 &&
    distance < 32 &&
    camera.getWorldDirection(new THREE.Vector3()).dot(toEye.normalize()) >
      1 - 0.025 / distance
  ) {
    staring = fauna.visible(camera.position, eye);
  }
  m.stare = staring ? (m.stare || 0) + dt : 0;
  if (creative) m.anger = 0;
  else if (m.stare >= 0.25) {
    if (m.anger <= 0) {
      fauna.callbacks.notice?.('你惊动了末影人！移开视线后，它会追来。');
      fauna.callbacks.mobSound?.('endermanAngry', p);
    }
    m.anger = 60;
  }
  const angry = m.anger > 0 && !creative;
  let speed = angry ? 5.1 : 0.75;
  if (angry) {
    m.angle = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    if (staring || near < 1.35) speed = 0;
  } else if (m.think <= 0) {
    m.angle += (Math.random() - 0.5) * 2.8;
    m.think = 2 + Math.random() * 4;
    m.resting = Math.random() < 0.45;
  }
  if (!angry && m.resting) speed = 0;
  const start = p.clone();
  if (speed > 0) {
    const x = p.x + Math.sin(m.angle) * speed * dt,
      z = p.z + Math.cos(m.angle) * speed * dt;
    const y = fauna.floor(x, z, p.y, 'enderman', 1);
    if (y !== null) p.set(x, y, z);
    else if (!angry) {
      m.angle += 1.3;
      m.think = 0.5;
    }
  }
  const moved = Math.hypot(p.x - start.x, p.z - start.z);
  m.obstructed =
    angry && speed > 0 && moved < speed * dt * 0.2
      ? (m.obstructed || 0) + dt
      : 0;
  m.chaseTimer = (m.chaseTimer || 0) - dt;
  if (
    angry &&
    !staring &&
    (m.obstructed > 1.2 || (near > 12 && m.chaseTimer <= 0))
  ) {
    teleportEnderman(fauna, m, camera, { chase: true });
    m.chaseTimer = 4 + Math.random() * 3;
  }
  m.dayTimer = (m.dayTimer ?? 5) - dt;
  if (!angry && !night && world.dimension === 'overworld' && m.dayTimer <= 0) {
    if (fauna.visible(eye, new THREE.Vector3(p.x, 65, p.z)))
      teleportEnderman(fauna, m, camera, { shade: true });
    m.dayTimer = 8 + Math.random() * 10;
  }
  m.blockTimer = (m.blockTimer ?? 15 + Math.random() * 20) - dt;
  if (!angry && !wet && m.blockTimer <= 0) {
    moveBlock(fauna, m, camera);
    m.blockTimer = 18 + Math.random() * 25;
  }
  const turn = m.angle + Math.PI - m.mesh.rotation.y;
  m.mesh.rotation.y +=
    Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 7);
  animateEnderman(m, dt, time, camera, moved);
  if (
    angry &&
    !staring &&
    m.attack <= 0 &&
    Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 1.7 &&
    Math.abs(p.y - (camera.position.y - 1.65)) < 1.5 &&
    fauna.visible(p.clone().add(new THREE.Vector3(0, 1.4, 0)), camera.position)
  ) {
    fauna.callbacks.damage(7, p);
    m.attack = 1.1;
  }
}
