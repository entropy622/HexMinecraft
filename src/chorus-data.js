export const CHORUS_BLOCKS = {
  chorusPlant: {
    name: '紫颂枝干',
    color: '#76547e',
    hardness: 0.4,
    shape: 'chorus',
    internal: true,
  },
  chorusFlower: {
    name: '紫颂花',
    color: '#d8accf',
    hardness: 0.4,
    shape: 'chorusFlower',
  },
  chorusFlowerDead: {
    name: '成熟紫颂花',
    color: '#b38f9e',
    hardness: 0.4,
    shape: 'chorusFlower',
    internal: true,
  },
};
export const CHORUS_ITEMS = {
  chorusFruit: { name: '紫颂果', color: '#b995bd', use: true },
  poppedChorusFruit: { name: '爆裂紫颂果', color: '#d1b4c7' },
};
export const CHORUS_RECIPES = [
  {
    id: 'purpur',
    count: 4,
    station: true,
    title: '从果实到浮城',
    desc: '四个爆裂紫颂果制作四块紫珀。先把紫颂果放进熔炉烧炼。',
    pattern: [
      null,
      'poppedChorusFruit',
      null,
      'poppedChorusFruit',
      'poppedChorusFruit',
      'poppedChorusFruit',
      null,
    ],
    cost: { poppedChorusFruit: 4 },
  },
];
export const isChorus = (type) =>
  ['chorusPlant', 'chorusFlower', 'chorusFlowerDead'].includes(type);
export const isChorusFlower = (type) =>
  type === 'chorusFlower' || type === 'chorusFlowerDead';
