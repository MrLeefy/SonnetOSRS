// headless smoke test of the simulation: node tools/simtest.mjs
import { Game } from '../src/sim.js';
import { WILDS, GRAVE } from '../src/world.js';
const g = new Game({}); const ev = {}; g.on(t => ev[t] = (ev[t] || 0) + 1);
const p = g.player; let phase = 0;
for (let i = 0; i < 9000; i++) {
  if (p.dead) { g.respawnPlayer(); phase++; }
  else {
    const dest = phase % 2 ? GRAVE : WILDS;
    if (!p.target) { let b = null, bd = 12; for (const o of g.actors) if (o !== p && !o.dead && o.kind !== 'npc' && !g.safe(o)) { const d = Math.max(Math.abs(o.x - p.x), Math.abs(o.y - p.y)); if (d < bd) { bd = d; b = o; } } if (b && !g.safe(p)) g.cmdAttack(b); else if (!p.path.length) g.cmdMove(dest.x + 3, dest.y + 3); }
    if (p.hp < 35) g.eat(p); if (p.target && p.ward !== p.target.stance) g.setWard(p, p.target.stance); if (p.focus < 20) g.tonic(p);
    if (i % 1500 === 1499) { g.depositAll(); g.buy('roast'); g.buy('blade1'); const k = p.inv.findIndex(s => s && s.id === 'blade1'); if (k >= 0) g.useSlot(k); }
  }
  g.step();
  for (const a of g.actors) if (!Number.isFinite(a.x + a.y + a.hp) || a.hp < 0 || a.hp > a.maxHp) throw new Error('bad actor state ' + JSON.stringify({ n: a.name, x: a.x, y: a.y, hp: a.hp }));
}
console.log(JSON.stringify({ lvl: p.level, coins: g.save.coins, bank: g.save.bank, kills: g.save.kills, deaths: g.save.deaths, eq: p.eq.blade }), JSON.stringify(ev));
