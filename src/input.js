'use strict';
/* ==========================================================================
   input.js  -  mouse/keyboard, context menus, player commands, dialogues
   ========================================================================== */
const INP = { keys: {}, mmb: false, mmbX: 0, cam: null, canvas: null };
const NAMECOL = { npc: 'ffff00', item: 'ff9040', obj: '00ffff', player: 'ffffff' };
function col(c, s) { return '<col=' + c + '>' + s + '</col>'; }
function playerTag(a) {
  const diff = a.level - G.player.level; return col('ffffff', a.name) + ' ' + col(levelColor(diff).toString(16).padStart(6, '0'), '(level-' + a.level + ')');
}
function ent(text, fn, extra) { return Object.assign({ text, fn }, extra || {}); }
const CANCEL = () => ent('Cancel', () => { });

/* ---------------- world commands ---------------- */
function clickMark(x, y, red) { UI.clicks.push({ x, y, t0: G.now, red: !!red }); }
/* any world command ends the open dialogue, so a stale option list cannot fire after the player has moved on */
function cmdWalk(tx, ty) {
  const pl = G.player; if (pl.dead) return;
  G.dialog = null; pl.target = null; pl.follow = null; pl.job = null; pl.pendingSpell = null;
  if (pl.frozen > 0) { gameMsg('A magical force stops you from moving.'); return; }
  const p = findPath(pl.x, pl.y, (x, y) => x === tx && y === ty, { x: tx, y: ty }, 5000); pl.path = p || [];
}
function cmdAttack(a) {
  const pl = G.player; if (pl.dead || a.dead || a === pl) return;
  G.dialog = null; pl.follow = null; pl.job = null; pl.path.length = 0; pl.target = a;
  if (G.spellSel) { pl.pendingSpell = G.spellSel; G.spellSel = null; } else pl.pendingSpell = null;
}
function cmdFollow(a) { const pl = G.player; G.dialog = null; pl.target = null; pl.job = null; pl.path.length = 0; pl.follow = a; }
function cmdJob(tx, ty, near, run, label) {
  const pl = G.player; if (pl.dead) return; G.dialog = null; pl.target = null; pl.follow = null; pl.pendingSpell = null;
  const job = { near, run }; if (near(pl)) { pl.path.length = 0; run(); return; }
  if (pl.frozen > 0) { gameMsg('A magical force stops you from moving.'); return; }
  const p = findPath(pl.x, pl.y, (x, y) => near({ x, y }), { x: tx, y: ty }, 5000); pl.path = p || []; pl.job = job;
}
function cmdTake(g) {
  cmdJob(g.x, g.y, a => a.x === g.x && a.y === g.y, () => {
    const i = G.ground.indexOf(g); if (i < 0) return;
    if (addItem(G.player, g.id, g.n)) G.ground.splice(i, 1); else gameMsg("You don't have enough inventory space.");
  });
}
function castOn(a) { cmdAttack(a); }
function examineActor(a) { gameMsg(a.npc ? 'Handles Grand Exchange transactions.' : 'Level-' + a.level + ' ' + a.name + '.'); }

