/* items.js - gear tiers, consumables and inventory helpers */
export const TIERS = [
  { n: 'Iron', c: 0x8f98a3, css: '#9aa3ad', price: 0 }, { n: 'Steel', c: 0xdde8f6, css: '#cfe0f5', price: 150 }, { n: 'Gilded', c: 0xf3c84a, css: '#f0c64a', price: 600 },
  { n: 'Ember', c: 0xff6a3a, css: '#ff7a4a', price: 1800 }, { n: 'Voidglass', c: 0xa878ff, css: '#b48cff', price: 5000 }
];
export const SLOTS = {
  blade: { base: 'Blade', style: 'melee', kind: 'weapon' }, bow: { base: 'Crossbow', style: 'ranged', kind: 'weapon' }, staff: { base: 'Staff', style: 'magic', kind: 'weapon' },
  plate: { base: 'Plate', style: 'melee', kind: 'armour' }, leather: { base: 'Leathers', style: 'ranged', kind: 'armour' }, robe: { base: 'Robes', style: 'magic', kind: 'armour' }
};
export const WEAPON_SLOT = { melee: 'blade', ranged: 'bow', magic: 'staff' }, ARMOUR_SLOT = { melee: 'plate', ranged: 'leather', magic: 'robe' };
export const ITEMS = {
  bread: { id: 'bread', name: 'Bread', kind: 'food', heal: 12, price: 8, desc: 'Heals 12.' },
  roast: { id: 'roast', name: 'Roast', kind: 'food', heal: 22, price: 22, desc: 'Heals 22.' },
  tonic: { id: 'tonic', name: 'Focus tonic', kind: 'tonic', focus: 40, price: 30, desc: 'Restores 40 focus.' }
};
for (const slot in SLOTS) TIERS.forEach((t, i) => {
  const s = SLOTS[slot], id = slot + i;
  ITEMS[id] = { id, slot, tier: i, kind: s.kind, style: s.style, name: `${t.n} ${s.base}`, price: Math.round(t.price * (s.kind === 'armour' ? 0.8 : 1)),
    desc: s.kind === 'weapon' ? `+${Math.round(i * 13)}% ${s.style} damage, +${i * 2}% accuracy.` : `-${i * 6}% damage taken in ${s.style} stance.` };
});
export const INV_SIZE = 20;
export const weaponMul = t => 1 + 0.13 * t, weaponAcc = t => 0.02 * t, armourCut = t => 0.06 * t;
export const SMITH_STOCK = Object.keys(ITEMS).filter(id => ITEMS[id].tier > 0), MARKET_STOCK = ['bread', 'roast', 'tonic'];
export const sellPrice = id => Math.max(1, Math.floor(ITEMS[id].price * 0.4));

export function countItem(inv, id) { let n = 0; for (const s of inv) if (s && s.id === id) n += s.n; return n; }
export function addItem(inv, id, n = 1) {
  let s = inv.find(s => s && s.id === id); if (s) { s.n += n; return true; }
  const i = inv.indexOf(null); if (i < 0) return false; inv[i] = { id, n }; return true;
}
export function takeItem(inv, id, n = 1) {
  for (let i = 0; i < inv.length; i++) { const s = inv[i]; if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) inv[i] = null; if (n <= 0) return true; } }
  return n <= 0;
}
export function newSave() {
  const inv = new Array(INV_SIZE).fill(null); addItem(inv, 'bread', 8); addItem(inv, 'tonic', 2);
  return { v: 2, eq: { blade: 'blade0', bow: 'bow0', staff: 'staff0', plate: 'plate0', leather: 'leather0', robe: 'robe0' }, inv, coins: 60, bank: { coins: 0, items: { roast: 4 } }, xp: 0, kills: 0, deaths: 0, best: 0, bossKills: 0 };
}
export const levelOf = xp => Math.min(50, 1 + Math.floor(Math.sqrt(xp / 90)));
export const xpForLevel = l => (l - 1) * (l - 1) * 90;
