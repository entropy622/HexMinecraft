import { BLOCKS } from './core.js';
import { cutBlockParts, cutItemWorld } from './cut-blocks.js';
import { blockTextures, textureURL } from './texture-pack.js';

// Small isometric projections reuse the same cut polygons and licensed tiles
// as the world. SVG remains crisp in slots without a second WebGL renderer.
export function cutBlockIcon(id) {
  const def = BLOCKS[id],
    parts = cutBlockParts(cutItemWorld(id, 1), 0, 0, 0);
  const tiles = blockTextures[def.base],
    faces = [];
  const project = ([x, y, z]) =>
    `${(24 + (x - z) * 12.5).toFixed(2)},${(33 + (x + z) * 5.8 - y * 20).toFixed(2)}`;
  const add = (points, top, shade) =>
    faces.push({
      points,
      top,
      shade,
      depth: points.reduce((n, [x, y, z]) => n + x + y + z, 0) / points.length,
    });
  for (const part of parts) {
    const low = part.y - part.h / 2,
      high = part.y + part.h / 2,
      poly = part.polygon;
    add(
      poly.map(([x, z]) => [x, high, z]),
      true,
      0,
    );
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        nx = b[1] - a[1],
        nz = a[0] - b[0];
      if (nx + nz <= 0.01) continue;
      add(
        [
          [a[0], low, a[1]],
          [b[0], low, b[1]],
          [b[0], high, b[1]],
          [a[0], high, a[1]],
        ],
        false,
        nx > nz ? 0.15 : 0.3,
      );
    }
  }
  const pattern = (name, tile) =>
    `<pattern id="${id}-${name}" width="16" height="16" patternUnits="userSpaceOnUse"><image href="${textureURL(tile)}" width="16" height="16"/></pattern>`;
  return `<span class="block-icon pixel-icon cut-icon" title="${def.name}"><svg viewBox="0 0 48 48" aria-hidden="true"><defs>${pattern('top', tiles[0])}${pattern('side', tiles.at(-1))}</defs>${faces
    .sort((a, b) => a.depth - b.depth)
    .map((f) => {
      const points = f.points.map(project).join(' ');
      return `<polygon points="${points}" fill="url(#${id}-${f.top ? 'top' : 'side'})"/>${f.shade ? `<polygon points="${points}" fill="#000" opacity="${f.shade}"/>` : ''}`;
    })
    .join('')}</svg></span>`;
}
