'use strict';
/* ==========================================================================
   ai.js  -  loadouts, player creation and the bot "pkers"
   ========================================================================== */
const PROFILES = {
  main: { atk: 99, str: 99, def: 99, rng: 99, mag: 99, pray: 99, hp: 99 },
  melee: { atk: 99, str: 99, def: 92, rng: 80, mag: 85, pray: 77, hp: 99 },
  zerker: { atk: 60, str: 99, def: 45, rng: 99, mag: 94, pray: 52, hp: 99 },
  pure: { atk: 60, str: 99, def: 1, rng: 99, mag: 94, pray: 52, hp: 92 },
  ranger: { atk: 70, str: 70, def: 70, rng: 99, mag: 94, pray: 70, hp: 94 },
  mage: { atk: 60, str: 70, def: 40, rng: 70, mag: 99, pray: 70, hp: 90 },
  hybrid: { atk: 75, str: 99, def: 75, rng: 99, mag: 99, pray: 75, hp: 99 }
};
const LOADOUTS = {
  main: {
    eq: { head: 'rhelm', cape: 'firecape', neck: 'glory', weapon: 'whip', body: 'rbody', shield: 'rkite', legs: 'rlegs', hands: 'bgloves', feet: 'rboots', ammo: 'dbolts:150' },
    inv: ['dscim', 'dds', 'gmaul', 'ags', 'ancstaff', 'rcb', 'death:400', 'blood:300', 'water:800', 'prayer', 'prayer', 'restore', 'brew', 'brew', 'supstr', 'shark*13']
  },
  melee: {
    eq: { head: 'rhelm', cape: 'firecape', neck: 'glory', weapon: 'whip', body: 'rbody', shield: 'rkite', legs: 'rlegs', hands: 'bgloves', feet: 'rboots' },
    inv: ['dds', 'supstr', 'prayer', 'prayer', 'prayer', 'restore', 'shark*15'], specWeapon: 'dds'
  },
  zerker: {
    eq: { head: 'rhelm', cape: 'firecape', neck: 'glory', weapon: 'dscim', body: 'rbody', legs: 'rlegs', hands: 'bgloves', feet: 'rboots' },
    inv: ['dds', 'gmaul', 'prayer', 'prayer', 'prayer', 'shark*15'], specWeapon: 'dds'
  },
  pure: {
    eq: { cape: 'firecape', neck: 'glory', weapon: 'dscim', hands: 'bgloves' },
    inv: ['dds', 'gmaul', 'prayer', 'prayer', 'prayer', 'shark*15'], specWeapon: 'gmaul'
  },
  ranger: {
    eq: { head: 'coif', cape: 'firecape', neck: 'glory', weapon: 'rcb', body: 'bdbody', legs: 'bdchaps', hands: 'bgloves', feet: 'rboots', ammo: 'dbolts:600' },
    inv: ['prayer', 'prayer', 'prayer', 'shark*20']
  },
  mage: {
    eq: { head: 'mhat', neck: 'glory', weapon: 'ancstaff', body: 'mtop', legs: 'mbottom', feet: 'mboots' },
    inv: ['prayer', 'prayer', 'prayer', 'shark*20'], autocast: 'iceBarrage'
  },
  hybrid: {
    eq: { head: 'rhelm', cape: 'firecape', neck: 'glory', weapon: 'ancstaff', body: 'rbody', legs: 'rlegs', hands: 'bgloves', feet: 'rboots' },
    inv: ['whip', 'dds', 'prayer', 'prayer', 'prayer', 'shark*16'], autocast: 'iceBarrage', specWeapon: 'dds', mainMelee: 'whip'
  }
};
function parseEntry(e) {
  let id = e, n = 1, rep = 1;
  if (e.includes(':')) { const p = e.split(':'); id = p[0]; n = +p[1]; }
  if (e.includes('*')) { const p = e.split('*'); id = p[0]; rep = +p[1]; }
  return { id, n, rep };
}
function applyLoadout(a, kind) {
  const L = LOADOUTS[kind]; a.eq = {}; a.inv = new Array(28).fill(null);
  for (const slot in L.eq) { const e = parseEntry(L.eq[slot]); a.eq[slot] = { id: e.id, n: e.n }; }
  let i = 0;
  for (const raw of L.inv) {
    const e = parseEntry(raw); const it = ITEMS[e.id];
    for (let r = 0; r < e.rep; r++) { if (i >= 28) break; a.inv[i++] = { id: e.id, n: it.doses ? 4 : (it.stack ? e.n : 1) }; }
  }
  a.style = 0; a.specOn = false; a.autocast = L.autocast && weaponOf(a).magic ? L.autocast : null;
  recalcBonus(a); a.spec = 100; a.run = 100;
}

