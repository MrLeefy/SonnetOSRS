'use strict';
/* ==========================================================================
   ui.js  -  the 765x503 fixed-mode client interface (drawing)
   ========================================================================== */
const PANEL = { x: 547, y: 205, w: 190, h: 261 };
const TAB_Y_TOP = 168, TAB_Y_BOT = 466, TAB_X0 = 527, TAB_W = 33, TAB_H = 37;
const CHAT = { x: 0, y: 338, w: 519, h: 142 };
const MM = { cx: 643, cy: 85, r: 73 };
const BG_STONE = 0x3b3327;
const TAB_ID = ['combat', 'stats', 'quests', 'inv', 'equip', 'prayer', 'magic', 'clan', 'friends', 'ignore', 'logout', 'options', 'emotes', 'music'];
const TAB_TIP = ['Combat Options', 'Skills', 'Player Killing', 'Inventory', 'Worn Equipment', 'Prayer', 'Magic', 'Clan Chat', 'Friends List', 'Ignore List', 'Logout', 'Options', 'Emotes', 'Music Player'];
const UI = {
  tab: 3, mouse: { x: -100, y: -100 }, menu: null, chatInput: '', chatFocus: false, frame: null, hoverText: '', clicks: [], tip: null, showBonus: false,
  drag: null, chatTab: 0, brightness: 3, sound: true, sharp: false, lastPrayers: [], bonusWin: false, frameCount: 0, cursorMode: 'arrow'
};
const MSG_COL = { game: 0x000000, public: 0x000000 };

/* ---------------- static frame ---------------- */
function buildFrame() {
  const p = new Pix(W, H);
  noiseFill(p, 0, 0, W, H, BG_STONE, 5, 77);
  // ---- viewport hole with bevel ----
  p.rect(VX - 4, VY - 4, VW + 8, VH + 8, 0x2a241a);
  p.frame(VX - 3, VY - 3, VW + 6, VH + 6, 0x5b5343);
  p.frame(VX - 2, VY - 2, VW + 4, VH + 4, 0x1a150d);
  p.frame(VX - 1, VY - 1, VW + 2, VH + 2, 0x000000);
  p.rect(VX, VY, VW, VH, 0x000000, 0);
  // ---- chat parchment ----
  const cb = [0x63533c, 0x605a4a, 0x4f4835, 0x4f4835, 0x5b5345, 0x605a4a, 0x31291b];
  for (let i = 0; i < cb.length; i++) p.frame(CHAT.x + i, CHAT.y + i, CHAT.w - i * 2, CHAT.h - i * 2, cb[i]);
  const r = mulberry32(5);
  for (let y = CHAT.y + 7; y < CHAT.y + CHAT.h - 7; y++) for (let x = CHAT.x + 7; x < CHAT.x + CHAT.w - 7; x++) {
    const n = (r() - 0.5) * 14 + Math.sin(x * 0.045 + y * 0.03) * 5 + Math.sin(x * 0.011 - y * 0.05) * 4;
    p.set(x, y, rgb(clamp(0xcb + n, 0, 255) | 0, clamp(0xba + n, 0, 255) | 0, clamp(0x98 + n, 0, 255) | 0));
  }
  // input separator
  p.rect(CHAT.x + 8, CHAT.y + 121, CHAT.w - 16, 1, 0x4f4835);
  // ---- right column ----
  p.frame(519, 0, 246, 503, 0x1a150d); p.rect(520, 0, 1, 503, 0x5b5343);
  // side pillars around the panel
  for (const px of [524, 738]) { p.rect(px, 205, 24, 261, 0x352d20); p.frame(px, 205, 24, 261, 0x1a150d); p.rect(px + 1, 206, 22, 1, 0x5b5343); }
  // panel
  p.rect(PANEL.x - 3, PANEL.y - 3, PANEL.w + 6, PANEL.h + 6, 0x000000);
  p.frame(PANEL.x - 2, PANEL.y - 2, PANEL.w + 4, PANEL.h + 4, 0x6c6453); p.frame(PANEL.x - 1, PANEL.y - 1, PANEL.w + 2, PANEL.h + 2, 0x4b402b);
  p.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x3e3529);
  const rr = mulberry32(9); for (let y = 0; y < PANEL.h; y++) for (let x = 0; x < PANEL.w; x++) { if (rr() < 0.25) { const n = (rr() - 0.5) * 6; p.set(PANEL.x + x, PANEL.y + y, rgb(0x3e + n | 0, 0x35 + n | 0, 0x29 + n | 0)); } }
  // tab strip backdrops
  p.rect(524, TAB_Y_TOP - 2, 241, TAB_H + 2, 0x2a241a); p.rect(524, TAB_Y_BOT, 241, TAB_H + 1, 0x2a241a);
  UI.frame = p.canvas();
}