/* ---------------- dialogues ---------------- */
function closeDialog() { G.dialog = null; }
function say(name, kit, lines, next) { G.dialog = { type: 'npc', name, kit, lines, next }; }
function options(title, opts) { G.dialog = { type: 'options', title, opts }; }
function dialogContinue() { const d = G.dialog; if (!d) return; G.dialog = null; if (d.next) d.next(); }
function talkClerk(npc) {
  const kit = npc.kit;
  say('Grand Exchange Clerk', kit, ['Welcome to the Grand Exchange.', 'How can I help you?'], () => {
    options('Select an Option', [
      { t: 'I would like to make an offer.', fn: () => say(G.player.name, G.player.kit, ['I would like to make an offer.'], () => say('Grand Exchange Clerk', kit, ['I\'m afraid all offers are cancelled on', 'this world. It is a PvP world - the only', 'currency here is your combat skill.'], () => { })) },
      { t: 'Is it safe to stand here?', fn: () => say('Grand Exchange Clerk', kit, ['Safe? Not at all! Everyone on this', 'platform is fair game. I would keep my', 'prayers up if I were you.'], () => { }) },
      { t: 'Never mind.', fn: () => { } }
    ]);
  });
}
function openBank(obj) {
  options('Bank of Gielinor - Restock', [
    { t: 'Hybrid main (whip, barrage, crossbow)', fn: () => restock('main') },
    { t: 'Melee (whip, dragon dagger, sharks)', fn: () => restock('pmelee') },
    { t: 'Ranged (rune crossbow, dragon hide)', fn: () => restock('pranged') },
    { t: 'Magic (ancient staff, mystic robes)', fn: () => restock('pmage') },
    { t: 'Just heal me up.', fn: () => { const a = G.player; a.hp = a.maxHp; a.pp = a.stats.pray; a.cur = Object.assign({}, a.stats); a.spec = 100; a.run = 100; gameMsg('The banker restores your stats.'); } }
  ]);
}
function restock(kind) {
  const a = G.player; a.loadoutKind = kind; applyLoadout(a, kind); a.hp = a.maxHp; a.pp = a.stats.pray; a.cur = Object.assign({}, a.stats); a.spec = 100; a.run = 100; a.prayers.clear(); a.overhead = null; a.frozen = 0;
  gameMsg('The banker restocks your inventory and equipment.');
}

/* ---------------- context menu ---------------- */
function itemMenu(a, i) {
  const s = a.inv[i]; if (!s) return [CANCEL()]; const it = ITEMS[s.id]; const nm = col(NAMECOL.item, itemName(s)); const out = [];
  if (it.food) out.push(ent('Eat ' + nm, () => eatFood(G.player, i)));
  else if (it.pot) out.push(ent('Drink ' + nm, () => drinkPotion(G.player, i)));
  else if (it.slot) out.push(ent('Wield ' + nm, () => equipFromInv(G.player, i)));
  out.push(ent('Use ' + nm, () => gameMsg('Nothing interesting happens.')));
  out.push(ent('Drop ' + nm, () => { const pl = G.player; if (pl.dead || !pl.inv[i]) return; G.ground.push({ id: s.id, n: s.n, x: pl.x, y: pl.y, t: G.tick }); pl.inv[i] = null; }));
  out.push(ent('Examine ' + nm, () => gameMsg(it.ex)));
  out.push(CANCEL()); return out;
}
function invDefault(i) { const e = itemMenu(G.player, i)[0]; if (e) e.fn(); }
function contextMenuFor(mx, my) {
  const pl = G.player; const out = [];
  if (!inRect(mx, my, { x: VX, y: VY, w: VW, h: VH })) return out;
  const vx = mx - VX, vy = my - VY; const cam = INP.cam;
  const a = pickActor(vx, vy); const obj = a ? null : pickObject(vx, vy, cam); const tile = pickTile(cam, vx, vy);
  if (G.spellSel) {
    const sp = SPELL_BY_ID[G.spellSel];
    if (a && !a.npc && a !== pl) out.push(ent('Cast ' + col('80d0ff', sp.name) + ' -> ' + playerTag(a), () => castOn(a), { red: true }));
  } else if (a) {
    if (a.npc) {
      out.push(ent('Talk-to ' + col(NAMECOL.npc, a.name), () => cmdJob(a.x, a.y, p => dist2(p.x, p.y, a.x, a.y) <= 2 || Math.hypot(p.x - a.x, p.y - a.y) < 4.9, () => talkClerk(a)), { red: true }));
      out.push(ent('Exchange ' + col(NAMECOL.npc, a.name), () => cmdJob(a.x, a.y, p => Math.hypot(p.x - a.x, p.y - a.y) < 4.9, () => talkClerk(a)), { red: true }));
      out.push(ent('Examine ' + col(NAMECOL.npc, a.name), () => examineActor(a)));
    } else if (a !== pl) {
      out.push(ent('Attack ' + playerTag(a), () => cmdAttack(a), { red: true }));
      out.push(ent('Follow ' + col('ffffff', a.name), () => cmdFollow(a), { red: true }));
      out.push(ent('Examine ' + col('ffffff', a.name), () => examineActor(a)));
    }
  }
  if (obj) {
    const near = p => dist2(p.x, p.y, obj.x, obj.y) <= 1;
    if (obj.kind === 'bank') { out.push(ent('Bank ' + col(NAMECOL.obj, obj.name), () => cmdJob(obj.x, obj.y, near, () => openBank(obj)), { red: true })); out.push(ent('Examine ' + col(NAMECOL.obj, obj.name), () => gameMsg('Good for storing gear.'))); }
    else out.push(ent('Open ' + col(NAMECOL.obj, obj.name), () => cmdJob(obj.x, obj.y, near, () => gameMsg('The chest is empty.')), { red: true })), out.push(ent('Examine ' + col(NAMECOL.obj, obj.name), () => gameMsg('A wooden chest.')));
  }
  if (tile) {
    const items = G.ground.filter(g => g.x === tile.x && g.y === tile.y);
    for (let i = items.length - 1; i >= 0; i--) { const g = items[i]; const nm = col(NAMECOL.item, groundName(g)); out.push(ent('Take ' + nm, () => cmdTake(g), { red: true })); out.push(ent('Examine ' + nm, () => gameMsg(ITEMS[g.id].ex))); }
    if (!G.spellSel || true) out.push(ent('Walk here', () => cmdWalk(tile.x, tile.y)));
  }
  out.push(ent(G.spellSel ? 'Cancel' : 'Cancel', () => { G.spellSel = null; }));
  return out;
}
function openMenu(entries, mx, my) {
  const m = { entries, x: mx, y: my }; const g = menuGeom(m);
  m.x = clamp(mx - 2, 0, W - g.w - 1); m.y = clamp(my - 2, 0, H - g.h - 1); UI.menu = m;
}

