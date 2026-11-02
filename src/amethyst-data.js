export const AMETHYST_STAGES = [
  'smallAmethystBud',
  'mediumAmethystBud',
  'largeAmethystBud',
  'amethystCluster',
];
export const AMETHYST_HEIGHTS = [3 / 16, 4 / 16, 5 / 16, 7 / 16];
export const AMETHYST_WIDTHS = [8 / 16, 10 / 16, 10 / 16, 10 / 16];
export const isAmethystBud = (type) => AMETHYST_STAGES.includes(type);
export const AMETHYST_BLOCKS = {
  smoothBasalt: {
    name: '平滑玄武岩',
    color: '#77777c',
    side: '#5d5d66',
    hardness: 1.25,
    tool: 1,
  },
  amethystBlock: {
    name: '紫水晶块',
    color: '#b58cd5',
    side: '#8864aa',
    hardness: 1.5,
    tool: 1,
    amethyst: true,
  },
  buddingAmethyst: {
    name: '紫水晶母岩',
    color: '#b88fd6',
    side: '#8263aa',
    hardness: 1.5,
    tool: 1,
    amethyst: true,
  },
  tintedGlass: {
    name: '遮光玻璃',
    color: '#686074',
    side: '#413848',
    hardness: 0.3,
    opacity: 0.38,
    blocksLight: true,
  },
  ...Object.fromEntries(
    AMETHYST_STAGES.map((id, stage) => [
      id,
      {
        name: ['小型紫晶芽', '中型紫晶芽', '大型紫晶芽', '紫水晶簇'][stage],
        color: ['#b193cb', '#b58bdd', '#bb83e7', '#c78deb'][stage],
        side: '#8160ae',
        hardness: 1.5,
        shape: 'amethyst',
        defaultFacing: 6,
        amethyst: true,
        light: '#b390eb',
      },
    ]),
  ),
};
export const AMETHYST_ITEMS = {
  amethystShard: { name: '紫水晶碎片', color: '#b389dc' },
  spyglass: { name: '望远镜', color: '#c58c55', use: true, maxStack: 1 },
};
export const AMETHYST_RECIPES = [
  {
    id: 'amethystBlock',
    count: 1,
    title: '凝结的紫光',
    pattern: [
      'amethystShard',
      'amethystShard',
      null,
      null,
      null,
      'amethystShard',
      'amethystShard',
    ],
    cost: { amethystShard: 4 },
    desc: '四枚紫水晶碎片合成一块紫水晶；母岩只能在晶洞中自然找到。',
  },
  {
    id: 'tintedGlass',
    count: 2,
    title: '看得见的暗室',
    station: true,
    pattern: [
      null,
      'amethystShard',
      'amethystShard',
      'glass',
      'amethystShard',
      'amethystShard',
      null,
    ],
    cost: { amethystShard: 4, glass: 1 },
    desc: '四枚碎片围住一块玻璃，得到两块可透视却遮挡光线的遮光玻璃。',
  },
  {
    id: 'spyglass',
    count: 1,
    title: '把远方拉近',
    station: true,
    pattern: [
      null,
      'amethystShard',
      null,
      'copperIngot',
      null,
      'copperIngot',
      null,
    ],
    cost: { amethystShard: 1, copperIngot: 2 },
    desc: '两枚铜锭与一枚紫水晶碎片制成望远镜；主手或副手按住使用，松开恢复视野。',
  },
];
