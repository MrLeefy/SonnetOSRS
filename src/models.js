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

/* --- mesh helpers: tapered tubes, rods and extruded plates, built from Mesh.quad/tri --- */
const MD_RING = {};
const MD_BLADE = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1]; // plate (fwd, up, thickness) -> blade in hand frame
const MD_KITE = [[-0.14, 0.2], [-0.14, 0.02], [0, -0.24], [0.14, 0.02], [0.14, 0.2]];
const MD_KITE_RIM = MD_KITE.map(p => [p[0] * 1.1, p[1] * 1.1]);
// unit ring of n sides with flat faces on the +X and +Z axes
function mdRing(n) {
  let r = MD_RING[n]; if (r) return r;
  r = MD_RING[n] = [];
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; r.push([Math.cos(a), Math.sin(a)]); }
  return r;
}
/* tapered tube about local Y from y0 (radii rx0,rz0) to y1 (rx1,rz1); top/bot add flat caps */
function mdFrustum(m, cx, y0, cz, rx0, rz0, y1, rx1, rz1, n, col, top, bot) {
  const R = mdRing(n), lo = [], hi = [];
  for (let i = 0; i < n; i++) {
    const c = R[i][0], s = R[i][1];
    lo.push(m ? M4.pt(m, cx + c * rx0, y0, cz + s * rz0) : [cx + c * rx0, y0, cz + s * rz0]);
    hi.push(m ? M4.pt(m, cx + c * rx1, y1, cz + s * rz1) : [cx + c * rx1, y1, cz + s * rz1]);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; DYN.quad(lo[i], hi[i], hi[j], lo[j], col); }
  if (top) for (let i = 1; i < n - 1; i++) DYN.tri(hi[0], hi[i], hi[i + 1], col);
  if (bot) for (let i = 1; i < n - 1; i++) DYN.tri(lo[0], lo[i + 1], lo[i], col);
}
/* round rod from point a to point b (local to m), radius r0 at a and r1 at b */
function mdRod(m, a, b, r0, r1, n, col, cap) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz) || 1e-4;
  const yx = dx / L, yy = dy / L, yz = dz / L;
  const ref = Math.abs(yy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let xx = yy * 0 - yz * ref[1], xy = yz * ref[0] - yx * 0, xz = yx * ref[1] - yy * ref[0];
  const xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
  const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
  const f = [xx, xy, xz, 0, yx, yy, yz, 0, zx, zy, zz, 0, a[0], a[1], a[2], 1];
  mdFrustum(m ? M4.mul(m, f) : f, 0, 0, 0, r0, r0, L, r1, r1, n, col, cap, cap);
}
/* flat polygon (counter-clockwise in x,y) extruded to +-t along z */
function mdPlate(m, pts, t, col) {
  const n = pts.length, F = [], K = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    F.push(m ? M4.pt(m, p[0], p[1], t) : [p[0], p[1], t]);
    K.push(m ? M4.pt(m, p[0], p[1], -t) : [p[0], p[1], -t]);
  }
  for (let i = 1; i < n - 1; i++) { DYN.tri(F[0], F[i], F[i + 1], col); DYN.tri(K[0], K[i + 1], K[i], col); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; DYN.quad(K[i], K[j], F[j], F[i], col); }
}
/* pyramid from a square base at z0 (half width hw) to an apex at z1 */
function mdTip(m, z0, z1, hw, col) {
  const V = (x, y, z) => m ? M4.pt(m, x, y, z) : [x, y, z];
  const a = V(-hw, -hw, z0), b = V(hw, -hw, z0), c = V(hw, hw, z0), d = V(-hw, hw, z0), e = V(0, 0, z1);
  DYN.tri(a, b, e, col); DYN.tri(b, c, e, col); DYN.tri(c, d, e, col); DYN.tri(d, a, e, col);
}
/* two crossed fletching vanes between z0 and z1 */
function mdFin(m, z0, z1, h, col) {
  const V = (x, y, z) => m ? M4.pt(m, x, y, z) : [x, y, z];
  DYN.quad(V(-h, 0, z0), V(h, 0, z0), V(h * 0.4, 0, z1), V(-h * 0.4, 0, z1), col);
  DYN.quad(V(0, -h, z0), V(0, h, z0), V(0, h * 0.4, z1), V(0, -h * 0.4, z1), col);
}