/* ---------------- panel interaction ---------------- */
function panelHit(mx, my, right) {
  const t = TAB_ID[UI.tab], a = G.player;
  switch (t) {
    case 'inv': {
      for (let i = 0; i < 28; i++) if (inRect(mx, my, invSlotRect(i))) {
        if (!a.inv[i]) return true;
        if (right) { openMenu(itemMenu(a, i), mx, my); return true; }
        if (G.spellSel) { G.spellSel = null; return true; }
        UI.drag = { from: i, sx: mx, sy: my, active: false }; return true;
      }
      return true;
    }
    case 'equip': {
      if (inRect(mx, my, EQ_BTN) && !right) { UI.bonusWin = !UI.bonusWin; return true; }
      for (const slot of SLOTS) if (inRect(mx, my, eqSlotRect(slot)) && a.eq[slot]) {
        const s = a.eq[slot]; const nm = col(NAMECOL.item, itemName(s));
        if (right) openMenu([ent('Remove ' + nm, () => unequipSlot(a, slot)), ent('Examine ' + nm, () => gameMsg(ITEMS[s.id].ex)), CANCEL()], mx, my);
        else unequipSlot(a, slot);
        return true;
      }
      return true;
    }
    case 'prayer': {
      for (let i = 0; i < PR_ORDER.length; i++) if (inRect(mx, my, PR_POS(i))) {
        const id = PR_ORDER[i]; const pr = PRAYER_BY_ID[id];
        if (right) openMenu([ent((a.prayers.has(id) ? 'Deactivate ' : 'Activate ') + col('ff9040', pr.name), () => togglePrayer(a, id)), CANCEL()], mx, my);
        else togglePrayer(a, id);
        return true;
      }
      return true;
    }
    case 'magic': {
      for (let i = 0; i < SPELLS.length; i++) if (inRect(mx, my, SP_POS(i))) {
        const sp = SPELLS[i]; const nm = col('80d0ff', sp.name);
        if (right) {
          const ents = [ent('Cast ' + nm, () => selectSpell(sp))];
          if (weaponOf(a).magic) ents.push(ent(a.autocast === sp.id ? 'Remove autocast ' + nm : 'Autocast ' + nm, () => { a.autocast = a.autocast === sp.id ? null : sp.id; if (a.autocast) gameMsg('Autocast set to ' + sp.name + '.'); }));
          ents.push(CANCEL()); openMenu(ents, mx, my);
        } else selectSpell(sp);
        return true;
      }
      return true;
    }
    case 'combat': {
      const w = weaponOf(a); const arr = STYLES[w.cat] || STYLES.unarmed;
      for (let i = 0; i < arr.length; i++) if (inRect(mx, my, CB.style(i))) { a.style = i; a.autocast = null; return true; }
      if (inRect(mx, my, CB.retal)) { a.autoRetal = !a.autoRetal; return true; }
      if (w.spec && inRect(mx, my, CB.spec)) { if (a.spec < w.spec.cost) gameMsg('You don\'t have enough power left.'); else a.specOn = !a.specOn; return true; }
      return true;
    }
    case 'options': optClick(mx, my); return true; // toggles live in ui.js
    case 'emotes': {
      for (let i = 0; i < EMOTES.length; i++) if (inRect(mx, my, emoteRect(i))) { a.anim = { type: ['cast', 'block', 'block', 'crush', 'block', 'slash', 'block', 'cast', 'slash', 'block', 'stab', 'slash'][i], t0: G.now, dur: 900 }; return true; }
      return true;
    }
    case 'logout': if (inRect(mx, my, LOGOUT_BTN)) App.logout(); return true;
  }
  return true;
}
function selectSpell(sp) {
  const a = G.player; if (a.stats.mag < sp.lvl) { gameMsg('You need a Magic level of ' + sp.lvl + ' to cast ' + sp.name + '.'); return; }
  G.spellSel = G.spellSel === sp.id ? null : sp.id;
  if (G.spellSel) { UI.tab = 6; }
}
function applyBrightness() { const f = [0.78, 0.9, 1.0, 1.12][UI.brightness]; INP.glCanvas.style.filter = 'brightness(' + f + ')'; }
function cycleBots() { const n = UI.botCount >= 12 ? 1 : UI.botCount + 1; setBotCount(n); }
function setBotCount(n) {
  UI.botCount = n; const bots = G.actors.filter(a => a.isBot);
  while (bots.length > n) { const b = bots.pop(); G.actors.splice(G.actors.indexOf(b), 1); }
  const kinds = ['melee', 'zerker', 'pure', 'ranger', 'mage', 'hybrid', 'melee', 'ranger', 'mage', 'zerker', 'pure', 'hybrid'];
  const used = new Set(bots.map(b => b.name));
  while (bots.length < n) { let nm = pick(BOT_NAMES); let g = 0; while (used.has(nm) && g++ < 50) nm = pick(BOT_NAMES); used.add(nm); bots.push(createBot(kinds[bots.length % kinds.length], nm)); }
}

