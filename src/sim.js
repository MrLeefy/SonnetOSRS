/* sim.js - the tick-based world simulation: movement, combat, zones, loot, inventory, bank and shops.
   Rendering-free and event driven, so it also runs headless (tools/simtest.mjs). */
import { STYLES, ACC, SPECIALS, WARD_REDUCE, DEADEYE_WARD_REDUCE, EAT_DELAY, BOT_NAMES, rint, pick, chance, clamp, lerp } from './data.js';
import { SPAWN, WILDS, GRAVE, npcSpots, nodes as WORLD_NODES, zoneAt, canStep, hasLoS, findPath, cheb, randomFreeTile, DIRS } from './world.js';
import { ITEMS, TIERS, SLOTS, WEAPON_SLOT, ARMOUR_SLOT, INV_SIZE, weaponMul, weaponAcc, armourCut, addItem, takeItem, countItem, newSave, levelOf, sellPrice, NODE, SKILLS, TASKS, FORGE, RECIPES, skillLevel } from './items.js';
import { QUESTS, questStatus } from './quests.js';
import { botThink, monsterThink } from './ai.js';

let NEXT_ID = 1;
const MONSTERS = {
  minion:  { name: 'Bone Thrall',   look: 'sk_minion',  stance: 'melee',  hp: 38,  max: 8,  n: 3, respawn: 25, coins: [5, 16] },
  archer:  { name: 'Bone Stalker',  look: 'sk_rogue',   stance: 'ranged', hp: 42,  max: 9,  n: 2, respawn: 30, coins: [8, 22] },
  hexer:   { name: 'Bone Hexer',    look: 'sk_mage',    stance: 'magic',  hp: 40,  max: 9,  n: 1, respawn: 30, coins: [10, 26] },
  warden:  { name: 'The Barrow Warden', look: 'sk_warrior', stance: 'melee', hp: 240, max: 22, n: 1, respawn: 160, coins: [240, 420], scale: 1.55, boss: true }
};
const RIVALS = 6;

export class Game {
  constructor(opts = {}) {
    this.tick = 0; this.actors = []; this.hitQ = []; this.loot = []; this.listeners = []; this.respawns = []; this.usedNames = new Set(); this.dirty = false;
    this.save = opts.save || newSave(); this.player = null; this.streak = 0; this.rev = 0;
    const sv = this.save; sv.skills = Object.assign({ wood: 0, mine: 0, fish: 0, cook: 0, smith: 0, fletch: 0, herb: 0, melee: 0, ranged: 0, magic: 0, defence: 0 }, sv.skills); sv.count = sv.count || {}; sv.tasks = sv.tasks || {}; sv.quests = sv.quests || {};
    this.nodes = WORLD_NODES.map((n, i) => Object.assign({ id: i, left: NODE[n.type].cap ? NODE[n.type].cap[0] + rint(NODE[n.type].cap[1]) : 0, depleted: false, regrowAt: 0 }, n));
    if (!opts.spectate) {
      const p = this.player = this.makeActor({ name: 'You', kind: 'player', isPlayer: true, look: 'hero', team: 'ffa', x: SPAWN.x, y: SPAWN.y });
      p.inv = this.save.inv; while (p.inv.length < INV_SIZE) p.inv.push(null); p.eq = this.save.eq; p.face = Math.PI; this.refreshPlayer(true);
    }
    const titles = { banker: 'Banker', smith: 'Smith', merchant: 'Merchant' }, looks = { banker: 'mage', smith: 'barbarian', merchant: 'rogue' };
    for (const k in npcSpots) { const s = npcSpots[k], a = this.makeActor({ name: titles[k], kind: 'npc', npc: k, look: 'npc_' + looks[k], team: 'npc', x: s.x, y: s.y }); a.face = s.face; a.stance = k === 'banker' ? 'magic' : k === 'smith' ? 'melee' : 'ranged'; }
    for (let i = 0; i < RIVALS; i++) this.spawnRival();
    for (const k in MONSTERS) for (let i = 0; i < MONSTERS[k].n; i++) this.spawnMonster(k);
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, d) { for (const fn of this.listeners) fn(type, d || {}); }

