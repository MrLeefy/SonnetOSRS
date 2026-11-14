'use strict';
/* ==========================================================================
   game.js - player, physics, tools, bore rig, dynamite, critters, quests
   ========================================================================== */
const P = {
  x: 96.5, y: CAMPY + 1, z: 100.5, vx: 0, vy: 0, vz: 0, hw: 0.3, h: 1.7, onGround: false, step: true, lift: 0, face: Math.PI, gy: CAMPY + 1,
  hp: 100, maxHp: 100, en: 100, maxEn: 100, coins: 0, lvl: 1, xp: 0, inv: new Int32Array(NB), dyn: 8, ration: 3,
  pick: 0, drill: 0, tank: 0, jet: 0, mode: 'pick', slots: [B.PLANK, B.COBBLE, B.LAMP], slot: 0, charge: 0, quest: 0, qn: 0,
  mounted: false, swing: 0, walk: 0, moving: 0, hurtT: 0, useT: 0, inWater: false, jetOn: false, dead: 0, blocksDug: 0
};
const rig = { x: 92.5, y: CAMPY + 1, z: 105.5, vx: 0, vy: 0, vz: 0, hw: 0.85, h: 1.9, onGround: false, step: true, lift: 0, face: 2.4, spin: 0, boring: 0, acc: 0 };
const input = { jx: 0, jy: 0, jump: false, use: false, hold: null, keys: {} };
const npcs = [
  { id: 'merchant', name: 'Merchant', x: 99.5, y: CAMPY + 1, z: 103.6, face: Math.PI, hood: 0x2f9a4a, body: 0x3f7a3a, skin: 0xf0c8a0 },
  { id: 'smith', name: 'Smith', x: 90.4, y: CAMPY + 1, z: 95.5, face: Math.PI / 2, hood: 0x4a4a55, body: 0x6a4a3a, skin: 0xd9a57c }
];
const crits = [], bombs = [], parts = [], meteors = [];
let task = null, dig = null, target = null, toolTimer = 0, placeTimer = 0, simAcc = 0, saveAcc = 0, cutT = 0, gameTime = 0, autoMove = null;
const PICKS = [{ n: 'Stone Pick', c: 0x9aa0a8 }, { n: 'Copper Pick', c: 0xe07a38 }, { n: 'Iron Pick', c: 0xe9e2da }, { n: 'Gold Pick', c: 0xffcf33 }, { n: 'Crystal Pick', c: 0x6fe6ff }];
const body = () => P.mounted ? rig : P;

/* ---- hooks implemented by ui.js ---- */
let toast = () => { }, feed = () => { }, sfx = () => { }, floatText = () => { }, flash = () => { }, onQuest = () => { };

/* ---- collision ---- */
function boxHits(x, y, z, hw, h) {
  const x0 = Math.floor(x - hw + 1e-4), x1 = Math.floor(x + hw - 1e-4), y0 = Math.floor(y + 1e-4), y1 = Math.floor(y + h - 1e-4), z0 = Math.floor(z - hw + 1e-4), z1 = Math.floor(z + hw - 1e-4);
  for (let xi = x0; xi <= x1; xi++) for (let zi = z0; zi <= z1; zi++) for (let yi = y0; yi <= y1; yi++) if (solidAt(xi, yi, zi)) return true;
  return false;
}
function moveBody(e, dt) {
  let landed = 0;
  const nx = e.x + e.vx * dt;
  if (!boxHits(nx, e.y, e.z, e.hw, e.h)) e.x = nx;
  else if (e.step && e.onGround && !boxHits(nx, e.y + 1.02, e.z, e.hw, e.h) && !boxHits(e.x, e.y + 1.02, e.z, e.hw, e.h)) { e.y += 1.02; e.x = nx; e.lift += 1.02; }
  else e.vx = 0;
  const nz = e.z + e.vz * dt;
  if (!boxHits(e.x, e.y, nz, e.hw, e.h)) e.z = nz;
  else if (e.step && e.onGround && !boxHits(e.x, e.y + 1.02, nz, e.hw, e.h) && !boxHits(e.x, e.y + 1.02, e.z, e.hw, e.h)) { e.y += 1.02; e.z = nz; e.lift += 1.02; }
  else e.vz = 0;
  const ny = e.y + e.vy * dt;
  if (!boxHits(e.x, ny, e.z, e.hw, e.h)) { e.y = ny; if (e.vy > 0.5 || e.vy < -1.5) e.onGround = false; else if (e.onGround && !boxHits(e.x, e.y - 0.06, e.z, e.hw, e.h)) e.onGround = false; }
  else { if (e.vy < 0) { e.y = Math.floor(ny + 1e-4) + 1; landed = -e.vy; e.onGround = true; } e.vy = 0; }
  return landed;
}

/* ---- inventory / progress ---- */
function give(id, n) { if (!id) return; P.inv[id] += n; feed(BL[id].name, n, BL[id].col); }
function addCoins(n, x, y, z) { P.coins += n; if (x !== undefined) floatText('+' + n + ' coins', x, y, z, '#ffcf4a'); sfx('coin'); }
function addXP(n) {
  P.xp += n;
  for (; ;) { const need = 30 + P.lvl * 22; if (P.xp < need) break; P.xp -= need; P.lvl++; P.maxHp += 5; P.hp = P.maxHp; P.maxEn += 5; toast('Level ' + P.lvl + '! Digging gets faster', 'gold'); sfx('level'); }
}
const QUESTS = [
  { k: 'dig', n: 10, t: 'Dig 10 blocks', r: 10 },
  { k: 'tree', n: 1, t: 'Chop down a tree', r: 10 },
  { k: 'place', n: 8, t: 'Place 8 blocks', r: 10 },
  { k: 'boom', n: 1, t: 'Throw a dynamite stick', r: 15 },
  { k: 'ore', n: 5, t: 'Mine 5 ore', r: 20 },
  { k: 'sell', n: 1, t: 'Sell ore to the Merchant', r: 20 },
  { k: 'rig', n: 1, t: 'Climb into the Bore Rig', r: 20 },
  { k: 'depth', n: 12, t: 'Get 12 m underground', r: 30 },
  { k: 'hammer', n: 1, t: 'Call down the Sky Hammer', r: 30 },
  { k: 'upgrade', n: 1, t: 'Buy an upgrade from the Smith', r: 40 },
  { k: 'chest', n: 1, t: 'Dig up a buried chest', r: 50 },
  { k: 'crystal', n: 1, t: 'Find a crystal', r: 80 }
];
function qEvent(k, n, abs) {
  const q = QUESTS[P.quest]; if (!q || q.k !== k) return;
  P.qn = abs ? Math.max(P.qn, n) : P.qn + (n || 1);
  if (P.qn >= q.n) { P.quest++; P.qn = 0; P.coins += q.r; toast('Done: ' + q.t + '  +' + q.r + ' coins', 'gold'); sfx('quest'); }
  onQuest();
}

