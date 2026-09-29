'use strict';
/* ==========================================================================
   items.js  -  item database (2007 PvP gear) + procedural inventory icons
   bonus[]: 0 aStab 1 aSlash 2 aCrush 3 aMagic 4 aRange | 5 dStab 6 dSlash 7 dCrush 8 dMagic 9 dRange | 10 str 11 rangedStr 12 magicDmg% 13 prayer
   ========================================================================== */
const SLOTS = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];
const STYLES = {
  whip: [{ n: 'Flick', t: 'slash', b: 'acc' }, { n: 'Lash', t: 'slash', b: 'ctl' }, { n: 'Deflect', t: 'slash', b: 'def' }],
  scim: [{ n: 'Chop', t: 'slash', b: 'acc' }, { n: 'Slash', t: 'slash', b: 'agg' }, { n: 'Lunge', t: 'stab', b: 'ctl' }, { n: 'Block', t: 'slash', b: 'def' }],
  dagger: [{ n: 'Stab', t: 'stab', b: 'acc' }, { n: 'Lunge', t: 'stab', b: 'agg' }, { n: 'Slash', t: 'slash', b: 'agg' }, { n: 'Block', t: 'stab', b: 'def' }],
  sword2h: [{ n: 'Chop', t: 'slash', b: 'acc' }, { n: 'Slash', t: 'slash', b: 'agg' }, { n: 'Smash', t: 'crush', b: 'agg' }, { n: 'Block', t: 'slash', b: 'def' }],
  maul: [{ n: 'Pound', t: 'crush', b: 'acc' }, { n: 'Pummel', t: 'crush', b: 'agg' }, { n: 'Block', t: 'crush', b: 'def' }],
  ranged: [{ n: 'Accurate', t: 'ranged', b: 'acc' }, { n: 'Rapid', t: 'ranged', b: 'rapid' }, { n: 'Longrange', t: 'ranged', b: 'long' }],
  staff: [{ n: 'Bash', t: 'crush', b: 'acc' }, { n: 'Pound', t: 'crush', b: 'agg' }, { n: 'Focus', t: 'crush', b: 'def' }],
  unarmed: [{ n: 'Punch', t: 'crush', b: 'acc' }, { n: 'Kick', t: 'crush', b: 'agg' }, { n: 'Block', t: 'crush', b: 'def' }]
};
const ITEMS = {};
const ICON_FN = {};
const Z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function bon(o) { const b = Z.slice(); for (const k in o) b[k] = o[k]; return b; }
const [A_STAB, A_SLASH, A_CRUSH, A_MAGIC, A_RANGE, D_STAB, D_SLASH, D_CRUSH, D_MAGIC, D_RANGE, B_STR, B_RSTR, B_MDMG, B_PRAY] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function def(id, o, icon) { o.id = id; ITEMS[id] = o; ICON_FN[id] = icon; return o; }

/* ---------- palette ---------- */
const P = { steel: 0xb9bdc4, steelD: 0x80858e, rune: 0x4aa9be, runeD: 0x2c7388, gold: 0xe2b930, goldD: 0xa27a18, wood: 0x8a5a2b, woodD: 0x5c3a19, leather: 0x7a4f26, red: 0xc03020, redD: 0x7a1a12, dragon: 0xb8261a, blue: 0x3a64c8, green: 0x3ea03a, black: 0x26262c, white: 0xecebe4, gray: 0x8a8a84, mystic: 0x9fb8e8 };

