/* sim.js - the tick-based game simulation. No rendering in here: it emits events that the
   renderer, HUD and audio listen to, so it can also run headless (see tools/simtest.mjs). */
import {
  STYLES, ACC, SPECIALS, WARD_REDUCE, DEADEYE_WARD_REDUCE, MAX_HP, FOOD_HEAL, FOOD_MAX, FOOD_START,
  TONIC_FOCUS, TONIC_MAX, TONIC_START, EAT_DELAY, DIFFICULTY, ARCHETYPES, BOT_NAMES, SKIN, HAIR, TEAM,
  rint, pick, chance, clamp, lerp
} from './data.js';
import { C, passable, canStep, hasLoS, findPath, cheb, randomFreeTile, DIRS } from './world.js';
import { botThink } from './ai.js';

let NEXT_ID = 1;

export class Game {
  constructor(opts = {}) {
    this.diffId = opts.difficulty || 'normal'; this.diff = DIFFICULTY[this.diffId];
    this.tick = 0; this.actors = []; this.hitQ = []; this.loot = []; this.listeners = [];
    this.player = null; this.usedNames = new Set();
    this.stats = { kills: 0, streak: 0, best: 0, deaths: 0, score: 0, dmgDealt: 0 };
    if (!opts.spectate) this.player = this.spawnActor({ name: opts.name || 'You', isPlayer: true, palette: { skin: SKIN[0], hair: HAIR[1], team: 0xe8c14a } });
    for (let i = 0; i < this.diff.bots; i++) this.spawnBot();
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, d) { for (const fn of this.listeners) fn(type, d || {}); }

  /* ---------------- actors ---------------- */
  spawnActor(o) {
    const a = {
      id: NEXT_ID++, name: o.name, isPlayer: !!o.isPlayer, palette: o.palette, arch: o.arch || null,
      x: 0, y: 0, seg: [], path: [], face: 0,
      hp: MAX_HP, maxHp: MAX_HP, focus: 100, spec: o.isPlayer ? 100 : 50, stance: 'melee', ward: null,
      target: null, atkCd: 0, eatCd: 0, frozen: 0, freezeImm: 0, dead: false, deadAt: 0, specArmed: false,
      food: o.isPlayer ? FOOD_START : 3 + rint(4), tonics: o.isPlayer ? TONIC_START : 1 + rint(2),
      protectUntil: 0, dmgFrom: new Map(), lastAttacker: null, lastHurtTick: -99, lastAtkTick: -99, kills: 0, ai: null, moving: false
    };
    this.placeAtSpawn(a); this.actors.push(a); return a;
  }
  placeAtSpawn(a) {
    let sp = null;
    for (let i = 0; i < 40; i++) {
      const c = a.isPlayer ? randomFreeTile(8, 13) : randomFreeTile(9, 19);
      const near = this.actors.some(o => o !== a && !o.dead && cheb(o.x, o.y, c.x, c.y) < (a.isPlayer ? 7 : 5));
      if (!near || i === 39) { sp = c; break; }
    }
    a.x = sp.x; a.y = sp.y; a.seg = []; a.path = []; a.face = Math.atan2(C - a.x, C - a.y);
    a.protectUntil = this.tick + (a.isPlayer ? 8 : 3);
  }
  spawnBot() {
    let name; for (let i = 0; i < 50; i++) { name = pick(BOT_NAMES); if (!this.usedNames.has(name)) break; }
    this.usedNames.add(name);
    const pool = []; for (const k in ARCHETYPES) for (let i = 0; i < ARCHETYPES[k].w; i++) pool.push(k);
    const arch = pick(pool);
    const a = this.spawnActor({ name, arch, palette: { skin: pick(SKIN), hair: pick(HAIR), team: pick(TEAM) } });
    const streak = this.stats.streak;
    a.ai = { skill: clamp(this.diff.skill + (Math.random() - 0.5) * 0.25 + streak * 0.03, 0.1, 0.97), react: 0, retarget: rint(4), wander: rint(5), kiteCd: 0, flee: 0, restance: 0 };
    a.stance = ARCHETYPES[arch].stances[0];
    this.emit('spawn', { a });
    return a;
  }