/* ---- particles ---- */
function burst(x, y, z, col, n, sp, emis) {
  for (let i = 0; i < n && parts.length < 420; i++) {
    const a = Math.random() * 6.28, u = Math.random(), s = (sp || 3) * (0.4 + Math.random());
    parts.push({ x: x + (Math.random() - .5) * .6, y: y + (Math.random() - .5) * .6, z: z + (Math.random() - .5) * .6, vx: Math.cos(a) * s * (1 - u * .5), vy: 1.5 + u * s, vz: Math.sin(a) * s * (1 - u * .5), life: .5 + Math.random() * .6, s: .06 + Math.random() * .08, col, emis: emis || 0, g: 18 });
  }
}

/* ---- breaking / placing ---- */
function breakBlock(x, y, z, how) {
  const id = getB(x, y, z); if (!id || id === B.BEDROCK || id === B.WATER || id === B.LAVA || !inW(x, y, z)) return false;
  const bl = BL[id]; setB(x, y, z, 0);
  const quiet = how === 'boom' && Math.random() < .8;
  if (!quiet) burst(x + .5, y + .5, z + .5, bl.col, how === 'tool' ? 7 : 3, 3, bl.emis ? 2 : 0);
  if (id === B.CHEST) {
    const c = 25 + ((Math.random() * 50) | 0); addCoins(c, x + .5, y + 1, z + .5); P.dyn += 2; feed('Dynamite', 2, 0xd0342c); if (Math.random() < .5) { P.ration++; feed('Ration', 1, 0xd94a4a); }
    toast('Buried chest! +' + c + ' coins', 'gold'); qEvent('chest');
  } else if (id === B.LEAVES || id === B.LEAVES2) { if (how === 'tool' && Math.random() < .06) { P.ration++; feed('Apple ration', 1, 0xd94a4a); } }
  else if (bl.drop && (how !== 'boom' || bl.ore || Math.random() < .45)) give(bl.drop, 1);
  if (how !== 'boom') { if (how === 'tool' || bl.ore) addXP(bl.xp); if (how === 'tool') P.charge = Math.min(100, P.charge + (bl.ore ? 6 : 2.2)); P.blocksDug++; qEvent('dig'); } else if (bl.ore) addXP(bl.xp);
  if (bl.ore) { qEvent('ore'); if (id === B.CRYSTAL) qEvent('crystal'); }
  if (id === B.LOG && how === 'tool') fellTree(x, y, z);
  return true;
}
function fellTree(x, y, z) {
  const logs = [], seen = new Set(), st = [[x, y + 1, z]]; let leaves = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) st.push([x + a, y, z + b], [x + a, y + 1, z + b]);
  const all = [];
  while (st.length && all.length < 160) {
    const [cx, cy, cz] = st.pop(), key = cx + ',' + cy + ',' + cz; if (seen.has(key) || cy < y) continue; seen.add(key);
    const id = getB(cx, cy, cz); if (id !== B.LOG && id !== B.LEAVES && id !== B.LEAVES2) continue;
    if (Math.abs(cx - x) > 4 || Math.abs(cz - z) > 4) continue;
    all.push([cx, cy, cz, id]); if (id === B.LOG) logs.push(1); else leaves++;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = 0; c <= 1; c++) if (a || b || c) st.push([cx + a, cy + c, cz + b]);
    st.push([cx, cy - 1, cz]);
  }
  if (leaves < 4) return;   // a built log wall, not a tree
  for (const [cx, cy, cz, id] of all) { setB(cx, cy, cz, 0); if (Math.random() < .3) burst(cx + .5, cy + .5, cz + .5, BL[id].col, 2, 2.5); }
  if (logs.length) give(B.LOG, logs.length); addXP(logs.length * 2); P.charge = Math.min(100, P.charge + 8);
  floatText('Timber!', x + .5, y + 2.5, z + .5, '#9be06a'); sfx('timber'); qEvent('tree');
}
function canPlaceAt(x, y, z) {
  if (!inW(x, y, z) || y >= WY - 1) return false; const b = getB(x, y, z); if (b !== 0 && b !== B.WATER && b !== B.LAVA) return false;
  const hit = e => x + 1 > e.x - e.hw && x < e.x + e.hw && z + 1 > e.z - e.hw && z < e.z + e.hw && y + 1 > e.y + .01 && y < e.y + e.h;
  if (hit(P) || hit(rig)) return false; for (const n of npcs) if (hit({ x: n.x, y: n.y, z: n.z, hw: .3, h: 1.6 })) return false;
  return true;
}
function placeBlock(x, y, z) {
  const id = P.slots[P.slot];
  if (P.inv[id] <= 0) { if (toolTimer <= 0) { toast('Out of ' + BL[id].name + ' - pick another block in your bag'); toolTimer = 1.5; } return false; }
  if (!canPlaceAt(x, y, z)) return false;
  setB(x, y, z, id); P.inv[id]--; sfx('place'); burst(x + .5, y + .5, z + .5, BL[id].col, 3, 1.5); P.swingT = .25; P.swing = 0; qEvent('place'); return true;
}

