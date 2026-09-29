'use strict';
/* ==========================================================================
   uiicons.js  -  pixel-art interface sprites (tabs, skills, prayers, spells, splats)
   ========================================================================== */
const IC = {};   // name -> canvas
function mkIcon(name, w, h, fn, opt) {
  const p = new Pix(w, h); fn(p);
  if (!opt || opt.bevel !== false) p.bevel(1.2, 0.75);
  if (!opt || opt.outline !== false) p.outline(0x000000);
  IC[name] = p.canvas(); return IC[name];
}

const TAB_NAMES = ['combat', 'stats', 'quests', 'inv', 'equip', 'prayer', 'magic', 'clan', 'friends', 'ignore', 'logout', 'options', 'emotes', 'music'];
const TAB_FN = {
  combat(p) { p.line(4, 16, 15, 4, 0xd8dce4, 2); p.line(5, 4, 16, 16, 0xc4c8d0, 2); p.line(2, 13, 7, 18, 0xe0b830, 2); p.line(13, 18, 18, 13, 0xe0b830, 2); },
  stats(p) { p.rect(3, 11, 4, 7, 0xd8c078); p.rect(8, 6, 4, 12, 0xe8d088); p.rect(13, 2, 4, 16, 0xd8c078); },
  quests(p) { p.rect(5, 3, 11, 15, 0xe8d8a0); p.rect(3, 3, 3, 15, 0xc8a860); p.rect(7, 6, 7, 1, 0x8a6a30); p.rect(7, 9, 7, 1, 0x8a6a30); p.rect(7, 12, 4, 1, 0x8a6a30); },
  inv(p) { p.poly([[7, 4], [13, 4], [16, 9], [17, 16], [15, 18], [5, 18], [3, 16], [4, 9]], 0xb88848); p.rect(7, 3, 6, 3, 0xd8b060); p.rect(8, 10, 4, 3, 0x7a5020); },
  equip(p) { p.poly([[6, 3], [14, 3], [18, 6], [16, 10], [14, 9], [14, 18], [6, 18], [6, 9], [4, 10], [2, 6]], 0xc4c8d0); p.line(10, 5, 10, 16, 0x8a8e98, 1); },
  prayer(p) { p.ellipse(10, 6, 3, 4, 0xf0d8b8); p.poly([[10, 6], [15, 10], [14, 18], [6, 18], [5, 10]], 0xe8e0c8); p.line(10, 9, 10, 17, 0xb8a880, 1); },
  magic(p) { p.rect(3, 4, 14, 13, 0x2c4aa8); p.rect(3, 4, 14, 2, 0x6c8ae0); p.line(10, 6, 10, 16, 0x101838, 1); p.disc(7, 11, 2, 0xe8f0ff); p.disc(13, 11, 2, 0xe8f0ff); },
  clan(p) { p.disc(6, 7, 3, 0xe8b088); p.rect(3, 11, 7, 6, 0x4a68c8); p.disc(14, 7, 3, 0xe8b088); p.rect(11, 11, 7, 6, 0xc84a4a); },
  friends(p) { p.disc(10, 10, 8, 0xe8c828); p.rect(6, 7, 2, 3, 0x000000); p.rect(12, 7, 2, 3, 0x000000); p.line(6, 13, 8, 15, 0x000000, 1); p.line(8, 15, 12, 15, 0x000000, 1); p.line(12, 15, 14, 13, 0x000000, 1); },
  ignore(p) { p.disc(10, 10, 8, 0xd8d8d0); p.rect(6, 7, 2, 3, 0x000000); p.rect(12, 7, 2, 3, 0x000000); p.line(6, 15, 14, 15, 0x000000, 1); p.line(3, 3, 17, 17, 0xd02020, 2); p.line(17, 3, 3, 17, 0xd02020, 2); },
  logout(p) { p.rect(4, 3, 8, 15, 0x8a5a2b); p.rect(6, 5, 4, 11, 0x5c3a19); p.rect(10, 10, 1, 2, 0xe0b830); p.poly([[12, 9], [16, 9], [16, 6], [20, 11], [16, 16], [16, 13], [12, 13]], 0xe83030); },
  options(p) { p.disc(10, 10, 7, 0xa8acb4); p.disc(10, 10, 3, 0x000000); for (let a = 0; a < 8; a++) { const x = 10 + Math.cos(a * Math.PI / 4) * 8, y = 10 + Math.sin(a * Math.PI / 4) * 8; p.disc(Math.round(x), Math.round(y), 1, 0xa8acb4); } },
  emotes(p) { p.disc(10, 5, 3, 0xe8b088); p.line(10, 8, 10, 14, 0x40a848, 3); p.line(10, 9, 4, 5, 0x40a848, 2); p.line(10, 9, 16, 12, 0x40a848, 2); p.line(10, 14, 5, 18, 0x40a848, 2); p.line(10, 14, 15, 18, 0x40a848, 2); },
  music(p) { p.ellipse(7, 15, 3, 2, 0x50a0e8); p.ellipse(15, 13, 3, 2, 0x50a0e8); p.rect(9, 4, 2, 11, 0x50a0e8); p.rect(17, 3, 2, 10, 0x50a0e8); p.rect(9, 3, 10, 2, 0x50a0e8); }
};

