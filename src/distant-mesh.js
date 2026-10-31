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
import { decodeDetail, detailMetadata } from './distant-detail.js';
import { pillarFace } from './pillar-faces.js';
import { isGlass } from './dye-data.js';
import {
  DISTANT_TILE,
  DISTANT_STEP,
  DISTANT_SAMPLES,
  DISTANT_DETAIL_STEP,
  DISTANT_DETAIL_SAMPLES,
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
    transparentIndices = [],
    origin = axialToWorld(
      tile.tq * DISTANT_TILE + 1.5,
      tile.tr * DISTANT_TILE + 1.5,
    );
  function polygon(points, normal, type, face, q, r, coords) {
    if (face === 'bottom') {
      if (type === 'grass') type = 'dirt';
      face = 'top';
    }
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
      colors.push(shade, shade, shade, isGlass(id) ? BLOCKS[id].opacity : 1);
      uv.push(...textures.uv(name, ...coords[i]));
      biomes.push(tint[0], tint[1], tint[2], tint[3]);
      optics.push(category);
    });
    const target = isGlass(id) ? transparentIndices : indices;
    for (let i = 1; i < points.length - 1; i++)
      target.push(start, start + i, start + i + 1);
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
    state = null,
    sideSpans = null,
  ) {
    if (top <= bottom) return;
    const point = (i, y) => [
        x + corners[i][0] * radius,
        y,
        z + corners[i][1] * radius,
      ],
      cap = (i) => [(corners[i][0] + 1) / 2, (corners[i][1] + 1) / 2],
      forward = [0, 1, 2, 3, 4, 5],
      reverse = [5, 4, 3, 2, 1, 0];
    const draw = (points, normal, face, coords, side) => {
      if (state?.axis) {
        const mapped = pillarFace(
          state.axis,
          side,
          points.map((p) => [
            (p[0] - x) / radius,
            p[1] - Math.floor(bottom),
            (p[2] - z) / radius,
          ]),
        );
        face = mapped.face;
        coords = mapped.uv;
      }
      polygon(points, normal, type, face, q, r, coords);
    };
    if (topFace)
      draw(
        reverse.map((i) => point(i, top)),
        [0, 1, 0],
        'top',
        reverse.map(cap),
        -1,
      );
    if (bottomFace)
      draw(
        forward.map((i) => point(i, bottom)),
        [0, -1, 0],
        'bottom',
        forward.map(cap),
        -2,
      );
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6,
        spans = sideSpans
          ? sideSpans(i)
          : [[neighbor ? Math.max(bottom, neighbor(i)) : bottom, top]];
      for (const [low, high] of spans) {
        if (high <= low) continue;
        const angle = (i * Math.PI) / 3,
          v0 = state ? low - Math.floor(bottom) : 0,
          v1 = state ? high - Math.floor(bottom) : 1;
        draw(
          [point(i, low), point(i, high), point(j, high), point(j, low)],
          [Math.cos(angle), 0, Math.sin(angle)],
          'side',
          [
            [0, v0],
            [0, v1],
            [1, v1],
            [1, v0],
          ],
          i,
        );
      }
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
  const detailN = DISTANT_DETAIL_SAMPLES,
    detailH = tile.detailHeight,
    extent = DISTANT_SAMPLES * DISTANT_STEP,
    metadata = detailMetadata(tile),
    full = { bottom: 0, top: 1, axis: 0 },
    empty = { id: 0, state: null },
    epsilon = 1 / 127,
    fine = new Map();
  for (let i = 0; i < (tile.fineDetails?.length || 0); i += 2) {
    const value = tile.fineDetails[i + 1];
    fine.set(tile.fineDetails[i], {
      id: value >>> 16,
      state: decodeDetail(value & 65535),
    });
  }
  const groundAt = (x, z) =>
    x < 0 || z < 0 || x >= extent || z >= extent
      ? 0
      : tile.groundHeights[
          Math.floor(x / DISTANT_STEP) * n + Math.floor(z / DISTANT_STEP)
        ];
  const coarseAt = (a, b, y) => {
    if (a < 0 || b < 0 || a >= detailN || b >= detailN || y < 0 || y >= detailH)
      return empty;
    const index = (a * detailN + b) * detailH + y,
      id = tile.details[index];
    return id ? { id, state: metadata.get(index) || full } : empty;
  };
  const fineAt = (x, z, y) => {
    if (x < 0 || z < 0 || x >= extent || z >= extent || y < 0 || y >= detailH)
      return empty;
    return (
      fine.get((x * extent + z) * detailH + y) ||
      coarseAt(
        Math.floor(x / DISTANT_DETAIL_STEP),
        Math.floor(z / DISTANT_DETAIL_STEP),
        y,
      )
    );
  };
  const occludes = (id, other) => {
    if (!other) return false;
    const name = DISTANT_TYPES[other - 1];
    if (isGlass(name) || name.startsWith('@') || BLOCKS[name]?.foliage)
      return id === other;
    return true;
  };
  function drawCell(x, z, y, cell, step, at) {
    const { id, state } = cell,
      ground = groundAt(x, z),
      bottom = Math.max(y + state.bottom, ground),
      top = y + state.top;
    if (top <= bottom + epsilon) return;
    const q = tile.tq * DISTANT_TILE + x + (step - 1) * 0.5,
      r = tile.tr * DISTANT_TILE + z + (step - 1) * 0.5,
      p = axialToWorld(q, r),
      above = at(0, 0, 1),
      below = at(0, 0, -1),
      topFace =
        state.top < 1 - epsilon ||
        !occludes(id, above.id) ||
        above.state.bottom > epsilon,
      bottomFace =
        ground < bottom - epsilon &&
        (state.bottom > epsilon ||
          !occludes(id, below.id) ||
          below.state.top < 1 - epsilon);
    prism(
      p.x - origin.x,
      p.z - origin.z,
      bottom,
      top,
      step,
      DISTANT_TYPES[id - 1],
      q,
      r,
      null,
      topFace,
      bottomFace,
      state,
      (i) => {
        const [dq, dr] = DIRECTIONS[i],
          low = Math.max(bottom, groundAt(x + dq * step, z + dr * step));
        if (low >= top) return [];
        const other = at(dq, dr, 0);
        if (!occludes(id, other.id)) return [[low, top]];
        const start = y + other.state.bottom,
          end = y + other.state.top,
          result = [];
        if (start > low) result.push([low, Math.min(top, start)]);
        if (end < top) result.push([Math.max(low, end), top]);
        return result;
      },
    );
  }
  const start = DISTANT_INSET / DISTANT_DETAIL_STEP,
    end = start + DISTANT_TILE / DISTANT_DETAIL_STEP;
  for (let a = start; a < end; a++)
    for (let b = start; b < end; b++)
      for (let y = 0; y < detailH; y++) {
        const cell = coarseAt(a, b, y);
        if (!cell.id) continue;
        drawCell(
          a * DISTANT_DETAIL_STEP,
          b * DISTANT_DETAIL_STEP,
          y,
          cell,
          DISTANT_DETAIL_STEP,
          (dq, dr, dy) => coarseAt(a + dq, b + dr, y + dy),
        );
      }
  for (const [index, cell] of fine) {
    const y = index % detailH,
      column = Math.floor(index / detailH),
      x = Math.floor(column / extent),
      z = column % extent;
    if (
      x < DISTANT_INSET ||
      z < DISTANT_INSET ||
      x >= DISTANT_INSET + DISTANT_TILE ||
      z >= DISTANT_INSET + DISTANT_TILE
    )
      continue;
    drawCell(x, z, y, cell, 1, (dq, dr, dy) => fineAt(x + dq, z + dr, y + dy));
  }
  const geometry = new BufferGeometry(),
    count = positions.length / 3;
  geometry.setIndex(indices.concat(transparentIndices));
  if (indices.length) geometry.addGroup(0, indices.length, 0);
  if (transparentIndices.length)
    geometry.addGroup(indices.length, transparentIndices.length, 1);
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
      4,
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