  /* ---------------- actors ---------------- */
  makeActor(o) {
    const a = Object.assign({
      id: NEXT_ID++, seg: [], path: [], face: 0, hp: 99, maxHp: 99, focus: 100, spec: 100, stance: 'melee', ward: null, target: null, atkCd: 0, eatCd: 0, frozen: 0, freezeImm: 0,
      dead: false, deadAt: 0, specArmed: false, food: 0, tonics: 0, protectUntil: 0, dmgFrom: new Map(), lastAttacker: null, lastHurtTick: -99, moving: false,
      dmgMul: 1, acc: 0, armour: { melee: 0, ranged: 0, magic: 0 }, wmax: null, tier: 0, scale: 1, interact: null, ai: null, home: null
    }, o);
    this.actors.push(a); return a;
  }
  spawnRival() {
    let name; for (let i = 0; i < 50; i++) { name = pick(BOT_NAMES); if (!this.usedNames.has(name)) break; } this.usedNames.add(name);
    const tier = pick([0, 0, 1, 1, 1, 2, 2, 3]), arch = pick(['brute', 'brute', 'stalker', 'stalker', 'hexer', 'warden', 'warden']);
    const sp = randomFreeTile(WILDS.x, WILDS.y, 3, WILDS.r - 3, (x, y) => !this.actors.some(o => !o.dead && cheb(o.x, o.y, x, y) < 5));
    const a = this.makeActor({ name, kind: 'rival', arch, look: arch === 'brute' ? 'brute' : 'hero', team: 'ffa', x: sp.x, y: sp.y, tier, home: { x: WILDS.x, y: WILDS.y, r: WILDS.r + 1 } });
    a.maxHp = a.hp = 70 + tier * 10; a.dmgMul = (0.72 + tier * 0.1); a.acc = tier * 0.02; for (const s in a.armour) a.armour[s] = armourCut(tier) * 0.7;
    a.food = 2 + tier + rint(3); a.tonics = 1 + rint(2); a.spec = 40 + rint(60); a.protectUntil = this.tick + 3; a.face = Math.random() * 6.28;
    a.stances = { brute: ['melee'], stalker: ['ranged', 'melee'], hexer: ['magic'], warden: ['melee', 'ranged', 'magic'] }[arch]; a.stance = a.stances[0];
    a.ai = { skill: clamp(0.32 + tier * 0.13 + (Math.random() - 0.5) * 0.2, 0.1, 0.95), react: 0, retarget: rint(4), wander: rint(5), kiteCd: 0, flee: 0, restance: 0 };
    this.emit('spawn', { a }); return a;
  }
  spawnMonster(k) {
    const M = MONSTERS[k], sp = randomFreeTile(GRAVE.x, GRAVE.y, M.boss ? 0 : 2, M.boss ? 3 : GRAVE.r - 2);
    const a = this.makeActor({ name: M.name, kind: 'monster', mon: k, look: M.look, team: 'undead', x: sp.x, y: sp.y, scale: M.scale || 1, boss: !!M.boss, home: { x: GRAVE.x, y: GRAVE.y, r: GRAVE.r + 3 } });
    a.maxHp = a.hp = M.hp; a.wmax = M.max; a.stance = M.stance; a.focus = 0; a.spec = 0; a.face = Math.random() * 6.28; a.ai = { wander: rint(6), mon: true };
    this.emit('spawn', { a }); return a;
  }
  /* recompute everything derived from the player's gear, level and bag */
  refreshPlayer(full) {
    const p = this.player, s = this.save, lvl = levelOf(s.xp); p.level = lvl; p.maxHp = 60 + Math.min(lvl, 20) * 2; if (full) p.hp = p.maxHp; p.hp = Math.min(p.hp, p.maxHp);
    for (const st in WEAPON_SLOT) p.armour[st] = Math.min(0.55, armourCut(ITEMS[p.eq[ARMOUR_SLOT[st]]].tier) + (skillLevel(s.skills.defence) - 1) * 0.002);
    p.food = p.inv.reduce((n, x) => n + (x && ITEMS[x.id].kind === 'food' ? x.n : 0), 0); p.tonics = countItem(p.inv, 'tonic'); this.dirty = true; this.rev++;
    for (const t of TASKS) if (!s.tasks[t.id] && t.ok(s)) { s.tasks[t.id] = 1; s.coins += t.r; this.emit('task', { task: t }); }
  }
  weaponTier(a) { return a.isPlayer ? ITEMS[a.eq[WEAPON_SLOT[a.stance]]].tier : a.tier; }
  safe(a) { return zoneAt(a.x, a.y) === 'town'; }