const SKILLS = [ // 3 columns x 8 rows, RS2007 order
  ['Attack', 'atk', 'sword'], ['Hitpoints', 'hp', 'heart'], ['Mining', null, 'pick'],
  ['Strength', 'str', 'fist'], ['Agility', null, 'boot'], ['Smithing', null, 'anvil'],
  ['Defence', 'def', 'shield'], ['Herblore', null, 'leaf'], ['Fishing', null, 'fish'],
  ['Ranged', 'rng', 'bow'], ['Thieving', null, 'mask'], ['Cooking', null, 'pot'],
  ['Prayer', 'pray', 'hands'], ['Crafting', null, 'needle'], ['Firemaking', null, 'flame'],
  ['Magic', 'mag', 'wand'], ['Fletching', null, 'arrow'], ['Woodcutting', null, 'axe'],
  ['Runecraft', null, 'rune'], ['Slayer', null, 'skull'], ['Farming', null, 'sprout'],
  ['Construction', null, 'hammer'], ['Hunter', null, 'trap']
];
const SKILL_FN = {
  sword(p) { p.line(3, 11, 11, 3, 0xd0d4dc, 2); p.line(2, 8, 5, 11, 0xe0b830, 2); p.set(2, 12, 0x805020); },
  heart(p) { p.disc(4, 5, 2, 0xe02020); p.disc(9, 5, 2, 0xe02020); p.poly([[2, 6], [11, 6], [6, 12]], 0xe02020); },
  pick(p) { p.line(3, 10, 9, 4, 0x8a5a2b, 1); p.line(2, 4, 6, 2, 0xb0b4bc, 2); p.line(6, 2, 11, 6, 0xb0b4bc, 2); },
  fist(p) { p.rect(3, 4, 7, 6, 0xe0a070); p.rect(3, 3, 7, 2, 0xf0b888); p.rect(9, 5, 2, 4, 0xe0a070); p.rect(3, 10, 6, 2, 0xc84020); },
  boot(p) { p.poly([[3, 2], [7, 2], [7, 8], [11, 9], [11, 11], [3, 11]], 0x9a6a3a); },
  anvil(p) { p.rect(2, 3, 9, 3, 0x8a8e98); p.rect(4, 6, 5, 3, 0x6a6e78); p.rect(2, 9, 9, 2, 0x5a5e68); },
  shield(p) { p.poly([[2, 2], [11, 2], [11, 7], [6, 12], [2, 7]], 0x9098a8); p.rect(6, 2, 1, 9, 0x606878); },
  leaf(p) { p.poly([[6, 1], [10, 5], [9, 10], [6, 12], [3, 10], [2, 5]], 0x40b040); p.line(6, 3, 6, 11, 0x207020, 1); },
  fish(p) { p.ellipse(6, 6, 4, 3, 0x60a0d8); p.poly([[9, 6], [12, 3], [12, 9]], 0x60a0d8); p.set(4, 5, 0x000000); },
  bow(p) { p.line(3, 1, 7, 6, 0xc09030, 1); p.line(7, 6, 3, 11, 0xc09030, 1); p.line(3, 1, 3, 11, 0xe8e8d8, 1); },
  mask(p) { p.ellipse(6, 6, 4, 5, 0xe0e0d0); p.rect(3, 5, 2, 2, 0x000000); p.rect(8, 5, 2, 2, 0x000000); },
  pot(p) { p.rect(2, 5, 9, 6, 0x60646c); p.rect(1, 4, 11, 2, 0x8a8e98); p.set(4, 2, 0xe0e0e0); p.set(7, 1, 0xe0e0e0); },
  hands(p) { p.poly([[6, 1], [9, 5], [9, 12], [6, 12], [3, 12], [3, 5]], 0xf0e0c0); p.line(6, 3, 6, 11, 0xb8a880, 1); },
  needle(p) { p.line(2, 11, 11, 2, 0xd0d4dc, 1); p.disc(3, 3, 1, 0xd8a020); },
  flame(p) { p.poly([[6, 1], [10, 6], [9, 11], [3, 11], [2, 6], [5, 5]], 0xf08020); p.poly([[6, 5], [8, 8], [7, 11], [5, 11], [4, 8]], 0xf8e040); },
  wand(p) { p.line(2, 11, 9, 4, 0x70503a, 2); p.disc(10, 3, 2, 0x50a0f0); },
  arrow(p) { p.line(2, 11, 10, 3, 0xc0a070, 1); p.poly([[8, 1], [12, 1], [12, 5]], 0x909098); p.line(2, 11, 4, 9, 0xe8e8d8, 2); },
  axe(p) { p.line(3, 11, 9, 3, 0x8a5a2b, 1); p.poly([[6, 2], [11, 3], [11, 7], [8, 6]], 0xb0b4bc); },
  rune(p) { p.poly([[3, 3], [9, 1], [11, 6], [9, 11], [4, 11], [1, 7]], 0xc8c8c0); p.disc(6, 6, 2, 0x4090e0); },
  skull(p) { p.ellipse(6, 5, 4, 4, 0xe8e8e0); p.rect(4, 8, 5, 3, 0xe8e8e0); p.rect(4, 4, 2, 2, 0x000000); p.rect(7, 4, 2, 2, 0x000000); },
  sprout(p) { p.line(6, 11, 6, 6, 0x40a040, 1); p.poly([[6, 6], [2, 3], [6, 4]], 0x50c050); p.poly([[6, 6], [10, 3], [6, 4]], 0x50c050); p.rect(3, 10, 7, 2, 0x7a5030); },
  hammer(p) { p.line(3, 11, 8, 5, 0x8a5a2b, 2); p.rect(6, 2, 6, 4, 0x8a8e98); },
  trap(p) { p.rect(2, 8, 9, 3, 0x8a5a2b); p.line(2, 8, 6, 2, 0xa0a4ac, 1); p.line(10, 8, 6, 2, 0xa0a4ac, 1); }
};

