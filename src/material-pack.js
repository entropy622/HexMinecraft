import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { BLOCKS } from './core.js';
import { decode, convertIndexedToRgb } from 'fast-png';

const aliases = {
  grass: 'grass_block',
  wood: 'oak_log',
  leaves: 'oak_leaves',
  planks: 'oak_planks',
  cobble: 'cobblestone',
  mossybrick: 'mossy_cobblestone',
  brick: 'bricks',
  ingot: 'iron_ingot',
  ironBlock: 'iron_block',
  coalOre: 'coal_ore',
  endstone: 'end_stone',
  endstoneBricks: 'end_stone_bricks',
  netherbrick: 'nether_bricks',
  purpur: 'purpur_block',
  hayBale: 'hay_block',
  crimsonwood: 'crimson_stem',
  shroom: 'nether_wart_block',
  wool: 'white_wool',
  workbench: 'crafting_table',
  furnaceLit: 'furnace',
  furnaceCasing: 'furnace',
  water: 'water_still',
  lava: 'lava_still',
  tuft: 'short_grass',
  flower: 'dandelion',
};
const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
export function materialNames(tile) {
  const [id, face = 'side'] = tile.split(':'),
    base = BLOCKS[id]?.base || id;
  let stem = aliases[base] || snake(base);
  if (base.endsWith('Wood')) stem = snake(base.slice(0, -4)) + '_log';
  if (base === 'grass')
    return face === 'top' ? ['grass_block_top'] : ['grass_block_side'];
  if (/(?:_log|_stem)$/.test(stem))
    return face === 'top' ? [stem + '_top', stem] : [stem];
  if (['furnace', 'blast_furnace', 'smoker'].includes(stem))
    return [
      stem +
        (face === 'top'
          ? '_top'
          : /Lit$/.test(id)
            ? '_front_on'
            : /Casing$/.test(id)
              ? '_side'
              : '_front'),
    ];
  if (stem === 'crafting_table')
    return ['crafting_table_' + (face === 'top' ? 'top' : 'side')];
  if (
    ['sandstone', 'red_sandstone', 'purpur_pillar', 'hay_block'].includes(stem)
  )
    return [stem + '_' + (face === 'top' ? 'top' : 'side'), stem];
  return [stem];
}

let active = null,
  restoreError = '';
