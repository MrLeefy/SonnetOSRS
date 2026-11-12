/* character.js - rigged, skeletally animated fighters. One rig per stance (knight / rogue / mage ...),
   swapped instantly when the stance changes; rigs are pooled because rivals respawn constantly. */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Assets } from '../assets.js';
import { GB } from './geo.js';

/* which loose accessory nodes each model shows, and weapons attached to hand bones */
const CFG = {
  knight: { show: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'] },
  barbarian: { show: ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape'] },
  rogue: { show: ['2H_Crossbow', 'Rogue_Cape'] },
  mage: { show: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'] },
  sk_warrior: { show: ['Skeleton_Warrior_Helmet'], attach: { handslotr: 'Skeleton_Blade', handslotl: 'Skeleton_Shield_Large_A' } },
  sk_minion: { show: [], attach: { handslotr: 'Skeleton_Axe' } },
  sk_rogue: { show: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], attach: { handslotr: 'Skeleton_Crossbow' } },
  sk_mage: { show: ['Skeleton_Mage_Hat'], attach: { handslotr: 'Skeleton_Staff' } }
};
export const LOOKS = {
  hero: { melee: 'knight', ranged: 'rogue', magic: 'mage' },
  brute: { melee: 'barbarian', ranged: 'rogue', magic: 'mage' },
  sk_warrior: { melee: 'sk_warrior', ranged: 'sk_rogue', magic: 'sk_mage' },
  sk_minion: { melee: 'sk_minion', ranged: 'sk_rogue', magic: 'sk_mage' },
  sk_rogue: { melee: 'sk_minion', ranged: 'sk_rogue', magic: 'sk_mage' },
  sk_mage: { melee: 'sk_minion', ranged: 'sk_rogue', magic: 'sk_mage' },
  npc_mage: { melee: 'mage', ranged: 'mage', magic: 'mage' }, npc_barbarian: { melee: 'barbarian', ranged: 'barbarian', magic: 'barbarian' }, npc_rogue: { melee: 'rogue', ranged: 'rogue', magic: 'rogue' }
};
const WEAPON = { knight: '1H_Sword', barbarian: '1H_Axe', rogue: '2H_Crossbow', mage: '2H_Staff' };
const ONE = { // one-shot animations: clip choices, playback speed, repeats
  melee: { clips: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal'], ts: 1.35 },
  spin: { clips: ['2H_Melee_Attack_Spinning'], ts: 1.15, reps: 2 },
  ranged: { clips: ['2H_Ranged_Shoot'], ts: 1.25 },
  magic: { clips: ['Spellcast_Shoot'], ts: 1.15 },
  magicspec: { clips: ['Spellcast_Raise'], ts: 1.9 },
  eat: { clips: ['Use_Item'], ts: 1.7 },
  hurt: { clips: ['Hit_A', 'Hit_B'], ts: 1.5 },
  block: { clips: ['Block_Hit'], ts: 1.6 },
  cheer: { clips: ['Cheer'], ts: 1.1 },
  pickup: { clips: ['PickUp'], ts: 1.6 }
};
const SCALE = 0.62, pool = {}, WHITE = new THREE.Color(0xffffff);
const iceGeo = (() => {
  const g = new GB();
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + (i % 2) * 0.3, r = 0.42 + (i % 3) * 0.06; g.cone(0.13, 0.5 + (i % 3) * 0.22, 4, 0xbfeaff, { p: [Math.cos(a) * r, 0.24, Math.sin(a) * r], r: [Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35] }); }
  g.cyl(0.62, 0.7, 0.1, 8, 0xd9f4ff, { p: [0, 0.05, 0] });
  return g.build();
})();
const iceMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.8, roughness: 0.15, emissive: 0x2a6a9a, emissiveIntensity: 0.6 });

function makeRig(name) {
  const p = pool[name]; if (p && p.length) { const r = p.pop(); r.mixer.stopAllAction(); r.one = null; r.obj.visible = true; if (r.wmat) r.wmat.color.set(0xffffff); return r; }
  const obj = cloneSkinned(Assets.models[name]), cfg = CFG[name], mats = new Map(), bones = {}; let wmat = null;
  obj.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    if (!o.isSkinnedMesh && !cfg.show.includes(o.name)) { o.visible = false; return; }
    if (o.isSkinnedMesh) o.frustumCulled = false;
    if (o.name === WEAPON[name]) { wmat = o.material.clone(); o.material = wmat; return; }
    if (!mats.has(o.material)) mats.set(o.material, o.material.clone()); o.material = mats.get(o.material);
  });
  for (const b in cfg.attach || {}) {
    const w = Assets.env[cfg.attach[b]].clone(true);
    w.traverse(o => { if (o.isMesh) { if (!mats.has(o.material)) mats.set(o.material, o.material.clone()); o.material = mats.get(o.material); o.receiveShadow = false; } });
    w.position.set(0, 0, 0); if (bones[b]) bones[b].add(w);
  }
  obj.scale.setScalar(SCALE);
  return { name, obj, mixer: new THREE.AnimationMixer(obj), acts: {}, one: null, mats: Array.from(mats.values()).concat(wmat ? [wmat] : []), wmat };
}
function act(rig, clip) {
  let a = rig.acts[clip]; if (!a) { a = rig.acts[clip] = rig.mixer.clipAction(Assets.clips[clip]); }
  return a;
}

