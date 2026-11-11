/* character.js - articulated low-poly fighters with three gear sets and fully procedural animation */
import * as THREE from 'three';
import { GB, shade } from './geo.js';

const HIP = 0.8, BONES = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'];
const STEEL = 0xaab3be, STEEL_D = 0x69727e, GOLD = 0xd8b24a, LEATHER = 0x7c5630, LEATHER_D = 0x4a321c, BLADE = 0xe4ebf2;
const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.08 });
const iceGeo = (() => {
  const g = new GB();
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + (i % 2) * 0.3, r = 0.42 + (i % 3) * 0.06; g.cone(0.13, 0.5 + (i % 3) * 0.22, 4, 0xbfeaff, { p: [Math.cos(a) * r, 0.24, Math.sin(a) * r], r: [Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35] }); }
  g.cyl(0.62, 0.7, 0.12, 8, 0xd9f4ff, { p: [0, 0.06, 0] });
  return g.build();
})();
const iceMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.1, emissive: 0x2a6a9a, emissiveIntensity: 0.5 });

/* a thin box between two points in the local YZ plane (used for bow limbs) */
function seg(gb, y0, z0, y1, z1, th, color, x = 0) {
  const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
  gb.box(th, th, len, color, { p: [x, (y0 + y1) / 2, (z0 + z1) / 2], r: [-Math.atan2(dy, dz), 0, 0] });
}