  /* ---------------- player commands ---------------- */
  cmdGather(n) { const p = this.player; if (p.dead) return; p.target = null; p.interact = null; p.path = []; p.gather = n; p.gCd = 1; }
  cmdMove(x, y) { const p = this.player; if (p.dead) return false; p.target = null; p.interact = null; p.gather = null; p.path = findPath(p.x, p.y, (px, py) => px === x && py === y, x, y, 6000); return p.path.length > 0; }
  cmdAttack(t) {
    const p = this.player; if (p.dead || !t || t.dead || t === p) return;
    p.gather = null;
    if (t.kind === 'npc') { p.target = null; p.interact = t; p.path = []; return; }
    if (this.safe(t)) { this.emit('msg', { text: `${t.name} is inside the safe zone.` }); return; }
    if (this.safe(p)) this.emit('msg', { text: 'You cannot fight inside Hollowmere - step outside the walls.', soft: true });
    p.interact = null; p.target = t; p.path = [];
  }
  setStance(a, s) { if (a.dead || a.stance === s) return; a.stance = s; a.specArmed = false; if (a.target) a.path = []; this.emit('stance', { a }); }
  setWard(a, w) {
    if (a.dead) return; if (w && a.focus <= 0) { if (a.isPlayer) this.emit('msg', { text: 'Out of focus - drink a tonic.' }); return; }
    a.ward = a.ward === w ? null : w; this.emit('ward', { a });
  }
  eat(a) {
    if (a.dead || a.eatCd > 0 || a.food <= 0 || a.hp >= a.maxHp) return false; let heal = 16;
if (a.isPlayer) { // smallest food that covers the wound, otherwise the biggest we have
      const foods = a.inv.filter(x => x && ITEMS[x.id].kind === 'food').map(x => ITEMS[x.id]).sort((x, y) => x.heal - y.heal), need = a.maxHp - a.hp, it = foods.find(f => f.heal >= need) || foods[foods.length - 1];
      takeItem(a.inv, it.id); heal = it.heal; this.refreshPlayer(); } else a.food--;
    a.hp = Math.min(a.maxHp, a.hp + heal); a.eatCd = EAT_DELAY; a.atkCd = Math.max(a.atkCd, 2); this.emit('eat', { a, heal }); return true;
  }
  tonic(a) {
    if (a.dead || a.eatCd > 0 || a.tonics <= 0 || a.focus >= 100) return false;
    if (a.isPlayer) { takeItem(a.inv, 'tonic'); this.refreshPlayer(); } else a.tonics--;
    a.focus = Math.min(100, a.focus + 40); a.eatCd = EAT_DELAY; this.emit('tonic', { a }); return true;
  }
  toggleSpec(a) {
    if (a.dead) return; const sp = SPECIALS[a.stance];
    if (!a.specArmed && a.spec < sp.cost) { if (a.isPlayer) this.emit('msg', { text: 'Not enough special energy.' }); return; }
    a.specArmed = !a.specArmed; this.emit('spec', { a });
  }
  respawnPlayer() {
    const p = this.player; if (!p.dead) return;
    Object.assign(p, { dead: false, focus: 100, spec: 100, ward: null, target: null, interact: null, frozen: 0, freezeImm: 0, atkCd: 0, eatCd: 0, specArmed: false, lastAttacker: null, x: SPAWN.x, y: SPAWN.y, seg: [], path: [], face: Math.PI });
    p.dmgFrom.clear(); this.refreshPlayer(true); this.emit('spawn', { a: p });
  }
  /* ---- bag, gear, bank, shops (player only) ---- */
  useSlot(i) {
    const p = this.player, s = p.inv[i]; if (!s || p.dead) return; const it = ITEMS[s.id];
    if (it.kind === 'food') { if (!this.eatItem(s.id)) this.emit('msg', { text: p.hp >= p.maxHp ? 'Already at full health.' : 'Not yet...' }); }
    else if (it.kind === 'tonic') { if (!this.tonic(p)) this.emit('msg', { text: p.focus >= 100 ? 'Focus is already full.' : 'Not yet...' }); }
    else if (!it.slot) this.emit('msg', { text: it.desc || 'This item is a crafting material.' });
    else {
      // Simulate the swap first: a full bag must never destroy worn equipment.
      const next = p.inv.map(x => x ? { ...x } : null), old = p.eq[it.slot];
      next[i].n--; if (!next[i].n) next[i] = null;
      if (old && !addItem(next, old)) { this.emit('msg', { text: 'Free a bag slot before changing gear.' }); return; }
      p.inv.splice(0, p.inv.length, ...next); p.eq[it.slot] = s.id;
      this.refreshPlayer(); this.emit('equip', { a: p, id: it.id });
    }
  }
  eatItem(id) { const p = this.player; if (p.dead || p.eatCd > 0 || p.hp >= p.maxHp || !takeItem(p.inv, id)) return false; const heal = ITEMS[id].heal; p.hp = Math.min(p.maxHp, p.hp + heal); p.eatCd = EAT_DELAY; p.atkCd = Math.max(p.atkCd, 2); this.refreshPlayer(); this.emit('eat', { a: p, heal }); return true; }
  dropSlot(i) { const p = this.player, s = p.inv[i]; if (!s) return; p.inv[i] = null; this.dropLoot(p.x, p.y, 0, [s]); this.refreshPlayer(); }
  deposit(i) { const p = this.player, s = p.inv[i], b = this.save.bank; if (!s) return; b.items[s.id] = (b.items[s.id] || 0) + s.n; p.inv[i] = null; this.refreshPlayer(); }
  depositAll() { const p = this.player, b = this.save.bank; p.inv.forEach((s, i) => { if (s) { b.items[s.id] = (b.items[s.id] || 0) + s.n; p.inv[i] = null; } }); b.coins += this.save.coins; this.save.coins = 0; this.refreshPlayer(); }
  withdraw(id, all) { const p = this.player, b = this.save.bank, have = b.items[id] || 0; if (!have) return; const n = all ? have : Math.min(have, ITEMS[id].kind === 'food' || ITEMS[id].kind === 'tonic' ? 5 : 1); if (!addItem(p.inv, id, n)) { this.emit('msg', { text: 'Your bag is full.' }); return; } b.items[id] = have - n; if (!b.items[id]) delete b.items[id]; this.refreshPlayer(); }
  moveCoins(toBank) { const s = this.save; if (toBank) { s.bank.coins += s.coins; s.coins = 0; } else { s.coins += s.bank.coins; s.bank.coins = 0; } this.dirty = true; this.rev++; }
  buy(id) {
    const s = this.save, price = ITEMS[id].price; if (s.coins + s.bank.coins < price) { this.emit('msg', { text: 'Not enough coins.' }); return false; }
    if (!addItem(this.player.inv, id)) { this.emit('msg', { text: 'Your bag is full.' }); return false; }
    const c = Math.min(s.coins, price); s.coins -= c; s.bank.coins -= price - c; this.refreshPlayer(); this.emit('trade', {}); return true;
  }
  /* smith your own gear from ore and logs instead of paying coins */
  forge(id) {
    const p = this.player, s = this.save, F = FORGE[ITEMS[id].tier], lvl = skillLevel(s.skills.smith);
    if (lvl < F.lvl) { this.emit('msg', { text: `Needs Smithing level ${F.lvl}. Forge simpler pieces first.` }); return false; }
    if (countItem(p.inv, 'ore') < F.ore || countItem(p.inv, 'logs') < F.logs) { this.emit('msg', { text: `Needs ${F.ore} ore and ${F.logs} logs in your bag.` }); return false; }
    takeItem(p.inv, 'ore', F.ore); takeItem(p.inv, 'logs', F.logs); if (!addItem(p.inv, id)) { addItem(p.inv, 'ore', F.ore); addItem(p.inv, 'logs', F.logs); this.emit('msg', { text: 'Your bag is full.' }); return false; }
    s.skills.smith += F.ore * 22; s.count.forged = (s.count.forged || 0) + 1; const l2 = skillLevel(s.skills.smith); if (l2 > lvl) this.emit('skill', { name: 'Smithing', level: l2 });
    this.refreshPlayer(); this.emit('trade', {}); return true;
  }
  craft(id) {
    const recipe = RECIPES.find(r => r.id === id), p = this.player, s = this.save;
    if (!recipe || !p || p.dead) return false;
    const spot = npcSpots[recipe.station === 'smith' ? 'smith' : 'merchant'];
    if (cheb(p.x, p.y, spot.x, spot.y) > 3) { this.emit('msg', { text: 'Return to the workbench to craft.' }); return false; }
    const lvl = skillLevel(s.skills[recipe.skill]);
    if (lvl < recipe.level) { this.emit('msg', { text: 'Requires ' + recipe.skill + ' level ' + recipe.level + '.' }); return false; }
    const next = p.inv.map(x => x ? { ...x } : null);
    if (Object.entries(recipe.costs).some(([item, n]) => countItem(next, item) < n)) {
      this.emit('msg', { text: 'You need ' + Object.entries(recipe.costs).map(([k, n]) => n + ' ' + ITEMS[k].name).join(' and ') + '.' }); return false;
    }
    for (const [item, n] of Object.entries(recipe.costs)) takeItem(next, item, n);
    if (!addItem(next, recipe.id, recipe.makes)) { this.emit('msg', { text: 'Your bag is full.' }); return false; }
    p.inv.splice(0, p.inv.length, ...next);
    s.skills[recipe.skill] += recipe.xp;
    s.count['crafted_' + recipe.id] = (s.count['crafted_' + recipe.id] || 0) + 1;
    if (skillLevel(s.skills[recipe.skill]) > lvl) this.emit('skill', { name: SKILLS[recipe.skill].name, level: skillLevel(s.skills[recipe.skill]) });
    this.refreshPlayer(); this.emit('craft', { item: ITEMS[id], n: recipe.makes }); return true;
  }
  quest(id) {
    const q = QUESTS.find(x => x.id === id), p = this.player, s = this.save;
    if (!q || !p || p.dead) return false;
    const npc = npcSpots[q.giver];
    if (cheb(p.x, p.y, npc.x, npc.y) > 3) { this.emit('msg', { text: 'Speak to the ' + q.giver + ' in town.' }); return false; }
    const st = questStatus(q, s, p.inv);
    if (st.state === 'locked' || st.state === 'done') return false;
    if (st.state === 'available') {
      s.quests[id] = { done: false, start: { undead: s.count.undead || 0, bossKills: s.bossKills || 0 } };
      this.refreshPlayer(); this.emit('quest', { quest: q, phase: 'start' }); return true;
    }
    if (st.state !== 'ready') { this.emit('msg', { text: 'Not finished yet: ' + st.progress }); return false; }
    const next = p.inv.map(x => x ? { ...x } : null);
    for (const [item, n] of Object.entries(q.items)) if (!takeItem(next, item, n)) return false;
    p.inv.splice(0, p.inv.length, ...next);
    for (const item of q.reward.items) if (!addItem(p.inv, item.id, item.n)) {
      s.bank.items[item.id] = (s.bank.items[item.id] || 0) + item.n;
      this.emit('msg', { text: ITEMS[item.id].name + ' was deposited in your vault (bag full).' });
    }
    s.coins += q.reward.coins; s.quests[id].done = true;
    this.refreshPlayer(); this.emit('quest', { quest: q, phase: 'complete' }); return true;
  }
  sell(i) { const p = this.player, s = p.inv[i]; if (!s) return; this.save.coins += sellPrice(s.id); s.n--; if (s.n <= 0) p.inv[i] = null; this.refreshPlayer(); this.emit('trade', {}); }

