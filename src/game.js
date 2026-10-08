'use strict';
/* ==========================================================================
   game.js  -  actors, pathing, the 600ms tick, and 2007-style combat
   ========================================================================== */
const PRAYERS = [
  { id: 'thick', name: 'Thick Skin', lvl: 1, drain: 3, def: 0.05, grp: 'def', d: 'Increases your Defence by 5%' },
  { id: 'burst', name: 'Burst of Strength', lvl: 4, drain: 3, str: 0.05, grp: 'str', d: 'Increases your Strength by 5%' },
  { id: 'clarity', name: 'Clarity of Thought', lvl: 7, drain: 3, atk: 0.05, grp: 'atk', d: 'Increases your Attack by 5%' },
  { id: 'rock', name: 'Rock Skin', lvl: 10, drain: 6, def: 0.10, grp: 'def', d: 'Increases your Defence by 10%' },
  { id: 'super', name: 'Superhuman Strength', lvl: 13, drain: 6, str: 0.10, grp: 'str', d: 'Increases your Strength by 10%' },
  { id: 'improved', name: 'Improved Reflexes', lvl: 16, drain: 6, atk: 0.10, grp: 'atk', d: 'Increases your Attack by 10%' },
  { id: 'rapidrestore', name: 'Rapid Restore', lvl: 19, drain: 1, grp: 'rr', d: '2x restore rate for all stats except Hitpoints, Summoning and Prayer' },
  { id: 'rapidheal', name: 'Rapid Heal', lvl: 22, drain: 3, grp: 'rh', d: '2x restore rate for Hitpoints stat' },
  { id: 'protitem', name: 'Protect Item', lvl: 25, drain: 3, grp: 'pi', d: 'Keep 1 extra item if you die' },
  { id: 'steel', name: 'Steel Skin', lvl: 28, drain: 12, def: 0.15, grp: 'def', d: 'Increases your Defence by 15%' },
  { id: 'ultimate', name: 'Ultimate Strength', lvl: 31, drain: 12, str: 0.15, grp: 'str', d: 'Increases your Strength by 15%' },
  { id: 'incredible', name: 'Incredible Reflexes', lvl: 34, drain: 12, atk: 0.15, grp: 'atk', d: 'Increases your Attack by 15%' },
  { id: 'pmagic', name: 'Protect from Magic', lvl: 37, drain: 12, grp: 'ov', ov: 'pmagic', d: 'Protects you from magic attacks' },
  { id: 'pmissiles', name: 'Protect from Missiles', lvl: 40, drain: 12, grp: 'ov', ov: 'pmissiles', d: 'Protects you from ranged attacks' },
  { id: 'pmelee', name: 'Protect from Melee', lvl: 43, drain: 12, grp: 'ov', ov: 'pmelee', d: 'Protects you from melee attacks' },
  { id: 'retribution', name: 'Retribution', lvl: 46, drain: 3, grp: 'ov', ov: 'retribution', d: 'Inflicts damage to nearby targets if you die' },
  { id: 'redemption', name: 'Redemption', lvl: 49, drain: 6, grp: 'ov', ov: 'redemption', d: 'Heals you when damaged and Hitpoints falls below 10%' },
  { id: 'smite', name: 'Smite', lvl: 52, drain: 18, grp: 'ov', ov: 'smite', d: 'Drains 25% of a player\'s Prayer points per damage you deal' }
];
const PRAYER_BY_ID = {}; for (const p of PRAYERS) PRAYER_BY_ID[p.id] = p;

const SPELLS = [
  { id: 'iceRush', name: 'Ice Rush', lvl: 58, max: 16, freeze: 8, runes: { death: 2, water: 2 }, kind: 'ice', d: 'Ice Rush' },
  { id: 'bloodRush', name: 'Blood Rush', lvl: 56, max: 15, runes: { death: 2, blood: 2 }, kind: 'blood', d: 'Blood Rush' },
  { id: 'iceBurst', name: 'Ice Burst', lvl: 70, max: 22, freeze: 16, runes: { death: 4, water: 4 }, kind: 'ice', d: 'Ice Burst' },
  { id: 'bloodBurst', name: 'Blood Burst', lvl: 68, max: 21, runes: { death: 2, blood: 4 }, kind: 'blood', d: 'Blood Burst' },
  { id: 'iceBlitz', name: 'Ice Blitz', lvl: 82, max: 26, freeze: 25, runes: { death: 2, blood: 2, water: 3 }, kind: 'ice', d: 'Ice Blitz' },
  { id: 'bloodBlitz', name: 'Blood Blitz', lvl: 80, max: 25, runes: { death: 2, blood: 4 }, kind: 'blood', d: 'Blood Blitz' },
  { id: 'iceBarrage', name: 'Ice Barrage', lvl: 94, max: 30, freeze: 33, runes: { death: 4, blood: 2, water: 6 }, kind: 'ice', d: 'Ice Barrage' },
  { id: 'bloodBarrage', name: 'Blood Barrage', lvl: 92, max: 29, runes: { death: 4, blood: 4 }, kind: 'blood', d: 'Blood Barrage' }
];
const SPELL_BY_ID = {}; for (const s of SPELLS) SPELL_BY_ID[s.id] = s;

