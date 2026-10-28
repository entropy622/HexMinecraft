import { World } from '../../src/world.js';
import { axialToWorld } from '../../src/core.js';
import { PlayerInventory } from '../../src/inventory.js';
import { validateSave } from '../../src/save.js';
import { currentSave } from './current-save.js';

export const referenceSettings = {
  quality: 1.7,
  fieldOfView: 72,
  sound: false,
  post: {
    occlusion: 0.6,
    antialias: true,
    bloom: 0.24,
    clouds: true,
    exposure: false,
  },
};
export const referenceSizes = [
  { width: 900, height: 650 },
  { width: 1920, height: 1080 },
];

// [axial q, eye y, axial r]. All terrain, trees and water are natural seed 624.
// Lock these inputs across the sky/cloud comparison; changing framing needs a
// fresh old/new pair, not just a new screenshot of the candidate.
export const referenceScenes = [
  {
    id: 'forest-toward-light',
    eye: [-120, 22.5, 4],
    look: [-98, 17, -4],
    purpose: '向光森林：冠层、天空、太阳附近云缘及远处坡地',
  },
  {
    id: 'open-sky',
    eye: [-120, 22.5, 4],
    look: [-98, 52, -4],
    purpose: '开阔天空：同一水平朝向，抬头观察云层体积与层间关系',
  },
  {
    id: 'low-basin',
    eye: [-126, 7.9, -2],
    look: [-110, 10, -6],
    purpose: '低洼：天然水岸到林地斜坡的空气与明暗层次',
  },
  {
    id: 'distance-ruler',
    eye: [-120, 26, 4],
    look: [-100, 16, -2],
    purpose: '远景标尺：清单中近中远三棵天然橡树的实测距离',
  },
  {
    id: 'forest-back-light',
    eye: [-106, 23, -8],
    look: [-124, 14, 6],
    purpose: '背向太阳：受光冠层与天空亮度关系',
  },
  {
    id: 'forest-side-light',
    eye: [-120, 22.5, 4],
    look: [-118, 16, -16],
    purpose: '侧光：冠层体积、树间阴影与天空填充',
  },
  {
    id: 'canopy-close',
    eye: [-116, 17, -2],
    look: [-113, 14.2, -5],
    purpose: '近冠层：真实树叶纹理、轮廓与高光，不改叶材质',
  },
  {
    id: 'water-surface',
    eye: [-128, 7.5, 2],
    look: [-126, 5.5, -1],
    purpose: '水面：天然浅水与林岸的反射、透射和天空联系',
  },
];

export function referenceSave(scene) {
  const world = new World(624, 'overworld', { load: false });
  const save = currentSave(world);
  const p = axialToWorld(scene.eye[0], scene.eye[2]);
  const target = axialToWorld(scene.look[0], scene.look[2]);
  const dx = target.x - p.x,
    dz = target.z - p.z;
  save.inventory = new PlayerInventory().serialize();
  save.creative = save.creativeFlying = true;
  save.position = [p.x, scene.eye[1], p.z];
  save.yaw = Math.atan2(-dx, -dz);
  save.pitch = Math.atan2(scene.look[1] - scene.eye[1], Math.hypot(dx, dz));
  save.time = 30;
  save.weather = {
    kind: 'clear',
    remaining: 3600,
    sequence: 0,
    rain: 0,
    storm: 0,
    wetness: 0,
  };
  save.dimensions.overworld.position = [...save.position];
  validateSave(save);
  return save;
}

// These are existing tree locations, not edits or synthetic distance geometry.
export function referenceLandmarks(scene, world) {
  const eye = referenceSave(scene).position;
  return [
    [-112, 3],
    [-106, -2],
    [-98, -1],
  ].map(([q, r]) => {
    const p = axialToWorld(q, r),
      y = world.surface(q, r);
    return {
      q,
      r,
      y,
      position: [p.x, y, p.z],
      kind: world.treeKind(q, r),
      naturalTree: world.tree(q, r),
      distance: Math.hypot(p.x - eye[0], y - eye[1], p.z - eye[2]),
    };
  });
}
