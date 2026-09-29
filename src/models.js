'use strict';
/* ==========================================================================
   models.js  -  procedural RS2-style humanoids, weapons, projectiles, effects
   Model space: +Y up, +Z forward, +X = character's left.
   ========================================================================== */
const DYN = new Mesh('white'), BLD = new Mesh('white'); BLD.blend = true;
const EASE = t => 1 - (1 - t) * (1 - t);

function basisMat(px, py, pz, dx, dy, dz) {
  let l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  let xx = dz, xy = 0, xz = -dx; l = Math.hypot(xx, xy, xz); if (l < 1e-4) { xx = 1; xy = 0; xz = 0; } else { xx /= l; xz /= l; }
  const yx = dy * xz - dz * xy, yy = dz * xx - dx * xz, yz = dx * xy - dy * xx;
  return [xx, xy, xz, 0, yx, yy, yz, 0, dx, dy, dz, 0, px, py, pz, 1];
}

const ICON_AVG = {};
function itemColor(id) {
  if (ICON_AVG[id] !== undefined) return ICON_AVG[id];
  const c = itemIcon(id); const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && (d[i] + d[i + 1] + d[i + 2]) > 30) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return ICON_AVG[id] = n ? rgb((r / n) | 0, (g / n) | 0, (b / n) | 0) : 0x888888;
}

/* --- weapon models, built in the right-hand frame (origin at the hand, +Z forward) --- */
function drawWeapon(m, model, item) {
  const B = (cx, cy, cz, hx, hy, hz, col) => DYN.box(m, cx, cy, cz, hx, hy, hz, col);
  const it = item; const col = it && it.color;
  switch (model) {
    case 'whip':
      B(0, 0, 0.10, 0.022, 0.022, 0.10, 0x5a3010); B(0, 0, 0.21, 0.03, 0.03, 0.02, 0xd0a030);
      B(0, 0, 0.30, 0.018, 0.018, 0.09, 0xe6d23a); B(0, -0.05, 0.42, 0.018, 0.018, 0.07, 0xe6d23a); B(0, -0.13, 0.5, 0.018, 0.06, 0.018, 0xe6d23a); B(0, -0.26, 0.5, 0.016, 0.07, 0.016, 0xc8b42a); break;
    case 'dagger':
      B(0, 0, 0.04, 0.02, 0.02, 0.05, 0x5a3a1a); B(0, 0, 0.09, 0.07, 0.014, 0.014, 0xe0b830); B(0, 0, 0.27, 0.014, 0.034, 0.17, 0xc0d4c8); break;
    case 'scim':
      B(0, 0, 0.05, 0.02, 0.02, 0.06, 0x5a3a1a); B(0, 0, 0.11, 0.08, 0.014, 0.014, 0x808088);
      B(0, 0.01, 0.30, 0.014, 0.04, 0.2, item.id === 'dscim' ? 0xc9d3e0 : 0x4aa9be); B(0, 0.07, 0.52, 0.014, 0.05, 0.05, item.id === 'dscim' ? 0xc9d3e0 : 0x4aa9be); break;
    case 'maul':
      B(0, 0, 0.26, 0.022, 0.022, 0.30, 0x6a4a20); B(0, 0, 0.58, 0.1, 0.1, 0.13, 0x8c8c86); B(0, 0, 0.58, 0.105, 0.03, 0.135, 0x6a6a64); break;
    case 'ags':
      B(0, 0, 0.06, 0.022, 0.022, 0.08, 0x5a3a1a); B(0, 0, 0.14, 0.14, 0.022, 0.022, 0xe0b830); B(0, 0, 0.66, 0.04, 0.075, 0.52, 0xd7dce6); B(0, 0.01, 1.2, 0.03, 0.05, 0.05, 0xd7dce6); break;
    case 'xbow':
      B(0, 0, 0.2, 0.022, 0.03, 0.22, 0x8a5a2b); B(0, 0, 0.38, 0.24, 0.014, 0.02, 0x4aa9be); B(0.24, 0, 0.33, 0.02, 0.014, 0.06, 0x4aa9be); B(-0.24, 0, 0.33, 0.02, 0.014, 0.06, 0x4aa9be); break;
    case 'bow':
      B(0, 0, 0.06, 0.014, 0.32, 0.014, 0xd8b040); B(0, 0.28, 0.02, 0.012, 0.06, 0.03, 0xd8b040); B(0, -0.28, 0.02, 0.012, 0.06, 0.03, 0xd8b040); B(0, 0, -0.02, 0.004, 0.3, 0.004, 0xf0f0e0); break;
    case 'staff':
      B(0.04, 0.32, 0.06, 0.02, 0.75, 0.02, 0x3a2a44); DYN.blob(m, 0.04, 1.12, 0.06, 0.07, 0.07, 0.07, 7, 4, 0xd04a9a); break;
  }
}