  /* ---------------- player commands (applied immediately, resolved on the next tick) ---------------- */
  cmdMove(x, y) {
    const p = this.player; if (p.dead) return false;
    p.target = null;
    const path = findPath(p.x, p.y, (px, py) => px === x && py === y, x, y);
    p.path = path; return path.length > 0;
  }
  cmdAttack(t) { const p = this.player; if (p.dead || !t || t.dead || t === p) return; p.target = t; p.path = []; }
  setStance(a, s) {
    if (a.dead || a.stance === s) return; a.stance = s; a.specArmed = false; a.path = a.target ? [] : a.path;
    this.emit('stance', { a });
  }
  setWard(a, w) {
    if (a.dead) return; if (w && a.focus <= 0) { if (a.isPlayer) this.emit('msg', { text: 'Out of focus - drink a tonic.' }); return; }
    a.ward = a.ward === w ? null : w; this.emit('ward', { a });
  }
  eat(a) {
    if (a.dead || a.eatCd > 0 || a.food <= 0 || a.hp >= a.maxHp) return false;
    a.food--; a.hp = Math.min(a.maxHp, a.hp + FOOD_HEAL); a.eatCd = EAT_DELAY; a.atkCd = Math.max(a.atkCd, 2);
    this.emit('eat', { a, heal: FOOD_HEAL }); return true;
  }
  tonic(a) {
    if (a.dead || a.eatCd > 0 || a.tonics <= 0 || a.focus >= 100) return false;
    a.tonics--; a.focus = Math.min(100, a.focus + TONIC_FOCUS); a.eatCd = EAT_DELAY;
    this.emit('tonic', { a }); return true;
  }
  toggleSpec(a) {
    if (a.dead) return; const sp = SPECIALS[a.stance];
    if (!a.specArmed && a.spec < sp.cost) { if (a.isPlayer) this.emit('msg', { text: 'Not enough special energy.' }); return; }
    a.specArmed = !a.specArmed; this.emit('spec', { a });
  }
  respawnPlayer() {
    const p = this.player; if (!p.dead) return;
    Object.assign(p, { dead: false, hp: p.maxHp, focus: 100, spec: 100, food: FOOD_START, tonics: TONIC_START, ward: null, target: null, frozen: 0, freezeImm: 0, atkCd: 0, eatCd: 0, specArmed: false, lastAttacker: null });
    p.dmgFrom.clear(); this.placeAtSpawn(p); this.emit('spawn', { a: p });
  }