/* ---------- weapons ---------- */
def('whip', { name: 'Abyssal whip', ex: 'A weapon from the abyss.', slot: 'weapon', bonus: bon({ [A_SLASH]: 82, [B_STR]: 82 }), speed: 4, range: 1, cat: 'whip', catName: 'Whip', model: 'whip', val: 120000 }, p => {
  p.line(4, 28, 9, 23, 0x7b3f14, 4); p.line(8, 24, 11, 21, P.gold, 3);
  const pts = [[11, 21], [14, 20], [17, 19], [19, 16], [20, 12], [23, 9], [26, 8], [28, 10], [28, 13]];
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xe6d23a, 3);
});
def('dds', { name: 'Dragon dagger(p++)', ex: 'A very sharp dagger.', slot: 'weapon', bonus: bon({ [A_STAB]: 40, [A_SLASH]: 25, [A_CRUSH]: -4, [A_MAGIC]: 1, [B_STR]: 40 }), speed: 4, range: 1, cat: 'dagger', catName: 'Stab Sword', model: 'dagger', val: 40000, spec: { cost: 25, name: 'Puncture', hits: 2, acc: 1.25, dmg: 1.15 } }, p => {
  p.line(11, 21, 26, 6, 0xa8bdb2, 3); p.line(12, 22, 25, 9, 0xd6e6de, 1);
  p.line(8, 20, 14, 26, P.gold, 3); p.line(4, 29, 9, 24, P.woodD, 3);
});
def('dscim', { name: 'Dragon scimitar', ex: 'A vicious, curved sword.', slot: 'weapon', bonus: bon({ [A_STAB]: 8, [A_SLASH]: 67, [A_CRUSH]: -2, [B_STR]: 66 }), speed: 4, range: 1, cat: 'scim', catName: 'Slash Sword', model: 'scim', val: 100000, spec: { cost: 55, name: 'Sever', acc: 1.0, dmg: 1.0, sever: true } }, p => {
  p.poly([[9, 24], [8, 16], [12, 10], [18, 6], [26, 5], [23, 9], [18, 13], [15, 19], [13, 25]], 0xc9d3e0);
  p.line(9, 26, 15, 20, P.gold, 3); p.line(4, 29, 9, 24, P.dragon, 3);
});
def('rscim', { name: 'Rune scimitar', ex: 'A vicious, curved sword.', slot: 'weapon', bonus: bon({ [A_STAB]: 7, [A_SLASH]: 45, [A_CRUSH]: -2, [B_STR]: 44 }), speed: 4, range: 1, cat: 'scim', catName: 'Slash Sword', model: 'scim', val: 15000 }, p => {
  p.poly([[9, 24], [8, 16], [12, 10], [18, 6], [26, 5], [23, 9], [18, 13], [15, 19], [13, 25]], P.rune);
  p.line(9, 26, 15, 20, P.steelD, 3); p.line(4, 29, 9, 24, P.woodD, 3);
});
def('gmaul', { name: 'Granite maul', ex: 'Simplicity is the best weapon.', slot: 'weapon', bonus: bon({ [A_STAB]: -4, [A_SLASH]: -4, [A_CRUSH]: 81, [B_STR]: 79 }), speed: 7, range: 1, cat: 'maul', catName: 'Blunt', model: 'maul', val: 55000, spec: { cost: 50, name: 'Quick smash', instant: true } }, p => {
  p.rect(7, 4, 18, 11, 0x8c8c86); p.rect(7, 4, 18, 3, 0xa4a49c); p.rect(9, 9, 14, 2, 0x6a6a64);
  p.line(16, 15, 11, 28, P.woodD, 3); p.line(15, 16, 10, 28, P.leather, 1);
});
def('ags', { name: 'Armadyl godsword', ex: 'A godsword.', slot: 'weapon', two: true, bonus: bon({ [A_STAB]: 80, [A_SLASH]: 132, [A_CRUSH]: 80, [B_STR]: 132 }), speed: 6, range: 1, cat: 'sword2h', catName: '2h Sword', model: 'ags', val: 8000000, spec: { cost: 50, name: 'The Judgement', acc: 2.0, dmg: 1.1 } }, p => {
  p.poly([[7, 25], [22, 4], [27, 5], [28, 9], [11, 26]], 0xd7dce6); p.line(11, 23, 24, 7, 0xf4f6fa, 1);
  p.line(6, 22, 14, 29, P.gold, 4); p.line(3, 30, 8, 25, P.woodD, 3);
});
def('rcb', { name: 'Rune crossbow', ex: 'A crossbow made of rune.', slot: 'weapon', bonus: bon({ [A_RANGE]: 90 }), speed: 6, range: 8, cat: 'ranged', catName: 'Crossbow', model: 'xbow', ranged: true, ammo: 'bolt', val: 30000 }, p => {
  p.line(6, 27, 25, 8, P.wood, 4); p.line(8, 8, 25, 25, P.rune, 3); p.line(7, 9, 9, 7, P.rune, 3); p.line(24, 26, 26, 24, P.rune, 3);
  p.line(9, 9, 24, 24, 0xd8d0b0, 1);
});
def('msb', { name: 'Magic shortbow', ex: 'A nice, sturdy magic bow.', slot: 'weapon', bonus: bon({ [A_RANGE]: 75 }), speed: 4, range: 7, cat: 'ranged', catName: 'Bow', model: 'bow', ranged: true, ammo: 'arrow', val: 1000, spec: { cost: 55, name: 'Snapshot', hits: 2, acc: 1.0, dmg: 1.0 } }, p => {
  const pts = [[9, 4], [15, 8], [18, 14], [18, 19], [15, 25], [9, 29]];
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xd8b040, 3);
  p.line(9, 4, 9, 29, 0xf0e8c8, 1);
});
def('ancstaff', { name: 'Ancient staff', ex: 'An ancient staff.', slot: 'weapon', bonus: bon({ [A_MAGIC]: 15, [A_CRUSH]: 20, [B_STR]: 15 }), speed: 5, range: 10, cat: 'staff', catName: 'Staff', model: 'staff', magic: true, val: 80000 }, p => {
  p.line(6, 28, 22, 10, 0x3a2a44, 3); p.line(7, 27, 21, 11, 0x5f4a72, 1);
  p.disc(24, 7, 4, 0xd04a9a); p.disc(23, 6, 1, 0xf8a8d8); p.line(19, 12, 21, 14, P.gold, 3);
});
def('dbolts', { name: 'Dragon bolts', ex: 'Some dragon crossbow bolts.', slot: 'ammo', stack: true, bonus: bon({ [B_RSTR]: 122 }), ammoType: 'bolt', val: 200 }, p => {
  for (const o of [0, 5]) { p.line(6 + o, 27 - o / 2, 22 + o, 9 - o / 2, 0xd8d8d0, 1); p.poly([[21 + o, 11 - o / 2], [26 + o, 5 - o / 2], [23 + o, 12 - o / 2]], P.dragon); p.line(6 + o, 27 - o / 2, 9 + o, 24 - o / 2, 0x50a838, 2); }
});
def('rarrows', { name: 'Rune arrow', ex: 'Arrows with rune heads.', slot: 'ammo', stack: true, bonus: bon({ [B_RSTR]: 49 }), ammoType: 'arrow', val: 30 }, p => {
  for (const o of [0, 5]) { p.line(6 + o, 27 - o / 2, 22 + o, 9 - o / 2, 0xc8a860, 1); p.poly([[21 + o, 11 - o / 2], [26 + o, 5 - o / 2], [23 + o, 12 - o / 2]], P.rune); p.line(6 + o, 27 - o / 2, 9 + o, 24 - o / 2, 0xe8e8e0, 2); }
});

