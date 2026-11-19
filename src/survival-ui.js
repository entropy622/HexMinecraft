import { avatarPortrait } from './avatar-portrait.js';
import { inventorySlot } from './inventory-ui.js';
const empty = ['头盔', '胸甲', '护腿', '靴子', '副手'];
const outline = [
  'M2 7V3l2-2h5l2 2v4H9V5H4v2z',
  'M3 1l2 1h2l2-1 3 3-2 2-1-1v6H3V5L2 6 0 4z',
  'M2 1h8v10H7V6H5v5H2z',
  'M2 5h3v6H0V9h2zm5 0h3v4h2v2H7z',
  'M2 1h8v6l-4 4-4-4z',
];
export function equipmentPreview(pack) {
  const g = pack.gear;
  const slot = (i) =>
    inventorySlot(g[i], 'gear:' + i, empty[i]).replace(
      '<span class="slot-ghost">' + empty[i] + '</span>',
      '<svg class="gear-ghost" aria-hidden="true" viewBox="0 0 12 12"><path fill="#707070" d="' +
        outline[i] +
        '"/></svg>',
    );
  return `<div class="armor-column">${[0, 1, 2, 3].map(slot).join('')}</div><div class="portrait"><img src="${avatarPortrait(g)}" alt="当前角色与装备"></div><div class="offhand-slot">${slot(4)}</div>`;
}
const silhouettes = {
  heart: 'M1 1h3v1h1V1h3v1h1v3H8v1H7v1H6v1H5v1H4V8H3V7H2V6H1V5H0V2h1z',
  armor: 'M2 1h1v2h3V1h1l2 2v2H8v3H1V5H0V3z',
  food: 'M5 0h3v1h1v4H8v1H6v1H4V6H3v2H2v1H0V7h1V6h1V4h1V2h1V1h1z',
};
const inks = { heart: '#f34642', armor: '#c4d2df', food: '#c97a45' };
export function meterIcons(el, kind, value, label) {
  const n = Math.ceil(Math.max(0, Math.min(value, 20)));
  if (el.dataset.points === String(n)) return;
  el.dataset.points = n;
  el.setAttribute('aria-label', label + ' ' + n + ' / 20');
  el.setAttribute('role', 'img');
  el.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const p = Math.min(2, Math.max(0, n - i * 2));
    return `<svg viewBox="-1 -1 11 11" aria-hidden="true" shape-rendering="crispEdges"><path d="${silhouettes[kind]}" fill="#473e39" stroke="#1d191a" stroke-width="1.5"/>${p ? `<svg width="${p === 1 ? 4.5 : 9}" height="9" overflow="hidden"><path d="${silhouettes[kind]}" fill="${inks[kind]}"/><path d="M2 2h2v1H2z" fill="#fff9"/></svg>` : ''}</svg>`;
  }).join('');
}