/* ---------------- helpers ---------------- */
function fillR(ctx, x, y, w, h, c) { ctx.fillStyle = css(c); ctx.fillRect(x, y, w, h); }
function frameR(ctx, x, y, w, h, c) { fillR(ctx, x, y, w, 1, c); fillR(ctx, x, y + h - 1, w, 1, c); fillR(ctx, x, y, 1, h, c); fillR(ctx, x + w - 1, y, 1, h, c); }
function inRect(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
function levelColor(diff) {
  if (diff >= 10) return 0xff0000; if (diff >= 7) return 0xff3000; if (diff >= 4) return 0xff7000; if (diff >= 1) return 0xffb000;
  if (diff === 0) return 0xffff00; if (diff >= -3) return 0xc0ff00; if (diff >= -6) return 0x80ff00; if (diff >= -9) return 0x40ff00; return 0x00ff00;
}
function stoneButton(ctx, x, y, w, h, sel, hov) {
  const base = sel ? 0x8a211e : (hov ? 0x5b5342 : 0x4b4434), hi = sel ? 0xb5453a : 0x726a58, lo = sel ? 0x4a100e : 0x2c261a;
  fillR(ctx, x, y, w, h, 0x000000); fillR(ctx, x + 1, y + 1, w - 2, h - 2, base);
  fillR(ctx, x + 1, y + 1, w - 2, 1, hi); fillR(ctx, x + 1, y + 1, 1, h - 2, hi); fillR(ctx, x + 1, y + h - 2, w - 2, 1, lo); fillR(ctx, x + w - 2, y + 1, 1, h - 2, lo);
}
function drawTabStone(ctx, idx, sel) {
  const row = idx < 7 ? 0 : 1, col = idx % 7; const x = TAB_X0 + col * TAB_W, y = row === 0 ? TAB_Y_TOP : TAB_Y_BOT;
  const base = sel ? 0x8a2a1e : 0x4a4230, hi = sel ? 0xb84c3a : 0x6b6350, lo = sel ? 0x4a140c : 0x241f14;
  fillR(ctx, x, y, TAB_W, TAB_H, 0x000000); fillR(ctx, x + 1, y + 1, TAB_W - 2, TAB_H - 2, base);
  fillR(ctx, x + 1, y + 1, TAB_W - 2, 1, hi); fillR(ctx, x + 1, y + 1, 1, TAB_H - 2, hi); fillR(ctx, x + 1, y + TAB_H - 2, TAB_W - 2, 1, lo); fillR(ctx, x + TAB_W - 2, y + 1, 1, TAB_H - 2, lo);
  const cut = (cx, cy) => { fillR(ctx, cx, cy, 3, 1, BG_STONE); fillR(ctx, cx, cy, 1, 3, BG_STONE); fillR(ctx, cx + 1, cy + 1, 1, 1, BG_STONE); };
  if (row === 0) { if (col === 0) fillR(ctx, x, y, 4, 4, 0x2a241a); if (col === 6) fillR(ctx, x + TAB_W - 4, y, 4, 4, 0x2a241a); }
  else { if (col === 0) fillR(ctx, x, y + TAB_H - 4, 4, 4, 0x2a241a); if (col === 6) fillR(ctx, x + TAB_W - 4, y + TAB_H - 4, 4, 4, 0x2a241a); }
  ctx.drawImage(IC['tab_' + TAB_ID[idx]], x + 6, y + 8 + (row ? 0 : 0));
}
function tabRect(idx) { const row = idx < 7 ? 0 : 1, col = idx % 7; return { x: TAB_X0 + col * TAB_W, y: row === 0 ? TAB_Y_TOP : TAB_Y_BOT, w: TAB_W, h: TAB_H }; }

/* ---------------- chat ---------------- */
function wrapMsg(m, maxW) {
  const lines = []; let segs;
  if (m.type === 'public') segs = [{ t: m.name + ': ', c: 0x000000 }, { t: m.text, c: 0x0000ff }];
  else segs = [{ t: m.text, c: m.col !== undefined ? m.col : 0x000000 }];
  // tokenise into words carrying colour
  const words = []; for (const s of segs) { let cur = ''; for (const ch of s.t) { cur += ch; if (ch === ' ') { words.push({ t: cur, c: s.c }); cur = ''; } } if (cur) words.push({ t: cur, c: s.c }); }
  let cur = [], cw = 0;
  for (const w of words) {
    const ww = textWidth('p11', w.t);
    if (cw + ww > maxW && cur.length) { lines.push(cur); cur = []; cw = 0; }
    cur.push(w); cw += ww;
  }
  if (cur.length) lines.push(cur);
  return lines;
}
function chatLinesAll() {
  const out = []; const start = Math.max(0, G.msgs.length - 60);
  for (let i = start; i < G.msgs.length; i++) {
    const m = G.msgs[i];
    if (UI.chatTab === 1 && m.type !== 'game') continue; if (UI.chatTab === 2 && m.type !== 'public') continue;
    for (const l of wrapMsg(m, 478)) out.push(l);
  }
  return out;
}
function drawChat(ctx) {
  const d = G.dialog;
  if (d) { drawDialog(ctx, d); }
  else {
    const lines = chatLinesAll(); const n = 8; const maxScroll = Math.max(0, lines.length - n); G.chatScroll = clamp(G.chatScroll, 0, maxScroll);
    const endIdx = lines.length - G.chatScroll, startIdx = Math.max(0, endIdx - n);
    for (let i = startIdx; i < endIdx; i++) {
      const row = i - startIdx + (n - (endIdx - startIdx)); let x = 10; const y = 357 + row * 14;
      for (const w of lines[i]) x = drawText(ctx, 'p11', w.t, x, y, w.c, false);
    }
    // scrollbar
    const sx = 497, sy = 345, sh = 111;
    fillR(ctx, sx, sy, 16, sh, 0x8a7a58); fillR(ctx, sx + 1, sy + 17, 14, sh - 34, 0x66593e);
    for (const yy of [sy, sy + sh - 16]) { fillR(ctx, sx, yy, 16, 16, 0x000000); fillR(ctx, sx + 1, yy + 1, 14, 14, 0x9a8a68); fillR(ctx, sx + 1, yy + 1, 14, 1, 0xc8b890); }
    ctx.fillStyle = css(0x000000); const up = [[8, 5], [7, 6], [9, 6], [6, 7], [10, 7]], dn = [[8, 11], [7, 10], [9, 10], [6, 9], [10, 9]];
    for (const [ax, ay] of up) ctx.fillRect(sx + ax, sy + ay, 1, 1); for (const [ax, ay] of dn) ctx.fillRect(sx + ax, sy + sh - 16 + ay, 1, 1);
    const track = sh - 34, thumbH = Math.max(14, Math.floor(track * n / Math.max(n, lines.length)));
    const thumbY = sy + 17 + Math.floor((track - thumbH) * (maxScroll ? 1 - G.chatScroll / maxScroll : 1));
    fillR(ctx, sx + 1, thumbY, 14, thumbH, 0x000000); fillR(ctx, sx + 2, thumbY + 1, 12, thumbH - 2, 0x9a8a68); fillR(ctx, sx + 2, thumbY + 1, 12, 1, 0xc8b890); fillR(ctx, sx + 2, thumbY + 1, 1, thumbH - 2, 0xc8b890);
  }
  // input line
  const pl = G.player; const blink = (Math.floor(G.now / 500) % 2) ? '*' : '';
  let x = drawText(ctx, 'p11', pl.name + ': ', 10, 471, 0x000000, false);
  drawText(ctx, 'p11', UI.chatInput + blink, x, 471, 0x0000ff, false);
  // buttons row
  const labs = ['All', 'Game', 'Public', 'Private', 'Clan', 'Trade']; const stat = ['', 'On', 'On', 'On', 'Off', 'On'];
  for (let i = 0; i < 6; i++) {
    const bx = 5 + i * 56; stoneButton(ctx, bx, 482, 54, 20, UI.chatTab === i && i < 3, false);
    drawTextC(ctx, 'p11', labs[i], bx + 27, i > 0 && i < 6 ? 494 : 496, i === 0 || UI.chatTab === i ? 0xffffff : 0xe0e0d0, true);
    if (stat[i]) drawTextC(ctx, 'q8', stat[i], bx + 27, 501, stat[i] === 'On' ? 0x40ff40 : 0xff4040, false);
  }
  stoneButton(ctx, 425, 482, 90, 20, false, false); drawTextC(ctx, 'p11', 'Report abuse', 470, 496, 0xff3030, true);
}
function drawDialog(ctx, d) {
  if (d.type === 'options') {
    drawTextC(ctx, 'b12', d.title || 'Select an Option', 260, 365, 0x000000, false);
    ctx.fillStyle = css(0x4f4835); ctx.fillRect(20, 371, 480, 1);
    const n = d.opts.length; const gap = Math.min(19, Math.floor(80 / n));
    d.rects = [];
    for (let i = 0; i < n; i++) {
      const y = 389 + i * gap; const hov = UI.mouse.x > 20 && UI.mouse.x < 500 && UI.mouse.y > y - 12 && UI.mouse.y <= y + 4;
      drawTextC(ctx, 'p11', d.opts[i].t, 260, y, hov ? 0xffffff : 0x0000ff, false); d.rects.push({ x: 20, y: y - 12, w: 480, h: 16 });
    }
  } else if (d.type === 'npc') {
    // chat head
    const hx = 22, hy = 352; fillR(ctx, hx, hy, 66, 78, 0x9a8a68); frameR(ctx, hx, hy, 66, 78, 0x4f4835);
    drawChatHead(ctx, hx + 33, hy + 78, d.kit || {});
    drawTextC(ctx, 'b12', d.name, 300, 366, 0x000000, false);
    ctx.fillStyle = css(0x4f4835); ctx.fillRect(100, 371, 400, 1);
    const lines = d.lines; const y0 = 371 + Math.floor((66 - lines.length * 14) / 2) + 12;
    for (let i = 0; i < lines.length; i++) drawTextC(ctx, 'p11', lines[i], 300, y0 + i * 14, 0x000000, false);
    const hov = UI.mouse.x > 100 && UI.mouse.x < 500 && UI.mouse.y > 440 && UI.mouse.y < 458;
    drawTextC(ctx, 'p11', 'Click here to continue', 300, 452, hov ? 0xffffff : 0x0000ff, false); d.rects = [{ x: 100, y: 440, w: 400, h: 18 }];
  } else if (d.type === 'msg') {
    const lines = d.lines; const y0 = 355 + Math.floor((80 - lines.length * 14) / 2) + 10;
    for (let i = 0; i < lines.length; i++) drawTextC(ctx, 'p11', lines[i], 260, y0 + i * 14, 0x000000, false);
    const hov = UI.mouse.y > 440 && UI.mouse.y < 458 && UI.mouse.x < 500;
    drawTextC(ctx, 'p11', 'Click here to continue', 260, 452, hov ? 0xffffff : 0x0000ff, false); d.rects = [{ x: 20, y: 440, w: 480, h: 18 }];
  }
}
function drawChatHead(ctx, cx, by, kit) {
  const skin = kit.skin || 0xe8b088, hair = kit.hair || 0x3a2410, shirt = kit.shirt || 0x40305a;
  const p = new Pix(66, 78);
  p.rect(6, 56, 54, 22, shirt); p.rect(24, 48, 18, 10, skin); p.ellipse(33, 30, 15, 19, skin); p.ellipse(33, 16, 16, 9, hair); p.rect(17, 18, 3, 16, hair); p.rect(46, 18, 3, 16, hair);
  p.rect(25, 28, 4, 3, 0x101010); p.rect(37, 28, 4, 3, 0x101010); p.rect(29, 41, 8, 2, shadeCol(skin, 0.7)); p.rect(31, 32, 4, 6, shadeCol(skin, 0.9));
  if (kit.clerk) { p.rect(30, 58, 6, 18, 0xe0e0d0); p.rect(20, 10, 26, 7, 0x5a3a18); p.rect(16, 14, 34, 4, 0x7a5228); }
  ctx.drawImage(p.canvas(), cx - 33, by - 78);
}

/* ---------------- panels ---------------- */
function tipBox(lines) { UI.tip = lines; }
function drawPanel(ctx) {
  const t = TAB_ID[UI.tab], a = G.player;
  switch (t) {
    case 'combat': return drawCombatTab(ctx, a);
    case 'stats': return drawStatsTab(ctx, a);
    case 'quests': return drawQuestTab(ctx, a);
    case 'inv': return drawInvTab(ctx, a);
    case 'equip': return drawEquipTab(ctx, a);
    case 'prayer': return drawPrayerTab(ctx, a);
    case 'magic': return drawMagicTab(ctx, a);
    case 'friends': return drawFriendsTab(ctx);
    case 'ignore': return drawTextTab(ctx, 'Ignore List', ['', 'Ignore list is empty.']);
    case 'clan': return drawTextTab(ctx, 'Clan Chat', ['', 'Not in a clan chat.', '', 'To talk in a clan chat, start', 'your messages with /.']);
    case 'logout': return drawLogoutTab(ctx);
    case 'options': return drawOptionsTab(ctx);
    case 'emotes': return drawEmotesTab(ctx);
    case 'music': return drawMusicTab(ctx);
  }
}
function invSlotRect(i) { return { x: PANEL.x + 11 + (i % 4) * 42, y: PANEL.y + 4 + Math.floor(i / 4) * 36, w: 42, h: 36 }; }
function drawItem(ctx, s, x, y) { // x,y = slot top-left (42x36)
  ctx.drawImage(itemIcon(s.id), x + 5, y + 2);
  const it = ITEMS[s.id];
  if (it.stack && s.n > 1) { const st = stackText(s.n); drawText(ctx, 'p11', st.t, x + 3, y + 11, st.c, true); }
  else if (it.stack) { drawText(ctx, 'p11', '1', x + 3, y + 11, 0xffff00, true); }
}
function drawInvTab(ctx, a) {
  for (let i = 0; i < 28; i++) {
    const r = invSlotRect(i); const s = a.inv[i];
    if (UI.drag && UI.drag.from === i && UI.drag.active) continue;
    if (s) drawItem(ctx, s, r.x, r.y);
    if (s && inRect(UI.mouse.x, UI.mouse.y, r) && !UI.menu && !UI.drag) { const it = ITEMS[s.id]; const lines = [itemName(s)]; if (it.food) lines.push('Heals ' + it.food.heal + ' Hitpoints'); else if (it.pot) lines.push('Boost potion'); else if (it.slot) lines.push('Slot: ' + it.slot + (it.catName ? ' | ' + it.catName : '')); else if (it.stack) lines.push('Quantity: ' + s.n); if (it.ex) lines.push(it.ex); tipBox(lines); }
  }
}
const EQ_POS = { head: [77, 7], cape: [36, 46], neck: [77, 46], ammo: [118, 46], weapon: [24, 85], body: [77, 85], shield: [130, 85], legs: [77, 125], hands: [24, 165], feet: [77, 165], ring: [130, 165] };
function eqSlotRect(slot) { const p = EQ_POS[slot]; return { x: PANEL.x + p[0], y: PANEL.y + p[1], w: 36, h: 36 }; }
const EQ_BTN = { x: PANEL.x + 35, y: PANEL.y + 214, w: 120, h: 30 };
function drawEquipTab(ctx, a) {
  for (const slot of SLOTS) {
    const r = eqSlotRect(slot); fillR(ctx, r.x, r.y, 36, 36, 0x2b251b); frameR(ctx, r.x, r.y, 36, 36, 0x1a150d); fillR(ctx, r.x + 1, r.y + 1, 34, 1, 0x5a5040); fillR(ctx, r.x + 1, r.y + 1, 1, 34, 0x5a5040);
    const s = a.eq[slot]; if (s) { ctx.drawImage(itemIcon(s.id), r.x + 2, r.y + 2); if (ITEMS[s.id].stack) { const st = stackText(s.n); drawText(ctx, 'p11', st.t, r.x + 2, r.y + 11, st.c, true); } }
    else { drawTextC(ctx, 'q8', slot === 'ring' ? 'Ring' : slot[0].toUpperCase() + slot.slice(1), r.x + 18, r.y + 22, 0x625644, false); }
  }
  const b = EQ_BTN; stoneButton(ctx, b.x, b.y, b.w, b.h, UI.bonusWin, inRect(UI.mouse.x, UI.mouse.y, b));
  drawTextC(ctx, 'p11', 'View equipment stats', b.x + b.w / 2, b.y + 19, 0xff981f, true);
}
const CB = { style: i => ({ x: PANEL.x + 6 + (i % 2) * 93, y: PANEL.y + 46 + Math.floor(i / 2) * 44, w: 84, h: 39 }), retal: { x: PANEL.x + 6, y: PANEL.y + 138, w: 177, h: 39 }, spec: { x: PANEL.x + 6, y: PANEL.y + 186, w: 177, h: 22 } };
function drawCombatTab(ctx, a) {
  const w = weaponOf(a); drawTextC(ctx, 'b12', w.name, PANEL.x + 95, PANEL.y + 22, 0xff981f, true);
  drawTextC(ctx, 'p11', 'Combat Lvl: ' + a.level, PANEL.x + 95, PANEL.y + 37, 0xffffff, true);
  const arr = STYLES[w.cat] || STYLES.unarmed;
  const anyMagic = a.autocast && w.magic;
  for (let i = 0; i < arr.length; i++) {
    const r = CB.style(i); const sel = a.style === i && !anyMagic; stoneButton(ctx, r.x, r.y, r.w, r.h, sel, inRect(UI.mouse.x, UI.mouse.y, r));
    const st = arr[i]; const col = st.t === 'stab' ? 0xa0c0ff : st.t === 'slash' ? 0xffe090 : st.t === 'crush' ? 0xffb080 : 0xc0ffc0;
    ctx.drawImage(IC.o_combatsel, r.x + r.w / 2 - 7, r.y + 5); drawTextC(ctx, 'p11', st.n, r.x + r.w / 2, r.y + 31, 0xffffff, true);
  }
  const r = CB.retal; stoneButton(ctx, r.x, r.y, r.w, r.h, false, inRect(UI.mouse.x, UI.mouse.y, r));
  ctx.drawImage(IC['o_combatsel'], r.x + 12, r.y + 12);
  drawTextC(ctx, 'p11', 'Auto Retaliate', r.x + 100, r.y + 17, 0xff981f, true); drawTextC(ctx, 'p11', a.autoRetal ? '(On)' : '(Off)', r.x + 100, r.y + 30, a.autoRetal ? 0x40ff40 : 0xff9040, true);
  if (w.spec) {
    const s = CB.spec; fillR(ctx, s.x, s.y, s.w, s.h, 0x000000); fillR(ctx, s.x + 1, s.y + 1, s.w - 2, s.h - 2, 0x0e3a12);
    fillR(ctx, s.x + 2, s.y + 2, Math.floor((s.w - 4) * a.spec / 100), s.h - 4, a.specOn ? 0x40ff60 : 0x1a7a28);
    drawTextC(ctx, 'p11', 'Special Attack: ' + Math.floor(a.spec) + '%', s.x + s.w / 2, s.y + 15, 0xffffff, true);
  }
  drawTextC(ctx, 'p11', 'Category: ' + w.catName, PANEL.x + 95, PANEL.y + 250, 0xe0d8c0, true);
  if (a.autocast && w.magic) drawTextC(ctx, 'p11', 'Autocast: ' + SPELL_BY_ID[a.autocast].name, PANEL.x + 95, PANEL.y + 228, 0x80d0ff, true);
}
function drawStatsTab(ctx, a) {
  const keys = { Attack: 'atk', Hitpoints: 'hp', Strength: 'str', Defence: 'def', Ranged: 'rng', Prayer: 'pray', Magic: 'mag' };
  for (let i = 0; i < SKILLS.length; i++) {
    const c = i % 3, r = Math.floor(i / 3); const x = PANEL.x + 3 + c * 63, y = PANEL.y + 4 + r * 32;
    fillR(ctx, x, y, 61, 30, 0x4a4131); fillR(ctx, x, y, 61, 1, 0x6a5f48); fillR(ctx, x, y + 29, 61, 1, 0x2a241a);
    ctx.drawImage(IC['sk_' + SKILLS[i][2]], x + 3, y + 8);
    const k = keys[SKILLS[i][0]]; let cur = 99, base = 99;
    if (k) { cur = k === 'hp' ? a.hp : k === 'pray' ? Math.ceil(a.pp) : a.cur[k]; base = a.stats[k]; }
    const curCol = cur < base ? 0xff4040 : cur > base ? 0x40ff40 : 0xffff00;
    drawText(ctx, 'p11', String(cur), x + 25, y + 15, curCol, true); drawText(ctx, 'p11', String(base), x + 40, y + 27, 0xffff00, true);
  }
  const x = PANEL.x + 3 + 2 * 63, y = PANEL.y + 4 + 7 * 32;
  const totalKeys = { Attack: 'atk', Hitpoints: 'hp', Strength: 'str', Defence: 'def', Ranged: 'rng', Prayer: 'pray', Magic: 'mag' };
  let totalLvl = 0; for (const k of Object.values(totalKeys)) if (a.stats[k]) totalLvl += a.stats[k];
  fillR(ctx, x, y, 61, 30, 0x4a4131); drawTextC(ctx, 'p11', 'Total level:', x + 31, y + 13, 0xffff00, true); drawTextC(ctx, 'p11', String(totalLvl), x + 31, y + 26, 0xffff00, true);
}
function drawQuestTab(ctx, a) {
  drawTextC(ctx, 'b12', 'Player Killing', PANEL.x + 95, PANEL.y + 18, 0xff981f, true);
  fillR(ctx, PANEL.x + 8, PANEL.y + 24, 174, 1, 0x000000);
  const rows = [['Kills', G.kills, 0x00ff00], ['Deaths', G.deaths, 0xff0000], ['K/D ratio', G.deaths ? (G.kills / G.deaths).toFixed(2) : G.kills.toFixed(2), 0xffff00], ['Kill streak', G.streak, 0x00ff00], ['Best streak', G.best, 0xffff00], ['Damage dealt', fmtNum(G.dmgDealt), 0xffffff], ['Damage taken', fmtNum(G.dmgTaken), 0xffffff]];
  for (let i = 0; i < rows.length; i++) { drawText(ctx, 'p11', rows[i][0] + ':', PANEL.x + 12, PANEL.y + 44 + i * 16, 0xdcd0b0, true); drawTextR(ctx, 'p11', String(rows[i][1]), PANEL.x + 178, PANEL.y + 44 + i * 16, rows[i][2], true); }
  fillR(ctx, PANEL.x + 8, PANEL.y + 160, 174, 1, 0x000000);
  const tips = ['Protect from Melee/Missiles/Magic', 'to survive. Switch your weapon', 'each tick with the inventory.', 'Freeze with Ice Barrage, then', 'finish with your special attack.', '', 'Location: Grand Exchange, Varrock', 'World 301 - PvP - multi-combat'];
  for (let i = 0; i < tips.length; i++) drawTextC(ctx, 'p11', tips[i], PANEL.x + 95, PANEL.y + 178 + i * 13, i > 5 ? 0x9a9a8a : 0xffff00, true);
}
const PR_POS = i => ({ x: PANEL.x + 2 + (i % 5) * 37, y: PANEL.y + 3 + Math.floor(i / 5) * 37, w: 37, h: 37 });
const PR_ORDER = ['thick', 'burst', 'clarity', 'rock', 'super', 'improved', 'rapidrestore', 'rapidheal', 'protitem', 'steel', 'ultimate', 'incredible', 'pmagic', 'pmissiles', 'pmelee', 'retribution', 'redemption', 'smite', 'piety'];
function drawPrayerTab(ctx, a) {
  for (let i = 0; i < PR_ORDER.length; i++) {
    const id = PR_ORDER[i], r = PR_POS(i), pr = PRAYER_BY_ID[id], on = a.prayers.has(id);
    const dis = a.stats.pray < pr.lvl;
    ctx.globalAlpha = dis ? 0.45 : 1; ctx.drawImage(on ? IC['pro_' + id] : IC['pr_' + id], r.x + 5, r.y + 5); ctx.globalAlpha = 1;
    if (inRect(UI.mouse.x, UI.mouse.y, r)) tipBox(['Level ' + pr.lvl + ': ' + pr.name, pr.d]);
  }
  drawTextC(ctx, 'p11', 'Prayer: ' + Math.ceil(a.pp) + '/' + a.stats.pray, PANEL.x + 95, PANEL.y + 250, 0xffff00, true);
}
const SP_POS = i => ({ x: PANEL.x + 5 + (i % 5) * 36, y: PANEL.y + 5 + Math.floor(i / 5) * 36, w: 36, h: 36 });
function drawMagicTab(ctx, a) {
  drawTextC(ctx, 'b12', 'Ancient Magicks', PANEL.x + 95, PANEL.y + 250, 0xff981f, true);
  for (let i = 0; i < SPELLS.length; i++) {
    const sp = SPELLS[i], r = SP_POS(i); const can = a.stats.mag >= sp.lvl;
    const sel = G.spellSel === sp.id; const ac = a.autocast === sp.id;
    if (sel || ac) { fillR(ctx, r.x + 1, r.y + 1, 34, 34, sel ? 0xe8c020 : 0x60c0ff); }
    ctx.globalAlpha = can ? 1 : 0.4; ctx.drawImage(IC['sp_' + sp.id], r.x + 4, r.y + 4); ctx.globalAlpha = 1;
    if (inRect(UI.mouse.x, UI.mouse.y, r)) { const ln = ['Level ' + sp.lvl + ': ' + sp.name, 'Max hit: ' + sp.max + (sp.freeze ? '  Freeze: ' + Math.round(sp.freeze * 0.6) + 's' : '  Heals 25% of damage')]; const rs = 'Runes: ' + Object.entries(sp.runes).map(([k, v]) => v + ' ' + ITEMS[k].name.replace(' rune', '')).join(', '); ln.push(rs); tipBox(ln); }
  }
  if (a.autocast) drawTextC(ctx, 'p11', 'Autocast: ' + SPELL_BY_ID[a.autocast].name, PANEL.x + 95, PANEL.y + 236, 0x80d0ff, true);
  const info = ['Left-click a spell, then click a', 'player to cast it. Right-click a', 'spell to set it as autocast', '(needs a staff wielded).'];
  for (let i = 0; i < info.length; i++) drawTextC(ctx, 'p11', info[i], PANEL.x + 95, PANEL.y + 108 + i * 13, 0xc8c0a0, true);
}
function drawTextTab(ctx, title, lines) {
  fillR(ctx, PANEL.x + 4, PANEL.y + 4, 182, 20, 0x2c261a); drawTextC(ctx, 'b12', title, PANEL.x + 95, PANEL.y + 19, 0xff981f, true);
  for (let i = 0; i < lines.length; i++) drawTextC(ctx, 'p11', lines[i], PANEL.x + 95, PANEL.y + 44 + i * 14, 0xffffff, true);
}
function drawFriendsTab(ctx) {
  fillR(ctx, PANEL.x + 4, PANEL.y + 4, 182, 20, 0x2c261a); drawTextC(ctx, 'b12', 'Friends List', PANEL.x + 95, PANEL.y + 19, 0xff981f, true);
  let y = PANEL.y + 40; const list = G.actors.filter(a => a.isBot);
  for (const b of list) { drawText(ctx, 'p11', b.name, PANEL.x + 8, y, b.dead ? 0xff4040 : 0x40ff40, true); drawTextR(ctx, 'p11', b.dead ? 'Dead' : 'World 301', PANEL.x + 182, y, 0xdcd0b0, true); y += 14; if (y > PANEL.y + 240) break; }
}
const LOGOUT_BTN = { x: PANEL.x + 20, y: PANEL.y + 60, w: 150, h: 36 };
function drawLogoutTab(ctx) {
  drawTextC(ctx, 'p11', 'World 301', PANEL.x + 95, PANEL.y + 24, 0xffffff, true); drawTextC(ctx, 'p11', 'Grand Exchange PvP', PANEL.x + 95, PANEL.y + 38, 0xdcd0b0, true);
  const b = LOGOUT_BTN; stoneButton(ctx, b.x, b.y, b.w, b.h, false, inRect(UI.mouse.x, UI.mouse.y, b)); drawTextC(ctx, 'p11', 'Click here to logout', b.x + b.w / 2, b.y + 22, 0xff981f, true);
}
const OPT = { bright: i => ({ x: PANEL.x + 12 + i * 41, y: PANEL.y + 38, w: 38, h: 22 }), run: { x: PANEL.x + 12, y: PANEL.y + 84, w: 166, h: 26 }, sound: { x: PANEL.x + 12, y: PANEL.y + 116, w: 166, h: 26 }, bots: { x: PANEL.x + 12, y: PANEL.y + 148, w: 166, h: 26 }, scale: { x: PANEL.x + 12, y: PANEL.y + 180, w: 166, h: 26 } };
function drawOptionsTab(ctx) {
  drawTextC(ctx, 'p11', 'Brightness', PANEL.x + 95, PANEL.y + 30, 0xffffff, true);
  for (let i = 0; i < 4; i++) { const r = OPT.bright(i); stoneButton(ctx, r.x, r.y, r.w, r.h, UI.brightness === i, inRect(UI.mouse.x, UI.mouse.y, r)); fillR(ctx, r.x + 12, r.y + 7, 14, 8, mixCol(0x303030, 0xf0f0f0, i / 3)); }
  const rr = OPT.run; stoneButton(ctx, rr.x, rr.y, rr.w, rr.h, false, inRect(UI.mouse.x, UI.mouse.y, rr)); drawTextC(ctx, 'p11', 'Run: ' + (G.player.runOn ? 'On' : 'Off'), rr.x + rr.w / 2, rr.y + 17, G.player.runOn ? 0x40ff40 : 0xff9040, true);
  const so = OPT.sound; stoneButton(ctx, so.x, so.y, so.w, so.h, false, inRect(UI.mouse.x, UI.mouse.y, so)); drawTextC(ctx, 'p11', 'Sound effects: ' + (UI.sound ? 'On' : 'Off'), so.x + so.w / 2, so.y + 17, UI.sound ? 0x40ff40 : 0xff9040, true);
  const bo = OPT.bots; stoneButton(ctx, bo.x, bo.y, bo.w, bo.h, false, inRect(UI.mouse.x, UI.mouse.y, bo)); drawTextC(ctx, 'p11', 'Opponents: ' + UI.botCount, bo.x + bo.w / 2, bo.y + 17, 0xffff00, true);
  const sc = OPT.scale; stoneButton(ctx, sc.x, sc.y, sc.w, sc.h, false, inRect(UI.mouse.x, UI.mouse.y, sc)); drawTextC(ctx, 'p11', 'Scaling: ' + (UI.sharp ? 'Sharp' : 'Smooth'), sc.x + sc.w / 2, sc.y + 17, 0xffff00, true);
  const lines = ['Arrows / middle-mouse: camera', 'F1-F7: panels   Enter: chat'];
  for (let i = 0; i < lines.length; i++) drawTextC(ctx, 'p11', lines[i], PANEL.x + 95, PANEL.y + 226 + i * 13, 0xc8c0a0, true);
}
const EMOTES = ['Yes', 'No', 'Bow', 'Angry', 'Think', 'Wave', 'Shrug', 'Cheer', 'Beckon', 'Laugh', 'Jump', 'Dance'];
function emoteRect(i) { return { x: PANEL.x + 5 + (i % 4) * 45, y: PANEL.y + 6 + Math.floor(i / 4) * 44, w: 42, h: 40 }; }
function drawEmotesTab(ctx) {
  for (let i = 0; i < EMOTES.length; i++) { const r = emoteRect(i); stoneButton(ctx, r.x, r.y, r.w, r.h, false, inRect(UI.mouse.x, UI.mouse.y, r)); ctx.drawImage(IC.tab_emotes, r.x + 10, r.y + 4); drawTextC(ctx, 'q8', EMOTES[i], r.x + 21, r.y + 34, 0xffffff, true); }
}
const TRACKS = ['Harmony', 'Autumn Voyage', 'Sea Shanty2', 'Newbie Melody', 'Flute Salad', 'Attention', 'Expanse', 'Wilderness', 'Wilderness 2', 'Wilderness 3'];
function drawMusicTab(ctx) {
  fillR(ctx, PANEL.x + 4, PANEL.y + 4, 182, 20, 0x2c261a); drawTextC(ctx, 'b12', 'Music Player', PANEL.x + 95, PANEL.y + 19, 0xff981f, true);
  drawTextC(ctx, 'p11', 'Now playing:', PANEL.x + 95, PANEL.y + 40, 0xffffff, true); drawTextC(ctx, 'p11', UI.sound ? 'Wilderness' : '(sound off)', PANEL.x + 95, PANEL.y + 54, UI.sound ? 0xff9040 : 0x808080, true);
  for (let i = 0; i < TRACKS.length; i++) drawText(ctx, 'p11', TRACKS[i], PANEL.x + 12, PANEL.y + 80 + i * 14, i === 7 ? 0x00ff00 : 0xff0000, true);
}

/* ---------------- minimap + orbs ---------------- */
let MMIMG = null, MMCV = null;
function drawMinimap(ctx, cam) {
  const R = MM.r, S = R * 2 + 1; if (!MMIMG) { MMIMG = ctx.createImageData(S, S); MMCV = document.createElement('canvas'); MMCV.width = MMCV.height = S; }
  const d = MMIMG.data; const pl = G.player; const rp = renderPos(pl, (G.now - G.lastTick) / TICK_MS); const px = rp[0], py = rp[1];
  const cs = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), N = MAPN;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = i - R, dy = j - R, o = (j * S + i) * 4;
    if (dx * dx + dy * dy > R * R) { d[o + 3] = 0; continue; }
    const ox = (cs * dx + sn * (-dy)) / 4, oy = (-sn * dx + cs * (-dy)) / 4;
    const tx = Math.floor(px + ox), ty = Math.floor(py + oy);
    let c = 0; if (tx >= 0 && ty >= 0 && tx < N && ty < N) c = WORLD.mm[ty * N + tx];
    d[o] = c >> 16 & 255; d[o + 1] = c >> 8 & 255; d[o + 2] = c & 255; d[o + 3] = 255;
  }
  MMCV.getContext('2d').putImageData(MMIMG, 0, 0); ctx.drawImage(MMCV, MM.cx - R, MM.cy - R);
  const dot = (ox, oy, col) => {
    const dx = 4 * (ox * cs - oy * sn), dy = -4 * (ox * sn + oy * cs); if (dx * dx + dy * dy > (R - 3) * (R - 3)) return;
    fillR(ctx, Math.round(MM.cx + dx) - 1, Math.round(MM.cy + dy) - 1, 3, 3, 0x000000); fillR(ctx, Math.round(MM.cx + dx) - 1, Math.round(MM.cy + dy) - 1, 2, 2, col);
  };
  for (const g of G.ground) dot(g.x + 0.5 - px, g.y + 0.5 - py, 0xff0000);
  for (const a of G.actors) { if (a === pl || a.dead) continue; dot(a.rx - px, a.ry - py, a.npc ? 0xffff00 : 0xffffff); }
  dot(0, 0, Math.sin(G.now / 500) > 0 ? 0xffffff : 0xd0d0b0);
  // ring
  drawRing(ctx, MM.cx, MM.cy, R + 1, R + 4);
}
const RING_CACHE = {};
function drawRing(ctx, cx, cy, r0, r1) {
  const S = (r1 + 1) * 2, rk = r0 + '_' + r1; let cv = RING_CACHE[rk];
  if (!cv) {
    const p = new Pix(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r0 && d < r1) { const k = d - r0; p.set(x, y, k < 1 ? 0x000000 : k < 2 ? 0x6b5f43 : k < 3 ? 0x4a402b : 0x000000); }
    }
    cv = RING_CACHE[rk] = p.canvas();
  }
  ctx.drawImage(cv, cx - S / 2, cy - S / 2);
}
const ORB_CACHE = {};
function orbCanvas(frac, hi, lo, on) {
  const p = new Pix(30, 30); const c = 15;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const dx = x - c + 0.5, dy = y - c + 0.5, d = dx * dx + dy * dy;
    if (d <= 15 * 15) p.set(x, y, 0x000000);
    if (d <= 14 * 14) p.set(x, y, on ? 0x8a6a20 : 0x4a4232);
    if (d <= 12.5 * 12.5) { const fromBottom = (30 - y) / 30; p.set(x, y, fromBottom <= frac ? hi : lo); }
  }
  return p.canvas();
}
function drawOrb(ctx, cx, cy, icon, frac, hi, lo, text, on) {
  const q = Math.round(clamp(frac, 0, 1) * 40) / 40; const key = hi + '_' + q + '_' + (on ? 1 : 0);
  const oc = ORB_CACHE[key] || (ORB_CACHE[key] = orbCanvas(q, hi, lo, on));
  ctx.drawImage(oc, cx - 15, cy - 15); if (icon) ctx.drawImage(icon, cx - Math.floor(icon.width / 2), cy - Math.floor(icon.height / 2));
}
const ORB = { hp: { x: 552, y: 50 }, pray: { x: 552, y: 82 }, run: { x: 563, y: 114 } };
function drawOrbs(ctx) {
  const a = G.player;
  drawOrb(ctx, ORB.hp.x, ORB.hp.y, IC.o_heart, a.hp / a.maxHp, 0xd81818, 0x4a0808, '', false); drawTextC(ctx, 'p11', String(a.hp), ORB.hp.x + 1, ORB.hp.y + 4, 0xffffff, true);
  drawOrb(ctx, ORB.pray.x, ORB.pray.y, IC.o_pray, a.pp / a.stats.pray, 0x3a5ad8, 0x141c48, '', a.prayers.size > 0); drawTextC(ctx, 'p11', String(Math.ceil(a.pp)), ORB.pray.x + 1, ORB.pray.y + 4, 0xffffff, true);
  drawOrb(ctx, ORB.run.x, ORB.run.y, IC.o_run, a.run / 100, 0xc8b020, 0x484010, '', a.runOn); drawTextC(ctx, 'p11', String(Math.floor(a.run)), ORB.run.x + 1, ORB.run.y + 4, a.run < 20 ? 0xff4040 : 0xffffff, true);
}
const COMP_CACHE = {};
function compassCanvas(yaw) {
  const p = new Pix(36, 36);
  p.disc(18, 18, 16, 0x000000); p.disc(18, 18, 15, 0x5b5040); p.disc(18, 18, 13, 0x8a7d5c); p.disc(18, 18, 11, 0xc8bfa0);
  const a = -yaw; const px = (r, ang) => [18 + Math.sin(ang + a) * r, 18 - Math.cos(ang + a) * r];
  const n = px(10, 0), l = px(3, Math.PI / 2), r = px(3, -Math.PI / 2), s = px(10, Math.PI);
  p.poly([n, l, r], 0xe02020); p.poly([s, l, r], 0x2848d8);
  return p.canvas();
}
function drawCompass(ctx, cam) {
  const q = Math.round((((cam.yaw % TAU) + TAU) % TAU) / TAU * 64) % 64;
  const cc = COMP_CACHE[q] || (COMP_CACHE[q] = compassCanvas(q / 64 * TAU));
  ctx.drawImage(cc, 573 - 18, 22 - 18);
}