/* --- pose / animation --- */
function poseFor(a, now, mb, ph) {
  const p = { rArm: -0.28, rArmZ: -0.05, lArm: 0.05, lArmZ: 0.05, lLeg: 0, rLeg: 0, bob: 0, lean: 0, fwd: 0, twist: 0, down: 0, fall: 0 };
  const sw = Math.sin(ph) * 0.75 * mb;
  p.lLeg = sw; p.rLeg = -sw; p.rArm += sw * 0.7; p.lArm += -sw * 0.8; p.bob = Math.abs(Math.cos(ph)) * 0.035 * mb;
  const w = a.eq.weapon ? ITEMS[a.eq.weapon.id] : null;
  if (mb < 0.1) p.bob = Math.sin(now / 520 + a.id) * 0.006;
  const an = a.anim;
  if (an) {
    const t = clamp((now - an.t0) / an.dur, 0, 1);
    if (t >= 1 && an.type !== 'death') a.anim = null;
    else switch (an.type) {
      case 'slash': p.rArm = lerp(-2.4, 0.5, EASE(t)); p.rArmZ = -0.35 * (1 - t); p.twist = lerp(0.35, -0.3, EASE(t)); p.lArm = -0.4; break;
      case 'stab': p.rArm = -1.45; p.fwd = Math.sin(t * Math.PI) * 0.25; p.lArm = 0.5; p.twist = 0.15; break;
      case 'crush': p.rArm = lerp(-3.0, 0.4, EASE(t * 1.2 > 1 ? 1 : t * 1.2)); p.lArm = p.rArm * 0.8; p.lean = lerp(-0.2, 0.3, t); break;
      case 'bow': p.rArm = -1.35; p.lArm = -1.5; p.fwd = -Math.sin(t * Math.PI) * 0.06; break;
      case 'cast': p.rArm = lerp(-0.4, -2.7, EASE(Math.min(1, t * 2))); p.lArm = -1.0; p.rArmZ = -0.2; break;
      case 'block': p.lean = -Math.sin(t * Math.PI) * 0.22; break;
      case 'death': { const k = Math.min(1, t * 2.2); p.fall = k * 1.52; p.down = k * 0.05; p.rArm = lerp(p.rArm, -0.8, k); p.lArm = lerp(p.lArm, 0.6, k); break; }
    }
  }
  return p;
}

