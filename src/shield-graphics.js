import * as THREE from 'three';

// The visible shield uses the world's six-sided silhouette and wood tiles.
// This is original geometry, separate from the licensed inventory icon.
export function createShield(textures) {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({
    map: textures.single('planks:side'),
  });
  const iron = new THREE.MeshLambertMaterial({ color: '#bcc2b4' });
  const dark = new THREE.MeshLambertMaterial({ color: '#51402b' });
  const plate = (radius, depth, material, z) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, depth, 6),
      material,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.z = 1.18;
    mesh.position.z = z;
    group.add(mesh);
    return mesh;
  };
  plate(0.34, 0.07, iron, 0);
  plate(0.305, 0.09, wood, 0);
  plate(0.075, 0.105, iron, -0.035);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 0.06), dark);
  handle.position.z = 0.065;
  group.add(handle);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const rivet = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.035),
      iron,
    );
    rivet.position.set(
      Math.sin(angle) * 0.28,
      Math.cos(angle) * 0.28 * 1.18,
      -0.06,
    );
    group.add(rivet);
  }
  group.visible = false;
  return group;
}