/* --- weapon models, built in the right-hand frame (origin at the fist, +Z forward, +Y blade up, +X flat faces) --- */
function drawWeapon(m, model, item) {
  const it = item || {};
  const B = (cx, cy, cz, hx, hy, hz, col) => DYN.box(m, cx, cy, cz, hx, hy, hz, col);
  const R = (a, b, r0, r1, n, col) => mdRod(m, a, b, r0, r1, n, col, false);
  const PL = (pts, t, col) => mdPlate(M4.mul(m, MD_BLADE), pts, t, col);
  const wood = 0x5a3a1a, gold = 0xe0b830;
  switch (model) {
    case 'whip':
      R([0, 0, -0.03], [0, 0, 0.12], 0.021, 0.017, 6, wood);          // braided grip
      R([0, 0, 0.12], [0, 0, 0.15], 0.028, 0.026, 6, 0xd0a030);       // gold collar
      R([0, 0, 0.15], [0, 0.008, 0.3], 0.02, 0.016, 6, 0xe6d23a);     // lash tapers and curls
      R([0, 0.008, 0.3], [0, -0.02, 0.43], 0.016, 0.012, 6, 0xe6d23a);
      R([0, -0.02, 0.43], [0, -0.12, 0.5], 0.012, 0.01, 6, 0xd8c030);
      R([0, -0.12, 0.5], [0, -0.26, 0.48], 0.01, 0.005, 6, 0xc8b42a);
      break;
    case 'dagger':
      R([0, 0, -0.05], [0, 0, 0.09], 0.018, 0.016, 6, wood);
      B(0, 0, 0.095, 0.07, 0.014, 0.014, gold);                       // crossguard
      DYN.blob(m, 0, 0, -0.07, 0.026, 0.026, 0.026, 6, 2, gold);      // pommel
      PL([[0.1, -0.03], [0.3, -0.03], [0.37, 0], [0.3, 0.032], [0.1, 0.03]], 0.007, 0xc0d4c8);
      PL([[0.12, -0.01], [0.3, -0.01], [0.34, 0], [0.3, 0.01], [0.12, 0.01]], 0.01, 0xe8f4ee); // fuller
      break;
    case 'scim': {
      const bc = it.id === 'dscim' ? 0xc9d3e0 : 0x4aa9be;
      R([0, 0, -0.05], [0, 0, 0.1], 0.018, 0.017, 6, wood);
      B(0, 0, 0.11, 0.08, 0.014, 0.014, 0x808088);                    // quillon
      PL([[0.1, -0.03], [0.22, -0.02], [0.33, 0.02], [0.42, 0.1], [0.48, 0.2], [0.5, 0.3], [0.49, 0.31], [0.42, 0.2], [0.33, 0.11], [0.22, 0.06], [0.1, 0.04]], 0.008, bc);
      break;
    }
    case 'maul':
      R([0, 0, -0.05], [0, 0, 0.46], 0.024, 0.02, 6, 0x6a4a20);       // haft
      R([0, 0, 0.0], [0, 0, 0.04], 0.03, 0.03, 6, 0x3a2a1a);          // leather wrap
      B(0, 0, 0.58, 0.075, 0.11, 0.12, 0x8c8c86);                     // block head
      B(0, 0, 0.71, 0.078, 0.095, 0.01, 0xa4a49c);                    // striking face
      B(0, 0.11, 0.58, 0.08, 0.012, 0.125, 0x6a6a64);                 // iron rims
      B(0, -0.11, 0.58, 0.08, 0.012, 0.125, 0x6a6a64);
      break;
    case 'ags':
      R([0, 0, -0.1], [0, 0, 0.16], 0.02, 0.02, 6, 0x3a2a1a);         // grip
      DYN.blob(m, 0, 0, -0.13, 0.034, 0.034, 0.034, 6, 2, gold);      // pommel
      B(0, 0, 0.16, 0.16, 0.024, 0.026, gold);                        // crossguard
      B(0.15, 0.03, 0.16, 0.026, 0.05, 0.026, gold);                  // quillon tips
      B(-0.15, 0.03, 0.16, 0.026, 0.05, 0.026, gold);
      PL([[0.18, -0.07], [0.9, -0.08], [1.12, -0.1], [1.24, 0], [1.12, 0.1], [0.9, 0.08], [0.18, 0.07]], 0.02, 0xd7dce6);
      PL([[0.2, -0.02], [0.9, -0.02], [1.1, -0.015], [1.2, 0], [1.1, 0.015], [0.9, 0.02], [0.2, 0.02]], 0.028, 0xf4f6fa); // fuller
      break;
    case 'xbow': {
      const rune = 0x4aa9be, arc = [[-0.27, 0, 0.34], [0, 0, 0.43], [0.27, 0, 0.34]];
      B(0, 0, 0.13, 0.024, 0.036, 0.26, 0x8a5a2b);                    // stock
      B(0, 0, 0.36, 0.05, 0.04, 0.04, 0x8a5a2b);                      // prod mount
      R(arc[0], arc[1], 0.014, 0.014, 5, rune); R(arc[1], arc[2], 0.014, 0.014, 5, rune); // rune prod
      R(arc[0], [0, 0.03, 0.3], 0.005, 0.005, 4, 0xe0e0d0);           // bowstring
      R([0, 0.03, 0.3], arc[2], 0.005, 0.005, 4, 0xe0e0d0);
      R([0, 0.04, 0.3], [0, 0.04, 0.5], 0.012, 0.012, 4, 0xd8d8d0);   // bolt in the groove
      break;
    }
    case 'bow': {
      const pts = [[0, 0.34, 0.0], [0, 0.2, 0.07], [0, 0, 0.1], [0, -0.2, 0.07], [0, -0.34, 0.0]];
      for (let i = 0; i < 4; i++) R(pts[i], pts[i + 1], 0.016, 0.016, 5, 0xd8b040);
      B(0, 0, 0.06, 0.02, 0.05, 0.02, wood);                          // grip
      R(pts[0], pts[4], 0.004, 0.004, 4, 0xf0f0e0);                   // string
      break;
    }
    case 'staff':
      R([0, -0.25, 0], [0, 1.0, 0], 0.024, 0.016, 6, 0x3a2a44);       // shaft
      R([0, 0.5, 0], [0, 0.53, 0], 0.03, 0.03, 6, gold);              // collars
      R([0, 0.9, 0], [0, 0.93, 0], 0.03, 0.03, 6, gold);
      R([0, 0.97, 0], [0.04, 1.08, 0.03], 0.01, 0.008, 4, gold);      // claw holding the crystal
      R([0, 0.97, 0], [-0.04, 1.08, 0.03], 0.01, 0.008, 4, gold);
      DYN.blob(m, 0, 1.12, 0, 0.075, 0.075, 0.075, 7, 4, 0xd04a9a);
      break;
  }
}