/* prayer icons (26x26 discs with a glyph) */
function prayerGlyph(p, id) {
  const c = 13;
  switch (id) {
    case 'thick': case 'rock': case 'steel': {
      const col = id === 'thick' ? 0xb08040 : id === 'rock' ? 0xa0a098 : 0xd0d4dc;
      p.poly([[7, 6], [19, 6], [19, 14], [13, 21], [7, 14]], col); p.rect(13, 7, 1, 13, shadeCol(col, 0.7)); break;
    }
    case 'burst': case 'super': case 'ultimate': {
      const n = id === 'burst' ? 1 : id === 'super' ? 2 : 3;
      for (let i = 0; i < n; i++) p.poly([[13, 5 + i * 5], [19, 11 + i * 5 - 1], [7, 11 + i * 5 - 1]], 0xe84828);
      p.rect(11, 12 + (n - 1) * 5, 5, 4, 0xe84828); break;
    }
    case 'clarity': case 'improved': case 'incredible': {
      p.ellipse(13, 13, 8, 4, 0xe8f0ff); p.disc(13, 13, 3, 0x2848c8); p.set(12, 12, 0xffffff);
      const n = id === 'clarity' ? 0 : id === 'improved' ? 1 : 2; for (let i = 0; i < n; i++) { p.rect(6 + i * 12, 5, 2, 3, 0xffff60); }
      break;
    }
    case 'rapidrestore': p.rect(11, 6, 4, 14, 0x40d060); p.rect(6, 11, 14, 4, 0x40d060); break;
    case 'rapidheal': p.rect(11, 6, 4, 14, 0xe83030); p.rect(6, 11, 14, 4, 0xe83030); break;
    case 'protitem': p.disc(13, 13, 7, 0xf0d040); p.poly([[13, 6], [18, 13], [8, 13]], 0x80601a); p.rect(11, 13, 4, 5, 0x80601a); break;
    case 'pmagic': p.disc(13, 13, 7, 0x3060f0); p.disc(13, 13, 3, 0xd0e8ff); p.line(13, 3, 13, 23, 0x90b0ff, 1); p.line(3, 13, 23, 13, 0x90b0ff, 1); break;
    case 'pmissiles': p.line(6, 20, 19, 7, 0x60d050, 2); p.poly([[16, 5], [22, 4], [21, 10]], 0x60d050); p.line(6, 20, 9, 17, 0xe8e8d0, 2); break;
    case 'pmelee': p.line(6, 20, 19, 7, 0xd8dce4, 3); p.line(5, 15, 11, 21, 0xe0b830, 3); p.line(19, 7, 21, 5, 0xf8f8f8, 2); break;
    case 'retribution': p.ellipse(13, 12, 6, 6, 0xe8e8e0); p.rect(10, 16, 7, 4, 0xe8e8e0); p.rect(9, 10, 3, 3, 0x000000); p.rect(15, 10, 3, 3, 0x000000); break;
    case 'redemption': p.disc(10, 11, 4, 0xe83030); p.disc(16, 11, 4, 0xe83030); p.poly([[6, 13], [20, 13], [13, 21]], 0xe83030); break;
    case 'smite': p.poly([[15, 3], [8, 14], [13, 14], [10, 23], [19, 11], [14, 11]], 0xffe040); break;
  }
}
function prayerBadge(id) {
  const key = 'pr_' + id; if (IC[key]) return IC[key];
  const pr = PRAYER_BY_ID[id];
  const bg = pr.ov ? 0x1d2a52 : pr.atk ? 0x22376a : pr.str ? 0x5a1d18 : pr.def ? 0x4c3a20 : 0x2a4a30;
  const p = new Pix(27, 27); p.disc(13, 13, 13, 0x000000); p.disc(13, 13, 12, bg); p.ring(13, 13, 12, mixCol(bg, 0xffffff, 0.35));
  const g = new Pix(27, 27); prayerGlyph(g, id); g.bevel(1.2, 0.75); p.blit(g, 0, 0);
  IC[key] = p.canvas(); return IC[key];
}
function prayerBadgeOn(id) {
  const key = 'pro_' + id; if (IC[key]) return IC[key];
  const pr = PRAYER_BY_ID[id]; const p = new Pix(27, 27); p.disc(13, 13, 13, 0x000000); p.disc(13, 13, 12, 0x7a4a18); p.ring(13, 13, 12, 0xffd060);
  const g = new Pix(27, 27); prayerGlyph(g, id); g.bevel(1.2, 0.75); p.blit(g, 0, 0);
  IC[key] = p.canvas(); return IC[key];
}
function spellBadge(sp) {
  const key = 'sp_' + sp.id; if (IC[key]) return IC[key];
  const ice = sp.kind === 'ice'; const tier = ['Rush', 'Burst', 'Blitz', 'Barrage'].findIndex(t => sp.name.includes(t));
  const p = new Pix(28, 28); p.disc(14, 14, 13, 0x000000); p.disc(14, 14, 12, ice ? 0x1a3a6a : 0x5a1418); p.ring(14, 14, 12, ice ? 0x80c0ff : 0xff8080);
  const g = new Pix(28, 28); const c1 = ice ? 0xc0f0ff : 0xe83030, c2 = ice ? 0xffffff : 0xff9090;
  if (ice) { g.line(14, 5, 14, 23, c1, 2); g.line(5, 14, 23, 14, c1, 2); g.line(7, 7, 21, 21, c2, 1); g.line(21, 7, 7, 21, c2, 1); }
  else { g.poly([[14, 4], [21, 15], [19, 21], [14, 24], [9, 21], [7, 15]], c1); g.poly([[13, 9], [16, 15], [14, 19]], c2); }
  for (let i = 0; i <= tier; i++) g.set(6 + i * 3, 25, 0xffff00), g.set(6 + i * 3, 24, 0xffff00);
  g.bevel(1.2, 0.75); p.blit(g, 0, 0);
  IC[key] = p.canvas(); return IC[key];
}