  /* ---------------- combat ---------------- */
  inRange(a, t, x = a.x, y = a.y) { const d = cheb(x, y, t.x, t.y); return d > 0 && d <= STYLES[a.stance].range && hasLoS(x, y, t.x, t.y); }
  canFight(a, t) { return !this.safe(a) && !this.safe(t) && this.tick >= t.protectUntil; }
  attack(a, t) {
    const style = a.stance, S = STYLES[style]; let spec = null;
    if (a.specArmed) { a.specArmed = false; if (a.spec >= SPECIALS[style].cost) { a.spec -= SPECIALS[style].cost; spec = style; } }
    a.atkCd = S.speed; a.face = Math.atan2(t.x - a.x, t.y - a.y); a.path = [];
    const wt = this.weaponTier(a), mastery = a.isPlayer ? skillLevel(this.save.skills[style]) - 1 : 0;
    let mul = a.isPlayer ? weaponMul(wt) * (1 + mastery * 0.01) : a.dmgMul;
    const accB = a.isPlayer ? weaponAcc(wt) + mastery * 0.0025 : a.acc, base = a.wmax || S.max;
    if (a.isPlayer && style === 'ranged' && countItem(a.inv, 'bolts') > 0) {
      takeItem(a.inv, 'bolts'); mul *= 1.12; this.refreshPlayer();
    }
    const delay = style === 'melee' ? 0 : 1 + Math.floor(cheb(a.x, a.y, t.x, t.y) / 4);
    const roll = (accBonus, maxMul, minFrac = 0) => { if (!chance(Math.min(1, ACC[style][t.stance] + accB + accBonus))) return 0; const max = base * maxMul * mul; return Math.max(1, Math.round(lerp(minFrac * max, max, Math.random()))); };
    const hits = [];
    if (spec === 'melee') hits.push({ t, dmg: roll(0.2, 0.95) }, { t, dmg: roll(0.2, 0.95), late: true });
    else if (spec === 'ranged') hits.push({ t, dmg: roll(1, 1.3, 0.4), pierce: true });
    else if (spec === 'magic') {
      hits.push({ t, dmg: roll(0.2, 1.25, 0.3), freeze: 12, force: true });
      for (const o of this.actors) if (o !== t && o !== a && !o.dead && o.kind !== 'npc' && o.team !== (a.team === 'undead' ? 'undead' : '') && cheb(o.x, o.y, t.x, t.y) <= 1 && !this.safe(o)) hits.push({ t: o, dmg: Math.round(roll(0, 0.6)), freeze: 8, force: true, splash: true });
    } else hits.push({ t, dmg: roll(0, 1), freeze: a.kind === 'monster' ? 3 * (S.freeze ? 1 : 0) : S.freeze || 0 });
    this.emit('attack', { a, t, style, spec, delay });
    for (const h of hits) { h.src = a; h.style = style; h.spec = spec; h.at = this.tick + delay; if (delay <= 0) this.applyHit(h); else this.hitQ.push(h); }
    if (t.ai && !t.target) t.target = a;
  }
  applyHit(h) {
    const t = h.t, src = h.src; if (t.dead) return; let dmg = h.dmg, warded = false;
    if (this.tick < t.protectUntil || this.safe(t)) dmg = 0;
    if (dmg > 0) dmg = Math.max(1, Math.round(dmg * (1 - (t.armour[t.stance] || 0))));
    if (dmg > 0 && t.ward === h.style) { warded = true; dmg = Math.max(1, Math.round(dmg * (1 - (h.pierce ? DEADEYE_WARD_REDUCE : WARD_REDUCE)))); }
    dmg = Math.min(dmg, t.hp); let froze = false;
    if (h.freeze && dmg > 0 && !t.boss && (h.force || (t.frozen <= 0 && t.freezeImm <= 0))) { t.frozen = h.freeze; t.freezeImm = h.freeze + 6; t.path = []; froze = true; }
    t.hp -= dmg; t.lastHurtTick = this.tick; t.lastAttacker = src; t.dmgFrom.set(src.id, (t.dmgFrom.get(src.id) || 0) + dmg);
    if (t.isPlayer && !t.target && !t.path.length && !t.interact && !src.dead) { t.target = src; t.gather = null; }
    if (src.isPlayer && dmg > 0) {
      const l0 = src.level, old = skillLevel(this.save.skills[h.style]);
      this.save.xp += dmg * 4; this.save.skills[h.style] += dmg * 3;
      this.refreshPlayer();
      if (src.level > l0) this.emit('level', { level: src.level });
      const next = skillLevel(this.save.skills[h.style]);
      if (next > old) this.emit('skill', { name: SKILLS[h.style].name, level: next });
    }
    if (t.isPlayer && dmg > 0) {
      const old = skillLevel(this.save.skills.defence);
      this.save.skills.defence += dmg * (warded ? 2 : 1);
      this.refreshPlayer();
      const next = skillLevel(this.save.skills.defence);
      if (next > old) this.emit('skill', { name: 'Defence', level: next });
    }
    this.emit('hit', { t, src, dmg, style: h.style, spec: h.spec, warded, froze, late: !!h.late, splash: !!h.splash });
    if (t.hp <= 0) this.kill(t, src);
  }
  dropLoot(x, y, coins, items) { if (!coins && !items.length) return; this.loot.push({ id: NEXT_ID++, x, y, t: this.tick, coins, items }); this.emit('loot', {}); }
  kill(d, lastHitter) {
    let killer = lastHitter, top = -1;
    for (const [id, dmg] of d.dmgFrom) { const o = this.actors.find(x => x.id === id); if (o && !o.dead && dmg > top) { top = dmg; killer = o; } }
    Object.assign(d, { dead: true, deadAt: this.tick, hp: 0, target: null, path: [], ward: null, frozen: 0, specArmed: false, interact: null, gather: null });
    for (const o of this.actors) if (o.target === d) o.target = null;
    const P = this.player, mine = killer && killer.isPlayer;
    if (killer && killer !== d) { killer.spec = Math.min(100, killer.spec + 30); killer.hp = Math.min(killer.maxHp, killer.hp + 12); }
    if (d.kind === 'rival') {
      const items = [{ id: 'bread', n: 1 + rint(3) }]; if (chance(0.4)) items.push({ id: 'tonic', n: 1 }); if (chance(0.3)) items.push({ id: 'roast', n: 1 + rint(2) });
      if (chance(d.tier ? 0.24 : 0.1)) items.push({ id: pick(Object.keys(SLOTS)) + Math.max(1, d.tier), n: 1 });
      this.dropLoot(d.x, d.y, (40 + rint(80)) * (d.tier + 1), items); this.respawns.push({ at: this.tick + 14, fn: () => this.spawnRival() });
      if (mine) { this.streak++; this.save.kills++; this.save.best = Math.max(this.save.best, this.streak); }
    } else if (d.kind === 'monster') {
      const M = MONSTERS[d.mon], items = []; if (chance(0.35)) items.push({ id: 'bread', n: 1 });
      if (M.boss) { items.push({ id: 'roast', n: 3 }, { id: pick(Object.keys(SLOTS)) + (chance(0.2) ? 3 : 2), n: 1 }); if (mine) this.save.bossKills++; }
      if (mine) this.save.count.undead = (this.save.count.undead || 0) + 1;
      this.dropLoot(d.x, d.y, M.coins[0] + rint(M.coins[1] - M.coins[0]), items); this.respawns.push({ at: this.tick + M.respawn, fn: () => this.spawnMonster(d.mon) });
    } else if (d.isPlayer) {
      // dying outside town costs what you were carrying (gear you are wearing is kept)
      const items = []; d.inv.forEach((s, i) => { if (s && !ITEMS[s.id].slot) { items.push(s); d.inv[i] = null; } });
      this.dropLoot(d.x, d.y, this.save.coins, items); this.lost = { coins: this.save.coins, items: items.length }; this.save.coins = 0; this.save.deaths++; this.lastStreak = this.streak; this.streak = 0; this.refreshPlayer();
    }
    this.dirty = true; this.emit('death', { a: d, killer });
  }