const G = {
  tick: 0, lastTick: 0, actors: [], player: null, ground: [], projs: [], effects: [], msgs: [], hitQ: [], dialog: null,
  nextId: 1, now: 0, spellSel: null, kills: 0, deaths: 0, streak: 0, best: 0, dmgDealt: 0, dmgTaken: 0, chatScroll: 0
};

/* ---------------- messages ---------------- */
function gameMsg(text, type) { G.msgs.push({ type: type || 'game', text, t: G.now }); if (G.msgs.length > 300) G.msgs.shift(); G.chatScroll = 0; }
function publicMsg(name, text, isMe) { G.msgs.push({ type: 'public', name, text, t: G.now }); if (G.msgs.length > 300) G.msgs.shift(); G.chatScroll = 0; }
function sayOverhead(a, text) { a.chat = { text, until: G.now + 3400 }; if (!a.npc) publicMsg(a.name, text); }

/* ---------------- stats ---------------- */
function combatLevel(s) {
  const base = 0.25 * (s.def + s.hp + Math.floor(s.pray / 2)), melee = 0.325 * (s.atk + s.str), rng = 0.325 * Math.floor(s.rng * 1.5), mag = 0.325 * Math.floor(s.mag * 1.5);
  return Math.floor(base + Math.max(melee, rng, mag));
}
function newActor(o) {
  const st = Object.assign({ atk: 99, str: 99, def: 99, rng: 99, mag: 99, pray: 99, hp: 99 }, o.stats || {});
  const a = {
    id: G.nextId++, name: o.name, isPlayer: !!o.isPlayer, isBot: !!o.isBot, npc: !!o.npc, x: o.x, y: o.y, seg: [], path: [], face: o.face || 0, faceR: o.face || 0,
    stats: st, cur: Object.assign({}, st), hp: st.hp, maxHp: st.hp, pp: st.pray, run: 100, runOn: true, spec: 100,
    eq: {}, inv: new Array(28).fill(null), prayers: new Set(), overhead: null, style: 0, autocast: null, specOn: false, autoRetal: true, pendingSpell: null,
    target: null, follow: null, atkCd: 0, eatCd: 0, potCd: 0, frozen: 0, freezeImm: 0, skull: 0, hpBarUntil: 0, splats: [], anim: null, chat: null,
    dead: false, deathTick: 0, respawnAt: 0, kills: 0, deaths: 0, bon: Z.slice(), drain: 0, walkPh: 0, moving: false, attackedBy: {}, prayerBlock: 0,
    boostT: 0, hpT: 0, specT: 0, lastHitTick: -99, hits: 0, level: 0, kit: o.kit || {}, ai: null, actRetalDelay: 0, lastAtk: -99, sevText: 0
  };
  a.level = combatLevel(st);
  return a;
}
function weaponOf(a) {
  const w = a.eq.weapon; if (w) return ITEMS[w.id];
  return { name: 'Unarmed', cat: 'unarmed', catName: 'Unarmed', speed: 4, range: 1, bonus: Z, model: null };
}
function styleOf(a) { const w = weaponOf(a); const arr = STYLES[w.cat] || STYLES.unarmed; return arr[Math.min(a.style, arr.length - 1)]; }
function recalcBonus(a) {
  const b = Z.slice();
  for (const s of SLOTS) { const it = a.eq[s]; if (!it) continue; const bb = ITEMS[it.id].bonus; if (bb) for (let i = 0; i < 14; i++) b[i] += bb[i]; }
  a.bon = b;
}
function prayMult(a, k) { let m = 1; for (const id of a.prayers) { const p = PRAYER_BY_ID[id]; if (p[k]) m = Math.max(m, 1 + p[k]); } return m; }
function countItem(a, id) { let n = 0; for (const s of a.inv) if (s && s.id === id) n += ITEMS[id].stack ? s.n : 1; return n; }
function removeItem(a, id, n) {
  for (let i = 0; i < 28 && n > 0; i++) {
    const s = a.inv[i]; if (!s || s.id !== id) continue;
    if (ITEMS[id].stack) { const t = Math.min(n, s.n); s.n -= t; n -= t; if (s.n <= 0) a.inv[i] = null; } else { a.inv[i] = null; n--; }
  }
}
function freeSlot(a) { for (let i = 0; i < 28; i++) if (!a.inv[i]) return i; return -1; }
function addItem(a, id, n) {
  n = n || 1; const it = ITEMS[id];
  if (it.stack) { for (const s of a.inv) if (s && s.id === id) { s.n += n; return true; } }
  if (it.stack || it.doses) { const f = freeSlot(a); if (f < 0) return false; a.inv[f] = { id, n: it.doses ? (n > 0 && n <= 4 ? n : 4) : n }; return true; }
  for (let k = 0; k < n; k++) { const f = freeSlot(a); if (f < 0) return false; a.inv[f] = { id, n: 1 }; }
  return true;
}

