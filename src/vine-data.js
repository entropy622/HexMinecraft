export const VINE_BLOCKS = {
  vine: {
    name: '藤蔓',
    color: '#79a94d',
    leafTint: '#79a94d',
    hardness: 0.2,
    shape: 'vine',
    nonSolid: true,
  },
};

// Six horizontal attachments and the ceiling; a face points toward support.
export const VINE_UP = 64;
export const vineFaces = (state) => state.faces ?? 1;
