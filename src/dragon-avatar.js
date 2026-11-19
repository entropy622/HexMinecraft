import * as T from 'three';
import { readYsm, makeSkeleton, animator } from './ysm-model.js';

export const dragonURL = import.meta.env.BASE_URL + 'models/pearl-dragon.zip';
let asset, pending, builtin;
export let avatarRevision = 0;
const dbPromise = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('hexwild-avatar', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('model');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function storage(mode, callback) {
  const db = await dbPromise();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('model', mode),
        req = callback(tx.objectStore('model'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function prepare(bytes) {
  const data = readYsm(bytes),
    url = URL.createObjectURL(new Blob([data.png], { type: 'image/png' }));
  let map;
  try {
    map = await new T.TextureLoader().loadAsync(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.NearestFilter;
  map.minFilter = T.LinearMipMapLinearFilter;
  const material = new T.MeshLambertMaterial({
    map,
    emissive: 0x3f3548,
    emissiveMap: map,
    alphaTest: 0.45,
  });
  const model = { ...data, material, portraitMaterial: material.clone() };
  try {
    model.template = makeSkeleton(data.geometry, material);
    if (data.arm) model.armTemplate = makeSkeleton(data.arm, material);
    return model;
  } catch (e) {
    release(model);
    throw e;
  }
}
function release(a) {
  for (const root of [a.template, a.armTemplate])
    root?.traverse((n) => n.geometry?.dispose());
  a.material.map.dispose();
  a.material.dispose();
  a.portraitMaterial.dispose();
}
function activate(next) {
  const old = asset;
  asset = next;
  avatarRevision++;
  if (old && old !== builtin) release(old);
}
export function loadDragon() {
  return (pending ??= (async () => {
    const response = await fetch(dragonURL);
    if (!response.ok) throw Error('白龙模型加载失败');
    builtin = await prepare(new Uint8Array(await response.arrayBuffer()));
    let selected;
    try {
      const data = await storage('readonly', (s) => s.get('selected'));
      if (data) selected = await prepare(data);
    } catch (e) {
      console.warn('使用默认角色：', e);
    }
    activate(selected || builtin);
  })());
}
export const avatarName = () => asset.name;
export async function importAvatar(file) {
  if (file.size > 24 * 1024 * 1024) throw Error('请选择小于 24 MiB 的 ZIP。');
  const bytes = new Uint8Array(await file.arrayBuffer()),
    next = await prepare(bytes);
  try {
    await storage('readwrite', (s) => s.put(bytes, 'selected'));
  } catch (e) {
    release(next);
    throw e;
  }
  activate(next);
}
export async function resetAvatar() {
  await storage('readwrite', (s) => s.delete('selected'));
  if (asset !== builtin) activate(builtin);
}

// The hand anchor stays in world units so held blocks/tools need no model-specific offsets.
export function dragonAvatar({ portrait = false } = {}) {
  const root = new T.Group(),
    rig = asset.template.clone(true),
    model = asset;
  if (portrait)
    rig.traverse((n) => {
      if (n.isMesh) n.material = model.portraitMaterial;
    });
  rig.scale.set(model.width / 16, model.height / 16, model.width / 16);
  root.add(rig);
  const find = (n) => rig.getObjectByName(n),
    head = find('Head'),
    controls = animator(rig, model.animations);
  const grips = ['Left', 'Right'].map((side) => {
    const p =
      find(side + 'HandLocator') ||
      find(side + 'Hand') ||
      find(side + 'Arm') ||
      rig;
    const g = new T.Group();
    g.scale.set(16 / model.width, 16 / model.height, 16 / model.width);
    p.add(g);
    return g;
  });
  const armor = [];
  // Small, fitted overlays follow the same bones as the cloth and boots.
  function equip(i, parent, size, offset) {
    if (!parent) return;
    const o = new T.Mesh(
      new T.BoxGeometry(...size),
      new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.28 }),
    );
    o.position.set(...offset);
    o.visible = false;
    parent.add(o);
    armor.push([i, o]);
  }
  if (model.geometry.description.identifier === 'geometry.pearl_dragon.main') {
    const crown = head.children.find((n) => n.isMesh).geometry;
    crown.computeBoundingBox();
    const width = crown.boundingBox.max.x - crown.boundingBox.min.x;
    equip(0, head, [width * 0.95, 0.63, 7.07], [0, 5.09, 0.02]);
    equip(1, find('UpperBody'), [4.86, 3.33, 3.5], [0, 4.94, 0]);
    for (const [side, s] of [
      ['Left', 1],
      ['Right', -1],
    ]) {
      equip(2, find(side + 'Leg'), [1.8, 4.2, 1.96], [0, -3.3, -0.06]);
      equip(3, find(side + 'LowerLeg'), [2.03, 1.43, 2.72], [0, -6.04, 0.4]);
    }
  }
  const headRest = head?.rotation.x || 0;
  let t = 0;
  return {
    root,
    grips,
    clips: model.animations,
    revision: avatarRevision,
    dispose() {
      armor.forEach(([, o]) => {
        o.geometry.dispose();
        o.material.dispose();
      });
      root.removeFromParent();
    },
    dressGear(items = []) {
      for (const [i, o] of armor) {
        const id = items[i]?.item;
        o.visible = !!id;
        if (id && id !== o.userData.item) {
          o.userData.item = id;
          o.material.color.set(
            /diamond/.test(id)
              ? 0x81d8cd
              : /gold/.test(id)
                ? 0xdec378
                : /leather/.test(id)
                  ? 0x9d765a
                  : /netherite/.test(id)
                    ? 0x695d70
                    : 0xbebcc7,
          );
        }
      }
    },
    update(
      dt,
      {
        walk = 0,
        strike = 0,
        crouch = false,
        pitch = 0,
        hurtAge = Infinity,
      } = {},
    ) {
      t += dt;
      controls.reset();
      if (head) head.rotation.x = headRest;
      controls.play(portrait && model.animations.gui ? 'gui' : 'idle', t);
      if (crouch && walk && model.animations.sneaking)
        controls.play('sneaking', t);
      else {
        if (walk) controls.play('walk', t, walk);
        if (crouch) controls.play('sneak', t);
      }
      if (strike > 0)
        controls.play(
          'swing_hand',
          strike * (model.animations.swing_hand?.animation_length || 0.42),
        );
      if (
        hurtAge >= 0 &&
        hurtAge < (model.animations.attacked?.animation_length || 0.55)
      )
        controls.play('attacked', hurtAge);
      if (head) head.rotation.x -= pitch * 0.42;
    },
  };
}
// Mount forearms from the first-person geometry at the same grip as the held item.
export function firstPersonArm(side) {
  const source = asset.armTemplate || asset.template,
    arm = source.getObjectByName(side + 'Arm');
  const group = new T.Group();
  if (!arm) return group;
  const child = arm.clone(true);
  child.position.set(0, 0, 0);
  const shape = new T.Group();
  shape.add(child);
  shape.updateMatrixWorld(true);
  const grip = shape.getObjectByName(side + 'HandLocator');
  const at = grip
    ? grip.getWorldPosition(new T.Vector3())
    : new T.Vector3(0, -7, 0);
  const scale = 0.07;
  shape.scale.setScalar(scale);
  shape.rotation.x = Math.PI / 2 - 0.23;
  shape.position
    .copy(at.multiplyScalar(-scale).applyEuler(shape.rotation))
    .add(new T.Vector3(0, 0.02, -0.28));
  group.add(shape);
  return group;
}