/* --- draw one actor into the dynamic mesh --- */
function drawActor(a, frac, dt, cam) {
  const now = G.now; const rp = renderPos(a, frac); const gx = rp[0], gy = rp[1];
  const gh = groundH(gx, gy);
  let d = angDiff(a.faceR, a.face); const mt = dt * 8; a.faceR += clamp(d, -mt, mt);
  const targetMB = (a.seg.length > 0 && !a.dead) ? 1 : 0; a.mb = a.mb === undefined ? 0 : a.mb; a.mb += clamp(targetMB - a.mb, -dt * 9, dt * 9);
  a.walkPh += dt * (a.seg.length > 1 ? 15 : 9.5) * (a.mb > 0.05 ? 1 : 0);
  const p = poseFor(a, now, a.mb, a.walkPh);
  let body = M4.mul(M4.trans(gx, gh + p.bob - p.down, -gy), M4.rotY(Math.PI - a.faceR));
  if (p.fwd) body = M4.mul(body, M4.trans(0, 0, p.fwd));
  if (p.fall) body = M4.mul(body, M4.mul(M4.trans(0, 0.1, -0.3 * Math.min(1, p.fall)), M4.rotX(-p.fall)));
  if (p.lean) body = M4.mul(body, M4.rotX(p.lean));
  const k = a.kit || {}; const eq = a.eq; const I = s => eq[s] ? ITEMS[eq[s].id] : null;
  const head = I('head'), bodyI = I('body'), legsI = I('legs'), hands = I('hands'), feet = I('feet'), cape = I('cape'), shield = I('shield'), neck = I('neck'), wpn = I('weapon');
  const skin = k.skin || 0xe8b088;
  const bodyCol = bodyI ? bodyI.color : (k.shirt || 0x2c4a9a);
  const legCol = legsI ? legsI.color : (k.pants || 0x3a3a2a);
  const bootCol = feet ? feet.color : (k.boots || 0x3a2a1a);
  const handCol = hands ? hands.color : skin;
  const B = (m, cx, cy, cz, hx, hy, hz, col) => DYN.box(m, cx, cy, cz, hx, hy, hz, col);
  const tw = p.twist ? M4.rotY(p.twist) : null;
  const torsoM = tw ? M4.mul(body, tw) : body;
  // legs
  const legs = [[0.105, p.lLeg], [-0.105, p.rLeg]];
  for (const [x, sw] of legs) {
    const m = M4.mul(body, M4.mul(M4.trans(x, 0.72, 0), M4.rotX(sw)));
    B(m, 0, -0.33, 0, 0.085, 0.34, 0.09, legCol);
    if (legsI && (legsI.model === 'legs')) B(m, 0, -0.15, 0, 0.095, 0.16, 0.10, legCol);
    B(m, 0, -0.68, 0.025, 0.095, 0.06, 0.125, bootCol);
  }
  if (legsI && legsI.model === 'skirt') B(body, 0, 0.5, 0, 0.27, 0.24, 0.135, legCol);
  // torso
  const plate = bodyI && bodyI.model === 'plate', robe = bodyI && bodyI.model === 'robe';
  B(torsoM, 0, 0.965, 0, plate ? 0.255 : 0.24, 0.245, plate ? 0.14 : 0.12, bodyCol);
  if (plate) { B(torsoM, 0.31, 1.16, 0, 0.1, 0.055, 0.1, bodyCol); B(torsoM, -0.31, 1.16, 0, 0.1, 0.055, 0.1, bodyCol); B(torsoM, 0, 0.98, 0.145, 0.1, 0.16, 0.012, shadeCol(bodyCol, 1.15)); }
  if (robe) { B(torsoM, 0, 0.78, 0, 0.255, 0.1, 0.135, bodyCol); B(torsoM, 0, 1.1, 0.125, 0.03, 0.1, 0.01, 0xe8e8f0); }
  if (!bodyI && k.clerk) { B(torsoM, 0, 1.03, 0.125, 0.025, 0.14, 0.008, 0xd8d8c8); }
  if (neck) B(torsoM, 0, 1.17, 0.125, 0.032, 0.035, 0.012, 0xe0b830);
  if (cape) B(torsoM, 0, 0.93, -0.155 - Math.sin(now / 400) * 0.01 * (1 - a.mb), 0.205, 0.31, 0.014, cape.color);
  // arms
  const armM = (sx, rx, rz) => M4.mul(torsoM, M4.mul(M4.trans(sx, 1.16, 0), M4.mul(M4.rotX(rx), M4.rotZ(rz))));
  const rM = armM(-0.32, p.rArm, p.rArmZ), lM = armM(0.32, p.lArm, p.lArmZ);
  const sleeve = plate ? bodyCol : (robe ? bodyCol : (k.shirt || 0x2c4a9a));
  for (const m of [rM, lM]) { B(m, 0, -0.21, 0, 0.075, 0.22, 0.075, sleeve); B(m, 0, -0.5, 0, 0.065, 0.075, 0.065, handCol); }
  if (plate) { B(rM, 0, -0.06, 0, 0.09, 0.09, 0.09, bodyCol); B(lM, 0, -0.06, 0, 0.09, 0.09, 0.09, bodyCol); }
  // weapon in right hand (origin at the hand)
  if (wpn && wpn.model) drawWeapon(M4.mul(rM, M4.trans(0, -0.5, 0.02)), wpn.model, wpn);
  if (shield) { const sm = M4.mul(lM, M4.trans(0.1, -0.3, 0.04)); B(sm, 0, 0, 0, 0.03, 0.24, 0.17, shield.color); B(sm, 0.03, 0.04, 0, 0.012, 0.16, 0.02, shadeCol(shield.color, 0.7)); B(sm, 0.03, 0.04, 0, 0.012, 0.02, 0.12, shadeCol(shield.color, 0.7)); }
  // head
  const hm = tw ? M4.mul(torsoM, M4.trans(0, 0, 0)) : body;
  B(hm, 0, 1.365, 0, 0.13, 0.14, 0.13, skin);
  const showFace = !(head && head.model === 'fullhelm');
  if (showFace) { B(hm, 0.05, 1.39, 0.132, 0.02, 0.02, 0.006, 0x101010); B(hm, -0.05, 1.39, 0.132, 0.02, 0.02, 0.006, 0x101010); B(hm, 0, 1.32, 0.132, 0.03, 0.008, 0.006, shadeCol(skin, 0.7)); }
  if (head) {
    if (head.model === 'fullhelm') { B(hm, 0, 1.375, 0, 0.155, 0.17, 0.155, head.color); B(hm, 0, 1.36, 0.156, 0.11, 0.014, 0.006, 0x0a1a20); B(hm, 0, 1.37, 0.157, 0.012, 0.13, 0.006, shadeCol(head.color, 0.7)); }
    else if (head.model === 'coif') { B(hm, 0, 1.415, -0.005, 0.145, 0.11, 0.145, head.color); B(hm, 0, 1.3, -0.06, 0.145, 0.1, 0.09, head.color); }
    else if (head.model === 'wizhat') { DYN.prism(hm, 0, 0, 1.47, 1.5, 0.3, 0.3, 10, head.color); DYN.prism(hm, 0, 0, 1.5, 1.76, 0.17, 0.17, 10, head.color); DYN.prism(hm, 0, 0, 1.76, 1.95, 0.09, 0.09, 8, shadeCol(head.color, 1.1)); }
  } else {
    const hair = k.hair || 0x3a2410, hs = k.hairStyle || 0;
    B(hm, 0, 1.47, -0.005, 0.14, 0.045, 0.14, hair);
    if (hs !== 2) { B(hm, 0, 1.4, -0.11, 0.14, 0.11, 0.03, hair); }
    B(hm, 0.135, 1.42, 0, 0.012, 0.08, 0.125, hair); B(hm, -0.135, 1.42, 0, 0.012, 0.08, 0.125, hair);
    if (hs === 1) { B(hm, 0, 1.28, -0.11, 0.14, 0.06, 0.03, hair); }
    if (hs === 2) { B(hm, 0, 1.28, 0.12, 0.09, 0.05, 0.02, hair); }
  }
  // frozen ice block
  if (a.frozen > 0 && !a.dead) BLD.box(null, gx, gh + 0.78, -gy, 0.4, 0.82, 0.4, 0xa8dcff, 0, 120);
  // skull / prayer overhead drawn in 2D; store head anchor for overlays
  a.wx = gx; a.wy = gh; a.wz = -gy;
}

