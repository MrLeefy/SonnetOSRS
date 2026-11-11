/* data.js - tuning constants and static tables shared by the sim, AI, renderer and HUD */
export const TICK = 0.6;             // seconds per game tick
export const MAX_HP = 99;
export const STYLE_IDS = ['melee', 'ranged', 'magic'];

export const STYLES = {
  melee:  { name: 'Blade', label: 'Melee',  range: 1, speed: 4, max: 34, color: 0xff7a45 },
  ranged: { name: 'Bow',   label: 'Ranged', range: 7, speed: 4, max: 27, color: 0x7fe07a },
  magic:  { name: 'Staff', label: 'Magic',  range: 7, speed: 5, max: 25, color: 0x6ec8ff, freeze: 6 }
};

/* hit chance: ACC[attack style][defender's stance (the armour they are wearing)] */
export const ACC = {
  melee:  { melee: 0.55, ranged: 0.70, magic: 0.85 },
  ranged: { melee: 0.45, ranged: 0.60, magic: 0.85 },
  magic:  { melee: 0.85, ranged: 0.40, magic: 0.60 }
};

export const SPECIALS = {
  melee:  { name: 'Twin Fang', cost: 50, desc: 'Two rapid, accurate strikes.' },
  ranged: { name: 'Deadeye',   cost: 50, desc: 'Never misses and punches through wards.' },
  magic:  { name: 'Frostbind', cost: 50, desc: 'Heavy blast that roots everything near the target.' }
};

export const WARD_REDUCE = 0.6;      // damage removed when the right ward is up at impact
export const DEADEYE_WARD_REDUCE = 0.25;
export const FOOD_HEAL = 18, FOOD_MAX = 16, FOOD_START = 10;
export const TONIC_FOCUS = 40, TONIC_MAX = 5, TONIC_START = 3;
export const EAT_DELAY = 3;

export const DIFFICULTY = {
  easy:   { label: 'Easy',   bots: 4, dmg: 0.7,  skill: 0.3,  gank: 1 },
  normal: { label: 'Normal', bots: 6, dmg: 0.85, skill: 0.5,  gank: 2 },
  hard:   { label: 'Hard',   bots: 8, dmg: 1.0,  skill: 0.72, gank: 3 }
};

/* bot archetypes: which stances they are willing to fight in */
export const ARCHETYPES = {
  brute:   { title: 'Brute',   stances: ['melee'],                    w: 3 },
  stalker: { title: 'Stalker', stances: ['ranged', 'melee'],          w: 3 },
  hexer:   { title: 'Hexer',   stances: ['magic'],                    w: 2 },
  warden:  { title: 'Warden',  stances: ['melee', 'ranged', 'magic'], w: 3 }
};

export const BOT_NAMES = ['Varn', 'Ossa', 'Kethrin', 'Mordu', 'Islet', 'Brannoch', 'Sable', 'Thune', 'Wick', 'Garrow', 'Nyx', 'Dregan',
  'Pell', 'Rook', 'Ashka', 'Fenn', 'Halvard', 'Ione', 'Jorrik', 'Lume', 'Marrow', 'Quill', 'Riven', 'Skarn', 'Tovin', 'Ulla', 'Vesper', 'Yarrow'];

export const SKIN = [0xe8b088, 0xd49a70, 0xb87a52, 0x94603c, 0xf0c8a0, 0x6e4628];
export const HAIR = [0x2a1a0e, 0x6b4a20, 0xc8a040, 0x151515, 0x9a3a1a, 0xdcdcdc, 0x7a4a8a];
export const TEAM = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd4a017, 0x8e44ad, 0x16a085, 0xd35400, 0x7f8c8d, 0xc2185b, 0x5d6d7e];

export function rint(n) { return Math.floor(Math.random() * n); }
export function pick(a) { return a[rint(a.length)]; }
export function chance(p) { return Math.random() < p; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
