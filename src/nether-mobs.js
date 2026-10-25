import * as THREE from 'three';
import { worldToAxial } from './core.js';
import { MOBS } from './mob-data.js';
import { LIQUIDS } from './fluids.js';
import { animateNetherMob } from './nether-mob-graphics.js';

export function flyingClear(world, position, kind) {
  const def = MOBS[kind],
    radius = def.radius || 0.5;
  if (position.y < 1 || position.y + def.height > 54) return false;
  for (const [dx, dz] of [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ]) {
    const a = worldToAxial(position.x + dx, position.z + dz);
    if (!world.loaded(a.q, a.r)) return false;
    for (const h of [0.12, def.height * 0.5, def.height - 0.05])
      if (world.pointSolid(position.x + dx, position.y + h, position.z + dz))
        return false;
  }
  return true;
}
export function updateNetherFlier(fauna, m, dt, time, camera, creative) {
  const def = MOBS[m.kind],
    p = m.mesh.position,
    ghast = m.kind === 'ghast';
  const eye = p.clone().add(new THREE.Vector3(0, def.hitHeight, 0));
  const distance = eye.distanceTo(camera.position),
    aggressive = !creative && distance < (ghast ? 36 : 24);
  const a = worldToAxial(p.x, p.z),
    fluid = fauna.world.fluids.get(a.q, Math.floor(p.y + 0.4), a.r);
  m.waterTimer = (m.waterTimer || 0) - dt;
  if (!ghast && fluid && LIQUIDS[fluid.type].coolant && m.waterTimer <= 0) {
    m.waterTimer = 0.5;
    fauna.hit(m, 1, null, false);
    if (m.hp <= 0) return;
  }
  m.sightTimer = (m.sightTimer || 0) - dt;
  if (m.sightTimer <= 0) {
    m.sight = aggressive && fauna.visible(eye, camera.position);
    m.sightTimer = 0.2;
  }
  let speed = def.speed,
    verticalTarget = m.hoverY ?? p.y;
  if (aggressive) {
    m.angle = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    verticalTarget = Math.max(
      2,
      Math.min(
        43,
        camera.position.y +
          (ghast ? 3 : -0.8) +
          Math.sin(time * 0.8 + m.id) * 0.65,
      ),
    );
    const desired = ghast ? 19 : 9;
    if (distance < desired - 3) m.angle += Math.PI;
    else if (distance < desired + 3) speed *= 0.15;
    if (m.charge > 0) speed *= 0.35;
  } else if (m.think <= 0) {
    m.angle += (Math.random() - 0.5) * Math.PI;
    m.hoverY = Math.max(3, Math.min(40, p.y + (Math.random() - 0.5) * 5));
    verticalTarget = m.hoverY;
    m.think = 3 + Math.random() * 4;
  }
  m.flight ||= new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3(
    Math.sin(m.angle) * speed,
    Math.max(-0.8, Math.min(0.8, (verticalTarget - p.y) * 0.6)),
    Math.cos(m.angle) * speed,
  );
  m.flight.lerp(desiredVelocity, 1 - Math.exp(-dt * 2));
  for (const axis of ['x', 'y', 'z']) {
    const next = p.clone();
    next[axis] += m.flight[axis] * dt;
    if (flyingClear(fauna.world, next, m.kind)) p.copy(next);
    else {
      m.flight[axis] = 0;
      m.think = 0;
      if (axis !== 'y') m.angle += 0.7;
    }
  }
  const faceAngle = aggressive
    ? Math.atan2(camera.position.x - p.x, camera.position.z - p.z)
    : m.angle;
  m.mesh.rotation.y = faceAngle + Math.PI;
  const sight = aggressive && m.sight;
  if (sight && !ghast && distance < 2.5 && m.attack <= 0) {
    fauna.callbacks.damage(4, p);
    m.attack = 1.3;
    m.charge = 0;
    m.volley = 0;
  } else if (sight && m.attack <= 0) {
    if (!m.charge)
      fauna.callbacks.mobSound?.(ghast ? 'ghastCharge' : 'blazeCharge', p);
    m.charge = Math.min(1, (m.charge || 0) + dt / (ghast ? 1.4 : 1.2));
    if (m.charge >= 1) {
      if (ghast) {
        const direction = camera.position.clone().sub(eye).normalize();
        fauna.callbacks.fireball?.(
          'large',
          eye.clone().addScaledVector(direction, 1.6),
          camera.position,
          m.id,
        );
        m.attack = 4.5;
        m.charge = 0;
      } else {
        m.shotTimer = (m.shotTimer || 0) - dt;
        if (m.shotTimer <= 0) {
          const aim = camera.position
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 0.4,
                (Math.random() - 0.5) * 0.6,
              ),
            );
          const direction = aim.clone().sub(eye).normalize();
          fauna.callbacks.fireball?.(
            'small',
            eye.clone().addScaledVector(direction, 0.8),
            aim,
            m.id,
          );
          m.volley = (m.volley || 0) + 1;
          m.shotTimer = 0.45;
          if (m.volley === 3) {
            m.volley = 0;
            m.charge = 0;
            m.attack = 4;
          }
        }
      }
    }
  } else {
    m.charge = Math.max(0, (m.charge || 0) - dt * 2);
    if (!sight) {
      m.volley = 0;
      m.shotTimer = 0;
    }
  }
  animateNetherMob(m, time);
}
