import { World } from '../../src/world.js';
import { BLOCKS, axialToWorld, worldToAxial, key } from '../../src/core.js';
import { buildingParts } from '../../src/building-shapes.js';
import { PlayerInventory } from '../../src/inventory.js';
import { validateSave } from '../../src/save.js';
import { currentSave } from './current-save.js';

const center = (world, q, y, r) => {
  const p = axialToWorld(q, r),
    part = buildingParts(world, q, y, r)[0];
  return [p.x + part.x, y + part.y, p.z + part.z];
};
export function amethystScene() {
  const probe = new World(624, 'overworld', { load: false });
  for (const geode of probe.geodes(0, 0, 260)) {
    const world = new World(624, 'overworld', { load: false });
    for (
      let q = Math.floor((geode.q - 9) / 8);
      q <= Math.floor((geode.q + 9) / 8);
      q++
    )
      for (
        let r = Math.floor((geode.r - 9) / 8);
        r <= Math.floor((geode.r + 9) / 8);
        r++
      )
        world.generateChunk(q, r);
    const floors = [];
    for (let q = geode.q - 5; q <= geode.q + 5; q++)
      for (let r = geode.r - 5; r <= geode.r + 5; r++)
        for (let y = geode.y - 4; y <= geode.y + 1; y++) {
          const below = BLOCKS[world.get(q, y - 1, r)];
          if (
            !world.get(q, y, r) &&
            !world.get(q, y + 1, r) &&
            below &&
            !below.nonSolid &&
            !below.shape
          )
            floors.push([q, y, r]);
        }
    const clusters = [];
    for (const [k, type] of world.blocks) {
      if (type !== 'amethystCluster') continue;
      const point = k.split(',').map(Number),
        target = center(world, ...point),
        p = axialToWorld(point[0], point[2]);
      let floor = point[1] - 1;
      while (floor > 0 && !world.get(point[0], floor, point[2])) floor--;
      const landed = [p.x, floor + 1.2, p.z];
      const pose = floors
        .map(([q, y, r]) => {
          const p = axialToWorld(q, r),
            eye = [p.x, y + 1.65, p.z];
          const pickup = Math.hypot(
            landed[0] - p.x,
            landed[1] - y - 0.65,
            landed[2] - p.z,
          );
          if (
            pickup > 2.1 ||
            Math.hypot(...target.map((v, i) => v - eye[i])) > 6.5
          )
            return null;
          for (let n = 1; n < 48; n++) {
            const at = eye.map((v, i) => v + ((target[i] - v) * n) / 48),
              c = worldToAxial(at[0], at[2]),
              h = Math.floor(at[1]);
            if (
              key(c.q, h, c.r) !== k &&
              world.get(c.q, h, c.r) &&
              !BLOCKS[world.get(c.q, h, c.r)].nonSolid
            )
              return null;
          }
          return { q, y, r, eye, target, pickup };
        })
        .filter(Boolean)
        .sort((a, b) => a.pickup - b.pickup)[0];
      if (pose) clusters.push({ point, pose });
    }
    if (clusters.length < 2) continue;
    const first = clusters[0].pose;
    const bench = floors.find(([q, y, r]) => {
      if (q === first.q && r === first.r) return false;
      const p = axialToWorld(q, r),
        distance = Math.hypot(
          p.x - first.eye[0],
          y - first.y,
          p.z - first.eye[2],
        );
      return (
        distance > 1.6 &&
        distance < 4 &&
        (p.x - first.eye[0]) * (first.target[0] - first.eye[0]) +
          (p.z - first.eye[2]) * (first.target[2] - first.eye[2]) <
          0
      );
    });
    if (!bench) continue;
    world.set(...bench, 'workbench');
    world.set(bench[0], bench[1] + 1, bench[2], 'torch');
    const pack = new PlayerInventory();
    pack.insert('pick2', 1);
    pack.insert('copperIngot', 2);
    pack.insert('glass', 1);
    const save = currentSave(world);
    save.inventory = pack.serialize();
    save.selected = 0;
    save.time = 120;
    save.health = save.hunger = 20;
    save.position = [...first.eye];
    save.yaw = Math.atan2(
      -(first.target[0] - first.eye[0]),
      -(first.target[2] - first.eye[2]),
    );
    save.pitch = Math.atan2(
      first.target[1] - first.eye[1],
      Math.hypot(
        first.target[0] - first.eye[0],
        first.target[2] - first.eye[2],
      ),
    );
    validateSave(save);
    return { save, geode, bench, clusters: clusters.slice(0, 2) };
  }
  throw Error('No natural geode offers two accessible mature clusters');
}