/* ---------------- in-viewport overlays ---------------- */
function drawOverlays(ctx, cam) {
  ctx.save(); ctx.beginPath(); ctx.rect(VX, VY, VW, VH); ctx.clip();
  const now = G.now;
  const list = G.actors.filter(a => a.scr && !a.npc || (a.npc && a.scr)).sort((p, q) => q.scr.d - p.scr.d);
  for (const a of list) {
    const s = a.scr; const hx = VX + Math.round(s.hx), hy = VY + Math.round(s.hy); const mx = VX + Math.round(s.mx), my = VY + Math.round(s.my);
    let ty = hy - 8;
    if (!a.dead && now < a.hpBarUntil && !a.npc) {
      const w = 30, f = Math.max(0, Math.min(1, a.hp / a.maxHp)); const bx = hx - 15, by = ty - 3;
      fillR(ctx, bx - 1, by - 1, w + 2, 7, 0x000000); fillR(ctx, bx, by, w, 5, 0xff0000); fillR(ctx, bx, by, Math.round(w * f), 5, 0x40ff00); ty -= 10;
    }
    // overhead icons
    if (!a.dead) {
      let icons = []; if (a.skull > 0) icons.push('skull'); if (a.overhead) icons.push('ov_' + a.overhead);
      let ix = hx - icons.length * 10 + 0;
      for (const nm of icons) { const im = IC[nm]; const alpha = nm === 'skull' ? 0.5 + 0.5 * Math.sin(now / 500) : 1; ctx.globalAlpha = alpha; ctx.drawImage(im, ix + (10 - Math.floor(im.width / 2)), ty - im.height + 3); ctx.globalAlpha = 1; ix += 20; }
      if (icons.length) ty -= 20;
    }
    if (a.chat && now < a.chat.until) { drawTextC(ctx, 'b12', a.chat.text, hx, ty - 2, 0xffff00, true); }
    // hitsplats
    for (const sp of a.splats) {
      const age = now - sp.t0; if (age > 1300) continue; if (age < 0) continue;
      const im = sp.dmg > 0 ? IC.splatRed : IC.splatBlue; const idx = a.splats.indexOf(sp);
      const off = [[0, 0], [-12, -12], [12, -12], [0, 12]][idx % 4]; let dy = age > 1000 ? (age - 1000) / 15 : 0;
      const x = mx + off[0] + sp.ox - 12, y = my + off[1] + sp.oy - 12 - dy;
      ctx.drawImage(im, x, y); drawTextC(ctx, 'b12', String(sp.dmg), x + 12, y + 16, 0xffffff, true);
    }
    a.splats = a.splats.filter(sp => now - sp.t0 < 1300);
  }
  // click markers
  for (const c of UI.clicks) { const f = Math.floor((now - c.t0) / 100); if (f < 4) ctx.drawImage(IC[(c.red ? 'xr' : 'xy') + f], c.x - 6, c.y - 6); }
  UI.clicks = UI.clicks.filter(c => now - c.t0 < 420);
  ctx.restore();
  // XP drops — rendered outside clip region so they float freely at top-right of viewport
  G.xpDrops = G.xpDrops.filter(d => now - d.t0 < 1500);
  for (let i = 0; i < G.xpDrops.length; i++) {
    const d = G.xpDrops[i]; const age = now - d.t0; const alpha = age > 1000 ? 1 - (age - 1000) / 500 : 1;
    const floatY = VY + 10 + i * 14 - age * 0.018;
    ctx.globalAlpha = alpha;
    drawText(ctx, 'p11', '+' + Math.round(d.xp) + ' ' + d.skill + ' XP', VX + VW - 120, floatY, 0xffff00, false);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- right-click menu, hover text, tooltips, cursor ---------------- */
function menuGeom(m) {
  let w = textWidth('b12', 'Choose Option') + 8; for (const e of m.entries) w = Math.max(w, textWidth('b12', e.text) + 8);
  return { w, h: 18 + m.entries.length * 15 + 4 };
}
function drawMenu(ctx) {
  const m = UI.menu; if (!m) return; const g = menuGeom(m); m.w = g.w; m.h = g.h;
  fillR(ctx, m.x, m.y, g.w, g.h, 0x000000); fillR(ctx, m.x + 1, m.y + 1, g.w - 2, g.h - 2, 0x5d5447);
  fillR(ctx, m.x + 1, m.y + 1, g.w - 2, 16, 0x000000); drawText(ctx, 'b12', 'Choose Option', m.x + 4, m.y + 13, 0x5d5447, false);
  for (let i = 0; i < m.entries.length; i++) {
    const y = m.y + 18 + i * 15; const hov = UI.mouse.x >= m.x && UI.mouse.x < m.x + g.w && UI.mouse.y >= y && UI.mouse.y < y + 15;
    if (hov) fillR(ctx, m.x + 2, y, g.w - 4, 15, 0x6f6555);
    drawText(ctx, 'b12', m.entries[i].text, m.x + 4, y + 12, 0xffffff, true);
  }
}
function drawTooltip(ctx) {
  const t = UI.tip; if (!t || UI.menu) return; let w = 0; for (const l of t) w = Math.max(w, textWidth('p11', l)); w += 8; const h = t.length * 14 + 6;
  let x = UI.mouse.x - w - 4, y = UI.mouse.y + 14; if (x < 522) x = UI.mouse.x + 12; if (y + h > H - 4) y = H - h - 4; if (x + w > W) x = W - w - 2;
  fillR(ctx, x, y, w, h, 0x000000); fillR(ctx, x + 1, y + 1, w - 2, h - 2, 0xc8b88a);
  for (let i = 0; i < t.length; i++) drawText(ctx, 'p11', t[i], x + 4, y + 13 + i * 14, 0x000000, false);
}
function drawBonusWindow(ctx) {
  const x = VX + 56, y = VY + 18, w = 400, h = 296; const a = G.player;
  fillR(ctx, x, y, w, h, 0x000000); fillR(ctx, x + 2, y + 2, w - 4, h - 4, 0x6b5f45); fillR(ctx, x + 4, y + 4, w - 8, h - 8, 0x3e3529); frameR(ctx, x + 4, y + 4, w - 8, h - 8, 0x000000);
  drawTextC(ctx, 'b12', 'Equipment Bonuses', x + w / 2, y + 22, 0xff981f, true);
  fillR(ctx, x + w - 22, y + 8, 14, 14, 0x8a211e); drawTextC(ctx, 'b12', 'X', x + w - 15, y + 20, 0xffffff, true);
  const b = a.bon; const A = ['Stab', 'Slash', 'Crush', 'Magic', 'Range'];
  drawText(ctx, 'b12', 'Attack bonus', x + 22, y + 46, 0xffffff, true); drawText(ctx, 'b12', 'Defence bonus', x + 216, y + 46, 0xffffff, true);
  for (let i = 0; i < 5; i++) {
    const f = v => (v >= 0 ? '+' : '') + v;
    drawText(ctx, 'p11', A[i] + ': ' + f(b[i]), x + 22, y + 66 + i * 18, 0xffff00, true); drawText(ctx, 'p11', A[i] + ': ' + f(b[5 + i]), x + 216, y + 66 + i * 18, 0xffff00, true);
  }
  drawText(ctx, 'b12', 'Other bonuses', x + 22, y + 176, 0xffffff, true);
  drawText(ctx, 'p11', 'Melee strength: ' + (b[10] >= 0 ? '+' : '') + b[10], x + 22, y + 196, 0xffff00, true); drawText(ctx, 'p11', 'Ranged strength: +' + b[11], x + 22, y + 214, 0xffff00, true);
  drawText(ctx, 'p11', 'Magic damage: +' + b[12] + '%', x + 216, y + 196, 0xffff00, true); drawText(ctx, 'p11', 'Prayer: +' + b[13], x + 216, y + 214, 0xffff00, true);
  drawTextC(ctx, 'p11', 'Click the X to close.', x + w / 2, y + h - 18, 0xc8c0a0, true);
}
function drawCursor(ctx) {
  const m = UI.mouse; if (m.x < 0) return;
  ctx.drawImage(IC.cursor, m.x, m.y);
  if (G.spellSel) { const sp = SPELL_BY_ID[G.spellSel]; ctx.drawImage(IC['sp_' + sp.id], m.x + 10, m.y + 10); }
  if (UI.drag && UI.drag.active) { const s = G.player.inv[UI.drag.from]; if (s) ctx.drawImage(itemIcon(s.id), m.x - 16, m.y - 16); }
}

/* ---------------- master draw ---------------- */
function drawUI(ctx, cam) {
  ctx.clearRect(0, 0, W, H); ctx.drawImage(UI.frame, 0, 0);
  UI.tip = null;
  drawOverlays(ctx, cam);
  // hover text (top-left of viewport)
  if (UI.hoverText && !UI.menu) { drawText(ctx, 'b12', UI.hoverText, 7, 17, 0xffffff, true); if (UI.hoverMore) drawText(ctx, 'b12', '  / ' + UI.hoverMore, 7 + textWidth('b12', stripTags(UI.hoverText)), 17, 0xffffff, true); }
  if (G.spellSel) drawText(ctx, 'b12', 'Cast ' + SPELL_BY_ID[G.spellSel].name + ' on...', 7, 32, 0x80d0ff, true);
  if (UI.bonusWin) drawBonusWindow(ctx);
  drawCompass(ctx, cam); drawMinimap(ctx, cam); drawOrbs(ctx);
  for (let i = 0; i < 14; i++) drawTabStone(ctx, i, i === UI.tab);
  drawPanel(ctx); drawChat(ctx);
  drawMenu(ctx); drawTooltip(ctx); drawCursor(ctx);
}
