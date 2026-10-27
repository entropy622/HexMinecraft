// Inventory, mob bows and projectiles share the same ammunition identity.
export const ARROW_ITEMS = {
  arrow: { name: '箭矢', color: '#c5b48a' },
  slownessArrow: {
    name: '缓慢之箭',
    color: '#8698ab',
    effect: { id: 'slowness', time: 30 },
  },
};