/* ---------------- pathfinding (BFS, RS corner rules) ---------------- */
const PF = { par: new Int32Array(MAPN * MAPN), seen: new Int32Array(MAPN * MAPN), q: new Int32Array(MAPN * MAPN), stamp: 0 };
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
function passable(x, y) { return x >= 0 && y >= 0 && x < MAPN && y < MAPN && !WORLD.block[y * MAPN + x]; }
function canStep(x, y, dx, dy) {
  if (!passable(x + dx, y + dy)) return false;
  if (dx && dy) return passable(x + dx, y) && passable(x, y + dy);
  return true;
}
/* goal(x,y) -> bool. nearest = {x,y}: when no goal found, walk to the reachable tile closest to it */
function findPath(sx, sy, goal, nearest, maxNodes) {
  const N = MAPN, par = PF.par, seen = PF.seen, q = PF.q; const st = ++PF.stamp; maxNodes = maxNodes || 4000;
  let head = 0, tail = 0; const s0 = sy * N + sx; q[tail++] = s0; seen[s0] = st; par[s0] = -1;
  let bestI = -1, bestD = 1e9, found = -1;
  while (head < tail) {
    const cur = q[head++]; const cx = cur % N, cy = (cur / N) | 0;
    if (goal(cx, cy)) { found = cur; break; }
    if (nearest) { const d = Math.hypot(cx - nearest.x, cy - nearest.y); if (d < bestD) { bestD = d; bestI = cur; } }
    if (tail > maxNodes) continue;
    for (let d = 0; d < 8; d++) {
      const dx = DIRS[d][0], dy = DIRS[d][1]; const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const ni = ny * N + nx; if (seen[ni] === st) continue;
      if (!canStep(cx, cy, dx, dy)) continue;
      seen[ni] = st; par[ni] = cur; q[tail++] = ni;
    }
  }
  if (found < 0) found = bestI;
  if (found < 0) return null;
  const path = []; let c = found; while (c !== s0 && c >= 0) { path.push({ x: c % N, y: (c / N) | 0 }); c = par[c]; }
  path.reverse(); return path;
}
const LOSB = new Uint8Array(MAPN * MAPN);
function initLoS() {
  for (let i = 0; i < LOSB.length; i++) LOSB[i] = WORLD.block[i];
  for (const o of WORLD.objs) LOSB[o.y * MAPN + o.x] = 0;
}
function hasLoS(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; }
    if (!(x === x1 && y === y1) && LOSB[y * MAPN + x]) return false;
  }
  return true;
}

/* ---------------- combat maths ---------------- */
function attackRange(a) {
  const w = weaponOf(a);
  if (a.pendingSpell || (a.autocast && w.magic)) return 10;
  if (w.ranged) { const st = styleOf(a); return w.range + (st.b === 'long' ? 2 : 0); }
  return 1;
}
function inRangeAt(x, y, t, rng) {
  const dx = Math.abs(x - t.x), dy = Math.abs(y - t.y);
  if (rng === 1) return dx + dy === 1;
  const d = Math.max(dx, dy); return d >= 1 && d <= rng && hasLoS(x, y, t.x, t.y);
}
function hitChance(atk, def) { return atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)); }
function typeIdx(t) { return t === 'stab' ? 0 : t === 'slash' ? 1 : 2; }
function defStyleBonus(t) { const st = styleOf(t); return st.b === 'def' ? 3 : st.b === 'ctl' ? 1 : 0; }