/* --- pose / animation --- */
function poseFor(a, now, mb, ph) {
  const p = { rArm: -0.28, rArmZ: -0.05, lArm: 0.05, lArmZ: 0.05, lLeg: 0, rLeg: 0, bob: 0, lean: 0, fwd: 0, twist: 0, down: 0, fall: 0, breath: 0 };
  const sw = Math.sin(ph) * 0.75 * mb;
  p.lLeg = sw; p.rLeg = -sw; p.rArm += sw * 0.7; p.lArm += -sw * 0.8; p.bob = Math.abs(Math.cos(ph)) * 0.035 * mb;
  p.twist = -sw * 0.06; // torso counter-rotates against the stride
  p.breath = Math.sin(now / 900 + a.id * 0.7) * 0.012 * (1 - mb);
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
  const skin = k.skin || 0xe8b088, hair = k.hair || 0x3a2410, hs = k.hairStyle || 0;
  const bodyCol = bodyI ? bodyI.color : (k.shirt || 0x2c4a9a);
  const legCol = legsI ? legsI.color : (k.pants || 0x3a3a2a);
  const bootCol = feet ? feet.color : (k.boots || 0x3a2a1a);
  const handCol = hands ? hands.color : skin;
  const plate = !!bodyI && bodyI.model === 'plate', robe = !!bodyI && bodyI.model === 'robe';
  const sleeve = (plate || robe) ? bodyCol : (k.shirt || 0x2c4a9a);
  const B = (m, cx, cy, cz, hx, hy, hz, col) => DYN.box(m, cx, cy, cz, hx, hy, hz, col);
  const tw = p.twist ? M4.rotY(p.twist) : null;
  const torsoM = tw ? M4.mul(body, tw) : body;
  const br = p.breath;
  // legs: hip joints at (+-0.105, 0.72); the trailing knee flexes
  for (const [x, sw, ix] of [[0.105, p.lLeg, 1], [-0.105, p.rLeg, -1]]) {
    const L = M4.mul(body, M4.mul(M4.trans(x, 0.72, 0), M4.rotX(sw)));
    const K = M4.mul(L, M4.mul(M4.trans(0, -0.34, 0), M4.rotX(Math.max(0, -sw) * 0.6)));
    const A = M4.mul(K, M4.trans(0, -0.32, 0));
    mdFrustum(L, 0, 0, 0, 0.1, 0.1, -0.34, 0.075, 0.078, 8, legCol, false, false);     // thigh
    mdFrustum(K, 0, 0, 0, 0.072, 0.072, -0.32, 0.05, 0.054, 8, legCol, false, false);   // shin
    if (legsI && legsI.model === 'legs') mdFrustum(L, 0, 0.02, 0, 0.116, 0.116, -0.3, 0.096, 0.096, 8, legCol, false, false); // plate thigh guard
    // foot: heel block, rounded toe, ankle sock (and a tall boot shaft when equipped)
    B(A, 0, -0.03, -0.02, 0.07, 0.03, 0.068, bootCol);
    DYN.blob(A, 0, -0.035, 0.05, 0.066, 0.025, 0.088, 6, 2, bootCol);
    if (feet && feet.model === 'boots') {
      mdFrustum(A, 0, 0.07, 0, 0.066, 0.066, 0.16, 0.07, 0.07, 8, bootCol, false, false);
      mdFrustum(A, 0, 0.14, 0, 0.072, 0.072, 0.16, 0.072, 0.072, 8, shadeCol(bootCol, 1.25), true, false);
    }
  }
  // hips and torso: waist and chest are tapered sections, the chest swells with breath
  mdFrustum(body, 0, 0.64, 0, 0.18, 0.11, 0.8, 0.19, 0.12, 8, legCol, false, false);
  mdFrustum(torsoM, 0, 0.8, 0, 0.19, 0.12, 0.96, 0.165, 0.105, 8, bodyCol, false, false);
  mdFrustum(torsoM, 0, 0.96, 0, 0.165, 0.105, 1.2, 0.228 * (1 + br), 0.13 * (1 + br), 8, bodyCol, true, false);
  mdFrustum(torsoM, 0, 1.15, 0, 0.074, 0.07, 1.31, 0.066, 0.064, 8, skin, false, false); // neck
  if (plate) {
    mdFrustum(torsoM, 0, 0.84, 0, 0.2, 0.126, 1.19, 0.245, 0.148, 8, bodyCol, false, false); // plate shell
    B(torsoM, 0, 1.0, 0.152, 0.007, 0.11, 0.005, shadeCol(bodyCol, 0.72));                    // centre ridge
    mdFrustum(torsoM, 0, 0.8, 0, 0.21, 0.135, 0.86, 0.21, 0.135, 8, 0x5a3a1a, false, false); // leather belt
    for (const sx of [-0.3, 0.3]) mdFrustum(torsoM, sx, 1.1, 0, 0.1, 0.1, 1.2, 0.08, 0.08, 6, shadeCol(bodyCol, 1.1), true, false); // pauldrons
  }
  if (robe) {
    mdFrustum(torsoM, 0, 0.78, 0, 0.2, 0.13, 0.84, 0.2, 0.13, 8, 0xe8e8f0, false, false);    // sash
    B(torsoM, 0, 1.08, 0.134, 0.03, 0.11, 0.008, 0xe8e8f0);                                    // front panel
    mdFrustum(torsoM, 0, 1.17, 0, 0.09, 0.085, 1.22, 0.09, 0.085, 8, 0xe8e8f0, false, false);  // collar
  }
  if (!bodyI && k.clerk) B(torsoM, 0, 1.03, 0.125, 0.025, 0.14, 0.008, 0xd8d8c8);
  if (legsI && legsI.model === 'skirt') { // flared robe skirt with a hem band
    mdFrustum(body, 0, 0.12, 0, 0.27, 0.22, 0.8, 0.19, 0.13, 8, legCol, false, false);
    mdFrustum(body, 0, 0.1, 0, 0.283, 0.233, 0.17, 0.27, 0.22, 8, 0xe8e8f0, false, false);
  }
  if (cape) { // pleated cape hanging from the shoulders, swaying gently
    const cc = cape.color, sway = Math.sin(now / 420 + a.id) * 0.012 * (1 - a.mb);
    for (let i = 0; i < 4; i++) {
      const x0 = -0.2 + i * 0.1, x1 = x0 + 0.1;
      const z0 = i % 2 ? -0.165 : -0.15, z1 = i % 2 ? -0.15 : -0.165;
      DYN.quad(M4.pt(torsoM, x0, 1.22, -0.14), M4.pt(torsoM, x1, 1.22, -0.14), M4.pt(torsoM, x1 * 1.14 + sway, 0.5, z1), M4.pt(torsoM, x0 * 1.14 + sway, 0.5, z0), i % 2 ? cc : shadeCol(cc, 0.82));
    }
  }
  if (neck) { // amulet: gold setting and a red gem on the chest
    DYN.blob(torsoM, 0, 1.12, 0.12, 0.03, 0.03, 0.012, 6, 2, 0xe2b930);
    DYN.blob(torsoM, 0, 1.12, 0.128, 0.014, 0.014, 0.008, 4, 2, 0xe04030);
  }
  // arms: upper arm, forearm and fist, with a flexing elbow
  const armM = (sx, rx, rz) => M4.mul(torsoM, M4.mul(M4.trans(sx, 1.16, 0), M4.mul(M4.rotX(rx), M4.rotZ(rz))));
  const drawArm = (M, bend, ix) => {
    mdFrustum(M, 0, 0, 0, 0.074, 0.074, -0.26, 0.062, 0.062, 8, sleeve, false, false);    // upper arm
    const E = M4.mul(M, M4.mul(M4.trans(0, -0.26, 0), M4.rotX(bend)));                    // elbow frame
    mdFrustum(E, 0, 0, 0, 0.062, 0.062, -0.2, 0.054, 0.054, 8, sleeve, false, false);     // forearm
    if (hands && hands.model === 'gloves') mdFrustum(E, 0, -0.16, 0, 0.064, 0.064, -0.2, 0.066, 0.066, 8, shadeCol(handCol, 0.85), false, false);
    B(E, 0, -0.245, 0, 0.058, 0.07, 0.06, handCol);                                       // fist
    B(E, ix * 0.05, -0.2, 0.035, 0.022, 0.03, 0.04, handCol);                              // thumb
    return E;
  };
  const rM = armM(-0.3, p.rArm, p.rArmZ), lM = armM(0.3, p.lArm, p.lArmZ);
  const rE = drawArm(rM, -(0.1 + 0.25 * clamp(-p.rArm - 1.6, 0, 1)), 1);
  const lE = drawArm(lM, -(0.1 + 0.2 * clamp(-p.lArm - 1.0, 0, 1)), -1);
  // weapon in the right fist (origin at the fist)
  if (wpn && wpn.model) drawWeapon(M4.mul(rE, M4.trans(0, -0.245, 0.02)), wpn.model, wpn);
  if (shield) { // kite shield with a rim and boss, held on the left forearm
    const sc = shield.color, sm = M4.mul(lE, M4.trans(0.03, 0, 0.17));
    mdPlate(M4.mul(sm, M4.trans(0, 0, -0.012)), MD_KITE_RIM, 0.01, shadeCol(sc, 0.6));
    mdPlate(sm, MD_KITE, 0.012, sc);
    DYN.blob(sm, 0, 0.02, 0.02, 0.05, 0.05, 0.034, 6, 2, shadeCol(sc, 1.25));
  }
  // head and face (torso frame)
  const hm = torsoM;
  const fullhelm = !!head && head.model === 'fullhelm';
  if (!fullhelm) {
    DYN.blob(hm, 0, 1.39, -0.01, 0.13, 0.135, 0.135, 8, 3, skin);                        // skull
    B(hm, 0, 1.27, 0, 0.095, 0.045, 0.1, skin);                                          // jaw
    B(hm, 0, 1.36, 0.135, 0.02, 0.035, 0.018, shadeCol(skin, 0.92));                     // nose
    B(hm, 0.05, 1.395, 0.136, 0.022, 0.016, 0.008, 0x101010);                            // eyes
    B(hm, -0.05, 1.395, 0.136, 0.022, 0.016, 0.008, 0x101010);
    B(hm, 0.05, 1.43, 0.133, 0.03, 0.01, 0.01, hair);                                    // brows
    B(hm, -0.05, 1.43, 0.133, 0.03, 0.01, 0.01, hair);
    B(hm, 0, 1.31, 0.122, 0.028, 0.008, 0.008, shadeCol(skin, 0.6));                     // mouth
  }
  if (head) {
    if (fullhelm) {
      DYN.blob(hm, 0, 1.39, 0, 0.152, 0.172, 0.152, 8, 3, head.color);                  // rounded helm
      B(hm, 0, 1.37, 0.15, 0.11, 0.012, 0.01, 0x0a1a20);                                // visor slit
      B(hm, 0, 1.33, 0.158, 0.016, 0.05, 0.01, shadeCol(head.color, 0.7));               // nasal bar
      mdFrustum(hm, 0, 1.2, 0, 0.166, 0.166, 1.245, 0.158, 0.158, 8, shadeCol(head.color, 0.8), false, false); // rim
    } else if (head.model === 'coif') {
      DYN.blob(hm, 0, 1.44, -0.03, 0.148, 0.105, 0.148, 8, 2, head.color);              // woollen hood over the crown
    } else if (head.model === 'wizhat') {
      mdFrustum(hm, 0, 1.49, 0, 0.25, 0.25, 1.535, 0.25, 0.25, 10, shadeCol(head.color, 0.9), true, false); // brim
      const cm = M4.mul(hm, M4.mul(M4.trans(0, 1.535, 0), M4.rotZ(0.12)));
      mdFrustum(cm, 0, 0, 0, 0.2, 0.2, 0.05, 0.2, 0.2, 10, 0xe8e8f0, false, false);     // trim band
      mdFrustum(cm, 0, 0.05, 0, 0.19, 0.19, 0.36, 0.03, 0.03, 10, head.color, true, false); // cone
    }
  } else {
    DYN.blob(hm, 0, 1.45, -0.02, 0.142, 0.095, 0.142, 8, 2, hair);                       // hair volume
    if (hs === 0) B(hm, 0, 1.38, -0.15, 0.13, 0.1, 0.03, hair);                          // short back
    if (hs === 1) { B(hm, 0, 1.3, -0.16, 0.135, 0.13, 0.03, hair); B(hm, 0.13, 1.33, -0.04, 0.02, 0.09, 0.07, hair); B(hm, -0.13, 1.33, -0.04, 0.02, 0.09, 0.07, hair); }
    if (hs === 2) B(hm, 0, 1.25, 0.05, 0.085, 0.05, 0.07, hair);                         // beard
  }
  // frozen ice block (same footprint as before)
  if (a.frozen > 0 && !a.dead) { BLD.box(null, gx, gh + 0.78, -gy, 0.4, 0.82, 0.4, 0xa8dcff, 0, 120); BLD.box(null, gx, gh + 0.78, -gy, 0.26, 0.7, 0.26, 0xe6f8ff, 0, 90); }
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
      if (p.kind === 'bolt') { // crossbow bolt: pale shaft, dragon head, green vanes
        DYN.box(m, 0, 0, -0.02, 0.014, 0.014, 0.2, 0xd8d8d0);
        mdTip(m, 0.18, 0.3, 0.03, 0xb82418);
        mdFin(m, -0.22, -0.13, 0.035, 0x50a838);
      } else { // arrow: wooden shaft, rune head, white vanes
        DYN.box(m, 0, 0, -0.02, 0.011, 0.011, 0.24, 0xc8a860);
        mdTip(m, 0.2, 0.32, 0.03, 0x4aa9be);
        mdFin(m, -0.26, -0.16, 0.04, 0xe8e8e0);
      }
    } else {
      const ice = p.kind === 'ice', c1 = ice ? 0x8fd8ff : 0xb01820, c2 = ice ? 0xf4fcff : 0xffa0a0;
      const pu = 1 + 0.12 * Math.sin(now / 60);
      BLD.blob(null, x, z, -y, 0.3 * pu, 0.3 * pu, 0.3 * pu, 8, 4, c1, 0, null, 60);     // outer glow
      BLD.blob(null, x, z, -y, 0.19 * pu, 0.19 * pu, 0.19 * pu, 7, 3, c1, 0, null, 140);  // inner glow
      if (ice) DYN.blob(M4.mul(M4.trans(x, z, -y), M4.rotY(now / 160)), 0, 0, 0, 0.13, 0.13, 0.13, 4, 2, c2); // spinning crystal
      else DYN.blob(null, x, z, -y, 0.11, 0.11, 0.11, 6, 3, c2);
      // trail
      for (let i = 1; i <= 3; i++) { const tt = Math.max(0, t - i * 0.05); BLD.box(null, lerp(sx, tp[0], tt), lerp(sz, tz, tt), -lerp(sy, tp[1], tt), 0.08 - i * 0.015, 0.08 - i * 0.015, 0.08 - i * 0.015, c1, 0, 140 - i * 35); }
    }
  }
  G.effects = G.effects.filter(e => now < e.t0 + e.dur);
  for (const e of G.effects) {
    const t = (now - e.t0) / e.dur; const gh = groundH(e.x, e.y);
    if (e.type === 'splash') { // ripple ring and falling droplets
      const rr = 0.18 + t * 0.5;
      BLD.blob(null, e.x, gh + 0.03, -e.y, rr, 0.025, rr, 8, 2, 0x9ad0ff, 0, null, 150 * (1 - t) | 0);
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * TAU + 0.4, r = 0.12 + t * (0.35 + (i % 3) * 0.1);
        const h = Math.sin(Math.min(1, t * 1.6) * Math.PI) * (0.3 + (i % 3) * 0.08);
        BLD.blob(null, e.x + Math.cos(ang) * r, gh + 0.12 + h, -(e.y + Math.sin(ang) * r), 0.055, 0.075, 0.055, 4, 2, 0xd4f0ff, 0, null, 230 * (1 - t) | 0);
      }
    } else { // ice spikes or blood droplets bursting out of the ground
      const ice = e.type === 'ice'; const c1 = ice ? 0xbfeaff : 0xd02020, c2 = ice ? 0xffffff : 0xff8080;
      const al = 230 * (1 - t * t) | 0, grow = Math.min(1, t * 3);
      for (let i = 0; i < 12; i++) {
        const ang = i / 12 * TAU + i * 0.5, r = 0.15 + t * 0.7 * (0.6 + (i % 3) * 0.25);
        const hh = (0.3 + (i % 4) * 0.12) * grow * (1 - t * 0.5);
        const bx = e.x + Math.cos(ang) * r, bz = -(e.y + Math.sin(ang) * r), s = 0.06 + (i % 3) * 0.025;
        if (ice) {
          const ap = [bx, gh + hh, bz], a0 = [bx - s, gh, bz - s], a1 = [bx + s, gh, bz - s], a2 = [bx + s, gh, bz + s], a3 = [bx - s, gh, bz + s];
          const c = i % 2 ? c1 : c2;
          BLD.tri(a0, a1, ap, c, true, null, al); BLD.tri(a1, a2, ap, c, true, null, al);
          BLD.tri(a2, a3, ap, c, true, null, al); BLD.tri(a3, a0, ap, c, true, null, al);
        } else {
          BLD.blob(null, bx, gh + hh, bz, s, s * 1.2, s, 4, 2, i % 2 ? c1 : c2, 0, null, al);
        }
      }
      BLD.blob(null, e.x, gh + 0.5 + t * 0.2, -e.y, 0.3 + t * 0.6, 0.35 + t * 0.4, 0.3 + t * 0.6, 8, 3, c1, 0, null, Math.max(0, 100 * (1 - t)) | 0);
    }
  }
}

