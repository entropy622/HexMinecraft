import * as T from 'three';
import { dragonAvatar, avatarRevision } from './dragon-avatar.js';
let portrait, last, uri;
export function avatarPortrait(gear) {
  const key = avatarRevision + '/' + gear.map((s) => s?.item || '').join(':');
  if (uri && key === last) return uri;
  if (!portrait) {
    const scene = new T.Scene(),
      a = dragonAvatar({ portrait: true }),
      r = new T.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    r.setSize(200, 328, false);
    const c = new T.OrthographicCamera(-0.74, 0.74, 1.214, -1.214, 0.1, 20);
    c.position.set(0.68, 1.26, 4);
    c.lookAt(0, 0.97, 0);
    scene.add(a.root, new T.HemisphereLight(0xfff7ff, 0xe1d9e8, 2.05));
    let sun = new T.DirectionalLight(0xffece0, 1.75);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    portrait = { a, r, c, scene };
  }
  if (portrait.a.revision !== avatarRevision) {
    portrait.a.dispose();
    portrait.a = dragonAvatar({ portrait: true });
    portrait.scene.add(portrait.a.root);
  }
  const { a, r, c, scene } = portrait;
  a.dressGear(gear);
  a.update(0.3);
  r.render(scene, c);
  uri = r.domElement.toDataURL();
  last = key;
  return uri;
}