/* ---- explosions ---- */
function explode(x, y, z, r, hammer) {
  const R = Math.ceil(r);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
    const d = Math.hypot(a, b, c), bx = Math.floor(x) + a, by = Math.floor(y) + b, bz = Math.floor(z) + c;
    if (d > r - hash3(bx, by, bz) * .9) continue;
    breakBlock(bx, by, bz, hammer ? 'hammer' : 'boom');
  }
  burst(x, y, z, 0xffb23a, 26, 9, 2); burst(x, y, z, 0x5a5a5a, 18, 6); burst(x, y, z, 0xfff0b0, 10, 12, 2);
  const push = (e, m) => { const dx = e.x - x, dy = e.y + .6 - y, dz = e.z - z, d = Math.hypot(dx, dy, dz) + .3; if (d > r + 3.5) return 0; const f = (1 - d / (r + 3.5)) * m / d; e.vx += dx * f; e.vy += dy * f + (1 - d / (r + 3.5)) * m * .5; e.vz += dz * f; e.onGround = false; return 1 - d / (r + 3.5); };
  for (const c of crits) if (push(c, 18)) { c.fly = 1.2; c.spin = (Math.random() - .5) * 20; }
  for (const o of bombs) if (o.fuse > .2 && Math.hypot(o.x - x, o.y - y, o.z - z) < r + 2) o.fuse = .12 + Math.random() * .15;
  const k = push(body(), P.mounted ? 5 : 12);
  if (k > 0 && !P.mounted && !hammer) hurt(k * 46, 'Too close to the blast!');
  const dcam = Math.hypot(P.x - x, P.y - y, P.z - z); cam.shake = Math.max(cam.shake, clamp(1.6 - dcam / 30, 0, 1.4) * (hammer ? 1.6 : 1));
  sfx(hammer ? 'hammer' : 'boom'); flash(hammer ? .5 : .22);
}
function throwDynamite(tx, ty, tz) {
  if (P.dyn <= 0) { toast('No dynamite left - the Merchant sells it'); return; }
  P.dyn--; const b = body(), ox = b.x, oy = b.y + (P.mounted ? 2.2 : 1.4), oz = b.z, T = .75, g = 22;
  if (tx === undefined) { const d = 6; tx = b.x + Math.sin(b.face) * d; tz = b.z + Math.cos(b.face) * d; ty = b.y; }
  bombs.push({ x: ox, y: oy, z: oz, vx: (tx - ox) / T, vy: (ty - oy) / T + .5 * g * T, vz: (tz - oz) / T, fuse: 1.7, rest: false });
  P.swingT = .3; P.swing = 0; sfx('throw'); qEvent('boom');
}
function skyHammer() {
  if (P.charge < 100) { toast('Sky Hammer charges as you dig (' + (P.charge | 0) + '%)'); return; }
  const b = body(), tx = b.x + Math.sin(b.face) * 7, tz = b.z + Math.cos(b.face) * 7; let ty = Math.min(WY - 2, Math.floor(b.y) + 8);
  while (ty > 1 && !solidAt(Math.floor(tx), ty, Math.floor(tz))) ty--;
  P.charge = 0; meteors.push({ tx, ty: ty + .5, tz, t: 0 }); toast('Sky Hammer incoming!', 'gold'); sfx('whistle'); qEvent('hammer');
}
function hurt(d, why) {
  if (P.dead) return; P.hp -= d; P.hurtT = 5; flash(.25, '#ff2a2a'); sfx('hurt');
  if (P.hp <= 0) {
    P.dead = 1.4; const loss = Math.floor(P.coins * .1); P.coins -= loss; P.mounted = false;
    toast((why || 'Knocked out!') + ' You wake up at camp' + (loss ? ', ' + loss + ' coins lighter' : ''), 'bad');
  }
}
function respawn() { P.x = 96.5; P.z = 100.5; P.y = surfaceY(96, 100) + 1.01; P.vx = P.vy = P.vz = 0; P.hp = P.maxHp; P.en = P.maxEn; P.dead = 0; task = null; }
function eatRation() {
  if (P.ration <= 0) { toast('No rations - the Merchant sells them'); return; }
  if (P.hp >= P.maxHp && P.en >= P.maxEn) { toast('Already at full health and energy'); return; }
  P.ration--; P.hp = Math.min(P.maxHp, P.hp + 45); P.en = P.maxEn; sfx('eat'); floatText('+45 HP', P.x, P.y + 2, P.z, '#ff7a7a');
}

/* ---- targeting ---- */
const diggable = (x, y, z) => { const b = getB(x, y, z); return inW(x, y, z) && b !== 0 && b !== B.WATER && b !== B.LAVA && b !== B.BEDROCK; };
function frontTarget() {
  const b = body(), fx = Math.sin(b.face), fz = Math.cos(b.face), by = Math.floor(b.y + .01), ds = P.mounted ? [1.5, 2.3] : [0.85, 1.6];
  const mk = (x, y, z) => ({ x, y, z, nx: -Math.round(fx), ny: 0, nz: -Math.round(fz), id: getB(x, y, z) });
  if (P.mode === 'build' && !P.mounted) {
    for (const d of [1.0, 1.6]) { const cx = Math.floor(b.x + fx * d), cz = Math.floor(b.z + fz * d); for (const yy of [by - 1, by, by + 1]) if (canPlaceAt(cx, yy, cz)) return { x: cx, y: yy, z: cz, cell: true }; }
    return null;
  }
  for (const d of ds) { const cx = Math.floor(b.x + fx * d), cz = Math.floor(b.z + fz * d); for (const yy of P.mounted ? [by + 1, by, by + 2] : [by + 1, by]) if (diggable(cx, yy, cz)) return mk(cx, yy, cz); }
  const cx = Math.floor(b.x + fx * ds[0]), cz = Math.floor(b.z + fz * ds[0]);
  if (diggable(cx, by - 1, cz)) return mk(cx, by - 1, cz);
  if (diggable(Math.floor(b.x), by - 1, Math.floor(b.z))) return mk(Math.floor(b.x), by - 1, Math.floor(b.z));
  return null;
}
function rayTarget(sx, sy) { const r = screenRay(sx, sy); return raycast(r.o[0], r.o[1], r.o[2], r.d[0], r.d[1], r.d[2], 220, true); }
const reach = () => P.mounted ? 6.5 : (P.mode === 'build' ? 6 : 5);
function distTo(t) { const b = body(); return Math.hypot(t.x + .5 - b.x, t.y + .5 - (b.y + .9), t.z + .5 - b.z); }

function tapWorld(sx, sy) {
  // entities first
  let best = null, bd = 46;
  const test = (o, x, y, z, kind) => { const p = project(x, y, z); if (!p) return; const d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = { o, kind }; } };
  for (const n of npcs) test(n, n.x, n.y + .9, n.z, 'npc');
  if (!P.mounted) test(rig, rig.x, rig.y + 1, rig.z, 'rig');
  for (const c of crits) test(c, c.x, c.y + .3, c.z, 'crit');
  if (best) {
    if (best.kind === 'crit') { const c = best.o; if (Math.hypot(c.x - P.x, c.z - P.z) < 6) { c.vy = 7; c.vx = (c.x - P.x) * 1.5; c.vz = (c.z - P.z) * 1.5; c.onGround = false; c.fly = .8; c.spin = 9; sfx('baa'); floatText('Baa!', c.x, c.y + 1, c.z, '#fff'); return; } }
    else { task = { type: best.kind, o: best.o, x: Math.floor(best.o.x), y: Math.floor(best.o.y), z: Math.floor(best.o.z), t: 6 }; return; }
  }
  const t = rayTarget(sx, sy); if (!t) return;
  task = { type: P.mode === 'build' && !P.mounted ? 'place' : 'dig', x: t.x, y: t.y, z: t.z, nx: t.nx, ny: t.ny, nz: t.nz, t: 7 };
}

