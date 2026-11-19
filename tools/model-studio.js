import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { animator } from '../src/ysm-model.js';
import { dragonAvatar, loadDragon } from '../src/dragon-avatar.js';
import { createMob } from '../src/mob-graphics.js';
import { createVillager } from '../src/villager-graphics.js';
import { animateRig } from '../src/mob-skins.js';
import { loadTexturePack } from '../src/texture-pack.js';
const canvas = document.querySelector('canvas'),
  r = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
const scene = new T.Scene();
scene.background = new T.Color(0xe8e3ec);
// A soft studio contact patch grounds the orthographic views without hiding the feet.
const patch = document.createElement('canvas');
patch.width = patch.height = 128;
const ctx = patch.getContext('2d'),
  fade = ctx.createRadialGradient(64, 64, 4, 64, 64, 63);
fade.addColorStop(0, 'rgba(69,50,85,.34)');
fade.addColorStop(1, 'rgba(69,50,85,0)');
ctx.fillStyle = fade;
ctx.fillRect(0, 0, 128, 128);
const floor = new T.Mesh(
  new T.PlaneGeometry(2.05, 1.35),
  new T.MeshBasicMaterial({
    map: new T.CanvasTexture(patch),
    transparent: true,
    depthWrite: false,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.009;
scene.add(floor);
const c = new T.OrthographicCamera(-1, 1, 1.09, -1.09, 0.01, 50);
const ctl = new OrbitControls(c, canvas);
scene.add(new T.HemisphereLight(0xfaf8ff, 0xe8dfee, 1.95));
for (const [pos, color, n] of [
  [[3, 4, 4], 0xfff6ed, 2.35],
  [[-2, 2, -3], 0xcfc9ed, 1.05],
]) {
  const l = new T.DirectionalLight(color, n);
  l.position.set(...pos);
  scene.add(l);
}
let root,
  model,
  kind,
  t = 0,
  walk = false,
  paused = false,
  strike = 0,
  hurtAge = Infinity;
await Promise.all([loadTexturePack(), loadDragon()]);
function select(id, portrait = false) {
  if (model) model.dispose();
  if (root) scene.remove(root);
  kind = id;
  model = id === 'dragon' ? dragonAvatar({ portrait }) : null;
  root =
    model?.root ||
    (['farmer', 'smith', 'merchant', 'fisher'].includes(id)
      ? createVillager(id)
      : createMob(id, {}));
  root.name = id;
  scene.add(root);
  orient(id === 'dragon' ? 0.2 : 2.75);
  step(0.25);
}
function orient(angle) {
  const y = kind === 'dragon' ? 0.98 : 0.89;
  c.position.set(
    Math.sin(angle) * 4,
    y + (kind === 'dragon' ? 0.045 : 0.3),
    Math.cos(angle) * 4,
  );
  ctl.target.set(0, y, 0);
  ctl.update();
}
function step(dt) {
  t += dt;
  if (model) model.update(dt, { walk: walk ? 0.85 : 0, strike, hurtAge });
  else animateRig(root, dt, t, walk ? 0.05 : 0, null);
  ctl.update();
  r.render(scene, c);
}
function resize() {
  r.setSize(innerWidth, innerHeight, false);
  c.left = (-1.09 * innerWidth) / innerHeight;
  c.right = -c.left;
  c.updateProjectionMatrix();
}
resize();
addEventListener('resize', resize);
select('dragon');
let prev = performance.now();
r.setAnimationLoop((n) => {
  if (!paused) step(Math.min(0.05, (n - prev) / 1000));
  prev = n;
});
subject.onchange = () => select(subject.value);
motion.onclick = () => {
  walk = !walk;
  motion.textContent = walk ? '待机' : '行走';
};
export async function glb() {
  const fresh = model ? dragonAvatar() : null;
  const rig = fresh?.root || root,
    animations = [];
  if (fresh) {
    const pose = animator(rig, fresh.clips);
    for (const [name, clip] of Object.entries(fresh.clips)) {
      const tracks = [];
      for (const [bone, properties] of Object.entries(clip.bones || {})) {
        const node = rig.getObjectByName(bone);
        if (!node) continue;
        for (const [key, value] of Object.entries(properties)) {
          if (!['position', 'rotation', 'scale'].includes(key)) continue;
          const times = [
            ...new Set([
              0,
              clip.animation_length || 1,
              ...(Array.isArray(value)
                ? []
                : Object.keys(value).map(Number).filter(Number.isFinite)),
            ]),
          ].sort((a, b) => a - b);
          const attr = key === 'rotation' ? 'quaternion' : key,
            values = [];
          for (const t of times) {
            pose.reset();
            pose.play(name, t);
            values.push(...node[attr].toArray());
          }
          const Track =
            key === 'rotation'
              ? T.QuaternionKeyframeTrack
              : T.VectorKeyframeTrack;
          tracks.push(new Track(node.uuid + '.' + attr, times, values));
        }
      }
      animations.push(
        new T.AnimationClip(name, clip.animation_length || 1, tracks),
      );
    }
    pose.reset();
  }
  try {
    const data = await new GLTFExporter().parseAsync(rig, {
      binary: true,
      animations,
    });
    return new Blob([data], { type: 'model/gltf-binary' });
  } finally {
    fresh?.dispose();
  }
}
save.onclick = async () => {
  let u = URL.createObjectURL(await glb()),
    a = document.createElement('a');
  a.href = u;
  a.download = kind + '.glb';
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
};
window.studio = {
  select,
  orient,
  step,
  glb,
  get root() {
    return root;
  },
  freeze() {
    paused = true;
  },
  walk(v) {
    walk = v;
  },
  hurt(v) {
    hurtAge = v;
  },
  strike(v) {
    strike = v;
  },
  camera: c,
  renderer: r,
};