  /* ---------------- per-tick ---------------- */
  moveAlong(a, stopFn) {
    a.seg = [{ x: a.x, y: a.y }]; a.moving = false; if (a.frozen > 0) { if (!a.isPlayer) a.path = []; return; }
    for (let s = 0; s < 2 && a.path.length; s++) {
      if (stopFn && stopFn()) { a.path = []; break; }
      const n = a.path[0], dx = n.x - a.x, dy = n.y - a.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || !canStep(a.x, a.y, dx, dy)) { a.path = []; break; }
      a.path.shift(); a.x = n.x; a.y = n.y; a.face = Math.atan2(dx, dy); a.seg.push({ x: a.x, y: a.y }); a.moving = true;
    }
  }
  stepActor(a) {
    if (a.dead || a.kind === 'npc') { a.seg = [{ x: a.x, y: a.y }]; return; }
    if (a.atkCd > 0) a.atkCd--; if (a.eatCd > 0) a.eatCd--;
    if (a.frozen > 0) { a.frozen--; if (a.frozen === 0) this.emit('thaw', { a }); } if (a.freezeImm > 0) a.freezeImm--;
    if (a.kind !== 'monster' && a.spec < 100 && this.tick % 2 === 0) a.spec = Math.min(100, a.spec + 1);
    if (a.ward) { a.focus -= 1; if (a.focus <= 0) { a.focus = 0; a.ward = null; this.emit('ward', { a }); if (a.isPlayer) this.emit('msg', { text: 'Your focus is spent - your ward drops.' }); } }
    else if (a.focus < 100 && this.tick % 4 === 0 && a.kind !== 'monster') a.focus++;
    if (a.isPlayer && this.safe(a) && this.tick % 3 === 0) { if (a.hp < a.maxHp) a.hp++; if (a.focus < 100) a.focus = Math.min(100, a.focus + 2); }   // rest in town
    if (a.ai) (a.ai.mon ? monsterThink : botThink)(this, a);
    const t = a.target, hold = a.ai && a.ai.holdPath;
    if (t && !t.dead) {
      const d = cheb(a.x, a.y, t.x, t.y);
      if (d === 0 && a.frozen <= 0) { for (const [dx, dy] of DIRS) if (canStep(a.x, a.y, dx, dy)) { a.path = [{ x: a.x + dx, y: a.y + dy }]; break; } }
      else if (!this.inRange(a, t) && a.frozen <= 0 && !hold) a.path = findPath(a.x, a.y, (x, y) => this.inRange(a, t, x, y), t.x, t.y, a.isPlayer ? 6000 : 900);
      else if (this.inRange(a, t) && !hold) a.path = [];
      this.moveAlong(a, () => this.inRange(a, t) && !hold);
      if (this.inRange(a, t)) {
        if (!a.moving) a.face = Math.atan2(t.x - a.x, t.y - a.y);
        if (a.atkCd <= 0 && this.canFight(a, t)) { if (a.protectUntil > this.tick) a.protectUntil = this.tick; this.attack(a, t); }
      }
    } else {
      a.target = null; const n = a.interact, gn = a.gather;
      if (gn) { if (cheb(a.x, a.y, gn.x, gn.y) <= 1) { a.path = []; this.gatherTick(a, gn); } else if (!a.path.length) { a.path = findPath(a.x, a.y, (x, y) => cheb(x, y, gn.x, gn.y) <= 1, gn.x, gn.y, 8000); const e = a.path[a.path.length - 1]; if (!e || cheb(e.x, e.y, gn.x, gn.y) > 1) { a.gather = null; a.path = []; this.emit('msg', { text: 'You cannot reach that.' }); } } }
      if (n) { if (cheb(a.x, a.y, n.x, n.y) <= 2) { a.path = []; a.interact = null; a.face = Math.atan2(n.x - a.x, n.y - a.y); this.emit('interact', { npc: n }); } else if (!a.path.length) a.path = findPath(a.x, a.y, (x, y) => cheb(x, y, n.x, n.y) <= 2 && (x === n.x || y !== n.y), n.x, n.y, 6000); }
      this.moveAlong(a);
    }
    if (a.ai) a.ai.holdPath = false;
    if (a.isPlayer) {
      for (let i = this.loot.length - 1; i >= 0; i--) {
        const l = this.loot[i]; if (l.x !== a.x || l.y !== a.y) continue; const got = [];
        if (l.coins) { this.save.coins += l.coins; got.push(l.coins + ' coins'); l.coins = 0; }
        l.items = l.items.filter(s => { if (addItem(a.inv, s.id, s.n)) { got.push((s.n > 1 ? s.n + ' x ' : '') + ITEMS[s.id].name); return false; } return true; });
        if (!l.items.length) this.loot.splice(i, 1); else this.emit('msg', { text: 'Your bag is full.' });
        if (got.length) { this.refreshPlayer(); this.emit('pickup', { a, x: l.x, y: l.y, text: got.join(', ') }); this.emit('loot', {}); }
      }
      const z = zoneAt(a.x, a.y); if (z !== this.zone) { const from = this.zone; this.zone = z; this.emit('zone', { zone: z, from }); }
    }
  }
  /* one attempt at chopping / mining / fishing / cooking */
  gatherTick(a, n) {
    const N = NODE[n.type], s = this.save, lvl = skillLevel(s.skills[N.skill]); a.face = Math.atan2(n.x - a.x, n.y - a.y);
    if (n.depleted) { a.gather = null; this.emit('msg', { text: n.type === 'tree' ? 'This tree has been felled - it will grow back.' : 'This rock is spent for now.', soft: true }); return; }
    if (n.type === 'fire' && !countItem(a.inv, 'rawfish')) { a.gather = null; this.emit('msg', { text: 'You have nothing to cook. Catch fish at the shore.' }); return; }
    if (--a.gCd > 0) return; a.gCd = n.type === 'fire' ? 2 : 3; this.emit('swing', { a, n });
    if (n.type === 'fire') {
      takeItem(a.inv, 'rawfish'); const burnt = chance(Math.max(0, 0.36 - lvl * 0.02));
      if (!burnt) { addItem(a.inv, 'trout'); s.skills.cook += N.xp; s.count.trout = (s.count.trout || 0) + 1; }
      this.emit('gather', { a, n, item: burnt ? null : 'trout', text: burnt ? 'You burn the trout.' : null });
    } else {
      if (!chance(Math.min(0.9, 0.35 + lvl * 0.015))) return;
      if (!addItem(a.inv, N.item)) { a.gather = null; this.emit('msg', { text: 'Your bag is full.' }); return; }
      s.skills[N.skill] += N.xp; s.count[N.item] = (s.count[N.item] || 0) + 1; this.emit('gather', { a, n, item: N.item });
       if (n.type === 'tree' && chance(0.22) && addItem(a.inv, 'herbs')) {
         s.count.herbs = (s.count.herbs || 0) + 1; this.emit('gather', { a, n, item: 'herbs' });
       }
      if (N.cap && --n.left <= 0) { n.depleted = true; n.regrowAt = this.tick + N.regrow; a.gather = null; this.emit('node', { n }); }
    }
    const l2 = skillLevel(s.skills[N.skill]); if (l2 > lvl) this.emit('skill', { name: SKILLS[N.skill].name, level: l2 });
    this.refreshPlayer();
  }
  step() {
    this.tick++;
    if (this.tick % 5 === 0) for (const n of this.nodes) if (n.depleted && this.tick >= n.regrowAt) { n.depleted = false; n.left = NODE[n.type].cap[0] + rint(NODE[n.type].cap[1]); this.emit('node', { n }); }
    if (this.hitQ.length) { const due = this.hitQ.filter(h => h.at <= this.tick); this.hitQ = this.hitQ.filter(h => h.at > this.tick); for (const h of due) this.applyHit(h); }
    for (const a of this.actors.slice()) this.stepActor(a);
    for (let i = this.actors.length - 1; i >= 0; i--) { const a = this.actors[i]; if (a.dead && !a.isPlayer && this.tick - a.deadAt >= 7) { this.actors.splice(i, 1); this.usedNames.delete(a.name); this.emit('remove', { a }); } }
    if (this.respawns.length) { const due = this.respawns.filter(r => r.at <= this.tick); this.respawns = this.respawns.filter(r => r.at > this.tick); for (const r of due) r.fn(); }
    const n = this.loot.length; this.loot = this.loot.filter(l => this.tick - l.t < 200); if (this.loot.length !== n) this.emit('loot', {});
    this.emit('tick', {});
  }
}

/* interpolated tile-space position for rendering; frac = 0..1 through the current tick */
export function renderPos(a, frac, out) {
  const s = a.seg, n = s.length - 1;
  if (n <= 0) { out.x = a.x + 0.5; out.y = a.y + 0.5; return out; }
  const t = clamp(frac, 0, 1) * n, i = Math.min(n - 1, Math.floor(t)), f = t - i;
  out.x = lerp(s[i].x, s[i + 1].x, f) + 0.5; out.y = lerp(s[i].y, s[i + 1].y, f) + 0.5; return out;
}
