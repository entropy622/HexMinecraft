import * as THREE from 'three';
import { BLOCKS, SQRT3, axialToWorld, worldToAxial } from './core.js';
import { SHULKER_NORMALS } from './shulker-data.js';
import { animateShulker } from './shulker-graphics.js';

const up = new THREE.Vector3(0, 1, 0);
export const shulkerNormal = (m) =>
  new THREE.Vector3(...SHULKER_NORMALS[m.attach ?? 0]);
export function orientShulker(m) {
  m.mesh.quaternion.setFromUnitVectors(up, shulkerNormal(m));
}
export function shulkerHitboxes(m) {
  const normal = shulkerNormal(m);
  return [0.45, 0.7 + (m.peek || 0) * 0.7].map((height) => ({
    center: m.mesh.position.clone().addScaledVector(normal, height),
    radius: 0.53,
  }));
}

// Probe the actual terrain shape, not just block IDs. A shell needs a broad
// supporting face and enough dry space for its whole body (or its open lid).
export function shulkerAttachment(world, point, attach = 0, open = false) {
  const normal = new THREE.Vector3(...SHULKER_NORMALS[attach]),
    rotation = new THREE.Quaternion().setFromUnitVectors(up, normal),
    side = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
    across = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
  const offsets = [
    [0, 0],
    [0.32, 0],
    [-0.32, 0],
    [0, 0.32],
    [0, -0.32],
  ];
  for (const [x, z] of offsets) {
    const base = point
        .clone()
        .addScaledVector(side, x)
        .addScaledVector(across, z),
      support = base.clone().addScaledVector(normal, -0.06);
    if (!world.pointSolid(support.x, support.y, support.z)) return false;
    for (const h of open ? [0.04, 0.5, 0.98, 1.35, 1.7] : [0.04, 0.5, 0.98]) {
      const probe = base.clone().addScaledVector(normal, h),
        cell = worldToAxial(probe.x, probe.z);
      if (
        probe.y < 0 ||
        probe.y > 64 ||
        !world.loaded(cell.q, cell.r) ||
        world.pointSolid(probe.x, probe.y, probe.z) ||
        world.fluids.get(cell.q, Math.floor(probe.y), cell.r)
      )
        return false;
    }
  }
  return true;
}

export function teleportShulker(fauna, m) {
  if (m.blinkCooldown > 0) return false;
  const point = m.mesh.position,
    center = worldToAxial(point.x, point.z),
    world = fauna.world;
  for (let i = 0; i < 48; i++) {
    const q = center.q + Math.round((Math.random() - 0.5) * 16),
      r = center.r + Math.round((Math.random() - 0.5) * 16),
      y = Math.max(
        1,
        Math.min(61, Math.floor(point.y + (Math.random() - 0.5) * 14)),
      ),
      type = world.get(q, y, r);
    if (
      !world.loaded(q, r) ||
      !type ||
      BLOCKS[type].shape ||
      BLOCKS[type].nonSolid
    )
      continue;
    const block = axialToWorld(q, r),
      first = Math.floor(Math.random() * 8);
    for (let j = 0; j < 8; j++) {
      const attach = (first + j) % 8,
        normal = new THREE.Vector3(...SHULKER_NORMALS[attach]);
      const destination = new THREE.Vector3(
        block.x,
        y + 0.5,
        block.z,
      ).addScaledVector(normal, (attach < 2 ? 0.5 : SQRT3 / 2) + 0.005);
      const body = destination.clone().addScaledVector(normal, 0.55);
      if (
        !shulkerAttachment(world, destination, attach, true) ||
        (fauna.camera &&
          body.distanceTo(
            fauna.camera.position.clone().add(new THREE.Vector3(0, -0.6, 0)),
          ) < 1.5) ||
        fauna.active.some(
          (other) => other !== m && other.mesh.position.distanceTo(body) < 1.3,
        )
      )
        continue;
      const origin = point.clone();
      point.copy(destination);
      m.attach = attach;
      m.peek = 0;
      m.blinkCooldown = 2;
      m.sightTimer = 0;
      m.attack = Math.max(m.attack, 1.5);
      orientShulker(m);
      fauna.remember(m);
      fauna.callbacks.endermanTeleport?.(origin, point);
      return true;
    }
  }
  m.blinkCooldown = 0.75;
  return false;
}

export function updateShulker(fauna, m, dt, time, camera, creative) {
  m.blinkCooldown = Math.max(0, (m.blinkCooldown || 0) - dt);
  m.idlePeek = Math.max(0, (m.idlePeek || 0) - dt);
  m.sightTimer = (m.sightTimer || 0) - dt;
  if (m.sightTimer <= 0) {
    const point = m.mesh.position;
    m.supported = shulkerAttachment(fauna.world, point, m.attach);
    if (!m.supported) teleportShulker(fauna, m);
    const normal = shulkerNormal(m),
      eye = point.clone().addScaledVector(normal, 1.2);
    m.sight =
      !creative &&
      eye.distanceTo(camera.position) < 18 &&
      fauna.visible(eye, camera.position);
    m.room = shulkerAttachment(fauna.world, point, m.attach, true);
    m.sightTimer = 0.25;
  }
  if (m.think <= 0) {
    m.think = 4 + Math.random() * 5;
    if (!m.sight && Math.random() < 0.3) m.idlePeek = 1.5;
  }
  const open = m.supported && m.room && (m.sight || m.idlePeek > 0);
  if (open !== m.open) {
    m.open = open;
    fauna.callbacks.mobSound?.(
      open ? 'shulkerOpen' : 'shulkerClose',
      m.mesh.position,
    );
  }
  m.peek = THREE.MathUtils.damp(
    m.peek || 0,
    open ? (m.sight ? 1 : 0.35) : 0,
    5,
    dt,
  );
  if (!creative && open && m.sight && m.peek > 0.85 && m.attack <= 0) {
    const normal = shulkerNormal(m),
      from = m.mesh.position.clone().addScaledVector(normal, 1.2);
    fauna.callbacks.shulkerShot?.(from, normal, m.id);
    m.attack = 2.5 + Math.random() * 3;
  }
  animateShulker(m, dt, time, camera);
}