function buildGear(stance, pal) {
  const b = {}; for (const k of BONES) b[k] = new GB();
  const skin = pal.skin, team = pal.team, teamD = shade(team, 0.6), hy = -0.31; // hy: hand height on forearm
  const hands = c => { for (const k of ['foreL', 'foreR']) b[k].box(0.11, 0.1, 0.11, c, { p: [0, hy, 0] }); };
  const face = () => {
    b.head.box(0.3, 0.3, 0.28, skin, { p: [0, 0.17, 0] });
    for (const s of [-1, 1]) b.head.box(0.045, 0.05, 0.02, 0x1a1410, { p: [s * 0.07, 0.2, 0.145] });
  };
  if (stance === 'melee') {
    // plate armour, crested helm, sword and shield
    b.head.box(0.34, 0.32, 0.33, STEEL, { p: [0, 0.18, 0], shade: 0.2 });
    b.head.box(0.24, 0.045, 0.02, 0x15171a, { p: [0, 0.21, 0.17] }); b.head.box(0.045, 0.16, 0.02, 0x15171a, { p: [0, 0.13, 0.17] });
    b.head.box(0.06, 0.13, 0.36, team, { p: [0, 0.4, -0.02] });
    b.torso.box(0.5, 0.34, 0.31, STEEL, { p: [0, 0.37, 0], shade: 0.2 }); b.torso.box(0.42, 0.22, 0.26, STEEL_D, { p: [0, 0.11, 0] });
    b.torso.box(0.2, 0.5, 0.03, team, { p: [0, 0.27, 0.16] }); b.torso.box(0.46, 0.06, 0.29, GOLD, { p: [0, 0.03, 0] });
    b.torso.box(0.44, 0.7, 0.03, teamD, { p: [0, 0.16, -0.19], r: [0.14, 0, 0] });
    for (const [k, s] of [['armL', 1], ['armR', -1]]) { b[k].ball(0.15, STEEL, { p: [s * 0.02, 0.0, 0], s: [1.1, 0.85, 1.1] }); b[k].box(0.13, 0.26, 0.13, STEEL_D, { p: [0, -0.15, 0] }); }
    for (const k of ['foreL', 'foreR']) b[k].box(0.14, 0.24, 0.14, STEEL, { p: [0, -0.13, 0], shade: 0.2 });
    hands(STEEL_D);
    for (const k of ['legL', 'legR']) { b[k].box(0.18, 0.4, 0.19, STEEL_D, { p: [0, -0.19, 0] }); b[k].box(0.2, 0.2, 0.05, STEEL, { p: [0, -0.1, 0.1] }); }
    for (const k of ['shinL', 'shinR']) { b[k].box(0.17, 0.36, 0.18, STEEL, { p: [0, -0.18, 0], shade: 0.25 }); b[k].box(0.14, 0.1, 0.06, STEEL, { p: [0, 0.0, 0.1] }); b[k].box(0.17, 0.1, 0.28, STEEL_D, { p: [0, -0.37, 0.04] }); }
    b.foreR.box(0.045, 0.045, 0.2, LEATHER_D, { p: [0, hy, 0.02] }); b.foreR.box(0.24, 0.05, 0.05, GOLD, { p: [0, hy, 0.13] });
    b.foreR.box(0.08, 0.028, 0.72, BLADE, { p: [0, hy, 0.51] }); b.foreR.cone(0.04, 0.12, 4, BLADE, { p: [0, hy, 0.93], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.35] });
    b.foreR.ball(0.04, GOLD, { p: [0, hy, -0.1] });
    b.foreL.cyl(0.3, 0.3, 0.05, 8, STEEL_D, { p: [0.1, -0.18, 0], r: [0, 0, Math.PI / 2] });
    b.foreL.cyl(0.24, 0.24, 0.06, 8, team, { p: [0.115, -0.18, 0], r: [0, 0, Math.PI / 2] }); b.foreL.ball(0.07, GOLD, { p: [0.15, -0.18, 0] });
  } else if (stance === 'ranged') {
    // hooded leathers, quiver and longbow
    face();
    b.head.box(0.35, 0.16, 0.34, team, { p: [0, 0.3, -0.01] }); b.head.box(0.35, 0.3, 0.1, team, { p: [0, 0.17, -0.13] });
    for (const s of [-1, 1]) b.head.box(0.04, 0.26, 0.26, team, { p: [s * 0.165, 0.19, -0.02] });
    b.torso.box(0.46, 0.52, 0.27, LEATHER, { p: [0, 0.27, 0], shade: 0.25 }); b.torso.box(0.48, 0.07, 0.29, LEATHER_D, { p: [0, 0.05, 0] });
    b.torso.box(0.09, 0.62, 0.3, teamD, { p: [0, 0.27, 0], r: [0, 0, 0.7] }); b.torso.box(0.5, 0.1, 0.3, team, { p: [0, 0.5, 0] });
    b.torso.cyl(0.075, 0.06, 0.46, 6, LEATHER_D, { p: [-0.1, 0.34, -0.19], r: [0, 0, 0.45] });
    for (let i = 0; i < 3; i++) b.torso.box(0.03, 0.12, 0.03, 0xe8e2d0, { p: [-0.21 + i * 0.03, 0.6 + i * 0.01, -0.19 + (i - 1) * 0.03], r: [0, 0, 0.45] });
    for (const k of ['armL', 'armR']) b[k].box(0.13, 0.3, 0.13, team, { p: [0, -0.13, 0] });
    for (const k of ['foreL', 'foreR']) b[k].box(0.125, 0.24, 0.125, LEATHER_D, { p: [0, -0.13, 0] });
    hands(skin);
    for (const k of ['legL', 'legR']) b[k].box(0.17, 0.4, 0.18, 0x403c35, { p: [0, -0.19, 0] });
    for (const k of ['shinL', 'shinR']) { b[k].box(0.16, 0.38, 0.17, LEATHER, { p: [0, -0.19, 0], shade: 0.3 }); b[k].box(0.16, 0.09, 0.27, LEATHER_D, { p: [0, -0.375, 0.04] }); }
    const pts = [[0, 0], [0.04, 0.22], [0.13, 0.44], [0.27, 0.6]];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) seg(b.foreL, hy + pts[i][0], s * pts[i][1], hy + pts[i + 1][0], s * pts[i + 1][1], 0.045 - i * 0.008, i ? 0x9a6a34 : LEATHER_D);
    b.foreL.box(0.012, 0.012, 1.2, 0xf0ead8, { p: [0, hy + 0.27, 0] });
  } else {
    // robes, pointed hat and crystal staff
    face();
    b.head.cyl(0.29, 0.29, 0.035, 8, teamD, { p: [0, 0.33, 0] }); b.head.cone(0.19, 0.46, 6, team, { p: [0, 0.56, -0.03], r: [-0.2, 0, 0] }); b.head.cyl(0.2, 0.2, 0.05, 8, GOLD, { p: [0, 0.36, 0] });
    b.head.box(0.2, 0.12, 0.06, pal.hair, { p: [0, 0.04, 0.13] });
    b.torso.box(0.46, 0.54, 0.28, team, { p: [0, 0.27, 0], shade: 0.3 }); b.torso.box(0.08, 0.54, 0.02, GOLD, { p: [0, 0.27, 0.15] });
    b.torso.box(0.48, 0.07, 0.3, GOLD, { p: [0, 0.07, 0] }); b.torso.box(0.52, 0.09, 0.3, teamD, { p: [0, 0.5, 0] });
    for (const k of ['armL', 'armR']) b[k].box(0.15, 0.3, 0.15, team, { p: [0, -0.13, 0] });
    for (const k of ['foreL', 'foreR']) { b[k].box(0.18, 0.24, 0.18, teamD, { p: [0, -0.14, 0] }); b[k].box(0.19, 0.04, 0.19, GOLD, { p: [0, -0.25, 0] }); }
    hands(skin);
    for (const k of ['legL', 'legR']) b[k].box(0.24, 0.44, 0.28, team, { p: [0, -0.2, 0], shade: 0.3 });
    for (const k of ['shinL', 'shinR']) { b[k].box(0.24, 0.3, 0.27, teamD, { p: [0, -0.13, 0] }); b[k].box(0.14, 0.1, 0.25, 0x2a2420, { p: [0, -0.37, 0.04] }); }
    b.foreR.cyl(0.028, 0.028, 1.7, 5, 0x5a3c22, { p: [0, hy, 0.3], r: [Math.PI / 2, 0, 0] });
    b.foreR.ball(0.11, 0x8fe9ff, { p: [0, hy, 1.24], s: [1, 1, 1.4] });
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; b.foreR.box(0.03, 0.03, 0.22, GOLD, { p: [Math.cos(a) * 0.09, hy + Math.sin(a) * 0.09, 1.16] }); }
  }
  if (stance !== 'melee' && stance !== 'magic') b.head.box(0.24, 0.05, 0.05, pal.hair, { p: [0, 0.3, 0.15] });
  const out = {}; for (const k of BONES) out[k] = b[k].build(); return out;
}