  /* ---------------- combat ---------------- */
  inRange(a, t, x = a.x, y = a.y) {
    const d = cheb(x, y, t.x, t.y); if (d === 0) return false;
    return d <= STYLES[a.stance].range && hasLoS(x, y, t.x, t.y);
  }
  attack(a, t) {
    const style = a.stance, S = STYLES[style]; let spec = null;
    if (a.specArmed) { a.specArmed = false; if (a.spec >= SPECIALS[style].cost) { a.spec -= SPECIALS[style].cost; spec = style; } }
    a.atkCd = S.speed; a.lastAtkTick = this.tick; a.face = Math.atan2(t.x - a.x, t.y - a.y); a.path = [];
    const dist = cheb(a.x, a.y, t.x, t.y);
    const delay = style === 'melee' ? 0 : 1 + Math.floor(dist / 4);
    const mul = a.isPlayer ? 1 : this.diff.dmg;
    const roll = (accBonus, maxMul, minFrac = 0) => {
      const acc = Math.min(1, ACC[style][t.stance] + accBonus);
      if (!chance(acc)) return 0;
      const max = S.max * maxMul * mul; return Math.max(1, Math.round(lerp(minFrac * max, max, Math.random())));
    };
    const hits = [];
    if (spec === 'melee') { hits.push({ t, dmg: roll(0.2, 0.95) }, { t, dmg: roll(0.2, 0.95), late: true }); }
    else if (spec === 'ranged') { hits.push({ t, dmg: roll(1, 1.3, 0.4), pierce: true }); }
    else if (spec === 'magic') {
      hits.push({ t, dmg: roll(0.2, 1.25, 0.3), freeze: 12, force: true });
      for (const o of this.actors) if (o !== t && o !== a && !o.dead && cheb(o.x, o.y, t.x, t.y) <= 1) hits.push({ t: o, dmg: Math.round(roll(0, 0.6)), freeze: 8, force: true, splash: true });
    } else hits.push({ t, dmg: roll(0, 1), freeze: S.freeze || 0 });
    this.emit('attack', { a, t, style, spec, delay });
    for (const h of hits) { h.src = a; h.style = style; h.spec = spec; h.at = this.tick + delay; if (delay <= 0) this.applyHit(h); else this.hitQ.push(h); }
    if (t.ai && !t.target) t.target = a;
  }
  applyHit(h) {
    const t = h.t, src = h.src; if (t.dead) return;
    let dmg = h.dmg, warded = false;
    if (this.tick < t.protectUntil) dmg = 0;
    if (dmg > 0 && t.ward === h.style) { warded = true; dmg = Math.max(1, Math.round(dmg * (1 - (h.pierce ? DEADEYE_WARD_REDUCE : WARD_REDUCE)))); }
    dmg = Math.min(dmg, t.hp);
    let froze = false;
    if (h.freeze && dmg > 0 && (h.force || (t.frozen <= 0 && t.freezeImm <= 0))) { t.frozen = h.freeze; t.freezeImm = h.freeze + 6; t.path = []; froze = true; }
    t.hp -= dmg; t.lastHurtTick = this.tick; t.lastAttacker = src;
    if (t.isPlayer && !t.target && !t.path.length && !src.dead) t.target = src;   // auto-retaliate when idle
    t.dmgFrom.set(src.id, (t.dmgFrom.get(src.id) || 0) + dmg);
    if (src.isPlayer) this.stats.dmgDealt += dmg;
    this.emit('hit', { t, src, dmg, style: h.style, spec: h.spec, warded, froze, late: !!h.late, splash: !!h.splash });
    if (t.hp <= 0) this.kill(t, src);
  }
  kill(d, lastHitter) {
    // credit goes to whoever dealt the most damage
    let killer = lastHitter, top = -1;
    for (const [id, dmg] of d.dmgFrom) { const o = this.actors.find(x => x.id === id); if (o && !o.dead && dmg > top) { top = dmg; killer = o; } }
    d.dead = true; d.deadAt = this.tick; d.hp = 0; d.target = null; d.path = []; d.ward = null; d.frozen = 0; d.specArmed = false;
    for (const o of this.actors) if (o.target === d) o.target = null;
    if (killer && killer !== d) {
      killer.kills++; killer.spec = Math.min(100, killer.spec + 30); killer.hp = Math.min(killer.maxHp, killer.hp + 15);
      if (killer.isPlayer) {
        const s = this.stats; s.kills++; s.streak++; s.best = Math.max(s.best, s.streak); s.score += 100 * Math.min(5, s.streak);
      }
    }
    if (d.isPlayer) { this.stats.deaths++; this.stats.lastStreak = this.stats.streak; this.stats.streak = 0; }
    this.loot.push({ id: NEXT_ID++, x: d.x, y: d.y, t: this.tick, food: 4, tonics: 1 });
    this.emit('death', { a: d, killer });
    this.emit('loot', {});
  }