/* overhead icons */
function buildOverheads() {
  mkIcon('skull', 13, 14, p => { p.ellipse(6, 5, 5, 5, 0xf0f0e8); p.rect(3, 8, 7, 4, 0xf0f0e8); p.rect(3, 4, 2, 3, 0x000000); p.rect(8, 4, 2, 3, 0x000000); p.rect(6, 7, 1, 2, 0x606060); p.set(4, 10, 0x000000); p.set(6, 10, 0x000000); p.set(8, 10, 0x000000); }, { bevel: false });
  const ov = {
    pmelee: p => { p.disc(10, 10, 8, 0x2848b8); p.line(6, 15, 14, 5, 0xe8eaf0, 2); p.line(5, 12, 9, 16, 0xe0b830, 2); },
    pmagic: p => { p.disc(10, 10, 8, 0x3868e8); p.disc(10, 10, 3, 0xe0f0ff); p.line(10, 3, 10, 17, 0xa0c0ff, 1); p.line(3, 10, 17, 10, 0xa0c0ff, 1); },
    pmissiles: p => { p.disc(10, 10, 8, 0x30903a); p.line(5, 15, 15, 5, 0xe8f8d0, 2); p.poly([[12, 4], [16, 4], [16, 8]], 0xe8f8d0); },
    retribution: p => { p.disc(10, 10, 8, 0xb02020); p.ellipse(10, 9, 4, 4, 0xf0f0e8); p.rect(8, 12, 5, 3, 0xf0f0e8); p.rect(7, 8, 2, 2, 0); p.rect(11, 8, 2, 2, 0); },
    redemption: p => { p.disc(10, 10, 8, 0xd8b030); p.disc(8, 8, 2, 0xe83030); p.disc(12, 8, 2, 0xe83030); p.poly([[5, 9], [15, 9], [10, 15]], 0xe83030); },
    smite: p => { p.disc(10, 10, 8, 0x6a3a98); p.poly([[11, 3], [6, 11], [10, 11], [8, 17], [14, 9], [10, 9]], 0xffe040); }
  };
  for (const k in ov) mkIcon('ov_' + k, 21, 21, ov[k], { bevel: false });
}
function buildSplats() {
  // RS-style hit splats (red spiky burst / blue shield for zero)
  const red = new Pix(25, 24);
  red.poly([[12, 0], [15, 5], [21, 2], [20, 8], [25, 11], [20, 14], [21, 21], [15, 19], [12, 24], [9, 19], [3, 21], [4, 14], [0, 11], [4, 8], [3, 2], [9, 5]], 0x7a0808);
  red.poly([[12, 2], [14, 6], [19, 4], [18, 9], [22, 11], [18, 14], [19, 19], [14, 17], [12, 22], [10, 17], [5, 19], [6, 14], [2, 11], [6, 9], [5, 4], [10, 6]], 0xd41818);
  red.poly([[12, 4], [13, 8], [17, 7], [16, 10]], 0xf05050);
  IC.splatRed = red.canvas();
  const blue = new Pix(25, 24); blue.disc(12, 12, 11, 0x0a1a5a); blue.disc(12, 12, 9, 0x2a58d0); blue.poly([[6, 6], [12, 4], [10, 9]], 0x6a90f0);
  IC.splatBlue = blue.canvas();
  const heal = new Pix(25, 24); heal.disc(12, 12, 11, 0x0a4a1a); heal.disc(12, 12, 9, 0x28b840); IC.splatGreen = heal.canvas();
}
function buildCursor() {
  const p = new Pix(14, 20);
  p.poly([[0, 0], [0, 15], [4, 12], [7, 18], [9, 17], [6, 11], [11, 11]], 0xffffff); p.outline(0x000000); IC.cursor = p.canvas();
  for (let f = 0; f < 4; f++) {
    for (const [nm, col] of [['xy', 0xffff00], ['xr', 0xff2020]]) {
      const q = new Pix(13, 13); const k = 5 - f;
      q.line(6 - k, 6 - k, 6 + k, 6 + k, col, 1); q.line(6 + k, 6 - k, 6 - k, 6 + k, col, 1);
      q.line(6 - k, 6 - k + 1, 6 + k - 1, 6 + k, col, 1); q.line(6 + k - 1, 6 - k, 6 - k, 6 + k - 1, col, 1);
      q.outline(0x000000); IC[nm + f] = q.canvas();
    }
  }
}
function buildAllIcons() {
  for (const n of TAB_NAMES) mkIcon('tab_' + n, 21, 21, TAB_FN[n]);
  for (const s of SKILLS) { const p = new Pix(15, 15), q = new Pix(13, 13); SKILL_FN[s[2]](q); q.bevel(1.2, 0.75); p.blit(q, 1, 1); p.outline(0x000000); IC['sk_' + s[2]] = p.canvas(); }
  for (const p of PRAYERS) { prayerBadge(p.id); prayerBadgeOn(p.id); }
  for (const s of SPELLS) spellBadge(s);
  buildOverheads(); buildSplats(); buildCursor();
  // orb glyphs
  mkIcon('o_heart', 15, 13, p => { p.disc(4, 4, 3, 0xf03030); p.disc(10, 4, 3, 0xf03030); p.poly([[1, 5], [14, 5], [7, 12]], 0xf03030); p.set(3, 3, 0xffb0b0); p.set(4, 3, 0xffb0b0); }, { outline: false, bevel: false });
  mkIcon('o_pray', 15, 15, p => { p.poly([[7, 1], [9, 6], [14, 7], [10, 10], [11, 14], [7, 11], [3, 14], [4, 10], [0, 7], [5, 6]], 0xe8e8ff); }, { outline: false, bevel: false });
  mkIcon('o_run', 15, 15, p => { p.poly([[4, 2], [8, 2], [8, 8], [13, 10], [13, 13], [3, 13], [3, 8]], 0xf0f0c0); p.rect(3, 12, 10, 2, 0x8a7030); }, { outline: false, bevel: false });
  mkIcon('o_map', 15, 15, p => { p.disc(7, 7, 6, 0x3a80d8); p.poly([[3, 4], [7, 3], [9, 7], [6, 11], [4, 8]], 0x40b040); }, { outline: false, bevel: false });
  mkIcon('o_combatsel', 14, 14, p => { p.line(2, 11, 11, 2, 0xd8dce4, 2); p.line(2, 2, 11, 11, 0xc4c8d0, 2); }, { outline: false });
}
