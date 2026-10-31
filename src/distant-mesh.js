import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Uint8BufferAttribute,
} from 'three';
import { BLOCKS, DIRECTIONS, axialToWorld } from './core.js';
import { TREES } from './wood-data.js';
import { biomeTintKind } from './biome-colors.js';
import { surfaceOpticsClass } from './surface-optics.js';
import { DISTANT_TYPES } from './distant-field.js';
import {
  DISTANT_TILE,
  DISTANT_STEP,
  DISTANT_SAMPLES,
} from './distant-config.js';

const corners = Array.from({ length: 6 }, (_, i) => [
  Math.cos(((i * 60 - 30) * Math.PI) / 180),
  Math.sin(((i * 60 - 30) * Math.PI) / 180),
]);
export function distantMesh(tile, textures, world, material) {
  const positions = [],
    normals = [],
    colors = [],
    uv = [],
    biomes = [],
    optics = [],
    origin = axialToWorld(
      tile.tq * DISTANT_TILE + 1.5,
      tile.tr * DISTANT_TILE + 1.5,
    );
  function triangle(points, normal, type, face, q, r, coords) {
    const id = type.startsWith('@') ? type.slice(1) : type,
      name = [
        id + ':' + face,
        id,
        BLOCKS[id]?.base + ':' + face,
        'stone:' + face,
      ].find((n) => textures.materials.has(n)),
      tint = textures.biomes.tint(world, q, r, biomeTintKind(name)),
      shade = normal[1] > 0.5 ? 1 : 0.86,
      category = surfaceOpticsClass(id, BLOCKS[id]);
    points.forEach((p, i) => {
      positions.push(...p);
      normals.push(...normal);
      colors.push(shade, shade, shade);
      uv.push(...textures.uv(name, ...coords[i]));
      biomes.push(tint[0], tint[1], tint[2], tint[3]);
      optics.push(category);
    });
  }
  function prism(x, z, bottom, top, radius, type, q, r, neighbor = null) {
    if (top <= bottom) return;
    const point = (i, y) => [
        x + corners[i][0] * radius,
        y,
        z + corners[i][1] * radius,
      ],
      cap = (i) => [(corners[i][0] + 1) / 2, (corners[i][1] + 1) / 2];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      triangle(
        [[x, top, z], point(j, top), point(i, top)],
        [0, 1, 0],
        type,
        'top',
        q,
        r,
        [[0.5, 0.5], cap(j), cap(i)],
      );
      const low = neighbor ? Math.max(bottom, neighbor(i)) : bottom;
      if (low >= top) continue;
      const angle = (i * Math.PI) / 3,
        n = [Math.cos(angle), 0, Math.sin(angle)],
        a = point(i, low),
        b = point(i, top),
        c = point(j, top),
        d = point(j, low);
      triangle([a, b, c], n, type, 'side', q, r, [
        [0, 0],
        [0, 1],
        [1, 1],
      ]);
      triangle([a, c, d], n, type, 'side', q, r, [
        [0, 0],
        [1, 1],
        [1, 0],
      ]);
    }
  }
  const width = DISTANT_TILE / DISTANT_STEP,
    n = DISTANT_SAMPLES;
  for (let a = 0; a < width; a++)
    for (let b = 0; b < width; b++) {
      const index = a * n + b,
        p = axialToWorld(a * DISTANT_STEP, b * DISTANT_STEP),
        q0 = tile.tq * DISTANT_TILE + a * DISTANT_STEP,
        r0 = tile.tr * DISTANT_TILE + b * DISTANT_STEP,
        ground = tile.groundHeights[index],
        groundType = DISTANT_TYPES[tile.groundTypes[index]],
        h = tile.heights[index],
        type = DISTANT_TYPES[tile.types[index]],
        offset = tile.offsets[index],
        q = q0 + Math.floor(offset / DISTANT_STEP),
        r = r0 + (offset % DISTANT_STEP);
      prism(p.x, p.z, 0, ground, DISTANT_STEP, groundType, q0, r0, (i) => {
        const [dq, dr] = DIRECTIONS[i],
          x = a + dq,
          z = b + dr;
        return x >= 0 && z >= 0 && x < n && z < n
          ? tile.groundHeights[x * n + z]
          : 0;
      });
      if (BLOCKS[type]?.foliage && h > ground + 1) {
        const actual = axialToWorld(q + 0.5, r + 0.5),
          x = actual.x - origin.x,
          z = actual.z - origin.z,
          bottom = Math.max(ground + 1, h - 4),
          log =
            Object.values(TREES).find((t) => t.leaves === type)?.log || 'wood';
        prism(x, z, ground, bottom, 0.35, log, q, r);
        prism(x, z, bottom, h - 1, 2.8, type, q, r);
        prism(x, z, h - 1, h, 1.9, type, q, r);
      }
    }
  const geometry = new BufferGeometry(),
    count = positions.length / 3;
  for (const [name, values, size] of [
    ['position', positions, 3],
    ['normal', normals, 3],
    ['color', colors, 3],
    ['uv', uv, 2],
  ])
    geometry.setAttribute(name, new Float32BufferAttribute(values, size));
  geometry.setAttribute('biomeTint', new Uint8BufferAttribute(biomes, 4, true));
  geometry.setAttribute(
    'surfaceOptics',
    new Uint8BufferAttribute(optics, 1, false),
  );
  geometry.setAttribute(
    'ambientOcclusion',
    new Float32BufferAttribute(new Float32Array(count).fill(1), 1),
  );
  geometry.setAttribute(
    'skylight',
    new Float32BufferAttribute(new Float32Array(count).fill(1), 1),
  );
  geometry.setAttribute(
    'blocklight',
    new Float32BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute(
    'rainExposure',
    new Float32BufferAttribute(new Float32Array(count).fill(1), 1),
  );
  geometry.setAttribute(
    'surfacePorosity',
    new Float32BufferAttribute(new Float32Array(count).fill(0.5), 1),
  );
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.position.set(origin.x, 0, origin.z);
  mesh.raycast = () => {};
  mesh.userData.distantTerrain = true;
  return mesh;
}