/* --- projectiles & effects --- */
function drawProjectiles() {
  const now = G.now;
  G.projs = G.projs.filter(p => now < p.t1 + 30);
  for (const p of G.projs) {
    if (now < p.t0) continue; const t = clamp((now - p.t0) / (p.t1 - p.t0), 0, 1);
    const tgt = p.tgt; const tp = renderPos(tgt, (now - G.lastTick) / TICK_MS);
    const sx = p.sx, sy = p.sy; const sz = groundH(sx, sy) + 1.0, tz = groundH(tp[0], tp[1]) + 0.9;
    const arc = (p.kind === 'arrow' ? 0.5 : p.kind === 'bolt' ? 0.15 : 0.0) * Math.sin(t * Math.PI);
    const x = lerp(sx, tp[0], t), y = lerp(sy, tp[1], t), z = lerp(sz, tz, t) + arc;
    if (p.kind === 'bolt' || p.kind === 'arrow') {
      const dx = tp[0] - sx, dz = -(tp[1] - sy), dy = (tz - sz);
      const m = basisMat(x, z, -y, dx, dy, dz);
      DYN.box(m, 0, 0, 0, 0.025, 0.025, 0.28, p.kind === 'bolt' ? 0xe0e0d8 : 0xc8a860);
      DYN.box(m, 0, 0, 0.26, 0.04, 0.04, 0.05, p.kind === 'bolt' ? 0xb82418 : 0x4aa9be);
    } else {
      const col = p.kind === 'ice' ? 0xa8e4ff : 0xb01820, col2 = p.kind === 'ice' ? 0xffffff : 0xff6060;
      const pu = 1 + 0.15 * Math.sin(now / 60);
      BLD.blob(null, x, z, -y, 0.24 * pu, 0.24 * pu, 0.24 * pu, 8, 5, col, 0, null, 150);
      DYN.blob(null, x, z, -y, 0.12, 0.12, 0.12, 6, 4, col2);
      // trail
      for (let i = 1; i <= 3; i++) { const tt = Math.max(0, t - i * 0.05); BLD.box(null, lerp(sx, tp[0], tt), lerp(sz, tz, tt), -lerp(sy, tp[1], tt), 0.08 - i * 0.015, 0.08 - i * 0.015, 0.08 - i * 0.015, col, 0, 140 - i * 35); }
    }
  }
  G.effects = G.effects.filter(e => now < e.t0 + e.dur);
  for (const e of G.effects) {
    const t = (now - e.t0) / e.dur; const gh = groundH(e.x, e.y);
    if (e.type === 'splash') {
      for (let i = 0; i < 7; i++) { const ang = i / 7 * TAU, r = 0.15 + t * 0.35; const h = Math.sin(t * Math.PI) * 0.4; BLD.box(null, e.x + Math.cos(ang) * r, gh + 0.3 + h, -(e.y + Math.sin(ang) * r), 0.05, 0.05, 0.05, 0x9ad0ff, 0, 200 * (1 - t)); }
    } else {
      const ice = e.type === 'ice'; const c1 = ice ? 0xbfeaff : 0xd02020, c2 = ice ? 0xffffff : 0xff8080;
      for (let i = 0; i < 14; i++) {
        const ang = i / 14 * TAU + i * 0.7, r = 0.1 + t * 0.9 * (0.5 + (i % 3) * 0.25); const h = 0.15 + t * (0.9 + (i % 4) * 0.25) - t * t * 0.5;
        const s = 0.07 + (i % 3) * 0.03;
        BLD.box(null, e.x + Math.cos(ang) * r, gh + h, -(e.y + Math.sin(ang) * r), s, s, s, i % 2 ? c1 : c2, 0, 230 * (1 - t * t));
      }
      BLD.blob(null, e.x, gh + 0.6 + t * 0.3, -e.y, 0.4 + t * 0.9, 0.5 + t * 0.6, 0.4 + t * 0.9, 9, 5, c1, 0, null, Math.max(0, 120 * (1 - t)) | 0);
    }
  }
}
function drawGround() {
  const now = G.now;
  for (const g of G.ground) {
    const gh = groundH(g.x + 0.5, g.y + 0.5); const col = itemColor(g.id); const bob = Math.sin(now / 500 + g.x) * 0.0;
    const m = M4.mul(M4.trans(g.x + 0.5, gh + 0.07, -(g.y + 0.5)), M4.rotY((g.x * 7 + g.y * 3) % 6));
    DYN.box(m, 0, 0, 0, 0.21, 0.06, 0.13, shadeCol(col, 0.8)); DYN.box(m, 0.03, 0.06, 0.01, 0.15, 0.05, 0.09, col); DYN.box(m, 0.06, 0.12, 0.02, 0.06, 0.04, 0.05, shadeCol(col, 1.25));
  }
}
function drawDynamic(frac, dt, cam) {
  DYN.clear(); BLD.clear();
  for (const a of G.actors) drawActor(a, frac, dt, cam);
  drawGround(); drawProjectiles();
}