/* ground drops: each category gets its own silhouette, lying flat on the tile */
function mdDrop(m, it, col) {
  const B = (cx, cy, cz, hx, hy, hz, c) => DYN.box(m, cx, cy, cz, hx, hy, hz, c);
  if (it.id === 'coins') {
    const hi = shadeCol(col, 1.2);
    for (const [sx, sz, n] of [[-0.14, -0.06, 3], [0.12, 0.1, 2]]) for (let i = 0; i < n; i++) mdFrustum(m, sx, i * 0.024, sz, 0.075, 0.075, i * 0.024 + 0.024, 0.075, 0.075, 6, i % 2 ? hi : col, true, false);
    return;
  }
  if (it.food) { // fish-like body with a tail fin
    const fm = M4.mul(m, M4.trans(0, 0.04, 0));
    DYN.blob(fm, 0, 0, 0, 0.055, 0.04, 0.13, 6, 2, col);
    mdPlate(M4.mul(fm, MD_BLADE), [[-0.12, 0], [-0.21, 0.07], [-0.19, 0], [-0.21, -0.07]], 0.01, col);
    return;
  }
  if (it.pot) { // vial: liquid body, glass neck and cork
    mdFrustum(m, 0, 0, 0, 0.05, 0.05, 0.09, 0.05, 0.05, 6, col, true, false);
    mdFrustum(m, 0, 0.09, 0, 0.03, 0.03, 0.14, 0.024, 0.024, 6, 0xd8e8f0, true, false);
    B(0, 0.155, 0, 0.026, 0.02, 0.026, 0xc8b07a);
    return;
  }
  if (it.id === 'bones') {
    const bc = 0xe8e0c8;
    mdRod(m, [-0.13, 0.03, -0.05], [0.12, 0.03, 0.05], 0.016, 0.016, 4, bc, false);
    mdRod(m, [0.05, 0.03, -0.13], [-0.05, 0.03, 0.1], 0.016, 0.016, 4, bc, false);
    for (const [x, z] of [[-0.13, -0.05], [0.12, 0.05], [0.05, -0.13], [-0.05, 0.1]]) DYN.blob(m, x, 0.03, z, 0.03, 0.03, 0.03, 4, 2, bc);
    return;
  }
  if (it.ammoType) { // loose arrows or bolts
    const shaft = it.ammoType === 'bolt' ? 0xd8d8d0 : 0xc8a860;
    for (const [ox, oz, ang] of [[-0.05, 0.04, 0.5], [0.05, -0.05, -0.8]]) {
      const am = M4.mul(M4.mul(m, M4.trans(ox, 0.025, oz)), M4.rotY(ang));
      mdRod(am, [0, 0, -0.14], [0, 0, 0.12], 0.01, 0.01, 4, shaft, false);
      mdTip(am, 0.12, 0.18, 0.02, col);
      mdFin(am, -0.14, -0.1, 0.03, 0xe8e8e0);
    }
    return;
  }
  if (it.slot === 'weapon' && it.model) { // laid flat, blade along the tile
    drawWeapon(M4.mul(M4.mul(M4.mul(m, M4.rotZ(Math.PI / 2)), M4.trans(0, 0, -0.3)), M4.scale(0.8, 0.8, 0.8)), it.model, it);
    return;
  }
  if (it.stack && !it.slot) { // runes: small flattened gems
    DYN.blob(m, 0, 0.03, 0, 0.055, 0.035, 0.055, 6, 3, col);
    DYN.blob(m, 0.015, 0.06, 0.012, 0.018, 0.012, 0.018, 4, 2, shadeCol(col, 1.35));
    return;
  }
  switch (it.slot) {
    case 'head':
      if (it.model === 'wizhat') { mdFrustum(m, 0, 0, 0, 0.13, 0.13, 0.02, 0.13, 0.13, 8, col, false, true); mdFrustum(m, 0, 0.02, 0, 0.1, 0.1, 0.2, 0.02, 0.02, 8, col, true, false); }
      else if (it.model === 'fullhelm') { DYN.blob(m, 0, 0.09, 0, 0.1, 0.09, 0.1, 6, 3, col); B(0, 0.08, 0.1, 0.07, 0.012, 0.01, 0x0a1a20); }
      else DYN.blob(m, 0, 0.03, 0, 0.1, 0.05, 0.1, 6, 2, col);
      return;
    case 'body':
      B(0, 0.03, 0, 0.12, 0.02, 0.09, col);
      mdRod(m, [-0.12, 0.05, 0], [-0.2, 0.03, 0.02], 0.035, 0.03, 4, col, false);
      mdRod(m, [0.12, 0.05, 0], [0.2, 0.03, 0.02], 0.035, 0.03, 4, col, false);
      return;
    case 'legs':
      B(-0.05, 0.03, 0, 0.04, 0.03, 0.1, col); B(0.05, 0.03, 0, 0.04, 0.03, 0.1, col);
      B(0, 0.065, 0, 0.1, 0.012, 0.03, shadeCol(col, 0.8));
      return;
    case 'hands':
      DYN.blob(m, -0.06, 0.03, 0, 0.04, 0.03, 0.045, 6, 2, col); DYN.blob(m, 0.06, 0.03, 0, 0.04, 0.03, 0.045, 6, 2, col);
      return;
    case 'feet':
      B(0, 0.04, 0, 0.06, 0.04, 0.08, col); DYN.blob(m, 0, 0.03, 0.1, 0.05, 0.04, 0.05, 6, 2, col);
      return;
    case 'shield':
      mdPlate(M4.mul(M4.mul(m, M4.rotX(-Math.PI / 2)), M4.scale(0.6, 0.6, 0.6)), MD_KITE, 0.02, col);
      return;
    case 'cape':
      B(0, 0.012, 0, 0.13, 0.012, 0.1, col); B(0.03, 0.026, 0, 0.05, 0.004, 0.1, shadeCol(col, 1.2));
      return;
    case 'neck':
      DYN.blob(m, 0, 0.02, 0, 0.04, 0.035, 0.03, 6, 2, col); DYN.blob(m, 0, 0.04, 0.02, 0.018, 0.018, 0.018, 4, 2, 0xe04030);
      return;
  }
  // unknown item: generic stack of boxes
  B(0, 0.065, 0, 0.21, 0.06, 0.13, shadeCol(col, 0.8)); B(0.03, 0.125, 0.01, 0.15, 0.05, 0.09, col); B(0.06, 0.19, 0.02, 0.06, 0.04, 0.05, shadeCol(col, 1.25));
}
function drawGround() {
  for (const g of G.ground) {
    const it = ITEMS[g.id]; if (!it) continue;
    const gh = groundH(g.x + 0.5, g.y + 0.5); const col = itemColor(g.id);
    const m = M4.mul(M4.trans(g.x + 0.5, gh + 0.02, -(g.y + 0.5)), M4.rotY((g.x * 7 + g.y * 3) % 6));
    mdDrop(m, it, col);
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
