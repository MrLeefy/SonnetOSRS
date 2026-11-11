// headless smoke test of the simulation: node tools/simtest.mjs
import { Game } from '../src/sim.js';
for (const difficulty of ['easy', 'normal', 'hard']) {
  const g = new Game({ difficulty }); const ev = {}; g.on(t => ev[t] = (ev[t] || 0) + 1);
  // a naive "player": attack the nearest enemy, eat when low, respawn when dead
  for (let i = 0; i < 6000; i++) {
    const p = g.player;
    if (p.dead) g.respawnPlayer();
    else {
      if (!p.target) { let b = null, bd = 99; for (const o of g.actors) if (o !== p && !o.dead) { const d = Math.max(Math.abs(o.x - p.x), Math.abs(o.y - p.y)); if (d < bd) { bd = d; b = o; } } g.cmdAttack(b); }
      if (p.hp < 50) g.eat(p);
      if (p.target && p.ward !== p.target.stance) g.setWard(p, p.target.stance);
      if (p.focus < 20) g.tonic(p);
      if (p.spec >= 50 && !p.specArmed) g.toggleSpec(p);
    }
    g.step();
    for (const a of g.actors) if (!Number.isFinite(a.x + a.y + a.hp) || a.hp < 0 || a.hp > 99) throw new Error('bad actor state ' + JSON.stringify({ x: a.x, y: a.y, hp: a.hp }));
  }
  console.log(difficulty, JSON.stringify(g.stats), JSON.stringify(ev));
}
