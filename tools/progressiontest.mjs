// Headless regression coverage for legacy saves, professions, combat masteries and NPC quests.
import assert from 'node:assert/strict';
import { Game } from '../src/sim.js';
import { newSave, addItem, countItem, skillLevel } from '../src/items.js';
import { npcSpots, GRAVE } from '../src/world.js';
import { QUESTS, questStatus } from '../src/quests.js';

const old = newSave();
delete old.skills.melee; delete old.skills.ranged; delete old.skills.magic;
delete old.skills.defence; delete old.skills.fletch; delete old.skills.herb; delete old.quests;
const g = new Game({ save: old }), p = g.player;
assert.equal(g.save.skills.melee, 0);
assert.deepEqual(g.save.quests, {});
const eqBefore = JSON.stringify(p.eq);
addItem(p.inv, 'ore', 2);
const idx = p.inv.findIndex(s => s?.id === 'ore');
g.useSlot(idx);
assert.equal(JSON.stringify(p.eq), eqBefore, 'resources must not equip');
assert.equal(countItem(p.inv, 'ore'), 2, 'using resources must not destroy them');

Object.assign(p, npcSpots.smith);
assert.equal(g.quest('smith'), true);
assert.equal(g.quest('smith'), false, 'cannot complete without materials');
addItem(p.inv, 'ore', 8); addItem(p.inv, 'logs', 4);
const coin0 = g.save.coins;
assert.equal(g.quest('smith'), true);
assert.equal(g.save.quests.smith.done, true);
assert.ok(g.save.coins >= coin0 + 175);
assert.equal(g.quest('smith'), false, 'no repeat quest rewards');

const herb0 = g.save.skills.herb;
Object.assign(p, npcSpots.merchant);
addItem(p.inv, 'herbs', 4); addItem(p.inv, 'trout', 4);
assert.equal(g.craft('salve'), true);
assert.ok(g.save.skills.herb > herb0);
assert.equal(countItem(p.inv, 'salve'), 1);
assert.equal(g.quest('hearth'), true);
assert.equal(questStatus(QUESTS[1], g.save, p.inv).state, 'ready');
addItem(p.inv, 'herbs', 2);
assert.equal(g.quest('hearth'), true);
assert.equal(g.save.quests.hearth.done, true);

Object.assign(p, npcSpots.smith);
addItem(p.inv, 'logs', 2);
const f0 = g.save.skills.fletch;
assert.equal(g.craft('bolts'), true);
assert.equal(countItem(p.inv, 'bolts'), 12);
assert.ok(g.save.skills.fletch > f0);
Object.assign(p, { x: GRAVE.x, y: GRAVE.y });
const mon = g.actors.find(a => a.kind === 'monster' && !a.boss);
Object.assign(mon, { x: GRAVE.x + 1, y: GRAVE.y, hp: 35, maxHp: 35, dead: false });
const r0 = g.save.skills.ranged;
g.applyHit({ src: p, t: mon, dmg: 5, style: 'ranged', freeze: 0 });
assert.ok(g.save.skills.ranged > r0);
const d0 = g.save.skills.defence;
p.hp = p.maxHp;
g.applyHit({ src: mon, t: p, dmg: 5, style: 'melee', freeze: 0 });
assert.ok(g.save.skills.defence > d0);
assert.ok(skillLevel(g.save.skills.ranged) >= 1);

Object.assign(p, npcSpots.banker);
assert.equal(g.quest('barrow'), true);
g.save.count.undead += 5; g.save.bossKills += 1;
assert.equal(g.quest('barrow'), true);
assert.equal(g.save.quests.barrow.done, true);
assert.equal(QUESTS.reduce((n, q) => n + (g.save.quests[q.id]?.done ? q.points : 0), 0), 4);
console.log('Progression tests passed: quests, skills, crafting, gear safety and save migration');