function addSplat(a, dmg) {
  a.splats.push({ dmg, t0: G.now, ox: rrange(-6, 6), oy: rrange(-2, 4) }); if (a.splats.length > 4) a.splats.shift();
  a.hpBarUntil = G.now + 6000;
}
function queueHit(h) { h.t = G.tick + h.delay; if (h.delay <= 0) applyHit(h); else G.hitQ.push(h); }
function applyHit(h) {
  const d = h.dst, s = h.src; if (d.dead || d.hp <= 0) return;
  let dmg = h.dmg;
  if (dmg > 0 && d.overhead === h.type && d.overhead && d.prayerBlock <= G.tick && d.prayers.has(overheadPrayer(d.overhead))) dmg = Math.floor(dmg * 0.6);
  if (dmg > d.hp) dmg = d.hp;
  d.hp -= dmg; addSplat(d, dmg); if (!h.spell) sfx(dmg >= 20 ? 'hitbig' : dmg > 0 ? 'hit' : 'miss', d.x, d.y); d.lastHitTick = G.tick; d.attackedBy[s.id] = G.tick; s.hpBarUntil = G.now + 6000;
  if (d.isPlayer) G.dmgTaken += dmg; if (s.isPlayer) G.dmgDealt += dmg;
  if (!d.dead && (!d.anim || (d.anim.type !== 'death' && G.now - d.anim.t0 > 350))) d.anim = { type: 'block', t0: G.now, dur: 400 };
  if (h.spell) {
    if (!h.splash) {
      if (h.spell.freeze && d.freezeImm <= 0 && d.frozen <= 0) { d.frozen = h.spell.freeze; d.freezeMax = h.spell.freeze; d.path.length = 0; if (d.isPlayer) gameMsg('You have been frozen!'); }
      if (h.spell.kind === 'blood' && !s.dead) { const heal = Math.floor(dmg * 0.25); s.hp = Math.min(s.maxHp, s.hp + heal); }
      G.effects.push({ type: h.spell.kind, x: d.x + 0.5, y: d.y + 0.5, t0: G.now, dur: 900 }); sfx(h.spell.kind === 'ice' ? 'ice' : 'blood', d.x, d.y);
    } else { G.effects.push({ type: 'splash', x: d.x + 0.5, y: d.y + 0.5, t0: G.now, dur: 700 }); sfx('splash', d.x, d.y); }
  }
  if (h.sever && dmg > 0 && d.overhead) { d.prayerBlock = G.tick + 8; for (const p of PRAYERS) if (p.ov) d.prayers.delete(p.id); d.overhead = null; if (d.isPlayer) gameMsg('Your protection prayer has been disabled!'); }
  if (dmg > 0 && s.prayers.has('smite') && d.pp > 0) d.pp = Math.max(0, d.pp - dmg / 4);
  if (d.hp > 0 && d.hp < d.maxHp * 0.1 && d.prayers.has('redemption')) {
    d.hp = Math.min(d.maxHp, d.hp + Math.floor(d.stats.pray * 0.25)); d.pp = 0; d.prayers.clear(); d.overhead = null; if (d.isPlayer) gameMsg('You have run out of prayer points; redemption heals you.');
  }
  // auto-retaliate
  if (d.hp > 0 && !d.target && d.autoRetal && !d.npc && s !== d && (d.isBot || (d.path.length === 0 && d.frozen >= 0))) { d.target = s; d.path.length = 0; }
  if (d.hp <= 0) killActor(d, s);
}
function overheadPrayer(ov) { return ov; }

function meleeMax(a, st, mult) {
  const eff = Math.floor(a.cur.str * prayMult(a, 'str')) + 8 + (st.b === 'agg' ? 3 : st.b === 'ctl' ? 1 : 0);
  return Math.floor(Math.floor(0.5 + eff * (a.bon[B_STR] + 64) / 640) * (mult || 1));
}
function rollAcc(atkRoll, defRoll) { return Math.random() < hitChance(atkRoll, defRoll); }