const sm = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const ACT_DUR = { melee: 0.6, ranged: 0.75, magic: 0.8, eat: 0.7, hurt: 0.32, spin: 0.7 };

export class Character {
  constructor(pal) {
    this.mat = baseMat.clone(); this.root = new THREE.Group();
    const G = () => new THREE.Group();
    const body = this.body = G(); body.position.y = HIP; this.root.add(body);
    const t = this.torso = G(); body.add(t);
    this.head = G(); this.head.position.y = 0.56; t.add(this.head);
    this.armL = G(); this.armL.position.set(0.3, 0.46, 0); this.armR = G(); this.armR.position.set(-0.3, 0.46, 0); t.add(this.armL, this.armR);
    this.foreL = G(); this.foreL.position.y = -0.27; this.armL.add(this.foreL); this.foreR = G(); this.foreR.position.y = -0.27; this.armR.add(this.foreR);
    this.legL = G(); this.legL.position.x = 0.115; this.legR = G(); this.legR.position.x = -0.115; body.add(this.legL, this.legR);
    this.shinL = G(); this.shinL.position.y = -0.38; this.legL.add(this.shinL); this.shinR = G(); this.shinR.position.y = -0.38; this.legR.add(this.shinR);
    this.sets = {};
    for (const st of ['melee', 'ranged', 'magic']) {
      const geos = buildGear(st, pal), set = this.sets[st] = [];
      for (const k of BONES) { const m = new THREE.Mesh(geos[k], this.mat); m.castShadow = true; m.visible = false; this[k].add(m); set.push(m); }
    }
    this.ice = new THREE.Mesh(iceGeo, iceMat); this.ice.visible = false; this.root.add(this.ice);
    this.stance = null; this.phase = Math.random() * 6; this.move = 0; this.act = null; this.flash = 0; this.dead = 0; this.yaw = 0; this.age = 0; this.t = Math.random() * 10; this.froz = 0;
    this.px = null; this.pz = 0; this.pose = {};
  }
  setStance(s) { if (this.stance === s) return; if (this.stance) for (const m of this.sets[this.stance]) m.visible = false; for (const m of this.sets[s]) m.visible = true; this.stance = s; }
  play(type) { this.act = { type, t: 0, dur: ACT_DUR[type] || 0.5 }; }
  dispose() { for (const k in this.sets) for (const m of this.sets[k]) m.geometry.dispose(); this.mat.dispose(); }
  /* s: { x, z, face, dead, frozen, stance } */
  update(dt, s) {
    this.t += dt; this.age += dt; this.setStance(s.stance);
    const r = this.root, k = 1 - Math.exp(-dt * 16);
    let speed = 0; if (this.px !== null && dt > 0) speed = Math.hypot(s.x - this.px, s.z - this.pz) / dt; this.px = s.x; this.pz = s.z;
    r.position.x = s.x; r.position.z = s.z;
    let dy = s.face - this.yaw; dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; this.yaw += dy * (1 - Math.exp(-dt * 13));
    const moving = speed > 0.4 && !s.dead; this.move += ((moving ? 1 : 0) - this.move) * (1 - Math.exp(-dt * 10));
    if (moving) this.phase += dt * Math.min(speed, 5) * 2.9;
    const m = this.move, ph = this.phase, sw = Math.sin(ph), br = Math.sin(this.t * 1.9);
    // ---- base pose: locomotion + idle breathing ----
    const P = {
      by: HIP - 0.03 * m + Math.abs(Math.cos(ph)) * 0.06 * m + br * 0.006, bz: 0, bx: 0.2 * m, spin: 0,
      ty: sw * 0.18 * m, tx: br * 0.015, hx: 0, hy: 0,
      aLx: -sw * 0.75 * m + br * 0.02, aLy: 0, aLz: 0.06, fL: -0.25 - 0.55 * m,
      aRx: sw * 0.75 * m - br * 0.02, aRy: 0, aRz: -0.06, fR: -0.25 - 0.55 * m,
      lL: sw * 0.9 * m, lR: -sw * 0.9 * m, sL: m * (0.2 + 0.95 * Math.max(0, Math.sin(ph - 1.9))), sR: m * (0.2 + 0.95 * Math.max(0, Math.sin(ph - 1.9 + Math.PI)))
    };
    // ---- how each stance carries its weapon ----
    if (s.stance === 'melee') { P.aRx = -0.3 + sw * 0.3 * m; P.fR = -0.95; P.aRz = -0.18; P.aLx = -0.55; P.aLy = -0.75; P.fL = -1.05; }
    else if (s.stance === 'ranged') { P.aLx = -0.5 - sw * 0.25 * m; P.fL = -0.55; P.aLz = 0.12; }
    else { P.aRx = -0.12 + sw * 0.12 * m; P.fR = -1.38; P.aRz = -0.1; }
    // ---- one-shot actions ----
    const a = this.act;
    if (a && !s.dead) {
      a.t += dt; const p = a.t / a.dur;
      if (p >= 1) this.act = null;
      else if (a.type === 'melee' || a.type === 'spin') {
        const w = sm(p / 0.3), st = sm((p - 0.3) / 0.22), rc = sm((p - 0.62) / 0.38);
        P.aRx = mix(mix(mix(P.aRx, -2.6, w), -0.35, st), P.aRx, rc); P.fR = mix(mix(mix(P.fR, -1.35, w), -0.1, st), P.fR, rc);
        P.aRz = mix(mix(mix(P.aRz, -0.55, w), 0.35, st), P.aRz, rc);
        P.ty = mix(mix(mix(P.ty, -0.6, w), 0.75, st), P.ty, rc); P.bx += 0.28 * st * (1 - rc); P.bz = 0.22 * st * (1 - rc);
        P.lL = mix(P.lL, -0.5, st * (1 - rc)); P.lR = mix(P.lR, 0.45, st * (1 - rc));
        if (a.type === 'spin') P.spin = sm(p / 0.8) * Math.PI * 2;
      } else if (a.type === 'ranged') {
        const d = sm(p / 0.3), rel = sm((p - 0.55) / 0.08), rc = sm((p - 0.7) / 0.3), aim = d * (1 - rc);
        P.aLx = mix(P.aLx, -1.5, aim); P.fL = mix(P.fL, -0.08, aim); P.aLz = mix(P.aLz, -0.12, aim);
        P.aRx = mix(P.aRx, -1.45, aim); P.fR = mix(P.fR, mix(-2.25, -0.9, rel), aim); P.aRz = mix(P.aRz, 0.25, aim);
        P.ty = mix(P.ty, -0.28, aim); P.hy = 0.2 * aim; P.bx = mix(P.bx, -0.05, aim);
      } else if (a.type === 'magic') {
        const w = sm(p / 0.4), st = sm((p - 0.42) / 0.14), rc = sm((p - 0.68) / 0.32);
        P.aRx = mix(mix(mix(P.aRx, -2.75, w), -1.35, st), P.aRx, rc); P.fR = mix(mix(mix(P.fR, -0.3, w), -0.2, st), P.fR, rc);
        P.aLx = mix(mix(mix(P.aLx, -2.5, w), -1.45, st), P.aLx, rc); P.fL = mix(mix(mix(P.fL, -0.5, w), -0.1, st), P.fL, rc); P.aLz = mix(P.aLz, 0.3, w * (1 - rc));
        P.tx += -0.2 * w * (1 - st) + 0.25 * st * (1 - rc); P.by += 0.08 * w * (1 - st);
      } else if (a.type === 'eat') {
        const e = Math.sin(Math.min(1, p) * Math.PI); const arm = s.stance === 'ranged' ? 'R' : 'L';
        P['a' + arm + 'x'] = mix(P['a' + arm + 'x'], -1.15, e); P['f' + arm] = mix(P['f' + arm], -2.15, e); P['a' + arm + 'y'] = mix(P['a' + arm + 'y'], arm === 'L' ? -0.5 : 0.5, e); P.hx = 0.18 * e;
      } else if (a.type === 'hurt') { const e = Math.sin(p * Math.PI); P.tx -= 0.32 * e; P.hx -= 0.25 * e; P.bz -= 0.08 * e; }
    }
    // ---- death: topple backwards, then sink away ----
    if (s.dead) {
      this.dead += dt; const d = sm(this.dead / 0.55);
      P.bx = -1.5 * d; P.by = mix(HIP, 0.2, d * d); P.aLz = 1.2 * d; P.aRz = -1.2 * d; P.aLx = -0.4 * d; P.aRx = -0.3 * d; P.lL = 0.25 * d; P.lR = -0.2 * d; P.sL = 0.3 * d; P.sR = 0.1; P.ty = 0.2 * d; P.hx = -0.3 * d; P.fL = -0.4; P.fR = -0.6;
      r.position.y = this.dead > 2.6 ? -(this.dead - 2.6) * 0.5 : 0;
    } else { this.dead = 0; r.position.y = 0; }
    // ---- apply (smoothed) ----
    const q = this.pose, f = s.dead || (a && a.type !== 'eat') ? 1 - Math.exp(-dt * 30) : k;
    for (const key in P) q[key] = q[key] === undefined ? P[key] : q[key] + (P[key] - q[key]) * f;
    q.spin = P.spin;
    r.rotation.y = this.yaw + q.spin;
    this.body.position.set(0, q.by, q.bz); this.body.rotation.x = q.bx;
    this.torso.rotation.set(q.tx, q.ty, 0); this.head.rotation.set(q.hx, q.hy - q.ty * 0.6, 0);
    this.armL.rotation.set(q.aLx, q.aLy, q.aLz); this.armR.rotation.set(q.aRx, q.aRy, q.aRz);
    this.foreL.rotation.x = q.fL; this.foreR.rotation.x = q.fR;
    this.legL.rotation.x = -q.lL - q.bx * 0.6; this.legR.rotation.x = -q.lR - q.bx * 0.6; this.shinL.rotation.x = q.sL; this.shinR.rotation.x = q.sR;
    // spawn pop-in, hit flash and freeze tint
    const sc = Math.min(1, this.age / 0.35); r.scale.setScalar(0.02 + 0.98 * sm(sc));
    this.flash = Math.max(0, this.flash - dt * 4.5); this.froz += ((s.frozen ? 1 : 0) - this.froz) * (1 - Math.exp(-dt * 12));
    this.mat.emissive.setRGB(this.flash * 0.9 + this.froz * 0.05, this.flash * 0.12 + this.froz * 0.25, this.flash * 0.08 + this.froz * 0.5);
    this.ice.visible = this.froz > 0.05; if (this.ice.visible) { this.ice.scale.setScalar(this.froz); this.ice.rotation.y = -r.rotation.y; }
  }
}
