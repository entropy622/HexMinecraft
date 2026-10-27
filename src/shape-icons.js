import { WEB_STRANDS } from './cobwebs.js';
import { BLOCKS } from './core.js';
import { cutItemWorld } from './cut-blocks.js';
import { buildingParts } from './building-shapes.js';
import { blockTextures, textureURL } from './texture-pack.js';
import { HEX_POLYGON } from './cut-blocks.js';

// Small isometric projections reuse the same cut polygons and licensed tiles
// as the world. SVG remains crisp in slots without a second WebGL renderer.
export function cutBlockIcon(id) {
  if (id === 'cobweb')
    return `<span class="block-icon pixel-icon"><svg viewBox="0 0 48 48" aria-label="蛛网" fill="none" stroke="#dce7de" stroke-width="1.4">${WEB_STRANDS.map((s) => `<polyline points="${s.map(([x, y]) => `${24 + x * 18},${24 + y * 18}`).join(' ')}"/>`).join('')}</svg></span>`;

  const def = BLOCKS[id],
    parts =
      def.portable || def.pillar || !def.shape
        ? [{ y: 0.5, h: 1, polygon: HEX_POLYGON }]
        : buildingParts(cutItemWorld(id, 1), 0, 0, 0);
  const faces = [];
  const project = ([x, y, z]) =>
    `${(24 + (x - z) * 12.5).toFixed(2)},${(33 + (x + z) * 5.8 - y * 20).toFixed(2)}`;
  const add = (points, top, shade, tile) =>
    faces.push({
      points,
      top,
      shade,
      tile,
      depth: points.reduce((n, [x, y, z]) => n + x + y + z, 0) / points.length,
    });
  for (const part of parts) {
    const low = -part.h / 2,
      high = part.h / 2,
      poly = part.polygon || [
        [-part.w / 2, -part.d / 2],
        [part.w / 2, -part.d / 2],
        [part.w / 2, part.d / 2],
        [-part.w / 2, part.d / 2],
      ];
    const tile = part.tile || def.base || id;
    const point = (x, y, z) => {
      const scale = 1 + ((part.topScale ?? 1) - 1) * (y / part.h + 0.5);
      x *= scale;
      z *= scale;
      const pitch = part.pitch || 0,
        angle = part.angle || 0;
      const py = y * Math.cos(pitch) - z * Math.sin(pitch);
      const pz = y * Math.sin(pitch) + z * Math.cos(pitch);
      return [
        x * Math.cos(angle) + pz * Math.sin(angle) + (part.x || 0),
        py + part.y,
        -x * Math.sin(angle) + pz * Math.cos(angle) + (part.z || 0),
      ];
    };
    add(
      poly.map(([x, z]) => point(x, high, z)),
      true,
      0,
      tile,
    );
    for (let i = 0; i < poly.length; i++) {
      const a = point(poly[i][0], 0, poly[i][1]),
        b = point(
          poly[(i + 1) % poly.length][0],
          0,
          poly[(i + 1) % poly.length][1],
        ),
        nx = b[2] - a[2],
        nz = a[0] - b[0];
      if (nx + nz <= 0.01) continue;
      add(
        [
          point(poly[i][0], low, poly[i][1]),
          point(
            poly[(i + 1) % poly.length][0],
            low,
            poly[(i + 1) % poly.length][1],
          ),
          point(
            poly[(i + 1) % poly.length][0],
            high,
            poly[(i + 1) % poly.length][1],
          ),
          point(poly[i][0], high, poly[i][1]),
        ],
        false,
        nx > nz ? 0.15 : 0.3,
        tile,
      );
    }
  }
  const pattern = (name, tile) => {
    const tiles = blockTextures[tile];
    if (!tiles) {
      const surface = BLOCKS[tile] || def;
      const mouth =
        tile === 'dropperMouth'
          ? '<rect x="2" y="4" width="12" height="9" fill="#41494d"/><rect x="3" y="5" width="10" height="7" fill="#161e23"/>'
          : tile === 'dispenserMouth'
            ? '<path d="M2 3h3v2H2zM11 3h3v2h-3z" fill="#3d4548"/><circle cx="8" cy="10" r="4.6" fill="#bec4c2"/><circle cx="8" cy="10" r="3.5" fill="#151d21"/>'
            : '';
      return `<pattern id="${id}-${tile}-${name}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${surface.color}"/><path d="M1 2h4v2H1zM8 5h5v2H8zM3 10h3v3H3zM11 12h4v2h-4z" fill="${surface.side || '#000'}" opacity="${surface.side ? 1 : 0.13}"/>${mouth}</pattern>`;
    }
    const url = textureURL(name === 'top' ? tiles[0] : tiles.at(-1));
    const crop = (y, height, destY, destHeight) =>
      `<svg x="0" y="${destY}" width="16" height="${destHeight}" viewBox="16 ${y} 16 ${height}" preserveAspectRatio="none"><image href="${url}" width="64" height="64"/></svg>`;
    const content = def.portable
      ? name === 'top'
        ? crop(0, 16, 0, 16)
        : crop(16, 12, 0, 8) + crop(44, 8, 8, 8)
      : tile === 'stonecutterSaw'
        ? `<svg width="16" height="16" viewBox="0 0 16 16"><image href="${url}" width="16" height="48"/></svg>`
        : `<image href="${url}" width="16" height="16"/>`;
    return `<pattern id="${id}-${tile}-${name}" width="16" height="16" patternUnits="userSpaceOnUse">${content}</pattern>`;
  };
  const tiles = [...new Set(faces.map((f) => f.tile))];
  return `<span class="block-icon pixel-icon cut-icon" title="${def.name}"><svg viewBox="0 0 48 48" aria-hidden="true"><defs>${tiles.map((tile) => pattern('top', tile) + pattern('side', tile)).join('')}</defs>${faces
    .sort((a, b) => a.depth - b.depth)
    .map((f) => {
      const points = f.points.map(project).join(' ');
      return `<polygon points="${points}" fill="url(#${id}-${f.tile}-${f.top ? 'top' : 'side'})"/>${f.shade ? `<polygon points="${points}" fill="#000" opacity="${f.shade}"/>` : ''}`;
    })
    .join('')}</svg></span>`;
}