/* ---- tool use ---- */
function digSpeed() { return (1 + P.pick * .55) * (1 + (P.lvl - 1) * .05); }
function applyTool(t, dt) {
  const b = body(); target = t;
  const cxz = Math.atan2(t.x + .5 - b.x, t.z + .5 - b.z);
  if (distTo(t) > reach()) { autoMove = t; return; }
  if (Math.hypot(t.x + .5 - b.x, t.z + .5 - b.z) > .4) b.face += angDiff(b.face, cxz) * Math.min(1, dt * 14);
  if (P.mode === 'build' && !P.mounted) {
    if (placeTimer > 0) return; placeTimer = .2;
    const px = t.cell ? t.x : t.x + t.nx, py = t.cell ? t.y : t.y + t.ny, pz = t.cell ? t.z : t.z + t.nz;
    placeBlock(px, py, pz); if (task && task.type === 'place') task = null; return;
  }
  if (t.cell || !diggable(t.x, t.y, t.z)) { if (task) task = null; return; }
  P.useT = .15;
  if (P.mounted) {   // bore rig: chews a 3x3x3 volume around the target
    rig.boring = .2; const fast = P.en > 0; P.en = Math.max(0, P.en - dt * 5); rig.acc += dt * (fast ? 16 : 5);
    const fy = Math.floor(rig.y + .01), lowY = t.y >= fy ? fy : t.y - 1;
    while (rig.acc >= 1) {
      rig.acc -= 1; let bb = null, bd = 1e9;
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) { const x = t.x + a, y = t.y + c, z = t.z + e; if (y < lowY || y > Math.max(t.y + 1, fy + 2) || !diggable(x, y, z)) continue; const d = Math.hypot(x + .5 - rig.x, y - rig.y, z + .5 - rig.z); if (d < bd) { bd = d; bb = [x, y, z]; } }
      if (!bb) { if (task) task = null; break; }
      breakBlock(bb[0], bb[1], bb[2], 'tool'); if (toolTimer <= 0) { sfx('drill'); toolTimer = .09; }
    }
    return;
  }
  if (!dig || dig.x !== t.x || dig.y !== t.y || dig.z !== t.z) dig = { x: t.x, y: t.y, z: t.z, p: 0 };
  const bl = BL[t.id || getB(t.x, t.y, t.z)]; let sp = digSpeed();
  if (P.mode === 'shovel') sp *= bl.soft ? 3.2 : .45;
  else if (P.mode === 'drill') { if (P.en > 0) { sp *= 5 + P.drill * 2.5; P.en = Math.max(0, P.en - dt * (9 - P.drill * 1.5)); } else { sp *= .6; if (toolTimer <= 0 && Math.random() < .02) toast('Drill is out of energy - rest or eat a ration'); } }
  dig.p += dt * sp / bl.hard; P.swing += dt * (P.mode === 'drill' ? 0 : 9);
  if (toolTimer <= 0) { toolTimer = P.mode === 'drill' ? .08 : .22; sfx(P.mode === 'drill' ? 'drill' : bl.soft ? 'dirt' : 'hit'); burst(t.x + .5 + (t.nx || 0) * .5, t.y + .5 + (t.ny || 0) * .5, t.z + .5 + (t.nz || 0) * .5, bl.col, 2, 2, bl.emis ? 2 : 0); }
  if (dig.p >= 1) {
    const { x, y, z } = dig; dig = null; sfx(bl.soft ? 'dig' : 'break');
    if (P.mode === 'shovel' && bl.soft) { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) if (Math.abs(a) + Math.abs(c) + Math.abs(e) <= 2 && BL[getB(x + a, y + c, z + e)].soft) breakBlock(x + a, y + c, z + e, 'tool'); }
    else {
      breakBlock(x, y, z, 'tool');
      if (P.mode === 'drill') { const fy = Math.floor(P.y + .01), oy = y === fy ? fy + 1 : y === fy + 1 ? fy : -1; if (oy >= 0 && diggable(x, oy, z) && BL[getB(x, oy, z)].hard < 100) breakBlock(x, oy, z, 'tool'); if (P.drill >= 2) for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (diggable(x + a, y, z + c)) breakBlock(x + a, y, z + c, 'tool'); }
    }
    if (task && task.type === 'dig') task = null;
  }
}

/* ---- per-frame update ---- */
function interactable() {
  if (P.mounted) return { kind: 'off', label: 'Hop off the rig' };
  for (const n of npcs) if (Math.hypot(n.x - P.x, n.z - P.z) < 3.4 && Math.abs(n.y - P.y) < 3) return { kind: 'npc', o: n, label: n.id === 'merchant' ? 'Trade with Merchant' : 'Upgrade at Smith' };
  if (Math.hypot(rig.x - P.x, rig.z - P.z) < 3.2 && Math.abs(rig.y - P.y) < 3) return { kind: 'rig', label: 'Drive the Bore Rig' };
  return null;
}
let openShop = () => { };
function doInteract(it) {
  it = it || interactable(); if (!it) return;
  if (it.kind === 'npc') openShop(it.o.id);
  else if (it.kind === 'rig') { P.mounted = true; rig.vx = rig.vz = 0; task = null; sfx('engine'); toast('Bore Rig: hold USE or tap rock to chew through it'); qEvent('rig'); }
  else if (it.kind === 'off') {
    P.mounted = false; task = null;
    for (const [a, c] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [0, 0]]) { if (!boxHits(rig.x + a, rig.y + (a || c ? 0 : 2), rig.z + c, P.hw, P.h)) { P.x = rig.x + a; P.z = rig.z + c; P.y = rig.y + (a || c ? 0 : 2); break; } }
    P.vx = P.vy = P.vz = 0;
  }
}

