import { materialNames } from './material-pack.js';
let atlas = null;
const urls = new Map();
export function configureMaterialIcons(textures) {
  atlas = textures?.materials;
  urls.clear();
}
export function materialIconURL(id, face = 'side') {
  const name = id + ':' + face;
  if (
    !atlas?.active ||
    !materialNames(name).some((stem) =>
      atlas.active.images.has(stem + ':color'),
    )
  )
    return null;
  if (!urls.has(name)) urls.set(name, atlas.tile(name).toDataURL());
  return urls.get(name);
}