export class Character {
  constructor(look, scale = 1) {
    this.look = LOOKS[look] || LOOKS.hero; this.root = new THREE.Group(); this.inner = new THREE.Group(); this.root.add(this.inner); this.inner.scale.setScalar(scale); this.size = scale;
    this.rigs = {}; this.rig = null; this.stance = null;
    this.ice = new THREE.Mesh(iceGeo, iceMat); this.ice.visible = false; this.ice.scale.setScalar(scale); this.root.add(this.ice);
    this.move = 0; this.flash = 0; this.dead = 0; this.yaw = 0; this.age = 0; this.froz = 0; this.px = null; this.pz = 0; this.act = null; this.dying = false;
  }
  setStance(s) {
    if (this.stance === s) return; this.stance = s; const name = this.look[s];
    if (this.rig && this.rig.name === name) return;
    if (this.rig) this.rig.obj.visible = false;
    let r = this.rigs[name]; if (!r) { r = this.rigs[name] = makeRig(name); this.inner.add(r.obj); }
    r.obj.visible = true; r.mixer.stopAllAction(); r.one = null; this.act = null;
    r.idle = act(r, 'Idle'); r.run = act(r, 'Running_A'); r.idle.reset().play(); r.run.reset().play(); this.rig = r; if (this.tints) this.setGear(this.tints);
    if (this.dying) this.startDeath(true);
  }
  /* tint each stance's weapon by its gear tier colour; tints: { melee, ranged, magic } hex */
  setGear(tints) { this.tints = tints; for (const st in this.look) { const r = this.rigs[this.look[st]]; if (r && r.wmat && tints[st] !== undefined) r.wmat.color.set(tints[st]).lerp(WHITE, 0.25); } }
  /* type: melee | spin | ranged | magic | magicspec | eat | hurt | block | cheer | pickup */
  play(type) {
    const r = this.rig, d = ONE[type]; if (!r || !d || this.dying) return;
    if (r.one) r.one.a.stop();
    const clip = d.clips[(Math.random() * d.clips.length) | 0], a = act(r, clip), reps = d.reps || 1;
    a.reset(); a.setLoop(reps > 1 ? THREE.LoopRepeat : THREE.LoopOnce, reps); a.clampWhenFinished = true; a.timeScale = d.ts; a.play();
    r.one = { a, t: 0, dur: Assets.clips[clip].duration * reps / d.ts, type }; this.act = r.one;
  }
  startDeath(instant) {
    const r = this.rig; if (!r) return; if (r.one) r.one.a.stop();
    const a = act(r, Math.random() < 0.6 ? 'Death_A' : 'Death_B'); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1.2; a.play(); if (instant) a.time = a.getClip().duration;
    r.one = { a, t: 0, dur: 1e9, type: 'death' }; this.act = r.one;
  }
  dispose() {
    for (const k in this.rigs) { const r = this.rigs[k]; this.inner.remove(r.obj); r.mixer.stopAllAction(); for (const m of r.mats) m.emissive.setRGB(0, 0, 0); (pool[k] || (pool[k] = [])).push(r); }
    this.rigs = {}; this.rig = null;
  }
  /* s: { x, z, face, dead, frozen, stance } */
  update(dt, s) {
    this.age += dt; this.setStance(s.stance); const r = this.rig, root = this.root;
    let speed = 0; if (this.px !== null && dt > 0) speed = Math.hypot(s.x - this.px, s.z - this.pz) / dt; this.px = s.x; this.pz = s.z;
    root.position.x = s.x; root.position.z = s.z;
    let dy = s.face - this.yaw; dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; this.yaw += dy * (1 - Math.exp(-dt * 13)); root.rotation.y = this.yaw;
    const moving = speed > 0.4 && !s.dead; this.move += ((moving ? 1 : 0) - this.move) * (1 - Math.exp(-dt * 12));
    if (s.dead && !this.dying) { this.dying = true; this.dead = 0; this.startDeath(false); }
    if (!s.dead && this.dying) { this.dying = false; this.dead = 0; if (r.one) { r.one.a.stop(); r.one = null; this.act = null; } }
    // blend weights: one-shot envelope over the idle/run mix
    let w = 0; const o = r.one;
    if (o) {
      o.t += dt;
      if (o.type === 'death') w = 1;
      else if (o.t >= o.dur) { o.a.stop(); r.one = null; this.act = null; }
      else w = Math.min(1, o.t / 0.09, (o.dur - o.t) / 0.22);
      if (r.one) o.a.setEffectiveWeight(w);
    }
    r.idle.setEffectiveWeight((1 - this.move) * (1 - w)); r.run.setEffectiveWeight(this.move * (1 - w)); r.run.timeScale = Math.max(0.6, Math.min(1.8, speed / 2.6));
    r.mixer.update(dt);
    if (this.dying) { this.dead += dt; root.position.y = this.dead > 2.8 ? -(this.dead - 2.8) * 0.55 : 0; } else root.position.y = 0;
    // spawn pop-in, hit flash and freeze tint
    root.scale.setScalar(0.02 + 0.98 * Math.min(1, this.age / 0.3));
    this.flash = Math.max(0, this.flash - dt * 4.5); this.froz += ((s.frozen ? 1 : 0) - this.froz) * (1 - Math.exp(-dt * 12));
    const er = this.flash * 0.85 + this.froz * 0.03, eg = this.flash * 0.1 + this.froz * 0.2, eb = this.flash * 0.06 + this.froz * 0.42;
    for (const m of r.mats) m.emissive.setRGB(er, eg, eb);
    this.ice.visible = this.froz > 0.05; if (this.ice.visible) { this.ice.scale.setScalar(this.froz * this.size); this.ice.rotation.y = -this.yaw; }
  }
}
