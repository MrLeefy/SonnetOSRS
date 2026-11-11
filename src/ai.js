/* ai.js - bot brains. Bots read their target's stance and ward, switch their own, eat, kite, flee and use specials. */
import { STYLES, ACC, SPECIALS, ARCHETYPES, rint, chance, clamp } from './data.js';
import { C, ARENA_R, passable, canStep, findPath, cheb, DIRS } from './world.js';

function chooseTarget(g, b) {
  let best = null, bs = 1e9;
  const onPlayer = g.actors.filter(o => o.ai && !o.dead && o !== b && o.target === g.player).length;
  for (const o of g.actors) {
    if (o === b || o.dead || g.tick < o.protectUntil) continue;
    if (o.isPlayer && onPlayer >= g.diff.gank && b.lastAttacker !== o) continue;
    let sc = cheb(b.x, b.y, o.x, o.y) + Math.random() * 7;
    if (o === b.lastAttacker) sc -= 6;
    if (o.hp < 40) sc -= 2;
    if (sc < bs) { bs = sc; best = o; }
  }
  return best;
}

function wander(g, b) {
  const ai = b.ai; if (b.path.length || b.frozen > 0 || ai.wander-- > 0) return;
  ai.wander = 2 + rint(5);
  for (let k = 0; k < 6; k++) {
    const x = b.x + rint(13) - 6, y = b.y + rint(13) - 6;
    if (passable(x, y) && Math.hypot(x - C, y - C) < ARENA_R - 3) { b.path = findPath(b.x, b.y, (px, py) => px === x && py === y, x, y); return; }
  }
}

function stepAway(b, t) {
  let best = null, bd = Math.hypot(b.x - t.x, b.y - t.y);
  for (const [dx, dy] of DIRS) {
    if (!canStep(b.x, b.y, dx, dy)) continue;
    const nx = b.x + dx, ny = b.y + dy, nx2 = nx + dx, ny2 = ny + dy;
    const two = canStep(nx, ny, dx, dy);
    const d = Math.hypot((two ? nx2 : nx) - t.x, (two ? ny2 : ny) - t.y) + Math.random() * 0.6 - Math.hypot(nx - C, ny - C) * 0.04;
    if (d > bd + 0.3 && (!best || d > best.d)) best = { d, path: two ? [{ x: nx, y: ny }, { x: nx2, y: ny2 }] : [{ x: nx, y: ny }] };
  }
  if (best) { b.path = best.path; b.ai.holdPath = true; return true; }
  return false;
}

/* pick the stance with the best expected damage against the target right now */
function bestStance(b, t, dist) {
  let best = b.stance, bs = -1;
  for (const s of ARCHETYPES[b.arch].stances) {
    const S = STYLES[s]; let v = ACC[s][t.stance] * S.max / S.speed;
    if (t.ward === s) v *= 0.4;
    if (s === 'melee' && dist > 2 && !(t.frozen > 2)) v *= b.frozen > 0 ? 0.05 : 0.6;
    if (s === 'magic' && t.frozen <= 0 && t.freezeImm <= 0) v *= 1.25;
    if (s === b.stance) v *= 1.1;
    if (v > bs) { bs = v; best = s; }
  }
  return best;
}

export function botThink(g, b) {
  const ai = b.ai, skill = ai.skill;
  // ---- survival ----
  if (b.eatCd <= 0 && b.food > 0 && (b.hp < 42 || (b.hp < 60 && b.atkCd >= 2 && chance(0.2 * skill)))) g.eat(b);
  if (b.focus < 15 && b.tonics > 0 && b.eatCd <= 0) g.tonic(b);
  // ---- target ----
  if (ai.retarget > 0) ai.retarget--;
  let t = b.target;
  if (t && (t.dead || cheb(b.x, b.y, t.x, t.y) > 30)) t = b.target = null;
  if (t && t.isPlayer && g.tick < t.protectUntil) t = b.target = null;
  if (!t && ai.retarget <= 0) { t = b.target = chooseTarget(g, b); ai.retarget = 2 + rint(3); }
  else if (t && ai.retarget <= 0 && b.lastAttacker && b.lastAttacker !== t && !b.lastAttacker.dead && g.tick - b.lastHurtTick < 3 && chance(0.35)) { t = b.target = b.lastAttacker; ai.retarget = 8; }
  if (!t) { if (b.ward && g.tick - b.lastHurtTick > 6) g.setWard(b, b.ward); wander(g, b); return; }
  const dist = cheb(b.x, b.y, t.x, t.y);
  // ---- flee when out of food and nearly dead ----
  if (ai.flee <= 0 && b.hp < 20 && b.food <= 0 && chance(0.5)) ai.flee = 8;
  if (ai.flee > 0) {
    ai.flee--; b.target = null; ai.retarget = 5;
    if (b.frozen <= 0 && !b.path.length) {
      const ax = clamp(Math.round(b.x + Math.sign(b.x - t.x || 1) * 8), 0, 47), ay = clamp(Math.round(b.y + Math.sign(b.y - t.y || 1) * 8), 0, 47);
      b.path = findPath(b.x, b.y, (x, y) => x === ax && y === ay, ax, ay);
    }
    return;
  }
  // ---- wards: react (imperfectly) to whoever is hitting us ----
  if (ai.react-- <= 0) {
    ai.react = 1 + rint(3);
    const threat = b.lastAttacker && !b.lastAttacker.dead && g.tick - b.lastHurtTick < 8 ? b.lastAttacker : (t.target === b ? t : null);
    if (threat && b.focus > 5) { if (b.ward !== threat.stance && chance(skill * 0.85)) g.setWard(b, threat.stance); }
    else if (b.ward && chance(0.5)) g.setWard(b, b.ward);
  }
  // ---- stance ----
  if (ai.restance-- <= 0) {
    ai.restance = 2 + rint(3);
    if (chance(0.35 + skill * 0.6)) { const s = bestStance(b, t, dist); if (s !== b.stance) g.setStance(b, s); }
  }
  // ---- kiting: ranged/magic users back off from melee attackers between shots ----
  if (ai.kiteCd > 0) ai.kiteCd--;
  if (b.stance !== 'melee' && dist <= 1 && b.frozen <= 0 && b.atkCd >= 2 && ai.kiteCd <= 0 && t.stance === 'melee' && chance(0.3 + skill * 0.5)) {
    if (stepAway(b, t)) ai.kiteCd = 4;
  }
  // ---- specials ----
  if (!b.specArmed && b.spec >= SPECIALS[b.stance].cost && b.atkCd <= 1 && dist <= STYLES[b.stance].range && t.ward !== b.stance && chance(0.12 + skill * 0.3)) g.toggleSpec(b);
}