/* ---------- armour ---------- */
def('rhelm', { name: 'Rune full helm', ex: 'A full face helmet.', slot: 'head', bonus: bon({ [D_STAB]: 30, [D_SLASH]: 32, [D_CRUSH]: 27, [D_MAGIC]: -6, [D_RANGE]: 30 }), color: P.rune, model: 'fullhelm', val: 20000 }, p => {
  p.ellipse(16, 14, 9, 9, P.rune); p.rect(7, 14, 18, 12, P.rune); p.rect(9, 26, 14, 2, P.runeD);
  p.rect(9, 14, 14, 3, 0x0d2830); p.rect(15, 14, 2, 12, P.runeD);
});
def('rbody', { name: 'Rune platebody', ex: 'Provides excellent protection.', slot: 'body', bonus: bon({ [D_STAB]: 82, [D_SLASH]: 80, [D_CRUSH]: 72, [D_MAGIC]: -30, [D_RANGE]: 80 }), color: P.rune, model: 'plate', val: 38000 }, p => {
  p.poly([[11, 4], [21, 4], [28, 9], [26, 16], [22, 14], [22, 28], [10, 28], [10, 14], [6, 16], [4, 9]], P.rune);
  p.line(16, 7, 16, 27, P.runeD, 1); p.poly([[11, 8], [15, 8], [15, 12], [11, 12]], 0x7fd0e0);
});
def('rlegs', { name: 'Rune platelegs', ex: 'These look pretty heavy.', slot: 'legs', bonus: bon({ [D_STAB]: 51, [D_SLASH]: 49, [D_CRUSH]: 47, [D_MAGIC]: -21, [D_RANGE]: 49 }), color: P.rune, model: 'legs', val: 38000 }, p => {
  p.poly([[8, 4], [24, 4], [25, 28], [18, 28], [16, 14], [14, 28], [7, 28]], P.rune); p.rect(8, 4, 16, 4, P.runeD);
});
def('rkite', { name: 'Rune kiteshield', ex: 'A large metal shield.', slot: 'shield', bonus: bon({ [D_STAB]: 44, [D_SLASH]: 48, [D_CRUSH]: 46, [D_MAGIC]: -3, [D_RANGE]: 45 }), color: P.rune, model: 'kite', val: 20000 }, p => {
  p.poly([[6, 4], [26, 4], [26, 15], [16, 29], [6, 15]], P.rune); p.line(16, 6, 16, 26, P.runeD, 2); p.line(8, 12, 24, 12, P.runeD, 2);
});
def('rboots', { name: 'Rune boots', ex: 'A pair of rune boots.', slot: 'feet', bonus: bon({ [D_STAB]: 3, [D_SLASH]: 3, [D_CRUSH]: 3, [D_MAGIC]: -3, [D_RANGE]: 3 }), color: P.rune, model: 'boots', val: 8000 }, p => {
  p.poly([[6, 8], [13, 8], [13, 22], [20, 24], [20, 28], [6, 28]], P.runeD); p.poly([[17, 6], [24, 6], [24, 20], [29, 24], [29, 28], [17, 28]], P.rune);
});
def('bgloves', { name: 'Barrows gloves', ex: 'Provides decent protection.', slot: 'hands', bonus: bon({ [A_STAB]: 12, [A_SLASH]: 12, [A_CRUSH]: 12, [A_MAGIC]: 12, [A_RANGE]: 12, [D_STAB]: 12, [D_SLASH]: 12, [D_CRUSH]: 12, [D_MAGIC]: 12, [D_RANGE]: 12, [B_STR]: 12, [B_PRAY]: 1 }), color: 0xd0c8b0, model: 'gloves', val: 130000 }, p => {
  p.poly([[9, 12], [12, 12], [12, 6], [15, 6], [15, 11], [17, 4], [20, 4], [19, 12], [22, 8], [24, 10], [22, 18], [22, 26], [10, 26], [10, 18]], 0xd8d0b8); p.rect(9, 22, 14, 4, 0x8a1c14);
});
def('firecape', { name: 'Fire cape', ex: 'A cape of fire.', slot: 'cape', bonus: bon({ [A_STAB]: 4, [A_SLASH]: 4, [A_CRUSH]: 4, [A_MAGIC]: 1, [A_RANGE]: 1, [D_STAB]: 11, [D_SLASH]: 11, [D_CRUSH]: 11, [D_MAGIC]: 11, [D_RANGE]: 11, [B_STR]: 4, [B_PRAY]: 2 }), color: 0xd8480e, model: 'cape', val: 1000 }, p => {
  p.poly([[9, 4], [23, 4], [27, 28], [5, 28]], 0xd44a10); const r = mulberry32(3); for (let i = 0; i < 30; i++) p.set(8 + rint(16), 6 + rint(21), r() < 0.5 ? 0xf8c020 : 0x8a1c08);
  p.rect(9, 4, 14, 3, 0x8a1c08);
});
def('glory', { name: 'Amulet of glory(4)', ex: 'A very powerful dragonstone amulet.', slot: 'neck', bonus: bon({ [A_STAB]: 10, [A_SLASH]: 10, [A_CRUSH]: 10, [A_MAGIC]: 10, [A_RANGE]: 10, [D_STAB]: 3, [D_SLASH]: 3, [D_CRUSH]: 3, [D_MAGIC]: 3, [D_RANGE]: 3, [B_STR]: 6, [B_PRAY]: 3 }), color: P.gold, model: 'amulet', val: 25000 }, p => {
  for (let a = 0.25; a < 2.9; a += 0.2) p.set(Math.round(16 - Math.cos(a) * 10), Math.round(4 + Math.sin(a) * 11), P.gold), p.set(Math.round(16 - Math.cos(a) * 10) + 1, Math.round(4 + Math.sin(a) * 11), P.goldD);
  p.disc(16, 21, 5, P.gold); p.disc(16, 21, 3, 0xe04030); p.set(15, 20, 0xffb0a0);
});
def('bdbody', { name: "Black d'hide body", ex: "Vambraces made from black dragon hide.", slot: 'body', bonus: bon({ [A_MAGIC]: -15, [A_RANGE]: 15, [D_STAB]: 25, [D_SLASH]: 20, [D_CRUSH]: 30, [D_MAGIC]: 15, [D_RANGE]: 25 }), color: 0x2c2c34, model: 'plate', val: 6000 }, p => {
  p.poly([[11, 4], [21, 4], [28, 9], [26, 16], [22, 14], [22, 28], [10, 28], [10, 14], [6, 16], [4, 9]], 0x30303a); p.line(16, 6, 16, 27, 0x505060, 1); p.line(10, 12, 22, 12, 0x505060, 1);
});
def('bdchaps', { name: "Black d'hide chaps", ex: 'Chaps made from black dragon hide.', slot: 'legs', bonus: bon({ [A_MAGIC]: -10, [A_RANGE]: 17, [D_STAB]: 11, [D_SLASH]: 9, [D_CRUSH]: 12, [D_MAGIC]: 8, [D_RANGE]: 11 }), color: 0x2c2c34, model: 'legs', val: 4000 }, p => {
  p.poly([[8, 4], [24, 4], [25, 28], [18, 28], [16, 14], [14, 28], [7, 28]], 0x30303a); p.rect(8, 4, 16, 3, 0x50505c);
});
def('coif', { name: 'Coif', ex: 'Woolen hood.', slot: 'head', bonus: bon({ [A_RANGE]: 8, [D_STAB]: 4, [D_SLASH]: 5, [D_CRUSH]: 6, [D_RANGE]: 4 }), color: 0x6a6a5c, model: 'coif', val: 500 }, p => {
  p.ellipse(16, 15, 9, 10, 0x8a8a76); p.ellipse(16, 18, 5, 6, 0x1a1a14); p.rect(7, 22, 18, 6, 0x8a8a76);
});
def('mtop', { name: 'Mystic robe top', ex: 'The upper half of a mystic robe.', slot: 'body', bonus: bon({ [A_MAGIC]: 20, [D_STAB]: 0, [D_MAGIC]: 20, [D_RANGE]: 0 }), color: 0x6f8ed8, model: 'robe', val: 60000 }, p => {
  p.poly([[11, 4], [21, 4], [28, 12], [25, 22], [22, 20], [22, 28], [10, 28], [10, 20], [7, 22], [4, 12]], 0x7f9ee8); p.rect(10, 22, 12, 3, 0xe8e8f0); p.line(16, 6, 16, 20, 0xe8e8f0, 1);
});
def('mbottom', { name: 'Mystic robe bottom', ex: 'The lower half of a mystic robe.', slot: 'legs', bonus: bon({ [A_MAGIC]: 15, [D_MAGIC]: 15 }), color: 0x6f8ed8, model: 'skirt', val: 50000 }, p => {
  p.poly([[9, 4], [23, 4], [28, 28], [4, 28]], 0x7f9ee8); p.rect(9, 4, 14, 3, 0xe8e8f0); p.rect(4, 25, 24, 3, 0xe8e8f0);
});
def('mhat', { name: 'Mystic hat', ex: 'A mystic hat.', slot: 'head', bonus: bon({ [A_MAGIC]: 6, [D_MAGIC]: 6 }), color: 0x6f8ed8, model: 'wizhat', val: 20000 }, p => {
  p.poly([[16, 3], [21, 18], [26, 22], [26, 26], [6, 26], [6, 22], [11, 18]], 0x7f9ee8); p.rect(6, 22, 20, 4, 0xe8e8f0);
});
def('mboots', { name: 'Mystic boots', ex: 'Mystic boots.', slot: 'feet', bonus: bon({ [A_MAGIC]: 3, [D_MAGIC]: 3 }), color: 0x6f8ed8, model: 'boots', val: 12000 }, p => {
  p.poly([[6, 8], [13, 8], [13, 22], [20, 24], [20, 28], [6, 28]], 0x6f8ed8); p.poly([[17, 6], [24, 6], [24, 20], [29, 24], [29, 28], [17, 28]], 0x7f9ee8);
});

