import * as THREE from 'three';
import { DIRECTIONS, axialToWorld } from './core.js';

export function netherSheet(world, q, y, r, map) {
  const root = new THREE.Group(),
    p = axialToWorld(q, r);
  const d = axialToWorld(...DIRECTIONS[world.state(q, y, r).facing % 3]);
  root.position.set(p.x, y + 0.5, p.z);
  root.rotation.y = -Math.atan2(d.z, d.x);
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.sqrt(3) + 0.012, 1.012),
    new THREE.MeshBasicMaterial({
      map,
      color: '#d3a4ff',
      transparent: true,
      opacity: 0.79,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  surface.userData.netherSheet = true;
  surface.userData.block = { q, y, r, type: 'portal' };
  root.add(surface);
  return root;
}
