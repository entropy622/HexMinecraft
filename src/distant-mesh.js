import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Int8BufferAttribute,
  Uint8BufferAttribute,
  Uint16BufferAttribute,
} from 'three';
import { BLOCKS, DIRECTIONS, axialToWorld } from './core.js';
import { biomeTintKind } from './biome-colors.js';
import { surfaceOpticsClass } from './surface-optics.js';
import { DISTANT_TYPES } from './distant-field.js';
import {
  DISTANT_TILE,
  DISTANT_STEP,
  DISTANT_SAMPLES,
  DISTANT_TREE_STEP,
  DISTANT_TREE_SAMPLES,
  DISTANT_INSET,
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
    indices = [],
    origin = axialToWorld(
      tile.tq * DISTANT_TILE + 1.5,
      tile.tr * DISTANT_TILE + 1.5,
    );
  function polygon(points, normal, type, face, q, r, coords) {
    if (face === 'bottom') face = 'top';
    const start = positions.length / 3;
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
    for (let i = 1; i < points.length - 1; i++)
      indices.push(start, start + i, start + i + 1);
  }
  function prism(
    x,
    z,
    bottom,
    top,
    radius,
    type,
    q,
    r,
    neighbor = null,
    topFace = true,
    bottomFace = false,
  ) {
    if (top <= bottom) return;
    const point = (i, y) => [
        x + corners[i][0] * radius,
        y,
        z + corners[i][1] * radius,
      ],
      cap = (i) => [(corners[i][0] + 1) / 2, (corners[i][1] + 1) / 2];
    const forward = [0, 1, 2, 3, 4, 5],
      reverse = [5, 4, 3, 2, 1, 0];
    if (topFace)
      polygon(
        reverse.map((i) => point(i, top)),
        [0, 1, 0],
        type,
        'top',
        q,
        r,
        reverse.map(cap),
      );
    if (bottomFace)
      polygon(
        forward.map((i) => point(i, bottom)),
        [0, -1, 0],
        type,
        'bottom',
        q,
        r,
        forward.map(cap),
      );
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const low = neighbor ? Math.max(bottom, neighbor(i)) : bottom;
      if (low >= top) continue;
      const angle = (i * Math.PI) / 3,
        n = [Math.cos(angle), 0, Math.sin(angle)],
        a = point(i, low),
        b = point(i, top),
        c = point(j, top),
        d = point(j, low);
      polygon([a, b, c, d], n, type, 'side', q, r, [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ]);
    }
  }
  const width = DISTANT_TILE / DISTANT_STEP,
    n = DISTANT_SAMPLES;
  const groundStart = DISTANT_INSET / DISTANT_STEP;
  for (let a = groundStart; a < width + groundStart; a++)
    for (let b = groundStart; b < width + groundStart; b++) {
      const index = a * n + b,
        p = axialToWorld(a * DISTANT_STEP, b * DISTANT_STEP),
        q0 = tile.tq * DISTANT_TILE + a * DISTANT_STEP,
        r0 = tile.tr * DISTANT_TILE + b * DISTANT_STEP,
        ground = tile.groundHeights[index],
        groundType = DISTANT_TYPES[tile.groundTypes[index]];
      prism(p.x, p.z, 0, ground, DISTANT_STEP, groundType, q0, r0, (i) => {
        const [dq, dr] = DIRECTIONS[i],
          x = a + dq,
          z = b + dr;
        return x >= 0 && z >= 0 && x < n && z < n
          ? tile.groundHeights[x * n + z]
          : 0;
      });
    }
  const treeN = DISTANT_TREE_SAMPLES,
    treeH = tile.treeHeight,
    treeWidth = DISTANT_TILE / DISTANT_TREE_STEP;
  const treeAt = (a, b, y) =>
    a < 0 || b < 0 || a >= treeN || b >= treeN || y < 0 || y >= treeH
      ? 0
      : tile.trees[(a * treeN + b) * treeH + y];
  const groundAt = (a, b) =>
    a < 0 || b < 0 || a >= treeN || b >= treeN
      ? 0
      : tile.groundHeights[
          Math.floor((a * DISTANT_TREE_STEP) / DISTANT_STEP) * n +
            Math.floor((b * DISTANT_TREE_STEP) / DISTANT_STEP)
        ];
  const blocked = (a, b, y) => !!treeAt(a, b, y) || groundAt(a, b) >= y + 1;
  const treeStart = DISTANT_INSET / DISTANT_TREE_STEP;
  for (let a = treeStart; a < treeWidth + treeStart; a++)
    for (let b = treeStart; b < treeWidth + treeStart; b++)
      for (let y = 0; y < treeH; y++) {
        const id = treeAt(a, b, y);
        if (!id || groundAt(a, b) >= y + 1) continue;
        const q = tile.tq * DISTANT_TILE + a * DISTANT_TREE_STEP + 0.5,
          r = tile.tr * DISTANT_TILE + b * DISTANT_TREE_STEP + 0.5,
          p = axialToWorld(q, r);
        prism(
          p.x - origin.x,
          p.z - origin.z,
          y,
          y + 1,
          DISTANT_TREE_STEP,
          DISTANT_TYPES[id - 1],
          q,
          r,
          (i) => {
            const [dq, dr] = DIRECTIONS[i];
            return blocked(a + dq, b + dr, y) ? y + 1 : y;
          },
          !blocked(a, b, y + 1),
          !blocked(a, b, y - 1),
        );
      }
  const geometry = new BufferGeometry(),
    count = positions.length / 3;
  geometry.setIndex(indices);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new Int8BufferAttribute(
      normals.map((v) => Math.round(v * 127)),
      3,
      true,
    ),
  );
  geometry.setAttribute(
    'color',
    new Uint8BufferAttribute(
      colors.map((v) => Math.round(v * 255)),
      3,
      true,
    ),
  );
  geometry.setAttribute(
    'uv',
    new Uint16BufferAttribute(
      uv.map((v) => Math.round(v * 65535)),
      2,
      true,
    ),
  );
  geometry.setAttribute('biomeTint', new Uint8BufferAttribute(biomes, 4, true));
  geometry.setAttribute(
    'surfaceOptics',
    new Uint8BufferAttribute(optics, 1, false),
  );
  geometry.setAttribute(
    'ambientOcclusion',
    new Uint8BufferAttribute(new Uint8Array(count).fill(255), 1, true),
  );
  geometry.setAttribute(
    'skylight',
    new Uint8BufferAttribute(new Uint8Array(count).fill(255), 1, true),
  );
  geometry.setAttribute(
    'blocklight',
    new Uint8BufferAttribute(new Uint8Array(count * 3), 3, true),
  );
  geometry.setAttribute(
    'rainExposure',
    new Uint8BufferAttribute(new Uint8Array(count).fill(255), 1, true),
  );
  geometry.setAttribute(
    'surfacePorosity',
    new Uint8BufferAttribute(new Uint8Array(count).fill(128), 1, true),
  );
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.position.set(origin.x, 0, origin.z);
  mesh.raycast = () => {};
  mesh.userData.distantTerrain = true;
  return mesh;
}