/* ---------------- mouse handling ---------------- */
/* page pixel -> logical 765x503 pixel. Uses the canvas's on-screen rect, so CSS scale and devicePixelRatio drop out. */
function clientPos(e) {
  const r = INP.canvas.getBoundingClientRect(); if (!r.width || !r.height) return { x: -1, y: -1 };
  return { x: Math.floor((e.clientX - r.left) * W / r.width), y: Math.floor((e.clientY - r.top) * H / r.height) };
}
function chatClick(mx, my) {
  for (let i = 0; i < 6; i++) { const bx = 5 + i * 56; if (mx >= bx && mx < bx + 54 && my >= 482 && my < 502) { if (i < 3) UI.chatTab = i; return true; } }
  if (mx >= 497 && mx < 513) { if (my >= 345 && my < 361) { G.chatScroll++; return true; } if (my >= 440 && my < 456) { G.chatScroll = Math.max(0, G.chatScroll - 1); return true; } }
  const d = G.dialog;
  if (d && d.type === 'options') { for (let i = 0; i < d.rects.length; i++) if (inRect(mx, my, d.rects[i])) { const o = d.opts[i]; G.dialog = null; o.fn(); return true; } }
  else if (d && d.rects) { for (const r of d.rects) if (inRect(mx, my, r)) { dialogContinue(); return true; } }
  return false;
}
function minimapClick(mx, my) {
  const dx = mx - MM.cx, dy = my - MM.cy; if (dx * dx + dy * dy > MM.r * MM.r) return false;
  const cam = INP.cam, cs = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), pl = G.player;
  const ox = (cs * dx + sn * (-dy)) / 4, oy = (-sn * dx + cs * (-dy)) / 4;
  cmdWalk(Math.floor(pl.x + 0.5 + ox), Math.floor(pl.y + 0.5 + oy)); return true;
}
function onDown(e) {
  sndInit();
  if (App.mode !== 'game') return App.onDown(e);
  const p = clientPos(e); UI.mouse = p; const mx = p.x, my = p.y; e.preventDefault();
  if (e.button === 1) { INP.mmb = true; INP.mmbX = e.clientX; INP.mmbY = e.clientY; return; }
  const right = e.button === 2;
  if (UI.menu) {
    const m = UI.menu; const g = menuGeom(m);
    if (!right && mx >= m.x && mx < m.x + g.w && my >= m.y + 18 && my < m.y + g.h - 4) {
      const i = Math.floor((my - m.y - 18) / 15); const en = m.entries[i]; UI.menu = null; if (en) { if (en.red !== undefined) clickMark(mx, my, en.red); en.fn(); } return;
    }
    UI.menu = null; if (!right) return;
  }
  if (UI.bonusWin && !right) { const x = VX + 56, y = VY + 18; if (mx >= x + 378 && mx < x + 394 && my >= y + 8 && my < y + 24) { UI.bonusWin = false; return; } }
  // tabs
  for (let i = 0; i < 14; i++) if (inRect(mx, my, tabRect(i))) { if (!right) { UI.tab = i; G.spellSel = null; } return; }
  if (inRect(mx, my, CHAT) || my >= 480 || (mx < 520 && my >= 338)) { if (!right) chatClick(mx, my); return; }
  if (inRect(mx, my, PANEL)) { panelHit(mx, my, right); return; }
  // orbs / compass
  const od = (o) => (mx - o.x) * (mx - o.x) + (my - o.y) * (my - o.y) < 14 * 14;
  if (od(ORB.run)) { G.player.runOn = !G.player.runOn; return; }
  if (od(ORB.pray)) { const a = G.player; if (a.prayers.size) { UI.lastPrayers = Array.from(a.prayers); for (const id of UI.lastPrayers) togglePrayer(a, id, true); } else { for (const id of UI.lastPrayers) togglePrayer(a, id, true); } return; }
  if ((mx - 573) * (mx - 573) + (my - 22) * (my - 22) < 16 * 16) { INP.cam.yawG = 0; return; }
  if (minimapClick(mx, my)) return;
  if (inRect(mx, my, { x: VX, y: VY, w: VW, h: VH })) {
    const ents = contextMenuFor(mx, my);
    if (right) { openMenu(ents, mx, my); return; }
    if (G.spellSel && !ents.some(x => x.text.startsWith('Cast'))) { G.spellSel = null; return; }
    const top = ents[0]; if (top && top.text !== 'Cancel') { clickMark(mx, my, top.red === true); top.fn(); } else if (top) top.fn();
  }
}
function onUp(e) {
  if (App.mode !== 'game') return; const p = clientPos(e); UI.mouse = p;
  if (e.button === 1) { INP.mmb = false; return; }
  if (UI.drag) {
    const d = UI.drag; UI.drag = null;
    if (d.active) { for (let i = 0; i < 28; i++) if (inRect(p.x, p.y, invSlotRect(i)) && i !== d.from) { const a = G.player; const t = a.inv[i]; a.inv[i] = a.inv[d.from]; a.inv[d.from] = t; } }
    else invDefault(d.from);
  }
}
function onMove(e) {
  const p = clientPos(e); UI.mouse = p;
  if (App.mode !== 'game') return;
  if (INP.mmb && e.buttons !== undefined && !(e.buttons & 4)) INP.mmb = false; // released outside the page
  if (INP.mmb) { const c = INP.cam; c.yawG += (e.clientX - INP.mmbX) * 0.006; c.pitchG = clamp(c.pitchG + (e.clientY - INP.mmbY) * 0.004, 0.25, 1.35); INP.mmbX = e.clientX; INP.mmbY = e.clientY; }
  if (UI.drag && !UI.drag.active && Math.hypot(p.x - UI.drag.sx, p.y - UI.drag.sy) > 5) UI.drag.active = true;
  if (UI.menu) { const m = UI.menu, g = menuGeom(m); if (p.x < m.x - 12 || p.x > m.x + g.w + 12 || p.y < m.y - 12 || p.y > m.y + g.h + 12) UI.menu = null; }
}
function onWheel(e) {
  if (App.mode !== 'game') return; e.preventDefault(); const p = clientPos(e);
  if (p.y >= 338 && p.x < 519) { G.chatScroll = Math.max(0, G.chatScroll + (e.deltaY < 0 ? 1 : -1) * 2); }
  else if (p.x < 520) { const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; INP.cam.distG = clamp(INP.cam.distG + clamp(dy / 100, -1, 1), 8, 26); }
}
/* window lost focus or the tab was hidden: drop held keys, a middle-drag and an item drag */
function releaseInput() { INP.keys = {}; INP.mmb = false; UI.drag = null; }