function doAttack(a, t) {
  const w = weaponOf(a); const st = styleOf(a); let kind, spell = null;
  if (a.pendingSpell) { spell = SPELL_BY_ID[a.pendingSpell]; kind = 'magic'; }
  else if (a.autocast && w.magic) { spell = SPELL_BY_ID[a.autocast]; kind = 'magic'; }
  else kind = w.ranged ? 'ranged' : 'melee';
  const dist = Math.max(Math.abs(a.x - t.x), Math.abs(a.y - t.y));
  // face and animate
  a.face = Math.atan2(t.x - a.x, t.y - a.y); a.lastKind = kind === 'magic' ? 'pmagic' : kind === 'ranged' ? 'pmissiles' : 'pmelee';
  // skull check
  if (!(a.attackedBy[t.id] && G.tick - a.attackedBy[t.id] < 120)) { if (a.skull <= 0 && a.isPlayer) gameMsg('You are now skulled.'); a.skull = Math.max(a.skull, 2000); }
  a.lastAtk = G.tick;
  let cd = w.speed;
  if (kind === 'melee') {
    let spec = null;
    if (a.specOn && w.spec) { if (a.spec >= w.spec.cost) { spec = w.spec; a.spec -= spec.cost; if (a.isPlayer) gameMsg('You use the ' + w.name + ' special attack.'); } a.specOn = false; }
    const atype = st.t; const ti = typeIdx(atype);
    const effA = Math.floor(a.cur.atk * prayMult(a, 'atk')) + 8 + (st.b === 'acc' ? 3 : st.b === 'ctl' ? 1 : 0);
    const effD = Math.floor(t.cur.def * prayMult(t, 'def')) + 8 + defStyleBonus(t);
    let aroll = effA * (a.bon[ti] + 64), droll = effD * (t.bon[5 + ti] + 64);
    let hits = 1, dmgMult = 1;
    if (spec) { hits = spec.hits || 1; aroll = Math.floor(aroll * (spec.acc || 1)); dmgMult = spec.dmg || 1; }
    const mx = meleeMax(a, st, dmgMult);
    const instant = spec && spec.instant;
    for (let i = 0; i < hits; i++) {
      const hit = rollAcc(aroll, droll); const dmg = hit ? rrange(0, mx) : 0;
      queueHit({ src: a, dst: t, dmg, type: 'pmelee', delay: 0, sever: spec && spec.sever });
    }
    a.anim = { type: (w.cat === 'maul' || atype === 'crush') ? 'crush' : atype === 'stab' ? 'stab' : 'slash', t0: G.now, dur: 480 };
    sfx(spec ? 'spec' : a.anim.type, a.x, a.y);
    if (instant) { cd = a.atkCd > 0 ? a.atkCd : w.speed; }
  } else if (kind === 'ranged') {
    const ammo = a.eq.ammo; const need = w.ammo;
    if (!ammo || ITEMS[ammo.id].ammoType !== need) { if (a.isPlayer) gameMsg('You have no ammo equipped.'); a.target = null; return; }
    let spec = null;
    if (a.specOn && w.spec) { if (a.spec >= w.spec.cost) { spec = w.spec; a.spec -= spec.cost; if (a.isPlayer) gameMsg('You use the ' + w.name + ' special attack.'); } a.specOn = false; }
    const effR = Math.floor(a.cur.rng) + 8 + (st.b === 'acc' ? 3 : 0);
    const effD = Math.floor(t.cur.def * prayMult(t, 'def')) + 8 + defStyleBonus(t);
    const aroll = effR * (a.bon[A_RANGE] + 64) * (spec ? (spec.acc || 1) : 1), droll = effD * (t.bon[D_RANGE] + 64);
    const mx = Math.floor(0.5 + effR * (a.bon[B_RSTR] + 64) / 640);
    const hits = spec ? (spec.hits || 1) : 1; const delay = 1 + Math.floor((3 + dist) / 6);
    for (let i = 0; i < hits; i++) {
      const hit = rollAcc(aroll, droll); const dmg = hit ? rrange(0, mx) : 0;
      queueHit({ src: a, dst: t, dmg, type: 'pmissiles', delay: delay + (i ? 0 : 0) });
      G.projs.push({ kind: w.model === 'bow' ? 'arrow' : 'bolt', sx: a.x + 0.5, sy: a.y + 0.5, tgt: t, t0: G.now + i * 60, t1: G.now + delay * TICK_MS * 0.85 + i * 60 });
    }
    ammo.n -= hits; if (ammo.n <= 0) a.eq.ammo = null; recalcBonus(a);
    a.anim = { type: 'bow', t0: G.now, dur: 500 }; sfx(spec ? 'spec' : 'bow', a.x, a.y);
    if (st.b === 'rapid') cd -= 1;
  } else { // magic
    if (a.stats.mag < spell.lvl) { if (a.isPlayer) gameMsg('You need a Magic level of ' + spell.lvl + ' to cast this spell.'); a.target = null; a.pendingSpell = null; return; }
    if (!a.isBot) for (const r in spell.runes) if (countItem(a, r) < spell.runes[r]) { if (a.isPlayer) gameMsg('You do not have enough ' + ITEMS[r].name + 's to cast this spell.'); a.target = null; a.pendingSpell = null; a.autocast = null; return; }
    if (!a.isBot) for (const r in spell.runes) removeItem(a, r, spell.runes[r]);
    const effM = Math.floor(a.cur.mag) + 8;
    const effD = Math.floor(0.7 * t.cur.mag + 0.3 * Math.floor(t.cur.def * prayMult(t, 'def'))) + 8;
    const aroll = effM * (a.bon[A_MAGIC] + 64), droll = effD * (t.bon[D_MAGIC] + 64);
    const mx = Math.floor(spell.max * (1 + a.bon[B_MDMG] / 100));
    const hit = rollAcc(aroll, droll); const dmg = hit ? rrange(0, mx) : 0; const delay = 1 + Math.floor((1 + dist) / 3);
    queueHit({ src: a, dst: t, dmg, type: 'pmagic', delay, spell, splash: !hit });
    G.projs.push({ kind: spell.kind, sx: a.x + 0.5, sy: a.y + 0.5, tgt: t, t0: G.now + 150, t1: G.now + delay * TICK_MS * 0.9 });
    a.anim = { type: 'cast', t0: G.now, dur: 600 }; cd = 5; sfx('cast', a.x, a.y);
    if (a.pendingSpell) { a.pendingSpell = null; if (!a.autocast) a.target = null; }
  }
  a.atkCd = cd;
}