/* ---------------- creation ---------------- */
const SKIN = [0xe8b088, 0xd49a70, 0xc0825a, 0xa66a44, 0xf0c8a0, 0x8a5a3a];
const HAIR = [0x3a2410, 0x6b4a20, 0xc8a040, 0x1a1a1a, 0x9a3a1a, 0xdedede, 0x8a6a30];
const SHIRT = [0x2c4a9a, 0x9a2c2c, 0x2c8a4a, 0x8a7a2c, 0x5a2c8a, 0x2c7a8a, 0x8a4a2c, 0x6a6a6a, 0x1c1c1c, 0xcfcfc0];
const BOT_NAMES = ['Pk_Ragnar', 'xX Sk8r Xx', 'Lil Dwarf', 'Whip 4 Life', 'Ice Barrage', 'n0 pk pls', 'Zezima Jr', 'Ownage 51', '1 Def Pure', 'Rune Kid 7', 'Fire Cape 07', 'Gr8 Pk3r', 'Wildy Wolf', 'Dragon Slyr', 'Tank Ghost', 'Mage 4 Fun', 'Sir Prizes', 'Cheesy Nacho', 'BuyMyGf', 'Iron Fist 9'];
function randomKit() {
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick([0x3a3a2a, 0x2a3a5a, 0x5a3a2a, 0x2a2a2a, 0x4a4a5a]), boots: pick([0x3a2a1a, 0x1a1a1a, 0x5a4a3a]), hairStyle: rint(3) };
}
function createPlayer() {
  const sp = { x: GEC, y: GEC - 12 };
  const a = newActor({ name: 'Pk_Player', isPlayer: true, x: sp.x, y: sp.y, stats: PROFILES.main, kit: { skin: 0xe8b088, hair: 0x6b4a20, shirt: 0x2c4a9a, pants: 0x3a3a2a, boots: 0x3a2a1a, hairStyle: 1 } });
  applyLoadout(a, 'main'); a.face = 0; a.faceR = 0; a.autoRetal = true; a.runOn = true;
  G.actors.push(a); G.player = a; return a;
}
function createBot(kind, name) {
  const sp = spawnPoint(false);
  const a = newActor({ name, isBot: true, x: sp.x, y: sp.y, stats: PROFILES[kind], kit: randomKit() });
  a.ai = { kind, skill: 0.5 + Math.random() * 0.4, retarget: rint(6), kiteTick: -1, kiteCd: 0, wander: 0, react: 0, specWeapon: LOADOUTS[kind].specWeapon || null, mainW: null, fleeT: 0, engaged: false };
  applyLoadout(a, kind); a.ai.mainW = a.eq.weapon ? a.eq.weapon.id : null; a.face = Math.random() * TAU; a.faceR = a.face; a.runOn = true;
  G.actors.push(a); return a;
}
function createClerks() {
  const names = ['Grand Exchange Clerk'];
  for (let i = 0; i < 6; i++) {
    const ang = i / 6 * TAU + 0.3; const x = Math.round(GEC + Math.cos(ang) * 2.8 - 0.5), y = Math.round(GEC + Math.sin(ang) * 2.8 - 0.5);
    const a = newActor({ name: 'Grand Exchange Clerk', npc: true, x, y, stats: { atk: 1, str: 1, def: 1, rng: 1, mag: 1, pray: 1, hp: 10 }, kit: { skin: pick(SKIN), hair: pick(HAIR), shirt: 0x40305a, pants: 0x30284a, boots: 0x1a1a1a, hairStyle: rint(3), clerk: true } });
    a.level = 2; a.face = Math.atan2(Math.cos(ang), Math.sin(ang)) * 0 + ang * 0; a.faceR = a.face; a.face = Math.atan2(Math.cos(ang), Math.sin(ang));
    a.faceR = a.face; G.actors.push(a);
  }
}

