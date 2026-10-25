export const FIRST_END_CITY = { q: 66, r: -16, h: 29 };
export const CITY_BLOCKS = {
  endstoneBricks: { name: '末地石砖', color: '#dbd9ac', hardness: 1.5 },
  purpurPillar: {
    name: '紫珀柱',
    color: '#bc9bbc',
    hardness: 1.3,
    pillar: true,
  },
  endRod: {
    name: '末地烛',
    color: '#efdfed',
    hardness: 0.15,
    shape: 'rod',
    light: '#eee2fa',
  },
};
export const CITY_RECIPES = [
  {
    id: 'endstoneBricks',
    count: 4,
    station: true,
    title: '浮城的墙面',
    desc: '四块末地石换四块浅色末地石砖。',
    pattern: [null, 'endstone', null, 'endstone', 'endstone', 'endstone', null],
    cost: { endstone: 4 },
  },
  {
    id: 'purpurPillar',
    count: 2,
    station: true,
    title: '紫色立柱',
    desc: '两块紫珀制成两根竖纹装饰柱。',
    pattern: [null, 'purpur', null, 'purpur', null, null, null],
    cost: { purpur: 2 },
  },
  {
    id: 'endRod',
    count: 4,
    station: true,
    title: '浮城里的微光',
    desc: '烈焰棒与爆裂紫颂果制成四根末地烛。细小的六棱白光源，也可以手持照明。',
    pattern: [null, 'blazeRod', null, 'poppedChorusFruit', null, null, null],
    cost: { blazeRod: 1, poppedChorusFruit: 1 },
  },
];