export const currentMaterialPack = () => active;
export const materialPackRestoreError = () => restoreError;
export function setMaterialPack(pack) {
  active = pack;
  restoreError = '';
}
// Preserve numeric RGB even beside alpha == 0 (labPBR emission/height).
export function decodeMaterialPNG(bytes) {
  const png = decode(bytes, { checkCrc: true });
  let source = png.data,
    channels = png.channels,
    depth = png.depth;
  if (png.palette) {
    source = convertIndexedToRgb(png);
    channels = png.palette[0].length;
    depth = 8;
  }
  const data = new Uint8Array(png.width * png.height * 4),
    max = 2 ** depth - 1;
  const sample = (pixel, c) => {
    const offset = pixel * channels + c;
    if (depth >= 8) return Math.round((source[offset] * 255) / max);
    const row = Math.floor(pixel / png.width),
      x = pixel % png.width,
      bit = x * channels * depth + c * depth;
    return (
      (((source[
        row * Math.ceil((png.width * channels * depth) / 8) + (bit >> 3)
      ] >>
        (8 - depth - (bit % 8))) &
        max) *
        255) /
      max
    );
  };
  for (let i = 0; i < png.width * png.height; i++) {
    const gray = channels < 3,
      r = sample(i, 0),
      g = gray ? r : sample(i, 1),
      b = gray ? r : sample(i, 2);
    let a = channels === 2 || channels === 4 ? sample(i, channels - 1) : 255;
    if (png.transparency && !png.palette) {
      const t = png.transparency;
      if (
        gray
          ? r === Math.round((t[0] * 255) / max)
          : r === Math.round((t[0] * 255) / max) &&
            g === Math.round((t[1] * 255) / max) &&
            b === Math.round((t[2] * 255) / max)
      )
        a = 0;
    }
    data.set([r, g, b, a], i * 4);
  }
  return { width: png.width, height: png.height, data };
}
const db = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('hexwild-material-pack', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('packs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function storeMaterialPack(file) {
  const connection = await db();
  try {
    await new Promise((resolve, reject) => {
      const tx = connection.transaction('packs', 'readwrite'),
        store = tx.objectStore('packs');
      if (file) store.put(file, 'active');
      else store.delete('active');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    connection.close();
  }
}
export async function restoreMaterialPack() {
  try {
    const connection = await db();
    let file;
    try {
      file = await new Promise((resolve, reject) => {
        const r = connection
          .transaction('packs')
          .objectStore('packs')
          .get('active');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      connection.close();
    }
    if (file) active = await decodeMaterialPack(file);
  } catch {
    restoreError = '上次的资源包未能恢复，已使用默认材质。';
  }
}
export async function decodeMaterialPack(file) {
  if (file.size > 32 * 1024 * 1024)
    throw Error('资源包超过 32 MiB，请选择较小的方块材质包。');
  const wanted = new Set(
    Object.keys(BLOCKS).flatMap((id) =>
      ['top', 'side'].flatMap((face) => materialNames(id + ':' + face)),
    ),
  );
  for (const stem of ['short_grass', 'dandelion', 'water_still', 'lava_still'])
    wanted.add(stem);
  const chosen = new Map();
  let total = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      const match = entry.name
        .toLowerCase()
        .replaceAll('\\', '/')
        .match(
          /(?:^|\/)assets\/minecraft\/textures\/blocks?\/([a-z0-9_]+)\.png$/,
        );
      if (!match) return false;
      const stem = match[1].replace(/_[ns]$/, ''),
        channel = match[1].endsWith('_n')
          ? 'normal'
          : match[1].endsWith('_s')
            ? 'specular'
            : 'color';
      if (!wanted.has(stem)) return false;
      const key = stem + ':' + channel;
      if (chosen.has(key)) throw Error('资源包有重复方块贴图：' + stem);
      if (
        entry.originalSize > 8 * 1024 * 1024 ||
        (total += entry.originalSize) > 64 * 1024 * 1024
      )
        throw Error('资源包的方块贴图数据过大。');
      chosen.set(key, entry.name);
      return true;
    },
  });
  if (!chosen.size) throw Error('未找到支持的 Minecraft 方块 PNG 贴图。');
  const images = new Map();
  let pixels = 0,
    resolution = 16;
  try {
    for (const [key, path] of chosen) {
      const bytes = entries[path];
      if (
        bytes.length < 24 ||
        bytes[0] !== 137 ||
        bytes[1] !== 80 ||
        bytes[2] !== 78 ||
        bytes[3] !== 71
      )
        throw Error('方块贴图不是有效 PNG：' + path);
      const header = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        ),
        w = header.getUint32(16),
        h = header.getUint32(20);
      if (
        !w ||
        !h ||
        w > 1024 ||
        h > 8192 ||
        h < w ||
        h % w ||
        (pixels += w * h) > 32 * 1024 * 1024
      )
        throw Error('方块贴图尺寸不受支持：' + path);
      const image = decodeMaterialPNG(bytes);
      images.set(key, image);
      resolution = Math.max(
        resolution,
        2 ** Math.ceil(Math.log2(Math.min(64, w))),
      );
    }
    // The same atlas cell must describe the same pixel grid for all channels.
    for (const [key, image] of images) {
      const stem = key.split(':')[0];
      for (const channel of ['color', 'normal', 'specular']) {
        const other = images.get(stem + ':' + channel);
        if (other && other.width !== image.width)
          throw Error('颜色、法线和镜面贴图尺寸不同：' + stem);
      }
    }
    return {
      name: file.name || '资源包',
      file,
      images,
      resolution,
      hasNormals: [...images.keys()].some((k) => k.endsWith(':normal')),
      hasSpecular: [...images.keys()].some((k) => k.endsWith(':specular')),
      count: chosen.size,
    };
  } catch (error) {
    for (const image of images.values()) image.close?.();
    throw error;
  }
}