/* --- screen projection of actors (for hitsplats, HP bars, picking) --- */
function updateScreenInfo(cam, frac) {
  for (const a of G.actors) {
    const rp = renderPos(a, frac); const gh = groundH(rp[0], rp[1]); a.rx = rp[0]; a.ry = rp[1];
    const feet = cam.project(rp[0], gh, -rp[1]);
    const head = cam.project(rp[0], gh + (a.dead ? 0.4 : 1.55), -rp[1]);
    const mid = cam.project(rp[0], gh + (a.dead ? 0.2 : 0.85), -rp[1]);
    a.scr = feet && head && mid ? { fx: feet[0], fy: feet[1], hx: head[0], hy: head[1], mx: mid[0], my: mid[1], d: feet[2] } : null;
  }
}
function pickActor(mx, my) { // mx,my in viewport coords
  let best = null, bd = 1e9;
  for (const a of G.actors) {
    if (!a.scr || a.dead) continue; const s = a.scr; const h = Math.max(20, s.fy - s.hy); const w = h * 0.42;
    if (mx >= s.fx - w && mx <= s.fx + w && my >= s.hy - 3 && my <= s.fy + 3) { if (s.d < bd) { bd = s.d; best = a; } }
  }
  return best;
}
/* ray to ground tile */
function pickTile(cam, mx, my) {
  const r = cam.ray(mx, my); if (r.d[1] >= -0.001) return null;
  let h = 0, x = 0, z = 0;
  for (let i = 0; i < 4; i++) {
    const t = (h - r.o[1]) / r.d[1]; x = r.o[0] + r.d[0] * t; z = r.o[2] + r.d[2] * t; const y = -z;
    h = groundH(x, y);
  }
  const tx = Math.floor(x), ty = Math.floor(-z); if (!inMap(tx, ty)) return null; return { x: tx, y: ty };
}
function pickObject(mx, my, cam) {
  let best = null, bd = 1e9;
  for (const o of WORLD.objs) {
    const gh = tileH(o.x, o.y); const a = cam.project(o.x + 0.5, gh, -(o.y + 0.5)), b = cam.project(o.x + 0.5, gh + o.h, -(o.y + 0.5));
    if (!a || !b) continue; const w = Math.max(14, (a[1] - b[1]) * 0.55);
    if (mx >= a[0] - w && mx <= a[0] + w && my >= b[1] - 2 && my <= a[1] + 4 && a[2] < bd) { bd = a[2]; best = o; }
  }
  return best;
}
