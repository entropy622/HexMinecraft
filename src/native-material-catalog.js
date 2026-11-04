import { BLOCKS } from './core.js';
import { isGlass } from './dye-data.js';

const authored = {
  mineral: ['dripstoneBlock', 'pointedDripstone', 'netherQuartzOre'],
  wood: [
    'crimsonwood',
    'jungleWood',
    'strippedJungleWood',
    'junglePlanks',
    'chest',
  ],
  textile: ['bed'],
  moss: ['mossBlock'],
  crystal: ['crystal'],
  light: ['lantern', 'glowBerry', 'sporeCenter'],
  plant: ['tuft', 'flower'],
  electronics: [
    'piston',
    'stickyPiston',
    'pistonHead',
    'stickyPistonHead',
    'pistonRod',
    'observer',
    'observerFace',
    'observerOutput',
    'observerOutputOn',
    'dispenser',
    'dispenserMouth',
    'dropper',
    'dropperMouth',
    'comparator',
    'repeater',
    'redstoneWire',
    'redstoneWireOn',
    'redstoneTorch',
    'redstoneLamp',
    'redstoneLampOn',
    'lever',
  ],
  iron: ['cauldron', 'hopper'],
  web: ['cobweb'],
};
const families = new Map(
  Object.entries(authored).flatMap(([family, ids]) =>
    ids.map((id) => [id, family]),
  ),
);
const optical = new Set(['portal', 'endportal', 'endGateway', 'water', 'lava']);

// The route is used by the real atlas painter; adding an unclassified block
// fails during atlas creation instead of quietly retaining random base noise.
export function nativeTextureRoute(id, sources) {
  const def = BLOCKS[id];
  if (sources[id]) return { kind: 'image', images: sources[id] };
  if (def?.tile) return { kind: 'alias', tile: def.tile };
  if (def?.cauldronLiquid) return { kind: 'alias', tile: 'cauldron' };
  if (def?.base) return { kind: 'alias', tile: def.base };
  if (id === 'cocoa') return { kind: 'alias', tile: 'cocoa2' };
  if (id === 'powderSnow') return { kind: 'generated', family: 'powder-snow' };
  if (id === 'stoneButton' || id === 'stonePressurePlate')
    return { kind: 'alias', tile: 'stone' };
  if (isGlass(id)) return { kind: 'optical', family: 'glass' };
  if (optical.has(id)) return { kind: 'optical', family: 'portal-or-fluid' };
  if (def?.amethyst) return { kind: 'generated', family: 'crystal' };
  if (def?.foliage) return { kind: 'generated', family: 'foliage' };
  if (def?.planks) return { kind: 'generated', family: 'joinery' };
  if (def?.shape === 'flower' || id === 'cactus')
    return { kind: 'generated', family: 'pigment-plant' };
  if (['vine', 'caveVines', 'sporeBlossom'].includes(def?.shape))
    return { kind: 'generated', family: def.shape };
  if (/^cocoa[0-2]$/.test(id)) return { kind: 'generated', family: 'cocoa' };
  return families.has(id)
    ? { kind: 'generated', family: families.get(id) }
    : null;
}

export function nativeMaterialCoverage(sources) {
  return Object.entries(BLOCKS).map(([id, def]) => ({
    id,
    name: def.name,
    route: nativeTextureRoute(id, sources),
  }));
}
