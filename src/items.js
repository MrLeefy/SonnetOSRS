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
  trout: { id: 'trout', name: 'Cooked trout', kind: 'food', heal: 16, price: 16, sell: 7, desc: 'Heals 16. Catch and cook your own.' },
  rawfish: { id: 'rawfish', name: 'Raw trout', kind: 'res', price: 8, sell: 3, desc: 'Cook it on the campfire in town.' },
  logs: { id: 'logs', name: 'Logs', kind: 'res', price: 14, sell: 6, desc: 'Timber. The Merchant buys it.' },
  ore: { id: 'ore', name: 'Iron ore', kind: 'res', price: 30, sell: 14, desc: 'Raw ore. The Merchant buys it.' },
  tonic: { id: 'tonic', name: 'Focus tonic', kind: 'tonic', focus: 40, price: 30, desc: 'Restores 40 focus.' },
  herbs: { id: 'herbs', name: 'Woodland herbs', kind: 'res', price: 12, sell: 5, desc: 'Gathered while chopping trees. Used in Herblore.' },
  bolts: { id: 'bolts', name: 'Reinforced bolts', kind: 'res', price: 5, sell: 2, desc: 'One is consumed per Crossbow attack for +12% damage. Fletch at the Smith.' },
  salve: { id: 'salve', name: 'Herbal salve', kind: 'food', heal: 30, price: 75, sell: 30, desc: 'Heals 30. Mix trout and woodland herbs at the Market.' }
};
for (const slot in SLOTS) TIERS.forEach((t, i) => {
  const s = SLOTS[slot], id = slot + i;
  ITEMS[id] = { id, slot, tier: i, kind: s.kind, style: s.style, name: `${t.n} ${s.base}`, price: Math.round(t.price * (s.kind === 'armour' ? 0.8 : 1)),
    desc: s.kind === 'weapon' ? `+${Math.round(i * 13)}% ${s.style} damage, +${i * 2}% accuracy.` : `-${i * 6}% damage taken in ${s.style} stance.` };
});
export const INV_SIZE = 20;
export const weaponMul = t => 1 + 0.13 * t, weaponAcc = t => 0.02 * t, armourCut = t => 0.06 * t;
export const SMITH_STOCK = Object.keys(ITEMS).filter(id => ITEMS[id].tier > 0), MARKET_STOCK = ['bread', 'roast', 'tonic'];
export const sellPrice = id => ITEMS[id].sell || Math.max(1, Math.floor(ITEMS[id].price * 0.4));

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
  return { v: 2, eq: { blade: 'blade0', bow: 'bow0', staff: 'staff0', plate: 'plate0', leather: 'leather0', robe: 'robe0' }, inv, coins: 60, bank: { coins: 0, items: { roast: 4 } }, xp: 0, kills: 0, deaths: 0, best: 0, bossKills: 0, skills: { wood: 0, mine: 0, fish: 0, cook: 0, smith: 0, fletch: 0, herb: 0, melee: 0, ranged: 0, magic: 0, defence: 0 }, count: {}, tasks: {}, quests: {} };
}
export const levelOf = xp => Math.min(50, 1 + Math.floor(Math.sqrt(xp / 90)));
export const xpForLevel = l => (l - 1) * (l - 1) * 90;

/* ---- gathering skills ---- */
export const SKILLS = { wood: { name: 'Woodcutting', verb: 'CHOPPING' }, mine: { name: 'Mining', verb: 'MINING' }, fish: { name: 'Fishing', verb: 'FISHING' }, cook: { name: 'Cooking', verb: 'COOKING' }, smith: { name: 'Smithing', verb: 'FORGING' },
  fletch: { name: 'Fletching', verb: 'FLETCHING' }, herb: { name: 'Herblore', verb: 'MIXING' },
  melee: { name: 'Melee', verb: 'TRAINING' }, ranged: { name: 'Ranged', verb: 'TRAINING' },
  magic: { name: 'Magic', verb: 'TRAINING' }, defence: { name: 'Defence', verb: 'TRAINING' } };
export const FORGE = [null, { ore: 6, logs: 2, lvl: 1 }, { ore: 18, logs: 6, lvl: 5 }, { ore: 45, logs: 15, lvl: 12 }, { ore: 110, logs: 35, lvl: 20 }];
export const NODE = { tree: { skill: 'wood', item: 'logs', xp: 25, cap: [3, 6], regrow: 45, name: 'Tree' }, rock: { skill: 'mine', item: 'ore', xp: 35, cap: [2, 4], regrow: 40, name: 'Ore rock' },
  fish: { skill: 'fish', item: 'rawfish', xp: 30, name: 'Fishing spot' }, fire: { skill: 'cook', item: 'trout', xp: 30, name: 'Campfire' } };
export const skillLevel = xp => Math.min(50, 1 + Math.floor(Math.sqrt(xp / 40)));
export const skillXp = l => (l - 1) * (l - 1) * 40;
export const RECIPES = [
  { id: 'bolts', station: 'smith', skill: 'fletch', level: 1, costs: { logs: 2, ore: 1 }, makes: 12, xp: 36 },
  { id: 'salve', station: 'market', skill: 'herb', level: 1, costs: { herbs: 2, trout: 1 }, makes: 1, xp: 55 }
];
/* ---- starter tasks: a guided tour of everything there is to do ---- */
const c = (s, k) => (s.count && s.count[k]) || 0;
export const TASKS = [
  { id: 'fish', t: 'Catch a fish from the shore', r: 20, ok: s => c(s, 'rawfish') >= 1 },
  { id: 'cook', t: 'Cook a trout on the campfire by the tavern', r: 25, ok: s => c(s, 'trout') >= 1 },
  { id: 'bank', t: 'Deposit coins in the vault', r: 30, ok: s => s.bank.coins > 0 },
  { id: 'wood', t: 'Chop 10 logs in the eastern forest', r: 50, ok: s => c(s, 'logs') >= 10 },
  { id: 'ore', t: 'Mine 10 ore at the north-east mine', r: 80, ok: s => c(s, 'ore') >= 10 },
  { id: 'forge', t: 'Forge a piece of gear at the Smith from your own ore', r: 120, ok: s => c(s, 'forged') >= 1 },
  { id: 'undead', t: 'Defeat 5 undead in the Barrow Yard', r: 60, ok: s => c(s, 'undead') >= 5 },
  { id: 'steel', t: 'Wield a Steel (or better) weapon', r: 60, ok: s => ['blade', 'bow', 'staff'].some(k => ITEMS[s.eq[k]].tier >= 1) },
  { id: 'warden', t: 'Defeat the Barrow Warden', r: 250, ok: s => s.bossKills >= 1 },
  { id: 'rival', t: 'Win a fight in the Ashen Wilds', r: 150, ok: s => s.kills >= 1 },
  { id: 'lvl10', t: 'Reach combat level 10', r: 200, ok: s => levelOf(s.xp) >= 10 },
  { id: 'herb', t: 'Find 2 woodland herbs while chopping', r: 30, ok: s => c(s, 'herbs') >= 2 },
  { id: 'fletch', t: 'Fletch a batch of reinforced bolts', r: 45, ok: s => c(s, 'crafted_bolts') >= 1 },
  { id: 'salve', t: 'Mix an herbal salve at the Market', r: 65, ok: s => c(s, 'crafted_salve') >= 1 },
  { id: 'mastery', t: 'Reach level 5 in any combat mastery', r: 100, ok: s => ['melee', 'ranged', 'magic', 'defence'].some(k => skillLevel((s.skills || {})[k] || 0) >= 5) }
];