  /* ---------------- per-tick ---------------- */
  moveAlong(a, stopFn) {
    a.seg = [{ x: a.x, y: a.y }]; a.moving = false;
    if (a.frozen > 0) { a.path = a.frozen > 0 && a.isPlayer ? a.path : []; return; }
    for (let s = 0; s < 2 && a.path.length; s++) {
      if (stopFn && stopFn()) { a.path = []; break; }
      const n = a.path[0], dx = n.x - a.x, dy = n.y - a.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || !canStep(a.x, a.y, dx, dy)) { a.path = []; break; }
      a.path.shift(); a.x = n.x; a.y = n.y; a.face = Math.atan2(dx, dy); a.seg.push({ x: a.x, y: a.y }); a.moving = true;
    }
  }
  stepActor(a) {
    if (a.dead) { a.seg = [{ x: a.x, y: a.y }]; return; }
    if (a.atkCd > 0) a.atkCd--; if (a.eatCd > 0) a.eatCd--;
    if (a.frozen > 0) { a.frozen--; if (a.frozen === 0) this.emit('thaw', { a }); }
    if (a.freezeImm > 0) a.freezeImm--;
    if (a.spec < 100 && this.tick % 2 === 0) a.spec = Math.min(100, a.spec + 1);
    if (a.ward) { a.focus -= 1; if (a.focus <= 0) { a.focus = 0; a.ward = null; this.emit('ward', { a }); if (a.isPlayer) this.emit('msg', { text: 'Your focus is spent - your ward drops.' }); } }
    else if (a.focus < 100 && this.tick % 4 === 0) a.focus++;
    if (a.ai) botThink(this, a);
    const t = a.target;
    if (t && !t.dead) {
      const d = cheb(a.x, a.y, t.x, t.y);
      if (d === 0 && a.frozen <= 0) { // standing on top of the target: step off
        for (const [dx, dy] of DIRS) if (canStep(a.x, a.y, dx, dy)) { a.path = [{ x: a.x + dx, y: a.y + dy }]; break; }
      } else if (!this.inRange(a, t) && a.frozen <= 0 && !(a.ai && a.ai.holdPath)) {
        a.path = findPath(a.x, a.y, (x, y) => this.inRange(a, t, x, y), t.x, t.y);
      } else if (this.inRange(a, t) && !(a.ai && a.ai.holdPath)) a.path = [];
      this.moveAlong(a, () => this.inRange(a, t) && !(a.ai && a.ai.holdPath));
      if (this.inRange(a, t)) {
        if (!a.moving) a.face = Math.atan2(t.x - a.x, t.y - a.y);
        if (a.atkCd <= 0 && this.tick >= t.protectUntil) { if (a.protectUntil > this.tick) a.protectUntil = this.tick; this.attack(a, t); }
      }
    } else { a.target = null; this.moveAlong(a); }
    if (a.ai) a.ai.holdPath = false;
    // loot pickup
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      if (l.x === a.x && l.y === a.y) {
        a.food = Math.min(FOOD_MAX, a.food + l.food); a.tonics = Math.min(TONIC_MAX, a.tonics + l.tonics); a.spec = Math.min(100, a.spec + 20);
        this.loot.splice(i, 1); this.emit('pickup', { a, x: l.x, y: l.y }); this.emit('loot', {});
      }
    }
  }
  step() {
    this.tick++;
    if (this.hitQ.length) {
      const due = this.hitQ.filter(h => h.at <= this.tick); this.hitQ = this.hitQ.filter(h => h.at > this.tick);
      for (const h of due) this.applyHit(h);
    }
    for (const a of this.actors.slice()) this.stepActor(a);
    // fallen bots are replaced by fresh challengers
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.dead && !a.isPlayer && this.tick - a.deadAt >= 7) { this.actors.splice(i, 1); this.usedNames.delete(a.name); this.emit('remove', { a }); this.spawnBot(); }
    }
    const n = this.loot.length; this.loot = this.loot.filter(l => this.tick - l.t < 100); if (this.loot.length !== n) this.emit('loot', {});
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
