export const THROWABLES = {
  pearl: {
    speed: 24,
    gravity: 16,
    cooldown: 1,
    color: '#a16cdb',
    hint: '右键投掷 · 落点传送 · 消耗 5 生命',
  },
  egg: {
    speed: 22,
    gravity: 16,
    cooldown: 0.25,
    color: '#eee2bd',
    hint: '右键投掷 · 破碎时有 1/8 几率孵出小鸡',
  },
  snowball: {
    speed: 22,
    gravity: 16,
    cooldown: 0.25,
    color: '#e6f4ff',
    hint: '右键投掷 · 击退生物 · 对烈焰人造成 3 点伤害',
  },
};

export const THROWING_RECIPES = [
  {
    id: 'snowball',
    count: 4,
    title: '捧起一场雪',
    desc: '分解雪块。雪球可以投掷，对烈焰人造成三点伤害。',
    pattern: [null, null, null, 'snow', null, null, null],
    cost: { snow: 1 },
  },
  {
    id: 'snow',
    count: 1,
    title: '把冬天堆起来',
    desc: '四个雪球压成一块雪。用铲子开采雪块也能收回四个雪球。',
    pattern: ['snowball', 'snowball', null, 'snowball', 'snowball', null, null],
    cost: { snowball: 4 },
  },
];