function update(dt) {
  gameTime += dt; toolTimer -= dt; placeTimer -= dt; target = null; autoMove = null;
  if (P.dead) { P.dead -= dt; if (P.dead <= 0) respawn(); P.dead = Math.max(P.dead, 0); updateEnts(dt); return; }
  const b = body();
  // tool use
  let using = false;
  if (input.hold) { const t = rayTarget(input.hold.x, input.hold.y); if (t) { applyTool(t, dt); using = true; task = null; } }
  else if (task) {
    task.t -= dt; if (task.t <= 0) task = null;
    else if (task.type === 'npc' || task.type === 'rig') { const o = task.o; if (Math.hypot(o.x - P.x, o.z - P.z) < 2.6) { const tk = task; task = null; if (!P.mounted) doInteract(tk.type === 'npc' ? { kind: 'npc', o } : { kind: 'rig' }); } else autoMove = task; }
    else { applyTool({ x: task.x, y: task.y, z: task.z, nx: task.nx, ny: task.ny, nz: task.nz, id: getB(task.x, task.y, task.z) }, dt); using = true; }
  } else if (input.use) { const t = frontTarget(); if (t) { applyTool(t, dt); using = true; } else if (P.mode !== 'build') { P.swing += dt * 9; P.useT = .1; } }
  if (!using) dig = null;
  P.swingT = (P.swingT || 0) - dt; if (P.swingT > 0 && P.useT <= 0) P.swing += dt * 12; else if (P.useT <= 0) P.swing = 0;
  // movement
  let mx = input.jx, mz = input.jy; const K = input.keys;
  if (K.KeyW || K.ArrowUp) mz += 1; if (K.KeyS || K.ArrowDown) mz -= 1; if (K.KeyD || K.ArrowRight) mx += 1; if (K.KeyA || K.ArrowLeft) mx -= 1;
  let ml = Math.hypot(mx, mz), wx = 0, wz = 0;
  if (ml > 0.12) { if (ml > 1) { mx /= ml; mz /= ml; ml = 1; } wx = Math.cos(cam.yaw) * mx - Math.sin(cam.yaw) * mz; wz = -Math.sin(cam.yaw) * mx - Math.cos(cam.yaw) * mz; if (task) task = null; }
  else if (autoMove) { const dx = autoMove.x + .5 - b.x, dz = autoMove.z + .5 - b.z, d = Math.hypot(dx, dz) || 1; wx = dx / d; wz = dz / d; ml = 1; }
  else ml = 0;
  const wet = getB(Math.floor(b.x), Math.floor(b.y + .6), Math.floor(b.z)) === B.WATER; P.inWater = wet && !P.mounted;
  const speed = (P.mounted ? 6.6 : 5.3) * (wet ? .6 : 1), acc = 1 - Math.exp(-dt * (b.onGround ? 14 : 5));
  b.vx += (wx * speed - b.vx) * acc; b.vz += (wz * speed - b.vz) * acc; P.moving = ml > .12 ? 1 : 0;
  if (ml > .12 && !using) b.face += angDiff(b.face, Math.atan2(wx, wz)) * Math.min(1, dt * 12);
  const jump = input.jump || K.Space;
  P.jetOn = false;
  if (wet) { b.vy -= 6 * dt; b.vy *= Math.exp(-dt * 3); if (jump) b.vy = Math.min(b.vy + 30 * dt, 3.6); if (!P.mounted) b.onGround = false; }
  else {
    b.vy -= 22 * dt;
    if (jump && b.onGround) { b.vy = P.mounted ? 6.2 : 7.8; b.onGround = false; sfx('jump'); }
    else if (jump && !P.mounted && P.jet && P.en > 0 && !b.onGround && b.vy < 6.5) { b.vy += 52 * dt; P.en = Math.max(0, P.en - 16 * dt); P.jetOn = true; if (Math.random() < .6) parts.push({ x: P.x - Math.sin(P.face) * .3, y: P.y + .7, z: P.z - Math.cos(P.face) * .3, vx: (Math.random() - .5) * 2, vy: -6, vz: (Math.random() - .5) * 2, life: .35, s: .09, col: 0xffb23a, emis: 2, g: 0 }); }
  }
  if (b.vy < -34) b.vy = -34;
  const steps = 2; for (let i = 0; i < steps; i++) { const land = moveBody(b, dt / steps); if (land > 15.5 && !P.mounted && !wet) hurt((land - 15.5) * 5, 'That was a long fall!'); if (land > 9) burst(b.x, b.y, b.z, 0xc8c0b0, 6, 2); }
  b.x = clamp(b.x, 1.2, WX - 1.2); b.z = clamp(b.z, 1.2, WZ - 1.2);
  b.lift *= Math.exp(-dt * 14);
  if (P.mounted) { P.x = rig.x; P.y = rig.y; P.z = rig.z; P.face = rig.face; P.onGround = rig.onGround; }
  else if (!rig.onGround || rig.vy) { rig.vx *= .9; rig.vz *= .9; rig.vy -= 22 * dt; moveBody(rig, dt); }
  if (P.moving && b.onGround) P.walk += dt * (P.mounted ? 0 : 11);
  rig.boring -= dt; rig.spin += dt * (rig.boring > 0 ? 26 : P.mounted ? 3 : 0);
  // lava, regen
  const feet = getB(Math.floor(b.x), Math.floor(b.y + .2), Math.floor(b.z));
  if (feet === B.LAVA) { if (P.mounted) { if (Math.random() < .05) burst(b.x, b.y, b.z, 0xff7a1a, 3, 3, 2); } else { hurt(34 * dt, 'Lava!'); b.vy = Math.max(b.vy, 5); } }
  P.hurtT -= dt; if (P.hurtT <= 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + dt * 2.5);
  if (P.useT > 0) P.useT -= dt; else if (!P.jetOn) P.en = Math.min(P.maxEn, P.en + dt * 7);
  // depth + cutaway bookkeeping
  if (b.onGround || wet) P.gy = Math.floor(b.y + .01); else if (Math.floor(b.y) < P.gy) P.gy = Math.floor(b.y); else if (b.y > P.gy + 2.4) P.gy = Math.floor(b.y) - 1;
  const depth = depthAt(b.x, b.y, b.z);
  P.depth = depth; if (depth >= 2) qEvent('depth', depth, true);
  updateCut(dt);
  const covered = cut.on ? smooth(2, 16, depth) * .85 : 0; Env.k += (covered - Env.k) * Math.min(1, dt * 2.5);
  updateEnts(dt);
  simAcc += dt; while (simAcc > .07) { simAcc -= .07; simTick(); }
  cam.shake *= Math.exp(-dt * 5);
}
/* metres below ground: rock overhead, or the depth of the open pit you are standing in */
function depthAt(x, y, z) {
  const fy = Math.floor(y + .01); let m = 99;
  for (const [a, c] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) m = Math.min(m, surfaceY(x + a, z + c));
  return Math.max(0, surfaceY(x, z) - fy, m + 1 - fy);
}

function updateCut(dt) {
  const b = body(), hx = b.x, hy = b.y + (P.mounted ? 2.0 : 1.5), hz = b.z;
  const dx = cam.pos[0] - hx, dy = cam.pos[1] - hy, dz = cam.pos[2] - hz, d = Math.hypot(dx, dy, dz) || 1;
  const r = raycast(hx, hy, hz, dx / d, dy / d, dz / d, d - 1, false);
  if (r) cutT = .45; else cutT -= dt;
  const on = cutT > 0, cy = P.gy + (P.mounted ? 3 : 2), cx = b.x + Math.sin(cam.yaw) * 4, cz = b.z + Math.cos(cam.yaw) * 4, R = 11.5;
  if (on === cut.on && (!on || (cy === cut.y && Math.hypot(cx - cut.x, cz - cut.z) < 2.5))) return;
  if (cut.on) markDirtyRect(Math.floor(cut.x - R - 1), Math.floor(cut.z - R - 1), Math.ceil(cut.x + R + 1), Math.ceil(cut.z + R + 1));
  cut.on = on; cut.x = cx; cut.y = cy; cut.z = cz; cut.r2 = R * R;
  if (on) markDirtyRect(Math.floor(cx - R - 1), Math.floor(cz - R - 1), Math.ceil(cx + R + 1), Math.ceil(cz + R + 1));
}