/* ---------------- bot brain ---------------- */
function findFoodIdx(b) { for (let i = 0; i < 28; i++) { const s = b.inv[i]; if (s && ITEMS[s.id].food) return i; } return -1; }
function findPotIdx(b, kind) { for (let i = 0; i < 28; i++) { const s = b.inv[i]; if (s && ITEMS[s.id].pot === kind) return i; } return -1; }
function invIdx(b, id) { for (let i = 0; i < 28; i++) { const s = b.inv[i]; if (s && s.id === id) return i; } return -1; }
function swapWeapon(b, id) {
  if (b.eq.weapon && b.eq.weapon.id === id) return true; const i = invIdx(b, id); if (i < 0) return false; return equipFromInv(b, i);
}
function botWander(b) {
  const ai = b.ai; if (b.path.length || b.frozen > 0) return;
  if (ai.wander-- > 0) return; ai.wander = 3 + rint(6);
  for (let k = 0; k < 6; k++) {
    const x = b.x + rrange(-6, 6), y = b.y + rrange(-6, 6);
    if (passable(x, y) && poly12(x + 0.5 - GEC, y + 0.5 - GEC) < 20) { const p = findPath(b.x, b.y, (px, py) => px === x && py === y, null, 1500); if (p && p.length) { b.path = p; return; } }
  }
}
function chooseTarget(b) {
  let best = null, bs = 1e9;
  for (const o of G.actors) {
    if (o === b || o.dead || o.npc) continue;
    if (o.isPlayer && G.tick < (o.protectUntil || 0)) continue;
    const d = dist2(b.x, b.y, o.x, o.y); if (d > 32) continue;
    let sc = d + Math.random() * 6; if (o.isPlayer) sc -= 2;
    if (o.frozen > 0) sc -= 1;
    if (sc < bs) { bs = sc; best = o; }
  }
  return best;
}
function desiredProtect(t) {
  if (G.tick - t.lastAtk < 6 && t.lastKind) return t.lastKind;
  const w = weaponOf(t); if (t.autocast && w.magic) return 'pmagic'; if (w.ranged) return 'pmissiles'; return 'pmelee';
}
function kiteAway(b, t) {
  let best = null, bd = dist2(b.x, b.y, t.x, t.y);
  for (const [dx, dy] of DIRS) {
    const nx = b.x + dx, ny = b.y + dy; if (!canStep(b.x, b.y, dx, dy)) continue;
    const d = Math.hypot(nx - t.x, ny - t.y) + Math.random() * 0.5; if (d > bd + 0.2 && (!best || d > best.d)) best = { x: nx, y: ny, d };
  }
  if (best) { b.path = [{ x: best.x, y: best.y }]; b.ai.kiteTick = G.tick; return true; }
  return false;
}
function botThink(b) {
  const ai = b.ai;
  // -------- survival --------
  if (b.hp < b.maxHp * 0.5 && b.eatCd <= 0) { const i = findFoodIdx(b); if (i >= 0) eatFood(b, i); }
  else if (b.hp < b.maxHp * 0.72 && b.eatCd <= 0 && b.atkCd >= 2 && chance(0.15 * ai.skill)) { const i = findFoodIdx(b); if (i >= 0) eatFood(b, i); }
  if (b.pp < 14 && b.potCd <= 0) { const i = findPotIdx(b, 'prayer'); if (i >= 0) drinkPotion(b, i); }
  if (b.pp < 20 && b.potCd <= 0 && b.inv.some(s => s && ITEMS[s.id].pot === 'restore') && chance(0.3)) { drinkPotion(b, findPotIdx(b, 'restore')); }
  // -------- target --------
  if (ai.retarget > 0) ai.retarget--;
  let t = b.target; if (t && (t.dead || dist2(b.x, b.y, t.x, t.y) > 36)) { t = b.target = null; }
  if (!t && ai.retarget <= 0) { t = chooseTarget(b); if (t) { b.target = t; ai.engaged = true; } ai.retarget = 2 + rint(3); }
  // occasionally switch to someone who is attacking us
  if (t && ai.retarget <= 0 && chance(0.08)) { const n = chooseTarget(b); if (n && n !== t) b.target = t = n; ai.retarget = 6; }
  if (!t) {
    if (b.prayers.size) { for (const id of Array.from(b.prayers)) togglePrayer(b, id, true); }
    botWander(b);
    if (b.eq.weapon && ai.mainW && b.eq.weapon.id !== ai.mainW && !ai.specWeapon) swapWeapon(b, ai.mainW);
    if (chance(0.0015)) sayOverhead(b, pick(['anyone want to fight?', 'lol', 'ge pk ftw', 'lf pk', 'where is everyone', 'dds spec ftw', 'sell whip 2.5m', 'no pkers here?']));
    return;
  }
  const dist = dist2(b.x, b.y, t.x, t.y);
  // -------- fleeing --------
  if (b.hp < b.maxHp * 0.22 && findFoodIdx(b) < 0 && ai.fleeT <= 0 && chance(0.6)) { ai.fleeT = 10; }
  if (ai.fleeT > 0) {
    ai.fleeT--; b.target = null; ai.retarget = 6;
    if (b.frozen <= 0 && !b.path.length) {
      const away = { x: clamp(b.x + Math.sign(b.x - t.x) * 9, 6, MAPN - 7), y: clamp(b.y + Math.sign(b.y - t.y) * 9, 6, MAPN - 7) };
      const p = findPath(b.x, b.y, (x, y) => x === away.x && y === away.y, away, 1500); if (p) b.path = p;
    }
    return;
  }
  // -------- protection prayers (imperfect reactions) --------
  if (ai.react-- <= 0) {
    ai.react = 1 + rint(2);
    const want = desiredProtect(t);
    if (b.stats.pray >= 37 && b.pp > 0 && b.overhead !== want && chance(ai.skill)) { if (b.prayerBlock <= G.tick) togglePrayer(b, want, true); }
    if (ai.kind !== 'mage' && ai.kind !== 'ranger' && b.stats.pray >= 31 && dist <= 3 && !b.prayers.has('ultimate') && b.pp > 30) { togglePrayer(b, 'ultimate', true); if (b.stats.pray >= 34) togglePrayer(b, 'incredible', true); }
    if (dist > 6 && b.prayers.has('ultimate')) { togglePrayer(b, 'ultimate', true); togglePrayer(b, 'incredible', true); }
  }
  // -------- tactics by archetype --------
  const k = ai.kind;
  if (k === 'ranger' || k === 'mage') {
    if (dist <= 2 && b.frozen <= 0 && b.atkCd >= 2 && ai.kiteCd <= 0 && chance(0.6)) { if (kiteAway(b, t)) ai.kiteCd = 3; }
    if (ai.kiteCd > 0) ai.kiteCd--;
  }
  if (k === 'hybrid') {
    // melee when the target is frozen and close, otherwise barrage
    const mainW = ai.mainW ? 'whip' : 'whip';
    if (t.frozen > 3 && dist <= 2) { if (b.atkCd <= 1) swapWeapon(b, 'whip'); b.autocast = null; }
    else if (b.atkCd <= 1 && !(b.eq.weapon && b.eq.weapon.id === 'ancstaff')) { if (swapWeapon(b, 'ancstaff')) b.autocast = 'iceBarrage'; }
    else if (b.eq.weapon && b.eq.weapon.id === 'ancstaff') b.autocast = 'iceBarrage';
  }
  // specials: swap to spec weapon, use it, swap back
  if (ai.specWeapon && (k === 'melee' || k === 'zerker' || k === 'pure' || k === 'hybrid')) {
    const sw = ITEMS[ai.specWeapon]; const cur = b.eq.weapon ? b.eq.weapon.id : null;
    if (cur === ai.specWeapon && !b.specOn) { const back = k === 'hybrid' ? 'whip' : ai.mainW; if (back && b.atkCd <= 1) swapWeapon(b, back); }
    else if (b.spec >= sw.spec.cost && dist <= 1 && t.hp > t.maxHp * 0.15 && b.atkCd <= 1 && chance(0.55 * ai.skill + 0.2)) {
      if (swapWeapon(b, ai.specWeapon)) b.specOn = true;
    }
  }
  if (t.dead) b.target = null;
  if (b.frozen <= 0 && b.atkCd > 0 && ai.kiteTick === G.tick) return;
  // bots' chat when hit hard
  if (b.lastHitTick === G.tick - 1 && chance(0.02)) sayOverhead(b, pick(['ow', 'omg', 'nub', 'lag', '>:(', 'stop']));
}
function stepBotsKite(a) { }
