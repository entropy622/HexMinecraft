import { HEX_POLYGON } from './cut-blocks.js';

const THICKNESS = 3 / 16;
const RADIUS = 0.55;
const HINGE = (Math.sqrt(3) * RADIUS) / 2 - THICKNESS / 2;

// A fixed hexagonal rim keeps the opening usable at the world's horizontal
// scale. The smaller rigid lid can turn through 90 degrees inside one cell.
export function trapdoorParts(type, planks, state, angle) {
  const height = state.upper ? 1 - THICKNESS / 2 : THICKNESS / 2;
  const inner = HEX_POLYGON.map(([x, z]) => [x * RADIUS, z * RADIUS]);
  const parts = HEX_POLYGON.map((a, i) => ({
    x: 0,
    y: height,
    z: 0,
    h: THICKNESS,
    angle: 0,
    tile: planks,
    polygon: [a, HEX_POLYGON[(i + 1) % 6], inner[(i + 1) % 6], inner[i]],
  }));
  parts.push({
    x: state.open ? Math.sin(angle) * HINGE : 0,
    z: state.open ? Math.cos(angle) * HINGE : 0,
    y: height + (state.open ? (state.upper ? -HINGE : HINGE) : 0),
    h: THICKNESS,
    angle,
    pitch: state.open ? ((state.upper ? -1 : 1) * Math.PI) / 2 : 0,
    tile: type,
    panel: true,
    polygon: inner.map(([x, z]) => [-z, x]),
  });
  return parts;
}