function spawnCritters() {
  crits.length = 0; const R = mulberry32(World.seed + 77);
  for (let i = 0; i < 16; i++) {
    for (let k = 0; k < 30; k++) {
      const a = R() * 6.28, d = 14 + R() * 50, x = CAMPX + Math.cos(a) * d, z = CAMPZ + Math.sin(a) * d, y = surfaceY(x, z);
      if (getB(x | 0, y, z | 0) === B.GRASS && getB(x | 0, y + 1, z | 0) === 0) { crits.push({ x, y: y + 1.01, z, hx: x, hz: z, vx: 0, vy: 0, vz: 0, hw: .28, h: .6, onGround: false, step: true, lift: 0, face: a, t: R() * 3, fly: 0, spin: 0, rot: 0, tint: R() < .25 ? 0x6a5a50 : 0xf4efe4 }); break; }
    }
  }
}
function updateEnts(dt) {
  for (const c of crits) {
    if (Math.hypot(c.x - P.x, c.z - P.z) > 70) continue;
    c.t -= dt; c.fly -= dt;
    if (c.fly > 0) c.rot += c.spin * dt; else { c.rot *= Math.exp(-dt * 10); c.spin = 0; }
    if (c.onGround && c.fly <= 0) {
      if (c.t <= 0) { c.t = 1 + Math.random() * 3; const home = Math.hypot(c.x - c.hx, c.z - c.hz) > 9; c.face = home ? Math.atan2(c.hx - c.x, c.hz - c.z) : Math.random() * 6.28; c.go = Math.random() < .7 ? 1 : 0; if (c.go) c.vy = 4.2; }
      const sp = c.go ? 1.6 : 0; c.vx = Math.sin(c.face) * sp; c.vz = Math.cos(c.face) * sp; if (c.go && c.onGround && Math.random() < dt * 2.5) c.vy = 4;
    }
    const wet = getB(Math.floor(c.x), Math.floor(c.y + .3), Math.floor(c.z)); if (wet === B.WATER) { c.vy += 30 * dt; c.vy *= .9; } if (wet === B.LAVA || c.y < 1) { c.x = c.hx; c.z = c.hz; c.y = surfaceY(c.hx, c.hz) + 1.5; c.vx = c.vy = c.vz = 0; }
    c.vy -= 22 * dt; if (c.onGround && c.fly > 0) { c.vx *= .9; c.vz *= .9; }
    moveBody(c, dt); c.x = clamp(c.x, 1.5, WX - 1.5); c.z = clamp(c.z, 1.5, WZ - 1.5); c.lift *= Math.exp(-dt * 14);
  }
  for (let i = bombs.length - 1; i >= 0; i--) {
    const o = bombs[i]; o.fuse -= dt;
    if (!o.rest) {
      o.vy -= 22 * dt; const nx = o.x + o.vx * dt, ny = o.y + o.vy * dt, nz = o.z + o.vz * dt;
      if (solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { if (!solidAt(Math.floor(o.x), Math.floor(ny), Math.floor(o.z))) { o.vx *= -.3; o.vz *= -.3; o.y = ny; } else { o.vy *= -.25; o.vx *= .5; o.vz *= .5; if (Math.abs(o.vy) < 1.5) o.rest = true; } }
      else { o.x = nx; o.y = ny; o.z = nz; }
    } else if (!solidAt(Math.floor(o.x), Math.floor(o.y - .2), Math.floor(o.z))) o.rest = false;
    if (Math.random() < .5) parts.push({ x: o.x, y: o.y + .35, z: o.z, vx: (Math.random() - .5) * 1.5, vy: 2 + Math.random() * 2, vz: (Math.random() - .5) * 1.5, life: .25, s: .05, col: 0xffe27a, emis: 2, g: 6 });
    if (o.fuse <= 0) { bombs.splice(i, 1); explode(o.x, o.y, o.z, 3.3, false); }
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]; m.t += dt / .95;
    const k = Math.min(1, m.t); m.x = m.tx - 9 * (1 - k); m.y = m.ty + 38 * (1 - k); m.z = m.tz - 6 * (1 - k);
    for (let j = 0; j < 3; j++) parts.push({ x: m.x + (Math.random() - .5), y: m.y + (Math.random() - .5), z: m.z + (Math.random() - .5), vx: 0, vy: 2, vz: 0, life: .4, s: .14, col: j ? 0xffb23a : 0xfff0b0, emis: 2, g: 0 });
    if (m.t >= 1) { meteors.splice(i, 1); explode(m.tx, m.ty - 1, m.tz, 5.4, true); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vy -= p.g * dt; const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
    if (p.g && solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { p.vy *= -.35; p.vx *= .5; p.vz *= .5; } else { p.x = nx; p.y = ny; p.z = nz; }
  }
}

/* ---- models ---- */
function drawHumanoid(D, m, o) {
  const sw = Math.sin(o.walk || 0) * (o.moving ? .8 : 0), bob = o.moving ? Math.abs(Math.cos(o.walk)) * .05 : Math.sin(gameTime * 2 + (o.ph || 0)) * .012;
  m = mT(m, 0, bob, 0);
  let l = mRX(mT(m, .13, .42, 0), sw); D.box(l, 0, -.2, 0, .1, .22, .11, o.legs);
  l = mRX(mT(m, -.13, .42, 0), -sw); D.box(l, 0, -.2, 0, .1, .22, .11, o.legs);
  D.box(m, 0, .68, 0, .26, .27, .17, o.body); D.box(m, 0, .47, 0, .27, .05, .18, o.belt || 0x3a2a1c);
  if (o.pack) D.box(m, 0, .72, -.24, .19, .2, .09, o.pack);
  if (o.jet) { D.box(m, .11, .72, -.36, .07, .2, .07, 0x9aa0a8); D.box(m, -.11, .72, -.36, .07, .2, .07, 0x9aa0a8); }
  D.box(m, 0, 1.2, 0, .29, .27, .27, o.skin);
  D.box(m, .12, 1.22, .275, .045, .055, .01, 0x2a2228); D.box(m, -.12, 1.22, .275, .045, .055, .01, 0x2a2228);
  if (o.helmet) { D.box(m, 0, 1.47, 0, .32, .1, .3, o.helmet); D.box(m, 0, 1.4, .1, .34, .035, .34, o.helmet); D.box(m, 0, 1.5, .31, .07, .06, .03, 0xfff3b0, 2); }
  if (o.hood) { D.box(m, 0, 1.46, -.03, .32, .12, .31, o.hood); D.box(m, 0, 1.2, -.27, .31, .3, .05, o.hood); D.box(m, 0, 1.64, -.05, .16, .08, .16, o.hood); }
  if (o.beard) D.box(m, 0, 1.0, .2, .2, .1, .08, o.beard);
  const armL = mRZ(mRX(mT(m, .36, .9, 0), -sw * .8 + (o.armL || 0)), .08); D.box(armL, 0, -.2, 0, .085, .24, .1, o.body); D.box(armL, 0, -.43, 0, .08, .06, .09, o.skin);
  const ar = o.armR === undefined ? sw * .8 : o.armR;
  const armR = mRZ(mRX(mT(m, -.36, .9, 0), ar), -.08); D.box(armR, 0, -.2, 0, .085, .24, .1, o.body); D.box(armR, 0, -.43, 0, .08, .06, .09, o.skin);
  return mT(armR, 0, -.45, 0);   // hand frame
}
function drawTool(D, h, mode, pickCol, blockCol, spin) {
  h = mRX(h, 1.35);
  if (mode === 'pick') { D.box(h, 0, .28, 0, .035, .4, .035, 0x7a5230); D.box(h, 0, .66, 0, .05, .07, .3, pickCol); D.box(h, 0, .6, .33, .04, .06, .08, pickCol); D.box(h, 0, .6, -.33, .04, .06, .08, pickCol); }
  else if (mode === 'shovel') { D.box(h, 0, .3, 0, .03, .42, .03, 0x7a5230); D.box(h, 0, .82, 0, .13, .16, .03, 0xb9c0c8); D.box(h, 0, -.12, 0, .08, .03, .03, 0x7a5230); }
  else if (mode === 'drill') { D.box(h, 0, .16, 0, .11, .2, .11, 0xf0a020); D.box(h, 0, .4, 0, .08, .06, .08, 0x3a3a44); const s = mRY(mT(h, 0, .46, 0), spin); D.box(s, 0, .1, 0, .07, .1, .07, 0xb9c0c8); D.box(s, 0, .28, 0, .045, .09, .045, 0xd8dee6); D.box(s, 0, .43, 0, .02, .07, .02, 0xeef2f6); }
  else D.box(h, 0, .22, 0, .16, .16, .16, blockCol);
}
function buildScene() {
  DYN.reset(); DYNT.reset(); DYNH.reset();
  const b = body();
  // player
  if (!P.mounted) {
    const m = mAt(P.x, P.y - P.lift, P.z, P.face), using = P.useT > 0 || P.swingT > 0;
    let armR; if (P.mode === 'drill' && P.useT > 0) armR = -1.35 + Math.sin(gameTime * 60) * .03; else if (using) armR = -1.5 + Math.sin(P.swing) * 1.0;
    if (P.dead) { const k = 1 - P.dead / 1.4; drawHumanoid(DYN, mRX(mT(m, 0, .2, 0), -Math.min(1, k * 3) * 1.5), { legs: 0x3a4a6a, body: 0xd9772e, skin: 0xf0c8a0, helmet: 0xf2c230, pack: 0x6a4a2a }); }
    else {
      const h = drawHumanoid(DYN, m, { walk: P.walk, moving: P.moving && P.onGround, legs: 0x3a4a6a, body: 0xd9772e, skin: 0xf0c8a0, helmet: 0xf2c230, pack: 0x6a4a2a, jet: P.jet, armR });
      drawTool(DYN, h, P.mode, PICKS[P.pick].c, BL[P.slots[P.slot]].col, gameTime * 40);
    }
  }
  // npcs
  for (const n of npcs) { const d = Math.hypot(P.x - n.x, P.z - n.z); if (d < 9) n.face += angDiff(n.face, Math.atan2(P.x - n.x, P.z - n.z)) * .08; drawHumanoid(DYN, mAt(n.x, n.y, n.z, n.face), { legs: 0x4a3a2a, body: n.body, skin: n.skin, hood: n.id === 'merchant' ? n.hood : 0, helmet: 0, beard: n.id === 'smith' ? 0x8a8a90 : 0, belt: n.id === 'smith' ? 0x2a2a30 : 0xd0a030, ph: n.x }); if (n.id === 'smith') DYN.box(mAt(n.x, n.y, n.z, n.face), 0, .62, .19, .2, .26, .02, 0x3a3a44); }
  // bore rig
  {
    const m = mAt(rig.x, rig.y - rig.lift, rig.z, rig.face), sh = rig.boring > 0 ? Math.sin(gameTime * 70) * .015 : 0;
    DYN.box(m, .7, .28, 0, .2, .28, 1.0, 0x2e3038); DYN.box(m, -.7, .28, 0, .2, .28, 1.0, 0x2e3038);
    for (let i = 0; i < 5; i++) { const o = ((i / 5 + (P.mounted ? gameTime * (Math.hypot(rig.vx, rig.vz) * .25) : 0)) % 1) * 2 - 1; DYN.box(m, .7, .57, o * .9, .21, .02, .07, 0x54565f); DYN.box(m, -.7, .57, o * .9, .21, .02, .07, 0x54565f); }
    DYN.box(m, 0, .78 + sh, -.1, .62, .34, .9, 0xf0a020); DYN.box(m, 0, .78 + sh, -.1, .64, .08, .92, 0x2e3038);
    DYN.box(m, 0, 1.42 + sh, -.45, .5, .32, .46, 0xf6b63a); DYN.box(m, 0, 1.45 + sh, .02, .42, .22, .02, 0xbfe6f2); DYN.box(m, 0, 1.78 + sh, -.45, .54, .05, .5, 0x2e3038);
    DYN.box(m, .45, 1.5 + sh, -.95, .06, .4, .06, 0x54565f); DYN.box(m, 0, 1.25, .86, .1, .1, .1, 0xfff3b0, 2);
    const dm = mRZ(mT(m, 0, .9 + sh, 1.0), rig.spin);
    DYN.box(dm, 0, 0, .12, .5, .5, .12, 0x8d939c); DYN.box(dm, 0, 0, .36, .38, .38, .12, 0xb9c0c8); DYN.box(dm, 0, 0, .6, .25, .25, .12, 0xcfd5dc); DYN.box(dm, 0, 0, .84, .12, .12, .12, 0xe6eaee);
    DYN.box(dm, .42, 0, .3, .1, .06, .2, 0x54565f); DYN.box(dm, -.42, 0, .3, .1, .06, .2, 0x54565f); DYN.box(dm, 0, .42, .3, .06, .1, .2, 0x54565f); DYN.box(dm, 0, -.42, .3, .06, .1, .2, 0x54565f);
    if (P.mounted) { const pm = mT(m, 0, 1.05 + sh, -.45); DYN.box(pm, 0, .2, 0, .22, .2, .15, 0xd9772e); DYN.box(pm, 0, .62, 0, .24, .22, .22, 0xf0c8a0); DYN.box(pm, 0, .84, 0, .27, .08, .25, 0xf2c230); }
  }
  // woolpuffs
  for (const c of crits) {
    if (Math.hypot(c.x - cam.tx, c.z - cam.tz) > 80) continue;
    let m = mAt(c.x, c.y - c.lift + .3, c.z, c.face); m = mRX(m, c.rot); m = mT(m, 0, -.3, 0);
    DYN.box(m, 0, .36, 0, .26, .22, .32, c.tint); DYN.box(m, 0, .44, .34, .15, .15, .12, 0x3a3238); DYN.box(m, .08, .48, .465, .03, .03, .01, 0xffffff); DYN.box(m, -.08, .48, .465, .03, .03, .01, 0xffffff);
    DYN.box(m, 0, .62, .05, .2, .06, .22, c.tint);
    for (const [a, e] of [[.15, .2], [-.15, .2], [.15, -.2], [-.15, -.2]]) DYN.box(m, a, .08, e, .05, .09, .05, 0x3a3238);
  }
  for (const o of bombs) { const m = mRZ(mAt(o.x, o.y + .12, o.z, o.fuse * 9), o.rest ? 1.57 : o.fuse * 12); const blink = (o.fuse * 8 | 0) & 1; DYN.box(m, 0, 0, 0, .09, .22, .09, blink ? 0xff6a5a : 0xd0342c, blink ? 2 : 0); DYN.box(m, 0, .27, 0, .02, .06, .02, 0x3a3a3a); }
  for (const mt of meteors) if (mt.x !== undefined) { const m = mRX(mAt(mt.x, mt.y, mt.z, gameTime * 9), gameTime * 7); DYN.box(m, 0, 0, 0, .8, .8, .8, 0xffa030, 2); DYN.box(m, .3, .3, .2, .7, .5, .6, 0xfff0b0, 2); }
  for (const p of parts) DYN.box(mT(ID4, p.x, p.y, p.z), 0, 0, 0, p.s, p.s, p.s, p.col, p.emis);
  // open ocean beyond the map edge
  const wy = SEA + .86, W = 900, wc = 0x4f93dd;
  DYNT.box(ID4, -W / 2, wy - .5, WZ / 2, W / 2, .5, W + WZ / 2, wc); DYNT.box(ID4, WX + W / 2, wy - .5, WZ / 2, W / 2, .5, W + WZ / 2, wc);
  DYNT.box(ID4, WX / 2, wy - .5, -W / 2, WX / 2, .5, W / 2, wc); DYNT.box(ID4, WX / 2, wy - .5, WZ + W / 2, WX / 2, .5, W / 2, wc);
  // target highlight
  let hi = .3;
  if (target) {
    const e = .012 + (dig ? dig.p * .0 : 0), col = target.cell ? 0x9be06a : (distTo(target) > reach() ? 0xffffff : 0xffe27a);
    DYNH.box(ID4, target.x + .5, target.y + .5, target.z + .5, .5 + e, .5 + e, .5 + e, col, 2);
    hi = target.cell ? .35 : .22 + (dig ? dig.p * .5 : 0);
  }
  return hi;
}

/* ---- shop ---- */
function oreValue() { let v = 0; for (const id of ORES) v += P.inv[id] * BL[id].val; return v; }
function shopItems(who) {
  if (who === 'merchant') return [
    { id: 'sell', name: 'Sell all ore', desc: ORES.filter(i => P.inv[i]).map(i => P.inv[i] + ' ' + BL[i].name).join(', ') || 'Nothing to sell yet - ore is the speckled rock', gain: oreValue() },
    { id: 'dyn', name: 'Dynamite x5', desc: 'Blows a crater. Stand back.', cost: 25 },
    { id: 'ration', name: 'Rations x3', desc: 'Restores 45 HP and all energy', cost: 15 },
    { id: 'lamp', name: 'Lamps x6', desc: 'Glowing blocks for dark tunnels', cost: 18 },
    { id: 'glass', name: 'Glass x12', desc: 'See-through building blocks', cost: 15 },
    { id: 'brick', name: 'Brick x24', desc: 'Sturdy red building blocks', cost: 20 },
    { id: 'roof', name: 'Roof tiles x24', desc: '12 red and 12 blue', cost: 20 }
  ];
  return [
    P.pick < 4 ? { id: 'pick', name: PICKS[P.pick + 1].n, desc: 'Digs ' + Math.round(55 / (1 + P.pick * .55)) + '% faster than your ' + PICKS[P.pick].n, cost: [80, 220, 520, 1100][P.pick] } : { id: 'x', name: 'Crystal Pick', desc: 'Best pick there is', owned: 1 },
    P.drill < 2 ? { id: 'drill', name: 'Drill Mk ' + (P.drill + 2), desc: P.drill ? 'Wide bit: bores side blocks too' : 'Faster and sips less energy', cost: [150, 420][P.drill] } : { id: 'x', name: 'Drill Mk 3', desc: 'Fully tuned', owned: 1 },
    P.tank < 3 ? { id: 'tank', name: 'Energy cell +40', desc: 'More drilling, boring and flying', cost: [120, 280, 600][P.tank] } : { id: 'x', name: 'Energy cells', desc: 'Maxed out', owned: 1 },
    P.jet ? { id: 'x', name: 'Jetpack', desc: 'Hold JUMP in the air to fly', owned: 1 } : { id: 'jet', name: 'Jetpack', desc: 'Hold JUMP in the air to fly out of any hole', cost: 250 }
  ];
}
function buy(who, id) {
  const it = shopItems(who).find(i => i.id === id); if (!it || it.owned) return;
  if (id === 'sell') { if (!it.gain) { toast('No ore to sell yet'); return; } for (const o of ORES) P.inv[o] = 0; addCoins(it.gain); toast('Sold ore for ' + it.gain + ' coins', 'gold'); qEvent('sell'); return; }
  if (P.coins < it.cost) { toast('Not enough coins - you need ' + (it.cost - P.coins) + ' more'); sfx('no'); return; }
  P.coins -= it.cost; sfx('coin');
  if (id === 'dyn') P.dyn += 5; else if (id === 'ration') P.ration += 3; else if (id === 'lamp') P.inv[B.LAMP] += 6; else if (id === 'glass') P.inv[B.GLASS] += 12; else if (id === 'brick') P.inv[B.BRICK] += 24;
  else if (id === 'roof') { P.inv[B.ROOFR] += 12; P.inv[B.ROOFB] += 12; }
  else if (id === 'pick') { P.pick++; qEvent('upgrade'); } else if (id === 'drill') { P.drill++; qEvent('upgrade'); } else if (id === 'tank') { P.tank++; P.maxEn += 40; P.en = P.maxEn; qEvent('upgrade'); } else if (id === 'jet') { P.jet = 1; qEvent('upgrade'); }
  toast('Bought ' + it.name, 'gold');
}

/* ---- persistence ---- */
const SAVE_KEY = 'deepmere_save_v1';
function saveGame() {
  try {
    const p = {}; for (const k of ['x', 'y', 'z', 'hp', 'maxHp', 'en', 'maxEn', 'coins', 'lvl', 'xp', 'dyn', 'ration', 'pick', 'drill', 'tank', 'jet', 'mode', 'slots', 'slot', 'charge', 'quest', 'qn', 'blocksDug']) p[k] = P[k];
    p.inv = Array.from(P.inv);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, seed: World.seed, p, rig: { x: rig.x, y: rig.y, z: rig.z, face: rig.face }, cam: { yaw: cam.yaw, dist: cam.dist }, w: encodeWorld() }));
    World.dirty = false; return true;
  } catch (e) { return false; }
}
function loadGame() {
  try {
    const s = localStorage.getItem(SAVE_KEY); if (!s) return false; const d = JSON.parse(s); if (d.v !== 1) return false;
    decodeWorld(d.w); World.seed = d.seed; const inv = d.p.inv; delete d.p.inv; Object.assign(P, d.p); P.inv.set(inv.slice(0, NB)); Object.assign(rig, d.rig); if (d.cam) { cam.yaw = d.cam.yaw; cam.dist = d.cam.dist; }
    P.vx = P.vy = P.vz = 0; P.mounted = false; World.dirty = false; return true;
  } catch (e) { return false; }
}
function newGame(seed) {
  genWorld(seed);
  Object.assign(P, { x: 96.5, y: CAMPY + 1.01, z: 100.5, vx: 0, vy: 0, vz: 0, face: Math.PI, hp: 100, maxHp: 100, en: 100, maxEn: 100, coins: 0, lvl: 1, xp: 0, dyn: 8, ration: 3, pick: 0, drill: 0, tank: 0, jet: 0, mode: 'pick', slots: [B.PLANK, B.COBBLE, B.LAMP], slot: 0, charge: 0, quest: 0, qn: 0, mounted: false, dead: 0, blocksDug: 0 });
  P.inv.fill(0); P.inv[B.PLANK] = 40; P.inv[B.COBBLE] = 30; P.inv[B.LAMP] = 8; P.inv[B.GLASS] = 6;
  Object.assign(rig, { x: 92.5, y: CAMPY + 1.01, z: 105.5, vx: 0, vy: 0, vz: 0, face: 2.4 });
  bombs.length = 0; parts.length = 0; meteors.length = 0; task = null; cut.on = false;
}
