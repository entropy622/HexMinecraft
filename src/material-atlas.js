import { DataTexture, NearestFilter, RGBAFormat, Vector2 } from 'three';
import { materialNames } from './material-pack.js';
import { BLOCKS } from './core.js';
import { effectImage } from './texture-pack.js';
import { BiomeColors, TINT_BASES, biomeTintKind } from './biome-colors.js';

export function installMaterialAtlas(textures, tiles, names) {
  const rows = Math.ceil(names.length / 8),
    base = { size: 16, cell: 32, pad: 8, width: 256, height: rows * 32 };
  let layout = base,
    normal = null,
    specular = null,
    flags = null,
    pack = null,
    revision = 0;
  const reflectiveCache = new WeakMap();
  const uniforms = {
    surfacePackEnabled: { value: 0 },
    surfacePackNormal: { value: null },
    surfacePackSpecular: { value: null },
    surfacePackFlags: { value: null },
    surfacePackGrid: { value: new Vector2(8, rows) },
    biomeGrassOverlay: { value: null },
    biomeTileSize: { value: 16 },
  };
  const readImage = (image) => {
    if (!image) return null;
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d').drawImage(image, 0, 0);
    return {
      width: c.width,
      height: c.height,
      data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data,
    };
  };
  const nativeOverlay = readImage(
    effectImage('mcl_core_grass_block_side_overlay'),
  ) || { width: 1, height: 1, data: new Uint8Array(4) };
  textures.biomes = new BiomeColors({
    grass: readImage(effectImage('mcl_core_palette_grass')),
    foliage: readImage(effectImage('mcl_core_palette_foliage')),
  });
  let overlayTexture = null,
    overlaySource = nativeOverlay;
  function prepareOverlay(image) {
    const size = Math.min(64, image.width),
      raw = new Uint8Array(size * size * 4),
      tinted = new Uint8ClampedArray(raw.length),
      canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const sx = Math.floor((x * image.width) / size),
          sy = Math.floor((y * image.width) / size),
          pixel = image.data.subarray(
            (sy * image.width + sx) * 4,
            (sy * image.width + sx) * 4 + 4,
          );
        raw.set(pixel, ((size - 1 - y) * size + x) * 4);
        tinted.set(
          [
            (pixel[0] * TINT_BASES[4][0]) / 255,
            (pixel[1] * TINT_BASES[4][1]) / 255,
            (pixel[2] * TINT_BASES[4][2]) / 255,
            pixel[3],
          ],
          (y * size + x) * 4,
        );
      }
    canvas
      .getContext('2d')
      .putImageData(new ImageData(tinted, size, size), 0, 0);
    const texture = new DataTexture(raw, size, size, RGBAFormat);
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.needsUpdate = true;
    return { texture, canvas };
  }
  const index = new Map(names.map((name, i) => [name, i]));
  const imageFor = (next, name, channel) =>
    materialNames(name)
      .map((stem) => next?.images.get(stem + ':' + channel))
      .find(Boolean);
  function tileIndex(u, v, from = layout) {
    return Math.min(
      names.length - 1,
      Math.max(
        0,
        Math.floor(((1 - v) * from.height) / from.cell) * 8 +
          Math.floor((u * from.width) / from.cell),
      ),
    );
  }
  function mappedUV(u, v, from, to) {
    const i = tileIndex(u, v, from),
      x = i % 8,
      y = Math.floor(i / 8),
      localU =
        (u * from.width - x * from.cell - from.pad - 0.5) / (from.size - 1),
      localV =
        ((1 - v) * from.height - y * from.cell - from.pad - 0.5) /
        (from.size - 1);
    return [
      (x * to.cell + to.pad + 0.5 + localU * (to.size - 1)) / to.width,
      1 - (y * to.cell + to.pad + 0.5 + localV * (to.size - 1)) / to.height,
    ];
  }
  const canvasFor = (image) => {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.width;
    c.getContext('2d').putImageData(
      new ImageData(
        new Uint8ClampedArray(image.data.slice(0, image.width ** 2 * 4)),
        image.width,
        image.width,
      ),
      0,
      0,
    );
    return c;
  };
  const dataTexture = (data, w, h) => {
    const t = new DataTexture(data, w, h, RGBAFormat);
    t.minFilter = t.magFilter = NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  function numericTile(data, image, i, next) {
    // Include nearest-pixel gutters without Canvas's alpha premultiplication.
    const { size, cell, pad, width, height } = next,
      x0 = (i % 8) * cell,
      y0 = Math.floor(i / 8) * cell;
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const sx = Math.min(
            image.width - 1,
            Math.max(0, Math.floor(((x - pad) * image.width) / size)),
          ),
          sy = Math.min(
            image.width - 1,
            Math.max(0, Math.floor(((y - pad) * image.width) / size)),
          );
        data.set(
          image.data.subarray(
            (sy * image.width + sx) * 4,
            (sy * image.width + sx) * 4 + 4,
          ),
          ((height - 1 - y0 - y) * width + x0 + x) * 4,
        );
      }
  }
  const manager = {
    uniforms,
    get layout() {
      return layout;
    },
    get hasSpecular() {
      return !!specular;
    },
    get active() {
      return pack;
    },
    apply(next, scene, maxTextureSize = 16384) {
      let size = next?.resolution || 16;
      while (
        (rows * size * 2 > maxTextureSize || size * 16 > maxTextureSize) &&
        size > 16
      )
        size /= 2;
      const nextLayout = {
        size,
        cell: size * 2,
        pad: size / 2,
        width: size * 16,
        height: rows * size * 2,
      };
      if (nextLayout.height > maxTextureSize)
        throw Error('此设备无法容纳方块材质图集。');
      const color = document.createElement('canvas');
      color.width = nextLayout.width;
      color.height = nextLayout.height;
      const ctx = color.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const nextOverlay =
        next?.images.get('grass_block_side_overlay:color') || nativeOverlay;
      const overlay = prepareOverlay(nextOverlay);
      const nData = next?.hasNormals
          ? new Uint8Array(color.width * color.height * 4)
          : null,
        sData = next?.hasSpecular
          ? new Uint8Array(color.width * color.height * 4)
          : null;
      const mask = new Uint8Array(names.length * 4),
        specIndices = new Set(),
        sourceCanvases = new Map();
      names.forEach((name, i) => {
        const image = imageFor(next, name, 'color');
        let tile =
          (name === 'grass:side' ? tiles.get(name).bare : null) ||
          tiles.get(name).canvas;
        if (image) {
          if (!sourceCanvases.has(image))
            sourceCanvases.set(image, canvasFor(image));
          tile = sourceCanvases.get(image);
        }
        const x = (i % 8) * size * 2 + size / 2,
          y = Math.floor(i / 8) * size * 2 + size / 2;
        ctx.drawImage(tile, 0, 0, tile.width, tile.height, x, y, size, size);
        if (name === 'grass:side')
          ctx.drawImage(overlay.canvas, x, y, size, size);
        const [id, face] = name.split(':'),
          tint =
            id === 'leaves'
              ? '#79a94d'
              : BLOCKS[id]?.leafTint ||
                (id === 'grass' && face === 'top' ? '#91b95d' : null);
        const importTint = tint || (id === 'tuft' ? '#91b95d' : null);
        if (image && importTint) {
          const tinted = document.createElement('canvas');
          tinted.width = tinted.height = size;
          const t = tinted.getContext('2d');
          t.drawImage(tile, 0, 0, tile.width, tile.height, 0, 0, size, size);
          t.globalCompositeOperation = 'multiply';
          t.fillStyle = importTint;
          t.fillRect(0, 0, size, size);
          t.globalCompositeOperation = 'destination-in';
          t.drawImage(tile, 0, 0, tile.width, tile.height, 0, 0, size, size);
          ctx.clearRect(x, y, size, size);
          ctx.drawImage(tinted, x, y);
        }
        ctx.drawImage(color, x, y, size, 1, x, y - size / 2, size, size / 2);
        ctx.drawImage(
          color,
          x,
          y + size - 1,
          size,
          1,
          x,
          y + size,
          size,
          size / 2,
        );
        ctx.drawImage(
          color,
          x,
          y - size / 2,
          1,
          size * 2,
          x - size / 2,
          y - size / 2,
          size / 2,
          size * 2,
        );
        ctx.drawImage(
          color,
          x + size - 1,
          y - size / 2,
          1,
          size * 2,
          x + size,
          y - size / 2,
          size / 2,
          size * 2,
        );
        const n = imageFor(next, name, 'normal'),
          s = imageFor(next, name, 'specular');
        if (n) {
          numericTile(nData, n, i, nextLayout);
          mask[i * 4] = 255;
        }
        if (s) {
          numericTile(sData, s, i, nextLayout);
          mask[i * 4 + 1] = 255;
          specIndices.add(i);
        }
      });
      const geometries = new Set(),
        changes = [];
      scene?.traverse((o) => {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        if (
          o.geometry?.attributes.uv &&
          materials.some((m) => m?.map === textures.atlas)
        )
          geometries.add(o.geometry);
      });
      for (const geometry of geometries) {
        if (layout.size === nextLayout.size) {
          if (!next)
            for (const name of ['uv', 'sawNextUV', 'sawLastUV'])
              delete geometry.userData['packBase_' + name];
          continue;
        }
        for (const name of ['uv', 'sawNextUV', 'sawLastUV']) {
          const uv = geometry.attributes[name];
          if (!uv) continue;
          const key = 'packBase_' + name,
            canonical =
              geometry.userData[key] || new Float32Array(uv.array.length),
            result = new Float32Array(uv.array.length);
          for (let i = 0; i < uv.count; i++) {
            if (!geometry.userData[key])
              canonical.set(
                mappedUV(uv.getX(i), uv.getY(i), layout, base),
                i * 2,
              );
            result.set(
              mappedUV(
                canonical[i * 2],
                canonical[i * 2 + 1],
                base,
                nextLayout,
              ),
              i * 2,
            );
          }
          changes.push({ geometry, name, key, canonical, result });
        }
      }
      const newNormal = nData
          ? dataTexture(nData, color.width, color.height)
          : null,
        newSpecular = sData
          ? dataTexture(sData, color.width, color.height)
          : null,
        newFlags = next ? dataTexture(mask, names.length, 1) : null;
      // All decode/allocation/UV preparation succeeded; publish coherently.
      for (const { geometry, name, key, canonical, result } of changes) {
        if (next) geometry.userData[key] = canonical;
        else delete geometry.userData[key];
        geometry.attributes[name].array.set(result);
        geometry.attributes[name].needsUpdate = true;
      }
      if (
        textures.atlas.image.width !== color.width ||
        textures.atlas.image.height !== color.height
      )
        textures.atlas.dispose();
      textures.atlas.image = color;
      textures.atlas.needsUpdate = true;
      textures.canvas = color;
      overlayTexture?.dispose();
      overlayTexture = overlay.texture;
      overlaySource = nextOverlay;
      uniforms.biomeGrassOverlay.value = overlayTexture;
      uniforms.biomeTileSize.value = size;
      textures.biomes.setPack(next);
      revision++;
      normal?.dispose();
      specular?.dispose();
      flags?.dispose();
      normal = newNormal;
      specular = newSpecular;
      flags = newFlags;
      layout = nextLayout;
      pack = next;
      manager.specIndices = specIndices;
      uniforms.surfacePackEnabled.value = next ? 1 : 0;
      uniforms.surfacePackNormal.value = normal;
      uniforms.surfacePackSpecular.value = specular;
      uniforms.surfacePackFlags.value = flags;
      textures.refreshSingles?.();
      scene?.traverse((o) => {
        if (o.geometry && o.material?.map === textures.atlas) {
          o.userData.baseSurfaceReflection ??= !!o.userData.surfaceReflection;
          o.userData.surfaceReflection =
            o.userData.baseSurfaceReflection || manager.reflective(o.geometry);
        }
      });
    },
    specIndices: new Set(),
    reflective(geometry) {
      if (!specular || !geometry.attributes.uv) return false;
      const cached = reflectiveCache.get(geometry);
      if (cached?.revision === revision) return cached.value;
      const uv = geometry.attributes.uv;
      let value = false;
      for (let i = 0; i < uv.count; i++)
        if (manager.specIndices.has(tileIndex(uv.getX(i), uv.getY(i)))) {
          value = true;
          break;
        }
      reflectiveCache.set(geometry, { revision, value });
      return value;
    },
    has(name) {
      return index.has(name);
    },
    tile(name) {
      const i = index.get(name),
        c = document.createElement('canvas');
      c.width = c.height = layout.size;
      c.getContext('2d', { willReadFrequently: true }).drawImage(
        textures.canvas,
        (i % 8) * layout.cell + layout.pad,
        Math.floor(i / 8) * layout.cell + layout.pad,
        layout.size,
        layout.size,
        0,
        0,
        layout.size,
        layout.size,
      );
      const kind = biomeTintKind(name);
      if (kind) {
        const ctx = c.getContext('2d'),
          pixels = ctx.getImageData(0, 0, c.width, c.height),
          target = textures.biomes.color(
            '青翠平原',
            kind === 2 || kind === 3 ? 'foliage' : 'grass',
          ),
          base = TINT_BASES[kind];
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const p = (y * c.width + x) * 4,
              ox = Math.min(
                overlaySource.width - 1,
                Math.floor((x * overlaySource.width) / c.width),
              ),
              oy = Math.min(
                overlaySource.width - 1,
                Math.floor((y * overlaySource.width) / c.height),
              ),
              op = (oy * overlaySource.width + ox) * 4;
            for (let channel = 0; channel < 3; channel++)
              pixels.data[p + channel] =
                kind === 4
                  ? pixels.data[p + channel] +
                    (((overlaySource.data[op + channel] *
                      overlaySource.data[op + 3]) /
                      255) *
                      (target[channel] - base[channel])) /
                      255
                  : Math.min(1, pixels.data[p + channel] / base[channel]) *
                    target[channel];
          }
        ctx.putImageData(pixels, 0, 0);
      }
      return c;
    },
    uv(name, u, v) {
      const i = index.get(name);
      return [
        ((i % 8) * layout.cell + layout.pad + 0.5 + u * (layout.size - 1)) /
          layout.width,
        1 -
          (Math.floor(i / 8) * layout.cell +
            layout.pad +
            0.5 +
            (1 - v) * (layout.size - 1)) /
            layout.height,
      ];
    },
  };
  textures.materials = manager;
  return manager;
}