function killActor(d, s) {
  const ov = d.overhead;
  d.dead = true; d.deathTick = G.tick; d.hp = 0; d.target = null; d.path.length = 0; d.follow = null; d.frozen = 0; d.job = null; d.anim = { type: 'death', t0: G.now, dur: 2400 };
  d.respawnAt = G.tick + (d.isPlayer ? 9 : 14);
  d.prayers.clear(); d.overhead = null; d.pendingSpell = null; d.splats.length = Math.min(d.splats.length, 2); sfx('death', d.x, d.y);
  s.kills = (s.kills || 0) + 1; d.deaths = (d.deaths || 0) + 1;
  if (s.isPlayer) { G.kills++; G.streak++; G.best = Math.max(G.best, G.streak); gameMsg('You have defeated ' + d.name + '.'); }
  if (d.isPlayer) { G.deaths++; G.streak = 0; G.dialog = null; gameMsg('Oh dear, you are dead!'); }
  if (s.isBot && chance(0.5)) sayOverhead(s, pick(['gf', 'ez', 'lol', 'noob', 'ty', 'nice try', 'l0l', 'owned', 'rofl']));
  if (ov === 'retribution') {
    for (const o of G.actors) if (o !== d && !o.dead && !o.npc && dist2(o.x, o.y, d.x, d.y) <= 1) { const dm = rint(Math.floor(d.stats.pray * 0.25) + 1); o.hp = Math.max(0, o.hp - dm); addSplat(o, dm); o.attackedBy[d.id] = G.tick; if (o.hp <= 0) killActor(o, d); }
  }
  if (!d.isPlayer) dropLoot(d);
  for (const o of G.actors) { if (o.target === d) o.target = null; if (o.follow === d) o.follow = null; }
}
function dropLoot(d) {
  const drops = []; const inv = d.inv.filter(Boolean);
  drops.push({ id: 'bones', n: 1 });
  drops.push({ id: 'coins', n: 20 + rint(80) + d.level * 3 });
  const pool = inv.filter(s => s.id !== 'death' && s.id !== 'blood' && s.id !== 'water');
  for (let i = 0; i < 2 && pool.length; i++) { const s = pool.splice(rint(pool.length), 1)[0]; drops.push({ id: s.id, n: ITEMS[s.id].stack ? Math.max(1, Math.floor(s.n * 0.5)) : (ITEMS[s.id].doses ? s.n : 1) }); }
  const w = d.eq.weapon; if (w && chance(0.35)) drops.push({ id: w.id, n: 1 });
  for (const it of drops) G.ground.push({ id: it.id, n: it.n, x: d.x, y: d.y, t: G.tick, owner: d });
}

/* ---------------- consumables ---------------- */
function eatFood(a, idx) {
  const s = a.inv[idx]; if (!s || a.dead) return; const it = ITEMS[s.id];
  if (a.eatCd > 0) return;
  a.inv[idx] = null; a.eatCd = 3; a.atkCd += 3; sfx('eat', a.x, a.y);
  const before = a.hp; a.hp = Math.min(a.maxHp > a.hp ? a.maxHp : a.hp, a.hp + it.food.heal);
  if (a.isPlayer) { gameMsg('You eat the ' + it.name.toLowerCase() + '.'); if (a.hp > before) gameMsg('It heals some health.'); }
}
function drinkPotion(a, idx) {
  const s = a.inv[idx]; if (!s || a.dead) return; const it = ITEMS[s.id]; if (a.potCd > 0) return;
  a.potCd = 3; s.n--; const L = a.stats; sfx('drink', a.x, a.y);
  const boost = (k, add, pct) => { a.cur[k] = Math.max(a.cur[k], L[k] + add + Math.floor(L[k] * pct)); };
  switch (it.pot) {
    case 'supatk': boost('atk', 5, 0.15); break; case 'supstr': boost('str', 5, 0.15); break; case 'supdef': boost('def', 5, 0.15); break;
    case 'ranging': boost('rng', 4, 0.10); break;
    case 'prayer': a.pp = Math.min(L.pray, a.pp + Math.floor(L.pray / 4) + 7); break;
    case 'restore': a.pp = Math.min(L.pray, a.pp + Math.floor(L.pray / 4) + 8); for (const k of ['atk', 'str', 'def', 'rng', 'mag']) a.cur[k] = Math.max(a.cur[k], L[k]); break;
    case 'brew': {
      const heal = Math.floor(a.maxHp * 0.15) + 2; a.hp = Math.min(a.maxHp + heal, a.hp + heal);
      a.cur.def = Math.max(a.cur.def, L.def + Math.floor(L.def * 0.2) + 2);
      for (const k of ['atk', 'str', 'rng', 'mag']) a.cur[k] = Math.max(1, a.cur[k] - (Math.floor(L[k] * 0.1) + 2));
      break;
    }
  }
  if (a.isPlayer) { gameMsg('You drink some of your ' + it.name.toLowerCase() + ' potion.'); gameMsg(s.n > 0 ? 'You have ' + s.n + ' dose' + (s.n > 1 ? 's' : '') + ' of potion left.' : 'You have finished your potion.'); }
  if (s.n <= 0) a.inv[idx] = null;
}
function equipFromInv(a, idx) {
  const s = a.inv[idx]; if (!s || a.dead) return false; const it = ITEMS[s.id];
  if (!it.slot) { if (a.isPlayer) gameMsg("You can't wear that."); return false; }
  const cur = a.eq[it.slot];
  if (it.slot === 'ammo' && cur && cur.id === s.id) { cur.n += s.n; a.inv[idx] = null; recalcBonus(a); return true; }
  // a two-hander pushes the shield out, and a shield pushes a two-hander out
  const off = it.two && a.eq.shield ? a.eq.shield : (it.slot === 'shield' && a.eq.weapon && ITEMS[a.eq.weapon.id].two ? a.eq.weapon : null);
  a.inv[idx] = null;
  let free = 0; for (const x of a.inv) if (!x) free++;
  if (free < (cur ? 1 : 0) + (off ? 1 : 0)) { a.inv[idx] = s; if (a.isPlayer) gameMsg('You don\'t have enough inventory space.'); return false; }
  if (off) { a.inv[freeSlot(a)] = off; if (off === a.eq.shield) a.eq.shield = null; else a.eq.weapon = null; }
  a.eq[it.slot] = s;
  if (cur) a.inv[freeSlot(a)] = cur;
  if (it.slot === 'weapon') { a.style = 0; a.specOn = false; if (!it.magic) a.autocast = null; }
  recalcBonus(a); if (a.isPlayer) sfx('equip'); return true;
}
function unequipSlot(a, slot) {
  const s = a.eq[slot]; if (!s || a.dead) return;
  if (ITEMS[s.id].stack) { if (!addItem(a, s.id, s.n)) { if (a.isPlayer) gameMsg('You don\'t have enough inventory space.'); return; } }
  else { const f = freeSlot(a); if (f < 0) { if (a.isPlayer) gameMsg('You don\'t have enough inventory space.'); return; } a.inv[f] = s; }
  a.eq[slot] = null; if (slot === 'weapon') { a.style = 0; a.specOn = false; a.autocast = null; }
  recalcBonus(a);
}