/* ---------------- keyboard ---------------- */
function onKeyDown(e) {
  sndInit();
  if (App.mode !== 'game') return App.onKey(e);
  const k = e.key; INP.keys[k] = true;
  if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || (k[0] === 'F' && k.length <= 3 && /F\d+/.test(k))) e.preventDefault();
  const fmap = { F1: 0, F2: 1, F3: 2, F4: 3, F5: 4, F6: 5, F7: 6, F8: 8, F9: 9, F10: 11, F11: 12, F12: 13 };
  if (k in fmap) { UI.tab = fmap[k]; G.spellSel = null; return; }
  if (k === 'Escape') { UI.menu = null; G.spellSel = null; G.dialog = null; UI.bonusWin = false; UI.drag = null; return; }
  if (k === 'Enter') {
    if (G.dialog && !UI.chatInput) { if (G.dialog.type !== 'options') dialogContinue(); return; }
    const t = UI.chatInput.trim(); UI.chatInput = '';
    if (t) chatCommand(t); return;
  }
  if (k === 'Backspace') { UI.chatInput = UI.chatInput.slice(0, -1); return; }
  if (k === ' ' && !UI.chatInput && G.dialog) { if (G.dialog.type !== 'options') dialogContinue(); e.preventDefault(); return; }
  if (k === 'PageUp') { G.chatScroll += 4; return; } if (k === 'PageDown') { G.chatScroll = Math.max(0, G.chatScroll - 4); return; }
  if (k.length === 1 && !e.ctrlKey && !e.metaKey && UI.chatInput.length < 78) { UI.chatInput += k; e.preventDefault(); }
}
function onKeyUp(e) { INP.keys[e.key] = false; }
function chatCommand(t) {
  const pl = G.player;
  if (t.startsWith('::')) {
    const p = t.slice(2).split(' '); const c = p[0].toLowerCase();
    if (c === 'bots' && p[1]) { setBotCount(clamp(parseInt(p[1]) || 1, 0, 14)); gameMsg('Opponents: ' + UI.botCount); }
    else if (c === 'restock') restock(pl.loadoutKind || 'main');
    else if (c === 'heal') { pl.hp = pl.maxHp; pl.pp = pl.stats.pray; }
    else if (c === 'run') pl.runOn = !pl.runOn;
    else gameMsg('Unknown command: ::' + c + '. Try ::bots 6, ::restock, ::heal');
    return;
  }
  sayOverhead(pl, t);
}
/* arrow keys move the yaw / pitch goals; the camera eases toward them in main.js */
function updateCameraKeys(dt) {
  const cam = INP.cam, K = INP.keys;
  if (K.ArrowLeft) cam.yawG -= dt * 1.9; if (K.ArrowRight) cam.yawG += dt * 1.9;
  if (K.ArrowUp) cam.pitchG = clamp(cam.pitchG + dt * 1.0, 0.25, 1.35); if (K.ArrowDown) cam.pitchG = clamp(cam.pitchG - dt * 1.0, 0.25, 1.35);
}
/* hover text every frame */
function updateHover() {
  UI.hoverText = ''; UI.hoverMore = 0; if (UI.menu || App.mode !== 'game') return;
  const m = UI.mouse, a = G.player;
  const setFrom = ents => { if (ents.length) { UI.hoverText = ents[0].text; const n = ents.length - 2; if (n > 0) UI.hoverMore = n + ' more option' + (n > 1 ? 's' : ''); } };
  if (inRect(m.x, m.y, { x: VX, y: VY, w: VW, h: VH })) {
    setFrom(contextMenuFor(m.x, m.y)); if (UI.hoverText === 'Cancel') UI.hoverText = ''; return;
  }
  for (let i = 0; i < 14; i++) if (inRect(m.x, m.y, tabRect(i))) { UI.hoverText = TAB_TIP[i]; return; }
  if (inRect(m.x, m.y, PANEL)) {
    switch (TAB_ID[UI.tab]) {
      case 'inv': for (let i = 0; i < 28; i++) if (a.inv[i] && inRect(m.x, m.y, invSlotRect(i))) { setFrom(itemMenu(a, i)); return; } break;
      case 'equip': for (const slot of SLOTS) if (a.eq[slot] && inRect(m.x, m.y, eqSlotRect(slot))) { UI.hoverText = 'Remove ' + col(NAMECOL.item, itemName(a.eq[slot])); UI.hoverMore = '2 more options'; return; } break;
      case 'prayer': for (let i = 0; i < PR_ORDER.length; i++) if (inRect(m.x, m.y, PR_POS(i))) { const pr = PRAYER_BY_ID[PR_ORDER[i]]; UI.hoverText = (a.prayers.has(pr.id) ? 'Deactivate ' : 'Activate ') + col('ff9040', pr.name); return; } break;
      case 'magic': for (let i = 0; i < SPELLS.length; i++) if (inRect(m.x, m.y, SP_POS(i))) { UI.hoverText = 'Cast ' + col('80d0ff', SPELLS[i].name); UI.hoverMore = '1 more option'; return; } break;
      case 'combat': { const w = weaponOf(a), arr = STYLES[w.cat] || STYLES.unarmed; for (let i = 0; i < arr.length; i++) if (inRect(m.x, m.y, CB.style(i))) { UI.hoverText = 'Select ' + arr[i].n; return; } if (inRect(m.x, m.y, CB.retal)) UI.hoverText = 'Toggle Auto Retaliate'; else if (w.spec && inRect(m.x, m.y, CB.spec)) UI.hoverText = 'Use ' + col('ff981f', 'Special Attack'); return; }
    }
    return;
  }
  const od = o => (m.x - o.x) * (m.x - o.x) + (m.y - o.y) * (m.y - o.y) < 14 * 14;
  if (od(ORB.run)) UI.hoverText = 'Toggle Run'; else if (od(ORB.pray)) UI.hoverText = 'Toggle Quick-prayers'; else if (od(ORB.hp)) UI.hoverText = 'Hitpoints: ' + a.hp + '/' + a.maxHp;
  else if ((m.x - 573) * (m.x - 573) + (m.y - 22) * (m.y - 22) < 16 * 16) UI.hoverText = 'Face North';
  else if ((m.x - MM.cx) * (m.x - MM.cx) + (m.y - MM.cy) * (m.y - MM.cy) < MM.r * MM.r) UI.hoverText = 'Walk here';
}
