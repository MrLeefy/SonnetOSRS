'use strict';
/* Explicit compatibility layer for the original global-script engine.
 * Transactional inventory writes and actor-lifetime guards live here so both
 * Arena and Expedition use the same invariants. No network or eval involved.
 */
const Engine = (() => {
  const old = { newActor, queueHit, applyHit, killActor, respawn, doAttack, gameTick,
    stepActor, cmdWalk, cmdAttack, cmdFollow, cmdJob, togglePrayer, drainPrayer,
    equipFromInv, restock, setBotCount, openBank, talkClerk, contextMenuFor, itemMenu };
  const MAX_STACK = 2147483647;
  const validQty = n => Number.isSafeInteger(n) && n > 0 && n <= MAX_STACK;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const validItem = id => typeof id === 'string' && own(ITEMS, id);
  const copy = s => s ? { id: s.id, n: s.n } : null;
  const cloneInv = inv => inv.map(copy);
  function insert(inv, id, n = 1) {
    if (!validItem(id) || !validQty(n) || !Array.isArray(inv) || inv.length !== 28) return false;
    const it = ITEMS[id];
    if (it.doses && n > it.doses) return false;
    if (it.stack) {
      const s = inv.find(s => s && s.id === id);
      if (s) { if (s.n > MAX_STACK - n) return false; s.n += n; return true; }
    }
    const needed = it.stack || it.doses ? 1 : n;
    if (needed > inv.filter(s => !s).length) return false;
    let left = needed;
    for (let i = 0; i < 28 && left; i++) if (!inv[i]) {
      inv[i] = { id, n: it.stack || it.doses ? n : 1 }; left--;
    }
    return true;
  }
  function count(inv, id) {
    if (!validItem(id)) return 0;
    return inv.reduce((n, s) => n + (s && s.id === id ? (ITEMS[id].stack ? s.n : 1) : 0), 0);
  }
  function remove(inv, id, n = 1) {
    if (!validItem(id) || !validQty(n) || count(inv, id) < n) return false;
    for (let i = 0; i < 28 && n; i++) {
      const s = inv[i]; if (!s || s.id !== id) continue;
      const k = ITEMS[id].stack ? Math.min(n, s.n) : 1;
      if (ITEMS[id].stack && s.n > k) s.n -= k; else inv[i] = null;
      n -= k;
    }
    return true;
  }
  function alive(a) { return !!a && !a.dead && a.hp > 0; }
  function blockedMessage(a) { if (a.isPlayer) gameMsg('You need more free inventory space. Nothing was changed.'); }
  addItem = (a, id, n = 1) => insert(a.inv, id, n);
  countItem = (a, id) => count(a.inv, id);
  removeItem = (a, id, n = 1) => remove(a.inv, id, n);
  styleOf = a => {
    const w = weaponOf(a), arr = STYLES[w.cat] || STYLES.unarmed;
    const i = Number.isInteger(a.style) ? clamp(a.style, 0, arr.length - 1) : 0;
    return arr[i];
  };
  equipFromInv = (a, idx) => {
    if (!alive(a) || !Number.isInteger(idx) || idx < 0 || idx >= 28) return false;
    const s = a.inv[idx]; if (!s || !validItem(s.id)) return false;
    const it = ITEMS[s.id]; if (!SLOTS.includes(it.slot)) return false;
    if (it.required && a.stats[it.required.skill] < it.required.level) {
      if (a.isPlayer) gameMsg('Requires ' + it.required.level + ' ' + it.required.skill + '.'); return false;
    }
    const inv = cloneInv(a.inv), eq = Object.fromEntries(Object.entries(a.eq).map(([k, v]) => [k, copy(v)]));
    inv[idx] = null;
    if (it.slot === 'ammo' && eq.ammo && eq.ammo.id === s.id) {
      if (eq.ammo.n > MAX_STACK - s.n) return false;
      eq.ammo.n += s.n;
    } else {
      const displaced = [];
      if (eq[it.slot]) displaced.push(eq[it.slot]);
      if (it.two && eq.shield) { displaced.push(eq.shield); eq.shield = null; }
      if (it.slot === 'shield' && eq.weapon && ITEMS[eq.weapon.id].two) { displaced.push(eq.weapon); eq.weapon = null; }
      for (const d of displaced) if (!insert(inv, d.id, d.n)) { blockedMessage(a); return false; }
      eq[it.slot] = copy(s);
    }
    a.inv = inv; a.eq = eq;
    if (it.slot === 'weapon' || it.slot === 'shield') {
      a.style = 0; a.specOn = false;
      if (!weaponOf(a).magic) a.autocast = null;
    }
    recalcBonus(a); if (a.isPlayer) sfx('equip'); return true;
  };
  unequipSlot = (a, slot) => {
    if (!alive(a) || !SLOTS.includes(slot)) return false;
    const s = a.eq[slot]; if (!s) return false;
    if (!insert(a.inv, s.id, s.n)) { blockedMessage(a); return false; }
    a.eq[slot] = null;
    if (slot === 'weapon') { a.style = 0; a.specOn = false; a.autocast = null; }
    recalcBonus(a); return true;
  };
  const oldEat = eatFood, oldDrink = drinkPotion;
  eatFood = (a, idx) => {
    const s = a && a.inv[idx];
    if (!alive(a) || !s || !validItem(s.id) || !ITEMS[s.id].food || a.eatCd > 0) return false;
    oldEat(a, idx); return true;
  };
  drinkPotion = (a, idx) => {
    const s = a && a.inv[idx];
    if (!alive(a) || !s || !validItem(s.id) || !ITEMS[s.id].pot || !validQty(s.n) || a.potCd > 0) return false;
    oldDrink(a, idx); return true;
  };
  newActor = o => Object.assign(old.newActor(o), { life: 1, protectUntil: 0 });
  function clearTransient(a) {
    a.life = (a.life || 0) + 1; a.job = a.follow = a.pendingSpell = null;
    a.target = null; a.path.length = a.seg.length = a.splats.length = 0;
    a.atkCd = 2; a.eatCd = a.potCd = a.prayerBlock = a.freezeImm = a.drain = 0;
    a.attackedBy = {}; a.lastAtk = a.lastHitTick = -999; a.specOn = false;
    a.boostT = a.hpT = a.specT = 0;
    G.hitQ = G.hitQ.filter(h => h.dst !== a && h.src !== a);
    G.projs = G.projs.filter(p => p.tgt !== a);
    if (a.isPlayer) { UI.drag = null; UI.menu = null; G.dialog = null; }
  }
  queueHit = h => {
    if (!h || !alive(h.dst) || !h.src || !Number.isFinite(h.dmg)) return;
    h.srcLife = h.src.life; h.dstLife = h.dst.life;
    h.dmg = clamp(Math.floor(h.dmg), 0, 10000);
    h.delay = Number.isFinite(h.delay) ? clamp(Math.floor(h.delay), 0, 50) : 0;
    old.queueHit(h);
  };
  applyHit = h => {
    if (!h || !alive(h.dst) || !h.src || !Number.isFinite(h.dmg) || h.dmg < 0) return;
    if (!G.actors.includes(h.src) || !G.actors.includes(h.dst)) return;
    if (h.dstLife !== undefined && h.dst.life !== h.dstLife) return;
    if (h.srcLife !== undefined && h.src.life !== h.srcLife) return;
    if (h.dst.npc || h.dst === h.src) return;
    if (h.dst.isPlayer && G.tick < h.dst.protectUntil) return;
    if (typeof Expedition !== 'undefined' && !Expedition.canFight(h.src, h.dst)) return;
    const hp = h.dst.hp;
    if (h.dst.isPlayer && typeof Expedition !== 'undefined') Expedition.cancelGather();
    old.applyHit(h);
    const dealt = Math.max(0, hp - h.dst.hp);
    // A blood projectile may land after its caster died; it must never revive them.
    if (h.src.dead) h.src.hp = 0;
    if (typeof Expedition !== 'undefined') Expedition.onDamage(h.src, h.dst, dealt, h.type);
    if (typeof Polish !== 'undefined' && dealt) Polish.burst(h.dst.x + .5, h.dst.y + .5, h.type === 'pmagic' ? 0x86d6ef : 0xe0b678, Math.min(9, 3 + Math.floor(dealt / 5)));
  };
  doAttack = (a, t) => {
    if (!alive(a) || !alive(t) || t.npc || t === a || !G.actors.includes(t)) return;
    if (!inRangeAt(a.x, a.y, t, attackRange(a))) return;
    if (t.isPlayer && G.tick < t.protectUntil) { a.target = null; return; }
    if (typeof Expedition !== 'undefined' && !Expedition.canFight(a, t)) { a.target = null; return; }
    const spell = a.pendingSpell || (a.autocast && weaponOf(a).magic && a.autocast);
    if (spell && !own(SPELL_BY_ID, spell)) { a.pendingSpell = a.autocast = a.target = null; return; }
    const w = weaponOf(a);
    if (!spell && w.ranged) {
      const ammo = a.eq.ammo;
      if (!ammo || !validQty(ammo.n) || !validItem(ammo.id) || ITEMS[ammo.id].ammoType !== w.ammo) { a.target = null; if (a.isPlayer) gameMsg('Equip compatible ammunition first.'); return; }
      if (a.specOn && w.spec && a.spec >= w.spec.cost && ammo.n < (w.spec.hits || 1)) { a.specOn = false; if (a.isPlayer) gameMsg('Not enough ammunition for the special; firing a normal shot.'); }
    }
    // Initiating an attack forfeits spawn protection.
    if (a.isPlayer) a.protectUntil = 0;
    old.doAttack(a, t);
  };
  killActor = (d, s) => {
    if (d.dead) return;
    const pvm = d.monster && s.isPlayer;
    const before = pvm ? { kills:G.kills, streak:G.streak, best:G.best, actorKills:s.kills } : null;
    old.killActor(d, s);
    if (before) { G.kills=before.kills; G.streak=before.streak; G.best=before.best; s.kills=before.actorKills; }
    G.hitQ = G.hitQ.filter(h => h.dst !== d);
    if (typeof Expedition !== 'undefined') Expedition.onKill(d, s);
  };
  respawn = a => {
    if (a.monster && typeof Expedition !== 'undefined') { Expedition.respawnMonster(a); return; }
    if (a.isPlayer && typeof Expedition !== 'undefined' && Expedition.active) {
      clearTransient(a); a.dead = false; a.hp = a.maxHp; a.pp = a.stats.pray;
      a.cur = Object.assign({}, a.stats); a.run = a.spec = 100; a.frozen = a.skull = 0;
      a.prayers.clear(); a.overhead = a.anim = null; a.x = 48; a.y = 34;
      a.protectUntil = G.tick + 20; G.spellSel = null;
      gameMsg('You recover at the camp. Your expedition equipment was kept.'); return;
    }
    clearTransient(a); old.respawn(a);
  };
  togglePrayer = (a, id, quiet) => {
    if (!alive(a) || !own(PRAYER_BY_ID, id)) return false;
    old.togglePrayer(a, id, quiet); return true;
  };
  stepActor = a => {
    if (!a.npc && G.tick % 100 === 0) for (const id of Object.keys(a.attackedBy)) if (G.tick - a.attackedBy[id] > 120) delete a.attackedBy[id];
    if (a.monster && !a.dead && typeof Expedition !== 'undefined') Expedition.think(a);
    old.stepActor(a);
  };
  gameTick = () => {
    old.gameTick();
    if (typeof Expedition !== 'undefined') Expedition.tick();
    // Bounded off-screen lifetimes, independent of the renderer.
    G.effects = G.effects.filter(e => G.now < e.t0 + e.dur).slice(-160);
    G.projs = G.projs.filter(p => G.now < p.t1 + 30 && G.actors.includes(p.tgt)).slice(-160);
    G.ground = G.ground.slice(-512);
  };
  cmdWalk = (x, y) => { if (typeof Expedition !== 'undefined') Expedition.cancelGather(); old.cmdWalk(x, y); };
  cmdFollow = a => { if (!G.player || !alive(G.player) || !a) return; if (typeof Expedition !== 'undefined') Expedition.cancelGather(); old.cmdFollow(a); };
  cmdAttack = a => { if (!G.player || !alive(a) || a.npc) return; if (typeof Expedition !== 'undefined') { Expedition.cancelGather(); if (!Expedition.canFight(G.player, a)) return; } old.cmdAttack(a); };
  cmdJob = (x, y, near, run, label) => { if (typeof Expedition !== 'undefined') Expedition.cancelGather(); old.cmdJob(x, y, near, run, label); };
  setBotCount = n => {
    n = Number.isFinite(Number(n)) ? clamp(Math.floor(Number(n)), 0, 14) : 0;
    if (typeof Expedition !== 'undefined' && Expedition.active) n = 0;
    old.setBotCount(n);
    const live = new Set(G.actors);
    G.hitQ = G.hitQ.filter(h => live.has(h.src) && live.has(h.dst));
    G.projs = G.projs.filter(p => live.has(p.tgt));
    for (const a of G.actors) { if (!live.has(a.target)) a.target = null; if (!live.has(a.follow)) a.follow = null; }
  };
  restock = kind => {
    if (!G.player || !alive(G.player) || !own(LOADOUTS, kind)) return;
    if (typeof Expedition !== 'undefined' && Expedition.active) { gameMsg('Free combat kits are for Arena mode. Craft or loot expedition gear.'); return; }
    old.restock(kind); clearTransient(G.player); G.player.protectUntil = G.tick + 5;
  };
  openBank = obj => { if (typeof Client !== 'undefined') Client.open('bank'); else old.openBank(obj); };
  talkClerk = npc => { if (typeof Expedition !== 'undefined' && Expedition.active) { Client.open('journal'); return; } old.talkClerk(npc); };
  contextMenuFor = (mx, my) => {
    const out = old.contextMenuFor(mx, my);
    if (typeof Expedition !== 'undefined' && Expedition.active && inRect(mx, my, {x:VX,y:VY,w:VW,h:VH})) {
      const obj = pickObject(mx - VX, my - VY, INP.cam);
      if (obj && obj.expedition) {
        const label = obj.kind === 'resource' ? 'Gather ' : obj.kind === 'forge' ? 'Use ' : 'Open ';
        return [ent(label + col('80ddb0', obj.name), () => Expedition.interact(obj), {red:true}), ent('Examine ' + obj.name, () => gameMsg(obj.description || obj.name)), CANCEL()];
      }
    }
    return out;
  };
  itemMenu = (a, idx) => {
    const s = a.inv[idx]; const entries = old.itemMenu(a, idx);
    // Menu closures refer to an exact item, never a new occupant of the slot.
    for (const e of entries) { const fn = e.fn; e.fn = () => { if (a.inv[idx] === s && alive(a)) fn(); }; }
    return entries;
  };
  passable = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAPN && y < MAPN && !WORLD.block[y * MAPN + x];
  canStep = (x, y, dx, dy) => Number.isInteger(dx) && Number.isInteger(dy) && Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0) && passable(x + dx, y + dy) && (!dx || !dy || (passable(x + dx, y) && passable(x, y + dy)));
  const path = findPath;
  findPath = (sx, sy, goal, nearest, maxNodes) => {
    if (!passable(sx, sy) || typeof goal !== 'function') return null;
    if (PF.stamp >= 2147483646) { PF.stamp = 0; PF.seen.fill(0); }
    return path(sx, sy, goal, nearest && Number.isFinite(nearest.x) && Number.isFinite(nearest.y) ? nearest : null, Number.isFinite(maxNodes) ? clamp(Math.floor(maxNodes), 1, MAPN * MAPN) : 4000);
  };
  moveAlong = a => {
    const steps = a.runOn && a.run >= 1 ? 2 : 1; let moved = 0;
    for (let i = 0; i < steps && a.path.length; i++) {
      const n = a.path.shift(), dx = n.x - a.x, dy = n.y - a.y;
      if (!canStep(a.x, a.y, dx, dy)) { a.path.length = 0; break; }
      a.seg.push({fx:a.x,fy:a.y,tx:n.x,ty:n.y}); faceStep(a, dx, dy); a.x = n.x; a.y = n.y; moved++;
      if (a.target && inRangeAt(a.x, a.y, a.target, attackRange(a))) { a.path.length = 0; break; }
    }
    if (moved === 2) a.run = Math.max(0, a.run - .67);
    return moved;
  };
  hasLoS = (x0, y0, x1, y1) => {
    if (![x0,y0,x1,y1].every(Number.isInteger) || !inMap(x0,y0) || !inMap(x1,y1)) return false;
    const dx = Math.abs(x1-x0), dy = Math.abs(y1-y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx-dy, x=x0, y=y0;
    while (x!==x1 || y!==y1) {
      const prevX=x, prevY=y, e2=err*2;
      if(e2 > -dy){err-=dy;x+=sx;} if(e2 < dx){err+=dx;y+=sy;}
      if (x!==prevX && y!==prevY && (LOSB[prevY*MAPN+x] || LOSB[y*MAPN+prevX])) return false;
      if ((x!==x1 || y!==y1) && LOSB[y*MAPN+x]) return false;
    }
    return true;
  };
  return { MAX_STACK, validQty, validItem, insert, remove, count, cloneInv, copy, clearTransient, alive, old };
})();