/* ---------------- prayers ---------------- */
function togglePrayer(a, id, quiet) {
  const p = PRAYER_BY_ID[id]; if (a.dead) return;
  if (a.prayers.has(id)) { a.prayers.delete(id); if (p.ov && a.overhead === p.ov) a.overhead = null; if (a.isPlayer && !quiet) sfx('prayoff'); return; }
  if (a.stats.pray < p.lvl) { if (a.isPlayer && !quiet) gameMsg('You need a Prayer level of ' + p.lvl + ' to use ' + p.name + '.'); return; }
  if (a.pp <= 0) { if (a.isPlayer && !quiet) gameMsg('You have run out of Prayer points; you must recharge at an altar.'); return; }
  if (p.ov && a.prayerBlock > G.tick) return;
  for (const o of PRAYERS) if (o.id !== id && o.grp === p.grp) a.prayers.delete(o.id);
  a.prayers.add(id); if (p.ov) a.overhead = p.ov; if (a.isPlayer && !quiet) sfx('prayon');
}
function drainPrayer(a) {
  if (!a.prayers.size) return;
  let sum = 0; for (const id of a.prayers) sum += PRAYER_BY_ID[id].drain;
  a.drain += sum; const res = 60 + 2 * a.bon[B_PRAY];
  while (a.drain >= res) { a.drain -= res; a.pp = Math.max(0, a.pp - 1); }
  if (a.pp <= 0) { a.pp = 0; a.prayers.clear(); a.overhead = null; if (a.isPlayer) gameMsg('You have run out of Prayer points; you must recharge at an altar.'); }
}

