import { worldToAxial } from './core.js';
import { bodyOffsets } from './grounding.js';

// Return actual occupied cells so burning contact can consume the touched snow.
export function powderContact(world, x, feet, z, height, radius = 0.24) {
  const cells = new Map();
  for (const [dx, dz] of bodyOffsets(radius)) {
    const a = worldToAxial(x + dx, z + dz);
    for (
      let y = Math.floor(feet + 0.01);
      y <= Math.floor(feet + height - 0.01);
      y++
    )
      if (world.get(a.q, y, a.r) === 'powderSnow')
        cells.set(`${a.q},${y},${a.r}`, [a.q, y, a.r]);
  }
  return [...cells.values()];
}

// A one-way top surface: boots never turn the interior into a solid wall.
export function powderSupport(world, x, feet, z, previousFeet) {
  if (feet >= previousFeet) return false;
  return bodyOffsets(0.24).some(([dx, dz]) => {
    const a = worldToAxial(x + dx, z + dz),
      y = Math.floor(previousFeet + 0.03) - 1;
    return (
      world.get(a.q, y, a.r) === 'powderSnow' &&
      y + 1 > feet + 0.005 &&
      y + 1 <= previousFeet + 0.03
    );
  });
}