/* ---------- consumables ---------- */
def('shark', { name: 'Shark', ex: 'I very much doubt it will be dangerous to eat.', food: { heal: 20 }, val: 800 }, p => {
  p.ellipse(15, 17, 11, 6, 0x6f8595); p.ellipse(15, 20, 9, 3, 0xc6d0d6); p.poly([[3, 12], [8, 17], [3, 24]], 0x6f8595); p.poly([[14, 11], [20, 4], [21, 12]], 0x5a6f7e); p.set(22, 15, 0x000000); p.set(23, 15, 0x000000);
  p.poly([[26, 15], [29, 17], [26, 19]], 0x6f8595);
});
function potIcon(col) {
  return p => { p.rect(13, 4, 6, 3, 0xc8b07a); p.rect(14, 7, 4, 4, 0xd8e8f0); p.poly([[14, 10], [18, 10], [25, 18], [25, 27], [7, 27], [7, 18]], 0xd8e8f0); p.poly([[14, 13], [18, 13], [23, 19], [23, 26], [9, 26], [9, 19]], col); p.rect(11, 20, 3, 3, mixCol(col, 0xffffff, 0.5)); };
}
function pot(id, name, col, kind, ex) { def(id, { name, ex: ex || 'A vial of potion.', pot: kind, doses: 4, val: 500 }, potIcon(col)); }
pot('supatk', 'Super attack', 0x3f78e0, 'supatk'); pot('supstr', 'Super strength', 0xc09a2c, 'supstr'); pot('supdef', 'Super defence', 0xd0662a, 'supdef');
pot('ranging', 'Ranging potion', 0x3fb046, 'ranging'); pot('prayer', 'Prayer potion', 0x38d6d0, 'prayer'); pot('restore', 'Super restore', 0xe86ab0, 'restore'); pot('brew', 'Saradomin brew', 0x8a4a2a, 'brew');
function runeIcon(col, mark) {
  return p => { p.poly([[8, 10], [22, 6], [27, 15], [24, 26], [11, 27], [5, 18]], 0xb8b8b0); p.poly([[10, 11], [21, 8], [25, 15], [22, 24], [12, 25], [8, 18]], 0x94948c);
    p.disc(16, 16, 5, col); if (mark) { p.set(14, 15, 0xffffff); p.set(18, 15, 0xffffff); p.rect(15, 18, 3, 1, 0xffffff); } };
}
def('death', { name: 'Death rune', ex: 'Used for high level Magic spells.', stack: true, val: 200 }, runeIcon(0x1a1a1a, true));
def('blood', { name: 'Blood rune', ex: 'Used for Blood spells.', stack: true, val: 300 }, runeIcon(0xc01818));
def('water', { name: 'Water rune', ex: 'Used for Water spells.', stack: true, val: 5 }, runeIcon(0x2a5ad8));
def('coins', { name: 'Coins', ex: 'Lovely money!', stack: true, val: 1 }, p => {
  for (const [x, y] of [[9, 19], [17, 19], [13, 14], [21, 14]]) { p.disc(x, y, 5, 0xe8c020); p.disc(x, y, 3, 0xffe870); p.set(x, y, 0xc09010); }
});
def('bones', { name: 'Bones', ex: 'Ew, it is a pile of bones.', val: 1 }, p => { p.line(8, 22, 24, 10, 0xe8e0c8, 3); p.disc(7, 24, 3, 0xe8e0c8); p.disc(9, 21, 2, 0xe8e0c8); p.disc(25, 8, 3, 0xe8e0c8); p.disc(23, 11, 2, 0xe8e0c8); });

/* ---------- icon cache ---------- */
const ICON_CACHE = {};
function itemIcon(id) {
  let c = ICON_CACHE[id]; if (c) return c;
  const p = new Pix(32, 32); const fn = ICON_FN[id]; if (fn) fn(p);
  p.bevel(1.25, 0.72); p.outline(0x000000);
  c = ICON_CACHE[id] = p.canvas(); return c;
}
function groundName(g) { const it = ITEMS[g.id]; if (it.doses) return it.name + '(' + g.n + ')'; return it.name + (g.n > 1 ? ' x ' + fmtNum(g.n) : ''); }
function itemName(s) {
  const it = ITEMS[s.id]; if (it.doses) return it.name + '(' + s.n + ')'; return it.name;
}
/* short stack count string colours like RS */
function stackText(n) {
  if (n >= 10000000) return { t: Math.floor(n / 1000000) + 'M', c: 0x00ff80 };
  if (n >= 100000) return { t: Math.floor(n / 1000) + 'K', c: 0xffffff };
  return { t: String(n), c: 0xffff00 };
}