/* ---------------- the per-tick actor step ---------------- */
function faceStep(a, dx, dy) { if (dx || dy) a.face = Math.atan2(dx, dy); }
function moveAlong(a) {
  const steps = (a.runOn && a.run >= 1) ? 2 : 1; let moved = 0;
  for (let i = 0; i < steps && a.path.length; i++) {
    const n = a.path.shift(); if (!passable(n.x, n.y)) { a.path.length = 0; break; }
    a.seg.push({ fx: a.x, fy: a.y, tx: n.x, ty: n.y }); faceStep(a, n.x - a.x, n.y - a.y); a.x = n.x; a.y = n.y; moved++;
    if (a.target) { if (inRangeAt(a.x, a.y, a.target, attackRange(a))) { a.path.length = 0; break; } }
  }
  if (moved === 2) a.run = Math.max(0, a.run - 0.67);
  return moved;
}
function stepActor(a) {
  a.seg.length = 0; a.moving = false;
  if (a.npc) return;
  if (a.dead) { if (G.tick >= a.respawnAt) respawn(a); return; }
  // timers
  if (a.atkCd > 0) a.atkCd--; if (a.eatCd > 0) a.eatCd--; if (a.potCd > 0) a.potCd--;
  if (a.frozen > 0) { a.frozen--; if (a.frozen === 0) a.freezeImm = 5; } else if (a.freezeImm > 0) a.freezeImm--;
  if (a.skull > 0) a.skull--;
  if (++a.hpT >= 100) { a.hpT = 0; if (a.hp < a.maxHp) a.hp++; else if (a.hp > a.maxHp) a.hp--; }
  if (++a.boostT >= 100) { a.boostT = 0; for (const k of ['atk', 'str', 'def', 'rng', 'mag']) { if (a.cur[k] > a.stats[k]) a.cur[k]--; else if (a.cur[k] < a.stats[k]) a.cur[k]++; } }
  if (++a.specT >= 50) { a.specT = 0; a.spec = Math.min(100, a.spec + 10); }
  drainPrayer(a);
  if (a.isBot) {
    botThink(a);
    if (a.ai.kiteTick === G.tick && a.path.length && a.frozen <= 0) { if (moveAlong(a)) a.moving = true; a.ai.kiteTick = -1; return; }
  }
  // combat / movement
  let t = a.target; if (t && (t.dead || t.hp <= 0)) { a.target = t = null; }
  if (t) {
    const rng = attackRange(a);
    if (inRangeAt(a.x, a.y, t, rng)) {
      a.path.length = 0; a.face = Math.atan2(t.x - a.x, t.y - a.y);
      const w = weaponOf(a); const instant = a.specOn && w.spec && w.spec.instant && a.spec >= w.spec.cost;
      if (a.atkCd <= 0 || instant) doAttack(a, t);
    } else if (a.frozen > 0) {
      a.path.length = 0;
    } else {
      const p = findPath(a.x, a.y, (x, y) => inRangeAt(x, y, t, rng), { x: t.x, y: t.y }, 2500);
      if (p) { a.path = p; if (moveAlong(a)) a.moving = true; }
    }
  } else if (a.follow && !a.follow.dead) {
    const f = a.follow; if (dist2(a.x, a.y, f.x, f.y) > 1 || (a.x === f.x && a.y === f.y)) {
      if (a.frozen <= 0) { const p = findPath(a.x, a.y, (x, y) => Math.abs(x - f.x) + Math.abs(y - f.y) === 1, { x: f.x, y: f.y }, 2500); if (p) { a.path = p; if (moveAlong(a)) a.moving = true; } }
    }
  } else if (a.path.length) {
    if (a.frozen > 0) { if (a.isPlayer) gameMsg('A magical force stops you from moving.'); a.path.length = 0; }
    else if (moveAlong(a)) a.moving = true;
  }
  if (a.seg.length) a.moving = true;
  if (a.seg.length < 2) a.run = Math.min(100, a.run + 0.3);
  if (a.job) { const j = a.job; if (j.near(a)) { a.job = null; a.path.length = 0; j.run(); } else if (!a.path.length && !a.seg.length) a.job = null; }
}
function respawn(a) {
  a.dead = false; a.hp = a.maxHp; a.pp = a.stats.pray; a.cur = Object.assign({}, a.stats); a.run = 100; a.spec = 100; a.frozen = 0; a.freezeImm = 0; a.skull = 0; a.anim = null;
  a.atkCd = 2; a.prayers.clear(); a.overhead = null; a.seg.length = 0; a.path.length = 0; a.target = null; a.splats.length = 0; a.eatCd = 0; a.potCd = 0;
  const sp = a.isPlayer ? spawnPoint(true) : spawnPoint(false); a.x = sp.x; a.y = sp.y;
  applyLoadout(a, a.isPlayer ? (a.loadoutKind || 'main') : a.ai.kind);
  if (a.isPlayer) { gameMsg('You have been transported back to the Grand Exchange.'); G.spellSel = null; a.protectUntil = G.tick + 20; }
  else if (a.ai) { a.ai.fleeT = 0; a.ai.kiteTick = -1; a.ai.kiteCd = 0; }
}
function spawnPoint(player) {
  if (player) return { x: GEC + rrange(-4, 4), y: GEC - 14 + rrange(-1, 1) };
  for (let i = 0; i < 200; i++) {
    const ang = Math.random() * TAU, r = player ? 11 + Math.random() * 3 : 9 + Math.random() * 10;
    const x = Math.round(GEC + Math.cos(ang) * r), y = Math.round(GEC + Math.sin(ang) * r);
    if (passable(x, y) && (player ? true : true)) { const near = G.actors.some(o => !o.dead && !o.npc && dist2(o.x, o.y, x, y) < 4); if (!near) return { x, y }; }
  }
  return { x: GEC + 12, y: GEC };
}

/* ---------------- the global tick ---------------- */
function gameTick() {
  G.tick++;
  // land delayed hits
  if (G.hitQ.length) { const due = G.hitQ.filter(h => h.t <= G.tick); G.hitQ = G.hitQ.filter(h => h.t > G.tick); for (const h of due) { if (h.src.dead && false) continue; applyHit(h); } }
  const order = G.actors.slice(); // player first
  for (const a of order) stepActor(a);
  // ground items despawn
  if (G.ground.length) G.ground = G.ground.filter(g => G.tick - g.t < 250);
}
/* interpolated render position (tile coords) */
function renderPos(a, frac) {
  if (!a.seg.length) return [a.x + 0.5, a.y + 0.5];
  const n = a.seg.length, t = clamp(frac, 0, 1) * n, i = Math.min(n - 1, Math.floor(t)), f = t - i; const s = a.seg[i];
  return [lerp(s.fx, s.tx, f) + 0.5, lerp(s.fy, s.ty, f) + 0.5];
}
